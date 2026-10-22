// Exercises the same request handler Vercel calls, without a public deploy.
const os=require('os'),path=require('path'),fs=require('fs'),test=require('node:test'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mops-vercel-'));
process.env.MOPS_DATA_DIR=dir;
process.env.MOPS_RUNS_DIR=path.join(dir,'runs');
process.env.VERCEL='1';
process.env.ELT_MS='0';
process.env.COVER_MS='0';
process.env.PULL_MS='999999';
process.env.MOPS_AUTOPILOT='0';
process.env.CRM_FAIL_RATE='0';
delete process.env.DEMO_PASSCODE;
const handleRequest=require('../../api/index');

function request(method,url,{headers={},body='',ip='203.0.113.10'}={}){
  const waiters=[];let ended=false;const req={method,url,headers,socket:{remoteAddress:ip},
    on(ev,fn){if(ev!=='data'&&ev!=='end')return;if(ended){if(ev==='data'&&body)fn(body);if(ev==='end')fn();return}waiters.push([ev,fn])},
    flush(){if(ended)return;ended=true;for(const[ev,fn]of waiters){if(ev==='data'&&body)fn(body);if(ev==='end')fn()}}};
  return new Promise((resolve,reject)=>{const chunks=[];let status=0,rh={};const res={writableEnded:false,get headersSent(){return this._s},
    writeHead(c,h){status=c;rh=h||{};this._s=true},setHeader(k,v){rh[k]=v},
    write(c){chunks.push(Buffer.from(c));return true},
    end(b){if(b!=null)chunks.push(Buffer.isBuffer(b)?b:Buffer.from(String(b)));this.writableEnded=true;this._s=true;resolve({status,headers:rh,body:Buffer.concat(chunks).toString('utf8')})}};
    Promise.resolve(handleRequest(req,res)).then(()=>{if(!res.writableEnded)reject(new Error('handler did not end '+url))}).catch(reject);
    req.flush()})}

test('the Vercel handler gates the site with demo sign-in',async()=>{
  const health=await request('GET','/health');
  assert.equal(health.status,200);const h=JSON.parse(health.body);assert.equal(h.ok,true);assert.equal(h.company,'Northwind Networks');
  const home=await request('GET','/');
  assert.equal(home.status,401);assert.match(home.body,/Demo sign-in/);assert.doesNotMatch(home.body,/passcode/i);
  const bad=await request('POST','/api/login',{headers:{'content-type':'application/json'},body:'{"user":"nobody"}'});
  assert.equal(bad.status,401);
  const refused=await request('POST','/api/login',{headers:{'content-type':'application/json'},body:'{"user":"admin"}'});
  assert.equal(refused.status,403);
  const good=await request('POST','/api/login',{headers:{'content-type':'application/json','x-mops-internal':process.env.MOPS_SECRET},body:'{"user":"admin"}'});
  assert.equal(good.status,200);assert.match(good.headers['set-cookie'],/mops_session=/);assert.match(good.headers['set-cookie'],/HttpOnly/);assert.match(good.headers['set-cookie'],/Secure/);
  const cookie=good.headers['set-cookie'].split(';')[0];
  const state=await request('GET','/api/state',{headers:{cookie}});
  assert.equal(state.status,200);const s=JSON.parse(state.body);assert.match(JSON.stringify(s.company||s),/Northwind/);
  const eng=await request('GET','/api/engine/health',{headers:{cookie}});
  assert.equal(eng.status,200);const cards=JSON.parse(eng.body);assert.equal(cards.engine.ok,true);assert.ok(cards.engine.counts.contacts>=300);
  assert.equal(cards.mail.ok,true);assert.equal(cards.mail.catcher,'in-process');assert.equal(cards.warehouse.ok,true);
  const rewritten=await request('GET','/api/index?__path=health');
  assert.equal(rewritten.status,200);
});
