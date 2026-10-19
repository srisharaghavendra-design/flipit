// Event core, surfaces (email/Webex/app), self-healing, "covered for you" watcher with undo, scale test, efficiency report.
const os=require('os'),path=require('path'),fs=require('fs'),crypto=require('crypto');const test=require('node:test'),assert=require('node:assert/strict');
const ENV={MOPS_PORT:'9887',ENGINE_PORT:'9901',CRM_PORT:'9902',MAIL_PORT:'9903',SMTP_PORT:'3625',WH_PORT:'9904',MOPS_PUBLIC:'http://127.0.0.1:9887',MOPS_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'mops-test2-')),SYNC_MAX_ATTEMPTS:'3',ELT_MS:'0',PULL_MS:'999999',CRM_FAIL_RATE:'0',COVER_MS:'0',MOPS_RUNS_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'mops-runs2-')),MOPS_OUTAGE_MS:'5000',ELT_DEBOUNCE_MS:'999999'};
Object.assign(process.env,ENV);const{start}=require('../stack');const H='http://127.0.0.1:9887';let stack;
const j=async(p,body,h={})=>{const r=await fetch(H+p,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...h},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body))});return{status:r.status,body:await r.json()}};
const wait=async(fn,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,400))}throw new Error('timeout')};
test.before(async()=>{stack=await start(ENV,{quiet:true});await j('/api/engine/reset',{});await j('/svc/warehouse/elt/run',{})});test.after(()=>stack&&stack.stop());

test('cover watcher finds the seeded issues, acts within limits, and every action can be undone',async()=>{const s=(await j('/api/engine/covered/scan',{})).body;assert.deepEqual(s.errors,{});
  const L=(await j('/api/engine/covered')).body;const rules=new Set(L.map(x=>x.rule));
  for(const r of['Registrations behind pace','Lead not followed up in 48h','Budget underspend','Missing consent on upload','Campaign code missing in CRM','Post-event follow-up'])assert.ok(rules.has(r),'missing rule '+r);
  const pace=L.find(x=>x.rule==='Registrations behind pace');assert.equal(pace.status,'scheduled');assert.equal(pace.risk,'low');
  const up=L.find(x=>x.rule==='Missing consent on upload');assert.match(up.title,/quarantined 3 of 8/);
  const sh=L.find(x=>x.rule==='Budget underspend');assert.ok(sh.undo.amount<=25000,'within delegated limit');
  assert.equal((await j('/api/engine/covered/scan',{})).body.newItems,0,'idempotent');
  for(const it of L.filter(x=>x.undo)){const r=await j(`/api/engine/covered/${it.id}/undo`,{});assert.equal(r.body.ok,true,it.rule+': '+JSON.stringify(r.body))}
  const sch=(await j('/svc/engine/scheduled')).body;assert.equal(sch.find(x=>x.id===pace.undo.id).status,'cancelled');
  const crmLead=(await j('/svc/crm/services/data/v59.0/sobjects/Lead/'+L.find(x=>x.rule==='Lead not followed up in 48h').undo.crmId)).body;assert.ok(['Kenji Mori','Lena Ward'].includes(crmLead.OwnerName));
  assert.equal((await j('/svc/engine/uploads/UP-0001')).body.quarantined,0);assert.equal((await j('/svc/engine/templates/DRAFT-FU-EV-PAST')).status,404);
  assert.equal((await j('/api/engine/covered/'+L[0].id+'/undo',{})).status,409,'double undo refused')});

test('one entry point: email CC to @mops gets an emailed reply; Webex webhook (signed) and app hit the same agent',async()=>{
  await j('/api/engine/demo/email',{});const reply=await wait(async()=>(await j('/svc/mail/messages?rcpt=srisha')).body.find(m=>m.headers['x-mops-surface']==='reply'));
  assert.match(reply.subject,/^Re: /);assert.ok(reply.headers['in-reply-to']);assert.match(reply.rcpt,/chris@northwind\.example/,'thread cc preserved');
  const conv=(await j('/api/engine/conversations')).body;const e=conv.find(c=>c.surface==='email');assert.equal(e.action,'campaign.create');
  const camps=(await j('/svc/engine/campaigns')).body;assert.ok(camps.some(c=>c.channel==='Partner'&&c.region==='Japan'),'email action created the campaign');
  const raw=JSON.stringify({data:{roomId:'R',personEmail:'p@northwind.example',text:'@mops pipeline by channel'}});const sig=crypto.createHmac('sha1','dev-webex-secret').update(raw).digest('hex');
  const w=await j('/api/engine/webhooks/webex',raw,{'x-spark-signature':sig});assert.equal(w.body.action,'insight.pipeline');assert.equal((await j('/api/engine/webhooks/webex',raw,{'x-spark-signature':'nope'})).status,401);
  const a=await j('/api/engine/tag',{text:'@mops pipeline by channel'});assert.equal(a.body.action,'insight.pipeline');assert.equal(a.body.reply,w.body.markdown,'same answer on every surface')});

test('event core: services publish to the append-only log; consumers track offsets',async()=>{const c=(await j('/api/engine/core')).body;assert.ok(c.events>20);
  for(const n of['inbound-email','autopilot-healer','warehouse-loader','cover-watcher'])assert.ok(c.consumers.find(x=>x.name===n),n);assert.ok(c.consumers.every(x=>x.lag<200))});

test('self-healing: injected CRM outage → failure queue → autopilot detects, waits, replays, verifies',async()=>{const r=(await j('/api/engine/heal/inject',{})).body;
  const inc=await wait(async()=>(await j('/api/engine/heal/incidents')).body.find(i=>i.resolved),60000);assert.ok(inc.steps.length>=3);
  assert.equal((await j('/svc/engine/sync/status')).body.failureQueue.length,0);const crm=await fetch(H+'/svc/crm/services/data/v59.0/sobjects/Campaign/'+r.campaign,{headers:{'x-mops-trace':'noflake'}}).then(x=>x.json());assert.equal(crm.Name,'Self-heal probe campaign')});

test('scale test pipeline runs end to end and reports throughput + p95 (small size in CI)',async()=>{await j('/api/engine/loadtest',{contacts:20000,sends:2000});
  const L=await wait(async()=>{const x=(await j('/api/engine/loadtest')).body.live;return x.status==='done'&&x},90000);assert.equal(L.phases.send.acceptedBySink,L.phases.send.attempted);assert.ok(L.phases.send.messagesPerSec>0&&L.phases.send.p95Ms>0);assert.ok(L.phases.segment.p95Ms>=0)});

test('efficiency report compares baseline vs measured @mops time per task',async()=>{const r=(await j('/api/engine/run',{wait:true,pace:0})).body;assert.equal(r.ok,true);const e=(await j('/api/engine/efficiency')).body;
  const m=e.tasks.filter(t=>t.measured);assert.ok(m.length>=6);assert.ok(m.every(t=>t.machineSeconds>=0&&t.speedup>0));assert.match(e.note,/PLACEHOLDER/)});
