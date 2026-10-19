// Shared helpers for @mops backend services: tiny router, JSON/form/CSV body parsing, in-process calls, event bus emitter.
const http=require('http'),path=require('path'),fs=require('fs'),crypto=require('crypto');
if(!process.env.MOPS_SECRET)process.env.MOPS_SECRET=crypto.randomBytes(32).toString('base64url');
if(!process.env.MOPS_WEBEX_SECRET)process.env.MOPS_WEBEX_SECRET=crypto.randomBytes(32).toString('base64url');
if(!process.env.MOPS_SESSION_SECRET)process.env.MOPS_SESSION_SECRET=crypto.randomBytes(32).toString('base64url');
if(process.env.VERCEL&&!process.env.MOPS_DATA_DIR)process.env.MOPS_DATA_DIR='/tmp/mops';
if(process.env.VERCEL&&!process.env.MOPS_RUNS_DIR)process.env.MOPS_RUNS_DIR='/tmp/mops/runs';
const PORTS={hub:+process.env.MOPS_PORT||+process.env.PORT||8787,engine:+process.env.ENGINE_PORT||8801,crm:+process.env.CRM_PORT||8802,mail:+process.env.MAIL_PORT||8803,smtp:+process.env.SMTP_PORT||2525,warehouse:+process.env.WH_PORT||8804};
const URLS=Object.fromEntries(Object.entries(PORTS).map(([k,v])=>[k,'http://127.0.0.1:'+v]));
function publicBase(){if(process.env.MOPS_PUBLIC)return String(process.env.MOPS_PUBLIC).replace(/\/$/,'');
  if(process.env.VERCEL_ENV==='production'&&process.env.VERCEL_PROJECT_PRODUCTION_URL)return'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if(process.env.VERCEL_URL)return'https://'+process.env.VERCEL_URL;
  return'http://localhost:'+(process.env.MOPS_PORT||process.env.PORT||8787)}
const PUBLIC=publicBase();
const DATA=process.env.MOPS_DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(DATA,{recursive:true});
const now=()=>new Date().toISOString();
const handlers={};
// Event bus: every service reports what it did. Delivered in-process so it works with no open port (Vercel).
function emitter(svc){return(kind,msg,data={},trace)=>{const ev={svc,kind,msg,data,trace:trace||null,at:now()};
  try{require('./hub').bus(ev)}catch(e){if(process.env.MOPS_DEBUG)console.error('bus',e.message)}return ev}}
function readBody(req){return new Promise((resolve,reject)=>{let b='';let n=0;req.on('data',c=>{n+=c.length;if(n>8_000_000){reject(err(413,'Request is too large'));try{req.destroy()}catch(e){}return}b+=c});req.on('end',()=>resolve(b));req.on('error',reject);if(req.flush)req.flush()})}
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c=='"'&&t[i+1]=='"'){f+='"';i++}else if(c=='"')q=false;else f+=c}
  else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'||c=='\r'){if(c=='\r'&&t[i+1]=='\n')i++;row.push(f);f='';if(row.some(x=>x!==''))rows.push(row);row=[]}else f+=c}
  row.push(f);if(row.some(x=>x!==''))rows.push(row);const h=(rows.shift()||[]).map(s=>s.trim());return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])))}
function normHeaders(h){const o={};for(const[k,v]of Object.entries(h||{}))o[String(k).toLowerCase()]=v;return o}
function service(name,port,spec){const routes=[];const R=(m,pat,fn)=>{const keys=[];const re=new RegExp('^'+pat.replace(/:(\w+)/g,(_,k)=>{keys.push(k);return'([^/]+)'})+'$');routes.push({m,re,keys,fn})};
  const api={get:(p,f)=>R('GET',p,f),post:(p,f)=>R('POST',p,f),patch:(p,f)=>R('PATCH',p,f),del:(p,f)=>R('DELETE',p,f),spec};
  R('GET','/openapi.json',()=>spec);
  R('GET','/docs',(q,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(docsPage(spec))});
  async function dispatch(req,res){const u=new URL(req.url,'http://x');const t0=Date.now();
    try{const raw=['POST','PATCH','PUT'].includes(req.method)?await readBody(req):'';const ct=req.headers['content-type']||'';
      let body={};if(raw){if(ct.includes('json'))body=JSON.parse(raw);else if(ct.includes('x-www-form-urlencoded'))body=Object.fromEntries(new URLSearchParams(raw));else body={raw}}
      for(const r of routes){if(r.m!==req.method)continue;const mm=u.pathname.match(r.re);if(!mm)continue;
        const params=Object.fromEntries(r.keys.map((k,i)=>[k,decodeURIComponent(mm[i+1])]));
        const ctx={params,query:Object.fromEntries(u.searchParams),body,raw,headers:req.headers,trace:req.headers['x-mops-trace']||null};
        const out=await r.fn(ctx,res);if(res.writableEnded)return;
        const code=out&&out.__status||200;if(out&&out.__status)delete out.__status;
        res.writeHead(code,{'content-type':'application/json','x-elapsed-ms':String(Date.now()-t0)});return res.end(JSON.stringify(out??{}))}
      res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"not found"}');
    }catch(e){if(!e.status)console.error(name,e);if(!res.headersSent)res.writeHead(e.status||500,{'content-type':'application/json'});if(!res.writableEnded)res.end(JSON.stringify({error:e.message}))}}
  handlers[name]=dispatch;
  api.listen=()=>new Promise(ok=>{if(process.env.VERCEL)return ok(null);const s=http.createServer(dispatch);s.listen(port,'127.0.0.1',()=>{console.log(`[${name}] :${port}`);ok(s)});api.server=s});
  return api}
function err(status,msg){const e=new Error(msg);e.status=status;return e}
function docsPage(s){const esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const rows=Object.entries(s.paths||{}).flatMap(([p,ms])=>Object.entries(ms).map(([m,o])=>`<div class="op"><span class="m ${m}">${m.toUpperCase()}</span><code>${esc(p)}</code><p>${esc(o.summary||'')}</p>${o.requestBody?`<pre>${esc(JSON.stringify(o.requestBody.example||o.requestBody,null,1))}</pre>`:''}</div>`)).join('');
  return`<!doctype html><meta name=viewport content="width=device-width"><title>${esc(s.info.title)} API</title><style>body{font-family:Inter,system-ui,sans-serif;background:#06070a;color:#f4f4f6;max-width:880px;margin:0 auto;padding:40px 20px}h1{font-weight:600;letter-spacing:-.02em}.sub{color:#a4a4b0}.op{background:#ffffff0a;border:1px solid #ffffff14;border-radius:14px;padding:14px 16px;margin:10px 0}.m{font:600 11px ui-monospace,monospace;padding:3px 8px;border-radius:6px;margin-right:10px;background:#9d8cff33;color:#c9c0ff}.m.post{background:#4fe3c133;color:#8ff3dc}.m.patch{background:#ffb15c33;color:#ffd19c}code{font-size:14px}p{color:#a4a4b0;margin:8px 0 0;font-size:14px}pre{font-size:12px;color:#a4a4b0;background:#0003;padding:8px;border-radius:8px;overflow:auto}a{color:#9d8cff}</style><h1>${esc(s.info.title)}</h1><p class=sub>${esc(s.info.description||'')} · <a href="openapi.json">openapi.json</a></p>${rows}`}
function openapi(title,description,ops){const paths={};for(const[k,summary,example]of ops){const[m,p]=k.split(' ');(paths[p]=paths[p]||{})[m.toLowerCase()]={summary,...(example?{requestBody:{content:{'application/json':{}},example}}:{}),responses:{200:{description:'OK'}}}}
  return{openapi:'3.0.3',info:{title,description,version:'0.5.0'},paths}}
function mockReq({method,url,headers,raw}){const waiters=[];let ended=false;const req={method,url,headers:normHeaders(headers),socket:{remoteAddress:'127.0.0.1'},
  on(ev,fn){if(ev!=='data'&&ev!=='end'&&ev!=='close')return;if(ended){if(ev==='data'&&raw)fn(raw);if(ev==='end')fn();return}waiters.push([ev,fn])}};
  req.flush=()=>{if(ended)return;ended=true;for(const[ev,fn]of waiters){if(ev==='data'&&raw)fn(raw);if(ev==='end')fn()}};return req}
function invoke(name,method,urlPath,opts={}){const handler=handlers[name];if(!handler)return Promise.reject(new Error(name+' service is not registered'));
  const headers=normHeaders(opts.headers);if(opts.trace)headers['x-mops-trace']=opts.trace;if(opts.ct)headers['content-type']=opts.ct;
  let raw='';if(opts.raw!=null)raw=typeof opts.raw==='string'?opts.raw:String(opts.raw);
  else if(opts.body!=null){raw=typeof opts.body==='string'?opts.body:JSON.stringify(opts.body);if(!headers['content-type'])headers['content-type']='application/json'}
  const req=mockReq({method:method||(opts.body!=null||opts.raw!=null?'POST':'GET'),url:urlPath,headers,raw});
  const chunks=[];let status=200,resHeaders={},sent=false,settled=false;
  return new Promise((resolve,reject)=>{const res={writableEnded:false,get headersSent(){return sent},
    writeHead(c,h){status=c;sent=true;resHeaders=h||{}},setHeader(k,v){resHeaders[k]=v},
    write(c){chunks.push(Buffer.isBuffer(c)?c:Buffer.from(String(c)));return true},
    end(c){if(c!=null)chunks.push(Buffer.isBuffer(c)?c:Buffer.from(String(c)));this.writableEnded=true;sent=true;finish()}};
    function finish(){if(settled)return;settled=true;const buf=Buffer.concat(chunks);const text=buf.toString('utf8');let body;try{body=JSON.parse(text)}catch{body={text}}
      resolve({status,headers:resHeaders,body,text,raw:buf})}
    Promise.resolve(handler(req,res)).then(()=>{if(res.writableEnded)finish()}).catch(reject);req.flush()})}
async function call(svc,path,opts={},trace){const t0=Date.now();const method=opts.method||(opts.body!=null?'POST':'GET');
  const r=await invoke(svc,method,path,{...opts,trace:trace||opts.trace});
  let j=r.body;if(j==null||typeof j!=='object')j={text:r.text};
  if(!Array.isArray(j)){j.__ms=Date.now()-t0;j.__http=r.status}
  if(r.status>=400&&!opts.ok){const e=new Error(`${svc}${path} → ${r.status} ${(j&&j.error)||''}`);e.status=r.status;throw e}return j}
function listenServices(){if(process.env.VERCEL)return[];const servers=[];
  for(const name of['engine','crm','mail','warehouse']){if(!handlers[name])continue;const s=http.createServer(handlers[name]);s.listen(PORTS[name],'127.0.0.1');servers.push(s)}return servers}
module.exports={PORTS,URLS,PUBLIC,DATA,now,emitter,parseCSV,service,err,openapi,call,invoke,handlers,listenServices,publicBase};
if(process.env.MOPS_PARENT){const pp=+process.env.MOPS_PARENT;setInterval(()=>{try{process.kill(pp,0)}catch{process.exit(0)}},1000).unref()}
