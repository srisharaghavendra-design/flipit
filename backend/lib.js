// Shared helpers for @mops backend services: tiny router, JSON/form/CSV body parsing, event bus emitter, OpenAPI docs page.
const http=require('http');
const PORTS={hub:+process.env.MOPS_PORT||8787,engine:+process.env.ENGINE_PORT||8801,crm:+process.env.CRM_PORT||8802,mail:+process.env.MAIL_PORT||8803,smtp:+process.env.SMTP_PORT||2525,warehouse:+process.env.WH_PORT||8804};
const URLS=Object.fromEntries(Object.entries(PORTS).map(([k,v])=>[k,'http://127.0.0.1:'+v]));
const PUBLIC=process.env.MOPS_PUBLIC||process.env.RENDER_EXTERNAL_URL||('http://localhost:'+PORTS.hub);
const DATA=process.env.MOPS_DATA_DIR||require('path').join(__dirname,'data');
require('fs').mkdirSync(DATA,{recursive:true});
const now=()=>new Date().toISOString();
// Event bus: every service reports what it did to the hub, which streams it to the Engine room (SSE). Fire-and-forget.
function emitter(svc){return(kind,msg,data={},trace)=>{const ev={svc,kind,msg,data,trace:trace||null,at:now()};
  fetch(URLS.hub+'/api/engine/bus',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ev)}).catch(()=>{});return ev;}}
function readBody(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b))})}
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c=='"'&&t[i+1]=='"'){f+='"';i++}else if(c=='"')q=false;else f+=c}
  else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'||c=='\r'){if(c=='\r'&&t[i+1]=='\n')i++;row.push(f);f='';if(row.some(x=>x!==''))rows.push(row);row=[]}else f+=c}
  row.push(f);if(row.some(x=>x!==''))rows.push(row);const h=(rows.shift()||[]).map(s=>s.trim());return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||'').trim()])))}
function service(name,port,spec){const routes=[];const R=(m,pat,fn)=>{const keys=[];const re=new RegExp('^'+pat.replace(/:(\w+)/g,(_,k)=>{keys.push(k);return'([^/]+)'})+'$');routes.push({m,re,keys,fn})};
  const api={get:(p,f)=>R('GET',p,f),post:(p,f)=>R('POST',p,f),patch:(p,f)=>R('PATCH',p,f),del:(p,f)=>R('DELETE',p,f),spec};
  R('GET','/openapi.json',()=>spec);
  R('GET','/docs',(q,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(docsPage(spec));});
  api.listen=()=>new Promise(ok=>{const s=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x');const t0=Date.now();
    try{const raw=['POST','PATCH','PUT'].includes(req.method)?await readBody(req):'';const ct=req.headers['content-type']||'';
      let body={};if(raw){if(ct.includes('json'))body=JSON.parse(raw);else if(ct.includes('x-www-form-urlencoded'))body=Object.fromEntries(new URLSearchParams(raw));else body={raw};}
      for(const r of routes){if(r.m!==req.method)continue;const mm=u.pathname.match(r.re);if(!mm)continue;
        const params=Object.fromEntries(r.keys.map((k,i)=>[k,decodeURIComponent(mm[i+1])]));
        const ctx={params,query:Object.fromEntries(u.searchParams),body,raw,headers:req.headers,trace:req.headers['x-mops-trace']||null};
        const out=await r.fn(ctx,res);if(res.writableEnded)return;
        const code=out&&out.__status||200;if(out&&out.__status)delete out.__status;
        res.writeHead(code,{'content-type':'application/json','x-elapsed-ms':String(Date.now()-t0)});return res.end(JSON.stringify(out??{}));}
      res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"not found"}');
    }catch(e){if(!e.status)console.error(name,e);if(!res.headersSent)res.writeHead(e.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}))}});
    s.listen(port,'127.0.0.1',()=>{console.log(`[${name}] :${port}`);ok(s)});api.server=s;});
  return api;}
function err(status,msg){const e=new Error(msg);e.status=status;return e}
function docsPage(s){const esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const rows=Object.entries(s.paths||{}).flatMap(([p,ms])=>Object.entries(ms).map(([m,o])=>`<div class="op"><span class="m ${m}">${m.toUpperCase()}</span><code>${esc(p)}</code><p>${esc(o.summary||'')}</p>${o.requestBody?`<pre>${esc(JSON.stringify(o.requestBody.example||o.requestBody,null,1))}</pre>`:''}</div>`)).join('');
  return`<!doctype html><meta name=viewport content="width=device-width"><title>${esc(s.info.title)} API</title><style>body{font-family:Inter,system-ui,sans-serif;background:#06070a;color:#f4f4f6;max-width:880px;margin:0 auto;padding:40px 20px}h1{font-weight:600;letter-spacing:-.02em}.sub{color:#a4a4b0}.op{background:#ffffff0a;border:1px solid #ffffff14;border-radius:14px;padding:14px 16px;margin:10px 0}.m{font:600 11px ui-monospace,monospace;padding:3px 8px;border-radius:6px;margin-right:10px;background:#9d8cff33;color:#c9c0ff}.m.post{background:#4fe3c133;color:#8ff3dc}.m.patch{background:#ffb15c33;color:#ffd19c}code{font-size:14px}p{color:#a4a4b0;margin:8px 0 0;font-size:14px}pre{font-size:12px;color:#a4a4b0;background:#0003;padding:8px;border-radius:8px;overflow:auto}a{color:#9d8cff}</style><h1>${esc(s.info.title)}</h1><p class=sub>${esc(s.info.description||'')} · <a href="openapi.json">openapi.json</a></p>${rows}`}
function openapi(title,description,ops){const paths={};for(const[k,summary,example]of ops){const[m,p]=k.split(' ');(paths[p]=paths[p]||{})[m.toLowerCase()]={summary,...(example?{requestBody:{content:{'application/json':{}},example}}:{}),responses:{200:{description:'OK'}}}}
  return{openapi:'3.0.3',info:{title,description,version:'0.5.0'},paths}}
async function call(svc,path,opts={},trace){const t0=Date.now();const r=await fetch(URLS[svc]+path,{method:opts.method||(opts.body?'POST':'GET'),headers:{'content-type':opts.ct||'application/json',...(trace?{'x-mops-trace':trace}:{})},body:opts.body==null?undefined:(typeof opts.body==='string'?opts.body:JSON.stringify(opts.body))});
  const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={text:txt}}if(!r.ok&&!opts.ok){const e=new Error(`${svc}${path} → ${r.status} ${j.error||''}`);e.status=r.status;throw e}j.__ms=Date.now()-t0;return j}
module.exports={PORTS,URLS,PUBLIC,DATA,now,emitter,parseCSV,service,err,openapi,call};
// When launched by stack.js, exit if the launcher dies (prevents orphaned services holding ports).
if(process.env.MOPS_PARENT){const pp=+process.env.MOPS_PARENT;setInterval(()=>{try{process.kill(pp,0)}catch{process.exit(0)}},1000).unref()}
