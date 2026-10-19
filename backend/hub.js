// Hub (inside server.js on :8787): event bus + SSE stream for the Engine room, health aggregation, a reverse proxy to every
// service (/svc/<name>/...), and the orchestrator that turns @mops tags into real calls across the services.
const fs=require('fs'),path=require('path');const{PUBLIC,call,invoke}=require('./lib');
const SVCS={engine:{label:'@mops Engine',replaces:'Eloqua · campaign ops · Cvent'},crm:{label:'CRM (fake SFDC)',replaces:'Salesforce stand-in'},mail:{label:'Mail (in-process catcher)',replaces:'Email delivery'},warehouse:{label:'Warehouse',replaces:'Snowflake · Power BI/Tableau'}};
const ring=[],clients=new Set();let seq=0;
function bus(ev){try{ev.offset=require('./core').append(ev)}catch{}ev.id=++seq;ev.at=ev.at||new Date().toISOString();ring.push(ev);if(ring.length>800)ring.shift();const s=`data: ${JSON.stringify(ev)}\n\n`;for(const c of clients)c.write(s)}
const hubEmit=(kind,msg,data={},trace)=>bus({svc:'hub',kind,msg,data,trace});
async function health(){const out={};await Promise.all(Object.keys(SVCS).map(async k=>{const t0=Date.now();try{const r=await call(k,'/health');delete r.__ms;delete r.__http;out[k]={...SVCS[k],...r,ms:Date.now()-t0,docs:`/svc/${k}/docs`}}catch(e){out[k]={...SVCS[k],ok:false,error:'down',docs:`/svc/${k}/docs`}}}));return out}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BL=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','baselines.json')));
let current=null;const lastMaps={};const RUNS=(process.env.MOPS_RUNS_DIR||path.join(__dirname,'runs'));fs.mkdirSync(RUNS,{recursive:true});
// ---------------- the full campaign, end to end ----------------
async function runCampaign(opts={}){if(current&&!current.done)throw new Error('a run is already in progress');const pace=opts.pace??700;const rid='R'+Date.now().toString(36).slice(-5).toUpperCase();
  const run=current={id:rid,started:new Date().toISOString(),steps:[],done:false};const bl=BL();const ctx={};
  hubEmit('run',`▶ full campaign run ${rid} started`,{},rid);
  const step=async(n,tag,task,fn)=>{const trace=rid+':'+n;const st={n,tag,task,status:'running',startedAt:Date.now()};run.steps.push(st);hubEmit('tag',tag,{step:n,task},trace);
    try{st.result=await fn(trace);st.status='done'}catch(e){st.status='failed';st.error=e.message;hubEmit('error',`step ${n} failed: ${e.message}`,{},trace);throw e}
    finally{st.ms=Date.now()-st.startedAt;const b=bl.tasks[task];st.baselineMinutes=b?b.baselineMinutes:null;st.humanMinutes=b?(st.human??0):0;hubEmit('step',`step ${n} done in ${(st.ms/1000).toFixed(1)}s${b?` · baseline ${b.baselineMinutes} min (${b.label})`:''}`,{step:n,ms:st.ms,status:st.status},trace)}
    await sleep(pace);return st.result};
  try{
    await call('crm','/admin/chaos',{body:{failRate:0.12}});
    await step(1,'@mops new Zero Trust Roundtable, Bengaluru, budget $180K','budget',async t=>{const r=await call('engine','/campaigns',{body:{name:'Zero Trust Roundtable – Bengaluru',channel:'Events',region:'India',budget:180000,purpose:'Venue, catering, 2 speakers, invites',owner:'Srisha R.'}},t);ctx.camp=r;return{campaign:r.id,code:r.code,budget:'$180K',route:r.status}});
    await step(2,'@mops approve '+ctx.camp.budgetRequest+'  (Chris, from Webex)','budget',async t=>{run.steps.at(-1).human=0.5;const r=await call('engine',`/budget/${ctx.camp.budgetRequest}/decide`,{body:{decision:'approve',approver:'Chris (Director)'}},t);return{approved:r.status==='approved',approver:'Chris (Director)',rule:'> $150K needs approval'}});
    await step(3,'@mops sync the campaign to CRM','code',async t=>{const d=await call('engine','/sync/drain',{body:{timeoutMs:15000}},t);const c=await call('crm','/services/data/v59.0/sobjects/Campaign/'+ctx.camp.id,{},'noflake');return{crmId:c.Id,code:c.Code__c,status:c.Status,pending:d.pending}});
    await step(4,'@mops segment CIOs, CTOs and CISOs in India, EMEA and US','email',async t=>{const r=await call('engine','/segments',{body:{name:'Security & IT leaders – IN/EMEA/US',text:'CIOs CTOs CISOs in India EMEA US'}},t);ctx.seg=r;return{segment:r.id,contacts:r.count,rules:r.rules}});
    await step(5,'@mops create the event page for Nov 12','event',async t=>{const r=await call('engine','/events',{body:{campaignId:ctx.camp.id,name:'Zero Trust Roundtable',date:'2026-11-12',city:'Bengaluru',capacity:80}},t);ctx.ev=r;return{event:r.id,url:r.url}});
    await step(6,'@mops send the invite','email',async t=>{const r=await call('engine',`/campaigns/${ctx.camp.id}/send`,{body:{segmentId:ctx.seg.id,templateId:'TPL-INVITE',extra:{event_name:'Zero Trust Roundtable',event_date:'12 Nov 2026',event_city:'Bengaluru',event_link:ctx.ev.url}}},t);ctx.send=r;return r});
    await step(7,'(recipients engage: real opens, clicks and unsubscribes hit the tracking endpoints)','email',async t=>{await sleep(400);const msgs=(await call('mail','/messages')).filter(m=>m.headers['x-mops-campaign']===ctx.camp.code);let o=0,k=0,u=0;ctx.clickers=[];
      for(const [i,m] of msgs.entries()){const full=await call('mail','/messages/'+m.id);const px=full.html.match(/src="([^"]+\/t\/o\/[^"]+)"/),lk=full.html.match(/href="([^"]+\/t\/c\/[^"]+)"/),un=full.headers['list-unsubscribe']?.replace(/[<>]/g,'');
        const hit=async(abs,opt={})=>{const u=new URL(abs,PUBLIC);const mm=u.pathname.match(/^\/svc\/(engine|crm|mail|warehouse)(\/.*)?$/);if(!mm)throw new Error('tracking url '+u.pathname);return invoke(mm[1],opt.method||'GET',(mm[2]||'/')+u.search,{headers:opt.headers,raw:opt.body||''})};
        if(i%10<7&&px){await hit(px[1],{headers:{'x-mops-trace':t}});o++}
        if(i%10<4&&lk){await hit(lk[1].replace(/&amp;/g,'&'),{headers:{'x-mops-trace':t}});k++;ctx.clickers.push(m.rcpt)}
        else if(i%10===9&&un&&u<2){await hit(un,{method:'POST',headers:{'x-mops-trace':t,accept:'application/json'}});u++}}
      return{delivered:msgs.length,opens:o,clicks:k,unsubscribes:u}});
    await step(8,'(registrations arrive through the hosted form)','event',async t=>{let n=0;for(const email of ctx.clickers.slice(0,Math.max(3,Math.ceil(ctx.clickers.length*0.6)))){await call('engine','/r/'+ctx.ev.slug,{body:{email,consent:'on'}},t);n++}
      const walk=[['Riya','Menon','riya.menon@orbitfoods.example','Orbit Foods','CIO'],['Arjun','Pillai','arjun.p@tealbank.example','Teal Bank','CISO'],['Kavya','Iyer','kavya@novaports.example','Nova Ports','IT Director']];
      for(const[first,last,email,company,title]of walk){await call('engine','/r/'+ctx.ev.slug,{body:{first,last,email,company,title,region:'India',consent:'on'}},t);n++}return{registrations:n,newContacts:walk.length}});
    await step(9,'@mops pull this week\'s 6sense + Adobe signals','upload',async t=>{const ex=await call('engine','/export');const camp=new Set(ex.members.filter(m=>m.campaign_id===ctx.camp.id).map(m=>m.contact_id));const cts=ex.contacts.filter(c=>camp.has(c.id));
      const doms=[...new Set(cts.map(c=>c.email.split('@')[1]))];const csv='source,domain,kind,keyword,score,at\n'+doms.map((d,i)=>`6sense,${d},intent,${['zero trust','sase','firewall'][i%3]},${70+(i*7)%30},${new Date().toISOString()}`).join('\n');
      const a=await call('engine','/signals/csv',{body:csv,ct:'text/csv'},t);const b=await call('engine','/signals/webhook',{body:cts.slice(0,12).map(c=>({source:'Adobe Analytics',email:c.email,kind:'web',page:'/zero-trust/pricing',score:5}))},t);return{csvRows:doms.length,ingested:a.ingested+b.ingested,rescored:a.rescored+b.rescored,newMQLs:a.newMQLs+b.newMQLs}});
    await step(10,'@mops sync everything to CRM (with retries)','sync',async t=>{await call('crm','/admin/chaos',{body:{failRate:0.3}});const d=await call('engine','/sync/drain',{body:{timeoutMs:25000}},t);await call('crm','/admin/chaos',{body:{failRate:0.12}});let req=0;
      if(d.dead){req=(await call('engine','/sync/retry-failed',{body:{}},t)).requeued;await call('engine','/sync/drain',{body:{timeoutMs:15000}},t)}const s=await call('engine','/sync/status');return{pending:s.pending,retried:d.dead,requeuedFromFailureQueue:req,failureQueue:s.failureQueue.length}});
    await step(11,'(sales works the leads in CRM; @mops pulls changes back)','sync',async t=>{const s=await call('crm','/admin/simulate-sales',{body:{n:8}},t);const ex=await call('crm','/export');const l=ex.Lead.find(x=>x.LastModifiedById!=='integration');await sleep(30);const p=await call('engine','/sync/pull',{body:{}},t);await call('engine','/sync/drain',{body:{timeoutMs:10000}},t);return{salesChanges:s.changed,pulled:p.applied,conflicts:p.conflicts,opportunities:s.did.filter(x=>x.includes('converted')).length}});
    await step(12,'@mops refresh the warehouse','report',async t=>{const r=await call('warehouse','/elt/run',{body:{}},t);return{rows:r.rows,rawTables:Object.keys(r.tables).length,marts:r.marts.length,ms:r.ms}});
    await step(13,'@mops how did the roundtable do, and what\'s the pipeline by channel?','attribution',async t=>{const[c,f,a,p]=await Promise.all(['campaign?p='+ctx.camp.id,'funnel','attribution','pipeline_by_channel'].map(n=>call('warehouse','/query/'+n,{},t)));ctx.report={campaign:c.rows[0],funnel:f.rows,attribution:a.rows.slice(0,5),byChannel:p.rows};
      const x=c.rows[0]||{};hubEmit('answer',`Roundtable: ${x.sent} emailed, ${x.suppressed} suppressed for consent, ${x.opens} opens, ${x.clicks} clicks, ${x.registrations} registered, ${x.mqls} MQLs, $${Math.round((+x.sourced_pipeline||0)/1000)}K pipeline sourced.`,{},t);return ctx.report});
    run.done=true;run.ok=true;
  }catch(e){run.done=true;run.ok=false;run.error=e.message}
  run.finished=new Date().toISOString();run.totalMs=run.steps.reduce((a,s)=>a+s.ms,0);run.wallMs=Date.parse(run.finished)-Date.parse(run.started);
  const tasks=[...new Set(run.steps.map(s=>s.task))];run.baselineMinutes=tasks.reduce((a,k)=>a+(bl.tasks[k]?.baselineMinutes||0),0);run.humanMinutes=run.steps.reduce((a,s)=>a+(s.human||0),0)+bl.touchMinutes*1;
  run.mopsMinutes=+(run.totalMs/60000+run.humanMinutes).toFixed(2);run.speedup=Math.round(run.baselineMinutes/run.mopsMinutes);run.baselineNote=bl._label;
  fs.writeFileSync(path.join(RUNS,`run-${rid}.json`),JSON.stringify(run,null,1));hubEmit('run',run.ok?`■ run ${rid} complete in ${(run.wallMs/1000).toFixed(1)}s · ${run.baselineMinutes} baseline min vs ${run.mopsMinutes} min with @mops (≈${run.speedup}x, placeholder baselines)`:`■ run ${rid} failed: ${run.error}`,{},rid);return run}
// ---------------- single tags typed in the Engine room ----------------
async function tag(text){const q=text.toLowerCase(),t='T'+Date.now().toString(36).slice(-5).toUpperCase();hubEmit('tag',text,{},t);
  if(/elt|refresh.*warehouse/.test(q))return call('warehouse','/elt/run',{body:{}},t);
  if(/attribution/.test(q))return call('warehouse','/query/attribution',{},t);
  if(/funnel/.test(q))return call('warehouse','/query/funnel',{},t);
  if(/pipeline|channel/.test(q))return call('warehouse','/query/pipeline_by_channel',{},t);
  if(/consent/.test(q))return call('warehouse','/query/consent_health',{},t);
  if(/sync/.test(q)){await call('engine','/sync/drain',{body:{timeoutMs:10000}},t);return call('engine','/sync/pull',{body:{}},t)}
  if(/segment|who|find/.test(q))return call('engine','/segments/preview',{body:{text}},t);
  const m=q.match(/\$?(\d+)\s*k/);if(/campaign|budget/.test(q)&&m)return call('engine','/campaigns',{body:{name:text.replace(/@mops/i,'').trim().slice(0,60),channel:/event|roundtable/.test(q)?'Events':'Digital',region:'India',budget:+m[1]*1000}},t);
  return{hint:'Try: "@mops segment CISOs in Japan", "@mops sync now", "@mops refresh the warehouse", "@mops pipeline by channel", "@mops attribution", "@mops new campaign budget $90K"'}}
async function proxy(req,res,name,rest){try{const headers={...req.headers};delete headers['x-mops-internal'];const raw=['POST','PATCH','PUT'].includes(req.method)?await body(req):'';const r=await invoke(name,req.method,rest||'/',{raw,headers});
  const h={...(r.headers||{})};if(!h['content-type']&&!h['Content-Type'])h['content-type']=r.raw&&r.raw.length&&r.raw[0]===123?'application/json':'text/plain';
  res.writeHead(r.status,h);res.end(r.raw)}catch(e){if(res.headersSent)return;res.writeHead(e.status||502,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message||'bad gateway'}))}}
function engineSnap(){let db;try{const Database=require('better-sqlite3');db=new Database(path.join(require('./lib').DATA,'engine.db'),{readonly:true,fileMustExist:true})}catch(e){return{counts:{},campaigns:[],budgets:[],events:[],signals:[],audit:[]}}
 const n=t=>{try{return db.prepare('SELECT count(*) n FROM '+t).get().n}catch(e){return 0}}
 const snap={counts:{accounts:n('accounts'),contacts:n('contacts'),campaigns:n('campaigns'),budgets:n('budget_requests'),consent:n('consent_ledger'),sends:n('sends'),events:n('events'),signals:n('signals'),audit:n('audit'),uploads:n('uploads'),syncPending:n("sync_jobs WHERE status='pending'"),syncDead:n("sync_jobs WHERE status='dead'")},
  campaigns:db.prepare('SELECT id,code,name,status,budget FROM campaigns ORDER BY created_at DESC LIMIT 4').all(),
  budgets:db.prepare('SELECT id,amount,status,approver,rule FROM budget_requests ORDER BY requested_at DESC LIMIT 4').all(),
  events:db.prepare('SELECT id,name,city,date FROM events ORDER BY created_at DESC LIMIT 4').all(),
  signals:db.prepare('SELECT source,kind,keyword,score FROM signals ORDER BY id DESC LIMIT 4').all(),
  audit:db.prepare('SELECT at,actor,action,object FROM audit ORDER BY id DESC LIMIT 5').all()};
 db.close();return snap}
async function architecture(){const h=await health();const core=require('./core');const st=core.stats();const snap=engineSnap();const rep=require('./fields').repeatEntry();
 const lc=require('./lifecycle');let draft=null;try{draft=lc.get('LC-DEMO')}catch(e){draft=null}
 const conv=core.db.prepare('SELECT surface, count(*) n FROM conversations GROUP BY surface').all();const by=Object.fromEntries(conv.map(r=>[r.surface,r.n]));
 const recent=core.db.prepare('SELECT offset,svc,kind,msg,at FROM log ORDER BY offset DESC LIMIT 6').all();
 const W=require('./workers');const inc=W.incidents&&W.incidents[0];
 let load=null;try{const f=path.join(RUNS,'loadtest-latest.json');if(fs.existsSync(f)){const j=JSON.parse(fs.readFileSync(f));const send=j.phases&&j.phases.send||{},seg=j.phases&&j.phases.segment||{};load={contacts:j.contacts,sends:j.sends,messagesPerSec:send.messagesPerSec||null,segmentP95:seg.p95Ms!=null?seg.p95Ms:null,label:j.label||''}}}catch(e){}
 const e=h.engine||{},c=h.crm||{},m=h.mail||{},w=h.warehouse||{};
 const node=(id,name,role,tag,badge,records)=>({id,name,role,tag,badge,records:records||[]});
 const handoffs=['Marketer types the Airtable (budget form)','Airtable notifies Chris M.','Chris M. replies to the marketer','Marketer emails the agency for an SOW','Agency returns the SOW','Marketer retypes the approved amount into Command Center (BAN/CC ID)','Command Center sends the BAN ID back','Marketer creates the campaign in SFDC and the event platform','Marketer exports a file and rebuilds the report'];
 const brainMode=process.env.MOPS_API_KEY?'llm':'rules';
 return{brainMode,model:process.env.MOPS_MODEL||null,inbox:process.env.MOPS_INBOX||'mops@mops.local',
  compare:{today:{tools:rep.today.toolsTouched,handoffs:handoffs.length,retyped:rep.today.fieldEntries},mops:{conversations:1,approvals:1}},handoffs,
  scale:{events:st.events,ratePerSec:st.ratePerSec,deadLetters:st.deadLetters,consumers:st.consumers,load,heal:inc?{id:inc.id,resolved:!!inc.resolved,ms:inc.ms||null,steps:(inc.steps||[]).length}:null,services:{engine:!!e.ok,crm:!!c.ok,mail:!!m.ok,warehouse:!!w.ok,engineMs:e.ms,crmMs:c.ms,mailMs:m.ms,warehouseMs:w.ms}},
  principles:[
   {name:'Fewest steps',text:'Delete before you add. One conversation and one approval replace the tools, the handoffs, and the retyped fields.'},
   {name:'Acts first',text:'@mops notices the gap, shows the source of every field it filled, runs Budget, SOW, Codes, Compliance and Data together, learns after an approval, and checks its own work.'},
   {name:'One control plane',text:'Every campaign, one agent, policies set once. This map is the topology: what is replaced, what stays connected, and the live event bus.'}],
  layers:[
   {id:'channels',name:'Channels',hint:'All of them tag @mops',nodes:[
    node('app','App','The marketer’s screen',null,`${by.app||0} tags` ,[]),
    node('email','Email',(process.env.MOPS_INBOX||'mops@mops.local')+' · reply in thread',null,`${by.email||0} tags`,[]),
    node('webex','Webex space','Signed webhook, same agent',null,`${by.webex||0} tags`,[]),
    node('slack','Slack-style chat','Same tag path as the app. No separate Slack app in this demo.',null,'same agent',[])]},
   {id:'brain',name:'@mops brain',hint:'One reasoning layer',nodes:[
    node('llm','Reasoning',brainMode==='llm'?'Model '+ (process.env.MOPS_MODEL||'connected'):'Rule mode now. An OpenAI or Azure key plugs into the same tools later.',null,brainMode,[]),
    node('planner','Planner','One intent parser for every channel',null,draft?draft.step:'idle',[]),
    node('memory','Memory','Campaign, agency, venue and cost history',null,`${(draft&&draft.learned||[]).length} saved`,(draft&&draft.learned||[]).slice(0,6)),
    node('policy','Policy engine','$150K → Chris M. Consent per country. Code and BAN naming.',null,'3 policies',draft&&draft.policies||[]),
    node('audit','Guardrails','Audit log on every budget decision. The public demo is gated.',null,`${snap.counts.audit} audit rows`,snap.audit)]},
   {id:'agents',name:'Agent layer',hint:'Named agents, live status',nodes:(draft&&draft.agents||[]).map(a=>node(a.id,a.name,a.status,null,a.state,[]))},
   {id:'bus',name:'Event bus + workers',hint:'Append-only log',nodes:[
    node('log','Append-only log','SQLite offsets. Every service publishes here.',null,`${st.events} events`,recent),
    node('retry','Retries','Sync jobs retry, then land in a failure queue',null,`${snap.counts.syncPending} pending · ${snap.counts.syncDead} dead`,[]),
    node('heal','Self-heal','A worker waits out a CRM outage and replays the queue',null,inc?(inc.resolved?'healed '+inc.id:'healing'):'idle',inc?(inc.steps||[]).slice(-4):[]),
    node('idem','Idempotency','Consumers commit an offset. A second undo is refused.',null,`${st.consumers.length} consumers`,st.consumers.map(x=>({name:x.name,lag:x.lag,processed:x.processed})))]},
   {id:'systems',name:'Systems of record',hint:'Replaced or connected',nodes:[
    node('airtable','Airtable (budget form)','Budget intake. Replaced by @mops intake.','replaced',draft&&draft.form?`${draft.form.filled}/${draft.form.total} filled`:'',(draft&&draft.form&&draft.form.items||[]).filter(x=>x.value).slice(0,6)),
    node('command','Command Center (BAN/CC ID)','Budget approvals and the BAN / CC ID. Replaced by the Codes agent and the approval policy.','replaced',draft&&draft.codes?draft.codes.ban_id:'not issued yet',draft&&draft.codes?[{ban:draft.codes.ban_id,cc:draft.codes.cc_id,code:draft.codes.campaign_code}]:snap.budgets),
    node('eloqua','Eloqua','Email, forms, nurture. Replaced by the @mops engine.','replaced',`${snap.counts.sends} sends`,[]),
    node('sfdc','SFDC','CRM, campaigns, leads, owners. Connected. @mops writes to it.','connected',`${(c.counts&&c.counts.Campaign)||0} campaigns`,snap.campaigns),
    node('snow','Snowflake','Warehouse. Replaced by the @mops warehouse (SQLite in this demo).','replaced',w.counts?`${w.counts.raw_rows||0} rows`:'',[]),
    node('powerbi','Power BI / Tableau','Reporting. Replaced by @mops reports.','replaced',w.counts?`${w.counts.marts_tables||0} marts`:'',[]),
    node('cvent','Cvent / event platform','Registration. Connected. @mops creates the event and the form and keeps the event id.','connected',`${snap.counts.events} events`,snap.events),
    node('six','6sense & Adobe','Intent and web signals. Connected. @mops reads them.','connected',`${snap.counts.signals} signals`,snap.signals),
    node('agency','Agency','SOW in and out. Connected.','connected',draft&&draft.sowRequest?draft.sowRequest.status:'no request yet',draft&&draft.sowRequest?[draft.sowRequest]:[])]},
   {id:'data',name:'Data',hint:'Live counts',nodes:[
    node('d-contacts','Contacts','People the engine can email',null,String(snap.counts.contacts),[]),
    node('d-accounts','Accounts','Companies on those contacts',null,String(snap.counts.accounts),[]),
    node('d-campaigns','Campaigns','Codes, status, budget',null,String(snap.counts.campaigns),snap.campaigns),
    node('d-budgets','Budgets','Requests and decisions',null,String(snap.counts.budgets),snap.budgets),
    node('d-sows','SOWs','Drafts with a source on every field',null,draft&&draft.sow?'1 open':'0',draft&&draft.sow?draft.sow.fields.slice(0,5):[]),
    node('d-consent','Consent','Ledger rows, per country',null,String(snap.counts.consent),[])]}]}}
function body(req,limit=8_000_000){return new Promise((resolve,reject)=>{let b='';let n=0;let tooBig=false;req.on('data',c=>{n+=c.length;if(n>limit){tooBig=true;return}b+=c});req.on('end',()=>{if(tooBig){const e=new Error('Request is too large');e.status=413;reject(e);return}resolve(b)});req.on('error',reject)})}
const J=(res,o,c=200)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
async function handle(req,res,p,u){
  const sv=p.match(/^\/svc\/(engine|crm|mail|warehouse)(\/.*)?$/);
  if(sv){const rest=sv[2]||'/';const pub=/^\/(t|u|r)\//.test(rest);
    if(!pub){if(sv[1]==='warehouse'&&/^\/sql/.test(rest)){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:'Warehouse SQL is not available from the browser.'}));return true}
      const user=req.mopsUser;if(!user||user.role!=='admin'){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:'Admin only.'}));return true}}
    proxy(req,res,sv[1],rest+(u.search||''));return true}
  if(p==='/engine'||p==='/engine/'){res.writeHead(200,{'content-type':'text/html'});res.end(fs.readFileSync(path.join(__dirname,'..','ui','engine.html')));return true}
  if(!p.startsWith('/api/engine/'))return false;const r=p.slice(12);
  if(r==='bus'&&req.method==='POST'){bus(JSON.parse(await body(req)));J(res,{ok:1});return true}
  if(r==='stream'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive'});res.write(`retry: 1500\n\n`);for(const e of ring.slice(-(+u.searchParams.get('backlog')||80)))res.write(`data: ${JSON.stringify(e)}\n\n`);clients.add(res);const ka=setInterval(()=>res.write(': ka\n\n'),15000);req.on('close',()=>{clients.delete(res);clearInterval(ka)});return true}
  if(r==='log'){if(!req.mopsUser||req.mopsUser.role!=='admin'){J(res,{error:'Admin only.'},403);return true}J(res,ring.slice(-300));return true}
  if(r==='health'){J(res,await health());return true}
  if(r==='architecture'){J(res,await architecture());return true}
  if(r==='run'&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');if(current&&!current.done){J(res,{error:'run in progress',run:current},409);return true}
    const pr=runCampaign(b);if(b.wait||process.env.VERCEL){J(res,await pr)}else{pr.catch(()=>{});J(res,{started:true})}return true}
  if(r==='run/current'){J(res,current||{});return true}
  if(r==='runs'){J(res,fs.readdirSync(RUNS).filter(f=>f.endsWith('.json')).sort().reverse().slice(0,10).map(f=>JSON.parse(fs.readFileSync(path.join(RUNS,f)))).map(({steps,...x})=>x));return true}
  if(r==='tag'&&req.method==='POST'){const b=JSON.parse(await body(req));try{const x=await require('./agent').handle({text:b.text||'',surface:b.surface||'app',sender:b.sender||'Srisha R.'});J(res,x)}catch(e){J(res,{error:e.message},500)}return true}
  const W=require('./workers'),COV=require('./cover'),CORE=require('./core');
  if(r==='core'){J(res,CORE.stats());return true}
  if(r==='conversations'){J(res,CORE.db.prepare('SELECT * FROM conversations ORDER BY id DESC LIMIT 50').all());return true}
  if(r==='webhooks/webex'&&req.method==='POST'){const raw=await body(req);const x=await W.webex(raw,req.headers['x-spark-signature']);J(res,x.body,x.status);return true}
  if(r==='demo/email'&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');const info=require('./mail').deliver({from:'"Srisha R." <srisha@northwind.example>',to:'chris@northwind.example',cc:process.env.MOPS_INBOX||'mops@mops.local',subject:b.subject||'Partner webinar for Japan',text:b.text||'Chris, planning a partner webinar for Japan next quarter.\n\n@mops new partner webinar in Japan, budget $60K\n\nThanks,\nSrisha'});
    await CORE.drain(8000);J(res,{sent:true,messageId:info.messageId});return true}
  if(r==='demo/webex'&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');const raw=JSON.stringify({resource:'messages',event:'created',data:{roomId:'Y2lzY29zcGFyazovL2RlbW8',personEmail:b.from||'priya.n@northwind.example',text:b.text||'@mops what is the pipeline by channel?'}});
    const sig=require('crypto').createHmac('sha1',process.env.MOPS_WEBEX_SECRET).update(raw).digest('hex');const x=await W.webex(raw,sig);J(res,x.body,x.status);return true}
  if(r==='heal/inject'&&req.method==='POST'){if(!req.mopsUser||req.mopsUser.role!=='admin'){J(res,{error:'Admin only.'},403);return true}J(res,await W.injectFailure());return true}
  if(r==='heal/incidents'){J(res,W.incidents);return true}
  if(r==='loadtest'&&req.method==='POST'){if(!req.mopsUser||req.mopsUser.role!=='admin'){J(res,{error:'Admin only.'},403);return true}const b=JSON.parse(await body(req)||'{}');J(res,await W.startLoad(b));return true}
  if(r==='loadtest'){const f=path.join(RUNS,'loadtest-latest.json');const lim=W.loadLimits();J(res,{live:W.getLoad(),latest:fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null,defaults:{contacts:lim.defaultContacts,sends:lim.defaultSends,maxContacts:lim.maxContacts,maxSends:lim.maxSends,memoryGb:lim.memoryGb,vercel:!!lim.vercel,label:lim.label}});return true}
  const INT=require('./intake'),MAP=require('./mapper');let mm;
  if(r==='intake'&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');J(res,await INT.run(b));return true}
  mm=null;{const fx=r.match(/^fixtures\/([\w.-]+)$/);if(fx){const f=path.join(__dirname,'test','fixtures',fx[1]);if(fs.existsSync(f)){res.writeHead(200,{'content-type':'application/octet-stream'});res.end(fs.readFileSync(f))}else{res.writeHead(404);res.end()}return true}}
  if(r==='fixtures'){J(res,fs.readdirSync(path.join(__dirname,'test','fixtures')));return true}
  const ZT=require('./zerotouch');
  if(r==='zero/budget'&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');J(res,await ZT.budgetDraft(b.quarter));return true}
  if(r==='zero/budget'){J(res,ZT.latestBudget()||await ZT.budgetDraft());return true}
  mm=r.match(/^zero\/budget\/(BUD-[\w-]+)\/(approve|adjust)$/);if(mm&&req.method==='POST'){const b=JSON.parse(await body(req)||'{}');J(res,ZT.decide(mm[1],{action:mm[2],adjust:b.adjust}));return true}
  mm=r.match(/^sow\/(SOW-\w+)\/(state|answer|sign)$/);if(mm){const b=req.method==='POST'?JSON.parse(await body(req)||'{}'):{};J(res,mm[2]==='state'?ZT.sowGet(mm[1]):mm[2]==='answer'?ZT.sowAnswer(mm[1],b.answers||{}):ZT.sowSign(mm[1],b.by));return true}
  if(r==='zero/data'){J(res,ZT.DATA);return true}
  const LC=require('./lifecycle');
  if(r==='lifecycle/start'&&req.method==='POST'){let raw;try{raw=await body(req,2_000_000)}catch(e){J(res,{error:'Request is too large'},e.status||413);return true}const b=JSON.parse(raw||'{}');J(res,await LC.start({...b,user:req.mopsUser}));return true}
  if(r==='lifecycle/reset'&&req.method==='POST'){J(res,LC.present(LC.resetDemo()));return true}
  if(r==='lifecycle'){const out={draft:LC.present(LC.ensure()),items:LC.list(req.mopsUser),steps:LC.STEPS};if(u.searchParams.get('full')==='1')out.rows=LC.listRows(req.mopsUser);J(res,out);return true}
  mm=r.match(/^lifecycle\/(LC-[\w]+)\/sow\.(docx|pdf|html)$/);if(mm){const kind=mm[2]==='html'?'html':mm[2];const f=LC.file(mm[1],kind);if(!f){res.writeHead(404);return res.end('not ready'),true}
    const h={'content-type':f.type};if(kind!=='html'&&f.name)h['content-disposition']=`attachment; filename="${f.name}"`;res.writeHead(200,h);res.end(f.body);return true}
  mm=r.match(/^lifecycle\/(LC-[\w]+)\/upload\.csv$/);if(mm){const row=LC.read(mm[1],req.mopsUser);if(row&&row.forbidden){J(res,{error:row.error},403);return true}const csv=row&&row.setup&&row.setup.uploadCsv;if(!csv){res.writeHead(404);return res.end(''),true}res.writeHead(200,{'content-type':'text/csv','content-disposition':`attachment; filename="${mm[1]}-sfdc-upload.csv"`});res.end(csv);return true}
  mm=r.match(/^lifecycle\/(LC-[\w]+)\/upload-errors\.csv$/);if(mm){const row=LC.read(mm[1],req.mopsUser);if(row&&row.forbidden){J(res,{error:row.error},403);return true}const csv=row&&row.setup&&row.setup.uploadPreview&&row.setup.uploadPreview.errorCsv;if(!csv){res.writeHead(404);return res.end(''),true}res.writeHead(200,{'content-type':'text/csv','content-disposition':'attachment; filename="upload-errors.csv"'});res.end(csv);return true}
  mm=r.match(/^lifecycle\/(LC-[\w]+)$/);if(mm&&req.method==='POST'){let raw;try{raw=await body(req)}catch(e){J(res,{error:'Request is too large'},e.status||413);return true}const b=JSON.parse(raw||'{}');try{const out=await LC.act(mm[1],b,req.mopsUser);if(out&&out.forbidden){J(res,{error:out.error},403);return true}if(out&&out.fileRejected){J(res,out,400);return true}J(res,out||{error:'not found'},out?200:404)}catch(e){J(res,{error:e.message},500)}return true}
  if(mm){const out=LC.read(mm[1],req.mopsUser);if(out&&out.forbidden){J(res,{error:out.error},403);return true}J(res,out||{error:'not found'},out?200:404);return true}
  if(r==='intakes'){J(res,INT.list());return true}
  if(r==='repeat-entry'){J(res,require('./fields').repeatEntry());return true}
  mm=r.match(/^sow\/(SOW-[\w-]+)$/);if(mm){const s=INT.sow(mm[1]);res.writeHead(s?200:404,{'content-type':'text/html'});res.end(s?s.html:'not found');return true}
  mm=r.match(/^intake\/(IN-\w+)\/upload-template\.csv$/);if(mm){const c=INT.template(mm[1]);res.writeHead(c?200:404,{'content-type':'text/csv','content-disposition':`attachment; filename="${mm[1]}-sfdc-upload-template.csv"`});res.end(c||'');return true}
  if(r==='map'&&req.method==='POST'){const b=JSON.parse(await body(req));const t0=Date.now();let cid=b.campaignId,dc=b.defaultCountry;
    if(b.intakeId){const it=INT.list().find(x=>x.id===b.intakeId);if(it){cid=cid||it.artefacts.sfdc_campaign_id;dc=dc||it.fields.country}}
    const out=await MAP.map(b.name,Buffer.from(b.base64,'base64'),{campaignId:cid,defaultCountry:dc,leadSource:b.leadSource});out.ms=Date.now()-t0;out.id='MAP-'+Date.now().toString(36).slice(-5).toUpperCase();lastMaps[out.id]=out;W.setLastMap(out);
    bus({svc:'hub',kind:'answer',msg:`mapped ${out.file}: header on row ${out.headerRow}, ${out.mapping.filter(m=>m.target).length} columns → SFDC template, ${out.stats.output} rows, ${out.stats.ownersFound} owner IDs, ${out.quarantined.length} quarantined, ${out.duplicatesRemoved} duplicates removed (${out.ms}ms)`,data:{},trace:out.id});J(res,out);return true}
  mm=r.match(/^map\/(MAP-\w+)\.csv$/);if(mm){const m=lastMaps[mm[1]];res.writeHead(m?200:404,{'content-type':'text/csv','content-disposition':`attachment; filename="${(m?.file||'x').replace(/\.\w+$/,'')}-sfdc.csv"`});res.end(m?m.csv:'');return true}
  if(r==='efficiency'){J(res,W.efficiency());return true}
  if(r==='covered'){if(!global.__mopsCoveredOnce){global.__mopsCoveredOnce=true;try{await COV.scan('startup')}catch(e){}}J(res,COV.list());return true}
  if(r==='covered/scan'&&req.method==='POST'){J(res,await COV.scan('manual'));return true}
  const um=r.match(/^covered\/(COV-\d+)\/undo$/);if(um&&req.method==='POST'){try{J(res,await COV.undo(um[1]))}catch(e){J(res,{error:e.message},409)}return true}
  if(r==='reset'&&req.method==='POST'){if(!req.mopsUser||req.mopsUser.role!=='admin'){J(res,{error:'Admin only.'},403);return true}current=null;ring.length=0;require('./core').reset();const s=await call('engine','/admin/seed',{body:{}});await call('mail','/admin/reset',{body:{}});await call('warehouse','/elt/run',{body:{}});J(res,s);return true}
  J(res,{error:'unknown engine route'},404);return true}
module.exports={handle,bus,health,runCampaign};setImmediate(()=>require('./workers'));
