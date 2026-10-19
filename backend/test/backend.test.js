// Backend integration tests: boots the full stack on separate ports with a throwaway data dir, then exercises every flow.
const os=require('os'),path=require('path'),fs=require('fs');const test=require('node:test'),assert=require('node:assert/strict');
const ENV={MOPS_PORT:'9787',ENGINE_PORT:'9801',CRM_PORT:'9802',MAIL_PORT:'9803',SMTP_PORT:'3525',WH_PORT:'9804',MOPS_PUBLIC:'http://127.0.0.1:9787',MOPS_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'mops-test-')),SYNC_MAX_ATTEMPTS:'3',ELT_MS:'0',PULL_MS:'999999',CRM_FAIL_RATE:'0',MOPS_RUNS_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'mops-runs1-'))};
Object.assign(process.env,ENV);const{start}=require('../stack');const{URLS}=require('../lib');
const H=URLS.hub;let stack;
async function j(url,opt={}){const r=await fetch(url,{method:opt.method||(opt.body!==undefined?'POST':'GET'),headers:{'content-type':opt.ct||'application/json',...(opt.headers||{})},body:opt.body===undefined?undefined:(typeof opt.body==='string'?opt.body:JSON.stringify(opt.body)),redirect:'manual'});const t=await r.text();let b;try{b=JSON.parse(t)}catch{b=t}return{status:r.status,body:b,headers:r.headers}}
const E=(p,o)=>j(URLS.engine+p,o),C=(p,o)=>j(URLS.crm+p,o),M=(p,o)=>j(URLS.mail+p,o),W=(p,o)=>j(URLS.warehouse+p,o);
const chaos=r=>C('/admin/chaos',{body:{failRate:r}});const drain=()=>E('/sync/drain',{body:{timeoutMs:20000}});
test.before(async()=>{stack=await start(ENV,{quiet:true});const r=await j(H+'/api/engine/reset',{method:'POST'});assert.ok(r.body.ok,'seed ok')});
test.after(()=>stack&&stack.stop());

test('every service is up and publishes OpenAPI docs',async()=>{const h=(await j(H+'/api/engine/health')).body;for(const k of['engine','crm','mail','warehouse']){assert.equal(h[k].ok,true,k);const o=await j(H+`/svc/${k}/openapi.json`);assert.equal(o.body.openapi,'3.0.3');assert.ok(Object.keys(o.body.paths).length>=4)}
  assert.ok(h.engine.counts.contacts>=300);assert.ok(h.crm.counts.Lead>=200,'CRM bulk-loaded')});

test('segments: JSON rules, plain English, whitelisted fields, parameterised values',async()=>{
  const a=await E('/segments/preview',{body:{rules:{all:[{field:'title',op:'in',value:['CIO']},{field:'region',op:'eq',value:'India'}]}}});assert.ok(a.body.count>0);assert.ok(a.body.sample.every(x=>x.title==='CIO'&&x.region==='India'));
  const b=await E('/segments/preview',{body:{text:'CIOs in India enterprise who opted in'}});assert.ok(b.body.rules.all.find(r=>r.field==='consent'));assert.ok(b.body.count<=a.body.count);
  const inj=await E('/segments/preview',{body:{rules:{all:[{field:'title',op:'eq',value:"x' OR 1=1 --"}]}}});assert.equal(inj.body.count,0);
  const bad=await E('/segments/preview',{body:{rules:{all:[{field:'password',op:'eq',value:1}]}}});assert.equal(bad.status,400)});

test('campaign codes, $150K approval rule, audit log',async()=>{
  const s=await E('/campaigns',{body:{name:'Small webinar',channel:'Digital',region:'Japan',budget:40000}});assert.match(s.body.code,/^FY\d\dQ[1-4]-JPN-DIG-\d{4}$/);assert.equal(s.body.status,'approved');
  const s2=await E('/campaigns',{body:{name:'Another webinar',channel:'Digital',region:'Japan',budget:150000}});assert.notEqual(s2.body.code,s.body.code);assert.equal(s2.body.status,'approved','exactly at limit is auto-approved');
  const big=await E('/campaigns',{body:{name:'Summit',channel:'Events',region:'India',budget:150001}});assert.equal(big.body.status,'pending_approval');
  const d=await E(`/budget/${big.body.budgetRequest}/decide`,{body:{decision:'approve',approver:'Chris'}});assert.equal(d.body.status,'approved');
  const again=await E(`/budget/${big.body.budgetRequest}/decide`,{body:{decision:'reject'}});assert.equal(again.status,409);
  const au=(await E('/audit?limit=50')).body;assert.ok(au.some(x=>x.action==='budget.approve'&&x.actor==='Chris'));assert.ok(au.some(x=>x.action==='budget.route_for_approval'))});

test('email: consent suppression by law, real SMTP delivery, open/click tracking, working unsubscribe',async()=>{
  const k=(await E('/campaigns',{body:{name:'Consent test',channel:'Digital',region:'India',budget:1000}})).body;
  const seg=(await E('/segments',{body:{name:'all leaders',rules:{all:[{field:'title',op:'in',value:['CIO','CTO','CISO']},{field:'region',op:'in',value:['India','US','EMEA']}]}}})).body;
  const before=(await M('/messages')).body.length;const r=(await E(`/campaigns/${k.id}/send`,{body:{segmentId:seg.id,extra:{event_name:'T',event_link:'https://northwind.example/x'}}})).body;
  assert.equal(r.audience,seg.count);assert.equal(r.sent+r.suppressed+r.failed,r.audience);assert.ok(r.suppressed>0,'some suppressed');assert.equal(r.failed,0);
  await new Promise(x=>setTimeout(x,500));const msgs=(await M('/messages')).body;assert.equal(msgs.length-before,r.sent,'every allowed email reached the SMTP sink');
  const ex=(await E('/export')).body;const mine=ex.sends.filter(s=>s.campaign_id===k.id);const ct=Object.fromEntries(ex.contacts.map(c=>[c.id,c]));
  for(const s of mine){const c=ct[s.contact_id];if(c.consent==='opted_out')assert.equal(s.status,'suppressed');if(c.consent==='unknown'&&c.region!=='US')assert.equal(s.status,'suppressed');if(c.consent==='unknown'&&c.region==='US')assert.equal(s.status,'sent','CAN-SPAM opt-out model')}
  const m=(await M('/messages/'+msgs[0].id)).body;assert.ok(m.headers['list-unsubscribe']);const px=m.html.match(/src="([^"]+\/t\/o\/[^"]+)"/)[1],lk=m.html.match(/href="([^"]+\/t\/c\/[^"]+)"/)[1].replace(/&amp;/g,'&');
  const o=await j(px);assert.equal(o.headers.get('content-type'),'image/gif');const cl=await j(lk);assert.equal(cl.status,302);assert.match(cl.headers.get('location'),/^https:\/\/northwind\.example/);
  const sid=m.headers['x-mops-send'];const c360=(await E('/contacts/'+mine.find(s=>s.id===sid).contact_id)).body;const sd=c360.sends.find(s=>s.id===sid);assert.ok(sd.opened_at&&sd.clicked_at);assert.ok(['Clicked','Registered'].includes(c360.members.find(x=>x.campaign_id===k.id).status));
  const un=m.headers['list-unsubscribe'].replace(/[<>]/g,'');assert.equal((await j(un.replace(/\.[^.]+$/,'.forged'))).status,403);assert.equal((await j(un)).status,200);
  const pu=await j(un,{method:'POST',headers:{accept:'application/json'},body:''});assert.equal(pu.body.ok,true);
  const after=(await E('/contacts/'+c360.id)).body;assert.equal(after.consent.at(-1).status,'opted_out');assert.equal(after.canEmail.ok,false);
  const r2=(await E(`/campaigns/${k.id}/send`,{body:{rules:{all:[{field:'email',op:'eq',value:after.email}]}}})).body;assert.equal(r2.sent,0);assert.equal(r2.reasons['opted out'],1)});

test('CRM sync: retries through transient failures, failure queue, requeue, two-way pull with conflict rules',async()=>{
  await chaos(0.5);const k=(await E('/campaigns',{body:{name:'Sync test',channel:'ABM',region:'ANZ',budget:5000}})).body;let d=(await drain()).body;await chaos(0);
  if(d.dead)await E('/sync/retry-failed',{body:{}});d=(await drain()).body;assert.equal(d.pending,0);
  const crm=(await C('/services/data/v59.0/sobjects/Campaign/'+k.id,{headers:{'x-mops-trace':'noflake'}})).body;assert.equal(crm.Code__c,k.code);
  await chaos(1);const k2=(await E('/campaigns',{body:{name:'Doomed',channel:'ABM',region:'ANZ',budget:5000}})).body;await drain();let st=(await E('/sync/status')).body;assert.ok(st.failureQueue.some(f=>f.local_id===k2.id),'dead-lettered after max attempts');
  await chaos(0);assert.ok((await E('/sync/retry-failed',{body:{}})).body.requeued>=1);await drain();st=(await E('/sync/status')).body;assert.equal(st.failureQueue.length,0);
  assert.equal((await C('/services/data/v59.0/sobjects/Campaign/'+k2.id,{headers:{'x-mops-trace':'noflake'}})).body.Name,'Doomed');
  const lead=(await C('/export')).body.Lead.find(l=>l.Status==='MQL'||l.Status==='Open');
  await C(`/services/data/v59.0/sobjects/Lead/${lead.Id}?as=Dev%20Rao`,{method:'PATCH',body:{Status:'Working',OwnerName:'Dev Rao',Score__c:1}});
  const p=(await E('/sync/pull',{body:{}})).body;assert.ok(p.applied>=1);assert.ok(p.conflicts>=1);const l=(await E('/contacts/'+(await E('/export')).body.leads.find(x=>x.id===lead.External_Id__c).contact_id)).body.leads.find(x=>x.id===lead.External_Id__c);
  assert.equal(l.status,'Working','CRM wins status');assert.equal(l.owner,'Dev Rao');assert.notEqual(Math.round(l.score),1,'engine keeps score');
  await drain();assert.notEqual((await C('/services/data/v59.0/sobjects/Lead/'+lead.Id,{headers:{'x-mops-trace':'noflake'}})).body.Score__c,1,'engine score pushed back')});

test('registration replaces Cvent: form → contact → consent → member → lead → CRM → warehouse',async()=>{
  const k=(await E('/campaigns',{body:{name:'Roundtable',channel:'Events',region:'India',budget:20000}})).body;const ev=(await E('/events',{body:{campaignId:k.id,name:'Test Roundtable',date:'2026-11-12',city:'Pune',capacity:20}})).body;
  const page=await j(H+'/svc/engine/r/'+ev.slug);assert.match(page.body,/<form/);
  const r=await j(H+'/svc/engine/r/'+ev.slug,{ct:'application/x-www-form-urlencoded',body:'first=Zara&last=Q&email=zara%40newco.example&company=NewCo&title=CIO&region=India&consent=on'});assert.match(r.body,/registered/);
  const c=(await E('/contacts/zara@newco.example')).body;assert.equal(c.consent.at(-1).status,'opted_in');assert.match(c.consent.at(-1).law,/DPDP/);assert.equal(c.members[0].status,'Registered');assert.equal(c.leads.length,1);
  await drain();const crm=(await C('/export')).body;assert.ok(crm.Lead.some(l=>l.Email==='zara@newco.example'));assert.ok(crm.CampaignMember.some(m=>m.Email==='zara@newco.example'&&m.Status==='Registered'));
  await W('/elt/run',{body:{}});const q=(await W('/query/campaign?p='+k.id)).body.rows[0];assert.equal(+q.registrations,1)});

test('signals: 6sense/Adobe-style CSV + webhook feed lead scoring',async()=>{const before=(await E('/contacts/C1001')).body.score;
  const r=(await E('/signals/csv',{ct:'text/csv',body:'source,domain,kind,keyword,score\n6sense,sakuraenergy.example,intent,sase,95\n6sense,nobody.example,intent,x,50\n'})).body;assert.equal(r.ingested,1);assert.equal(r.unmatched,1);assert.ok(r.rescored>=1);
  const w=(await E('/signals/webhook',{body:[{source:'Adobe',email:'mei.sato0@sakuraenergy.example',kind:'web',page:'/pricing',score:5}]})).body;assert.equal(w.ingested,1);assert.ok((await E('/contacts/C1001')).body.score>=before)});

test('warehouse: ELT into RAW, marts rebuilt, named queries, read-only SQL',async()=>{const r=(await W('/elt/run',{body:{}})).body;assert.ok(r.rows>500);assert.ok(r.tables.engine_contacts>300);
  for(const q of['pipeline_by_channel','attribution','funnel','consent_health','top_campaigns'])assert.ok(Array.isArray((await W('/query/'+q)).body.rows),q);
  assert.ok((await W('/sql',{body:{sql:'SELECT count(*) n FROM marts.campaign_performance'}})).body.rows[0].n>0);assert.equal((await W('/sql',{body:{sql:'DROP TABLE raw.engine_contacts'}})).status,400)});

test('full campaign run: budget → report, end to end, under 2 minutes, timed against baselines',async()=>{const t=Date.now();const r=(await j(H+'/api/engine/run',{body:{wait:true,pace:0}})).body;
  assert.equal(r.ok,true,r.error);assert.equal(r.steps.length,13);assert.ok(Date.now()-t<120000);assert.ok(r.steps.every(s=>s.status==='done'));assert.ok(r.baselineMinutes>0&&r.speedup>0);
  const rep=r.steps.at(-1).result;assert.ok(+rep.campaign.sent>0);assert.ok(rep.funnel.length===7);const runs=(await j(H+'/api/engine/runs')).body;assert.ok(runs.length>=1)});
