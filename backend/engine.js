// @mops marketing engine: replaces Eloqua (contacts, segments, consent, email), the campaign/budget workflow,
// Cvent-style registration, signal-based lead scoring, and the CRM sync connector. Own SQLite database.
const path=require('path'),fs=require('fs'),crypto=require('crypto'),Database=require('better-sqlite3'),nodemailer=require('nodemailer');
const{PORTS,URLS,PUBLIC,DATA,now,emitter,parseCSV,service,err,openapi}=require('./lib');
const emit=emitter('engine');const db=new Database(path.join(DATA,'engine.db'));db.pragma('journal_mode=WAL');
const SECRET=process.env.MOPS_SECRET||'dev-only-secret';const APPROVAL_LIMIT=+(process.env.MOPS_APPROVAL_LIMIT||150000);
db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT,region TEXT,segment TEXT,industry TEXT,domain TEXT);
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,email TEXT UNIQUE,first TEXT,last TEXT,title TEXT,account_id TEXT,region TEXT,source TEXT,score REAL DEFAULT 0,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS consent_ledger(id INTEGER PRIMARY KEY,contact_id TEXT,channel TEXT,status TEXT,law TEXT,basis TEXT,source TEXT,evidence TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS segments(id TEXT PRIMARY KEY,name TEXT,rules TEXT,last_count INT,created_at TEXT);
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,name TEXT,subject TEXT,html TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,code TEXT UNIQUE,name TEXT,channel TEXT,region TEXT,fy_quarter TEXT,budget REAL,spend REAL DEFAULT 0,status TEXT,owner TEXT,crm_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS budget_requests(id TEXT PRIMARY KEY,campaign_id TEXT,amount REAL,purpose TEXT,status TEXT,approver TEXT,rule TEXT,requested_by TEXT,requested_at TEXT,decided_at TEXT);
CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,campaign_id TEXT,contact_id TEXT,status TEXT,crm_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,contact_id TEXT,campaign_id TEXT,status TEXT,score REAL,owner TEXT,opp_id TEXT,crm_id TEXT,created_at TEXT,updated_at TEXT,synced_at TEXT);
CREATE TABLE IF NOT EXISTS sends(id TEXT PRIMARY KEY,campaign_id TEXT,contact_id TEXT,template_id TEXT,status TEXT,reason TEXT,law TEXT,smtp_id TEXT,sent_at TEXT,opened_at TEXT,clicked_at TEXT,unsub_at TEXT);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,slug TEXT UNIQUE,name TEXT,campaign_id TEXT,date TEXT,city TEXT,capacity INT,created_at TEXT);
CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY,event_id TEXT,contact_id TEXT,consent INT,at TEXT);
CREATE TABLE IF NOT EXISTS signals(id INTEGER PRIMARY KEY,source TEXT,account_id TEXT,contact_id TEXT,kind TEXT,keyword TEXT,score REAL,at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT,actor TEXT,action TEXT,object TEXT,detail TEXT,trace TEXT);
CREATE TABLE IF NOT EXISTS sync_jobs(id INTEGER PRIMARY KEY,object TEXT,local_id TEXT,status TEXT,attempts INT DEFAULT 0,next_at INTEGER,last_error TEXT,trace TEXT,created_at TEXT,done_at TEXT,UNIQUE(object,local_id,status));
CREATE TABLE IF NOT EXISTS conflicts(id INTEGER PRIMARY KEY,object TEXT,local_id TEXT,field TEXT,local_val TEXT,remote_val TEXT,winner TEXT,rule TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,name TEXT,campaign_id TEXT,status TEXT,rows INT,imported INT DEFAULT 0,quarantined INT DEFAULT 0,at TEXT);
CREATE TABLE IF NOT EXISTS upload_rows(id INTEGER PRIMARY KEY,upload_id TEXT,data TEXT,status TEXT,reason TEXT,contact_id TEXT);
CREATE TABLE IF NOT EXISTS scheduled_sends(id TEXT PRIMARY KEY,campaign_id TEXT,body TEXT,due_at INTEGER,status TEXT,result TEXT,created_by TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS seq(k TEXT PRIMARY KEY,n INT);`);
for(const c of['start_date','end_date','country','product','intake_id','event_id'])try{db.exec(`ALTER TABLE campaigns ADD COLUMN ${c} TEXT`)}catch{}
const one=(q,...a)=>db.prepare(q).get(...a),all=(q,...a)=>db.prepare(q).all(...a),run=(q,...a)=>db.prepare(q).run(...a);
const nextId=(k,p,w=4)=>{run('INSERT INTO seq VALUES(?,1) ON CONFLICT(k) DO UPDATE SET n=n+1',k);return p+String(one('SELECT n FROM seq WHERE k=?',k).n).padStart(w,'0')};
const audit=(actor,action,object,detail,trace)=>run('INSERT INTO audit(at,actor,action,object,detail,trace) VALUES(?,?,?,?,?,?)',now(),actor,action,object,JSON.stringify(detail||{}),trace||null);
// ---------- consent: an append-only ledger; the current state is the latest row per contact ----------
const LAW={India:'DPDP (IN)',Japan:'APPI + Anti-Spam Act (JP)',ANZ:'Spam Act 2003 (AU/NZ)',ASEAN:'PDPA (SG/MY)',EMEA:'GDPR + ePrivacy (EU)',US:'CAN-SPAM (US)'};
const OPT_OUT_MODEL=new Set(['US']); // CAN-SPAM: email allowed unless the person opted out. Everywhere else here needs a positive opt-in.
const consentOf=cid=>one("SELECT * FROM consent_ledger WHERE contact_id=? AND channel='email' ORDER BY id DESC LIMIT 1",cid);
function canEmail(c){const cs=consentOf(c.id),st=cs?cs.status:'unknown',law=LAW[c.region]||'Unknown jurisdiction';
  if(st==='opted_out')return{ok:false,reason:'opted out',law};
  if(st==='opted_in')return{ok:true,law};
  if(OPT_OUT_MODEL.has(c.region))return{ok:true,law,note:'opt-out model; unsubscribe + postal address included'};
  return{ok:false,reason:'no consent on record',law}}
function recordConsent(cid,status,basis,source,evidence,trace){const c=one('SELECT region FROM contacts WHERE id=?',cid);
  run('INSERT INTO consent_ledger(contact_id,channel,status,law,basis,source,evidence,at) VALUES(?,?,?,?,?,?,?,?)',cid,'email',status,LAW[c?.region]||'?',basis,source,evidence||'',now());
  audit('system','consent.'+status,cid,{basis,source},trace)}
const CURRENT_CONSENT=`(SELECT status FROM consent_ledger cl WHERE cl.contact_id=c.id AND channel='email' ORDER BY id DESC LIMIT 1)`;
// ---------- segments: JSON rules compiled to parameterised SQL over a whitelist of fields ----------
const FIELDS={title:'c.title',region:'c.region',segment:'a.segment',industry:'a.industry',account:'a.name',score:'c.score',email:'c.email',source:'c.source',consent:`COALESCE(${CURRENT_CONSENT},'unknown')`,
  intent:'(SELECT MAX(score) FROM signals s WHERE s.account_id=c.account_id)',engaged_campaign:'(SELECT group_concat(campaign_id) FROM members m WHERE m.contact_id=c.id)'};
function compile(rules){const params=[];const one_=r=>{const f=FIELDS[r.field];if(!f)throw err(400,'unknown field '+r.field);const v=r.value;
  switch(r.op){case'eq':params.push(v);return`${f}=?`;case'neq':params.push(v);return`COALESCE(${f},'')!=?`;case'in':{const a=[].concat(v);params.push(...a);return`${f} IN (${a.map(()=>'?')})`}
  case'contains':params.push('%'+v+'%');return`${f} LIKE ?`;case'gte':params.push(+v);return`COALESCE(${f},0)>=?`;case'lte':params.push(+v);return`COALESCE(${f},0)<=?`;default:throw err(400,'unknown op '+r.op)}};
  const parts=[];if(rules.all?.length)parts.push(rules.all.map(one_).join(' AND '));if(rules.any?.length)parts.push('('+rules.any.map(one_).join(' OR ')+')');
  return{sql:`SELECT c.*,a.name account,a.segment,a.industry FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id WHERE ${parts.join(' AND ')||'1=1'} ORDER BY c.id`,params}}
const resolve=rules=>{const q=compile(rules);return all(q.sql,...q.params)};
const TITLES={cio:'CIO',cto:'CTO',ciso:'CISO','head of security':'Head of Security','it director':'IT Director','vp infra':'VP Infrastructure','network manager':'Network Manager',procurement:'Procurement Manager'};
function nlToRules(text){const q=text.toLowerCase(),all_=[];const t=Object.entries(TITLES).filter(([k])=>new RegExp('\\b'+k+'s?\\b').test(q)).map(([,v])=>v);if(t.length)all_.push({field:'title',op:'in',value:t});
  const r=['India','Japan','ANZ','ASEAN','EMEA','US'].filter(x=>q.includes(x.toLowerCase()));if(r.length)all_.push({field:'region',op:'in',value:r});
  if(/enterprise/.test(q))all_.push({field:'segment',op:'eq',value:'Enterprise'});if(/commercial/.test(q))all_.push({field:'segment',op:'eq',value:'Commercial'});
  if(/opted.?in|consent/.test(q))all_.push({field:'consent',op:'eq',value:'opted_in'});const m=q.match(/intent\s*(?:>=?|over|above)\s*(\d+)/);if(m)all_.push({field:'intent',op:'gte',value:+m[1]});return{all:all_}}
// ---------- campaigns, codes, budgets ----------
const CH={ABM:'ABM',Digital:'DIG',Partner:'PTR','Lead gen':'LGN',Events:'EVT',Event:'EVT'};const RG={India:'IND',Japan:'JPN',ANZ:'ANZ',ASEAN:'ASN',EMEA:'EMA',US:'USA'};
function fyq(d=new Date()){const m=d.getMonth(),y=d.getFullYear();const fy=(m>=7?y+1:y)%100;const q=Math.floor(((m-7+12)%12)/3)+1;return`FY${fy}Q${q}`} // fiscal year starts in August
function makeCode(channel,region,d){const base=`${fyq(d)}-${RG[region]||'GLB'}-${CH[channel]||'GEN'}`;return nextId('code:'+base,base+'-')}
// ---------- scoring ----------
function rescore(cid,trace){const c=one('SELECT * FROM contacts WHERE id=?',cid);if(!c)return;const t=c.title||'';
  const fit=/CIO|CTO|CISO/.test(t)?30:/VP|Head/.test(t)?20:/Director|Manager/.test(t)?10:5;
  const e=one('SELECT count(opened_at) o,count(clicked_at) k FROM sends WHERE contact_id=?',cid);const reg=one('SELECT count(*) n FROM registrations WHERE contact_id=?',cid).n;
  const intent=one('SELECT MAX(score) s FROM signals WHERE account_id=? OR contact_id=?',c.account_id,cid).s||0;const web=one("SELECT count(*) n FROM signals WHERE contact_id=? AND kind='web'",cid).n;
  const score=Math.round(fit+Math.min(15,e.o*5)+Math.min(20,e.k*10)+(reg?20:0)+intent*0.3+Math.min(10,web*2));
  run('UPDATE contacts SET score=?,updated_at=? WHERE id=?',score,now(),cid);
  const lead=one("SELECT * FROM leads WHERE contact_id=? AND status NOT IN('Converted','Disqualified') ORDER BY created_at DESC LIMIT 1",cid);
  if(lead){run('UPDATE leads SET score=?,updated_at=? WHERE id=?',score,now(),lead.id);if(score>=60&&['Open','Registered'].includes(lead.status)){run("UPDATE leads SET status='MQL' WHERE id=?",lead.id);emit('score',`${c.email} crossed 60 → MQL (score ${score})`,{},trace)}enqueue('Lead',lead.id,trace)}
  else if(score>=60){const m=one('SELECT campaign_id FROM members WHERE contact_id=? ORDER BY updated_at DESC LIMIT 1',cid);const id=nextId('lead','LD');
    run('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,cid,m?.campaign_id||null,'MQL',score,null,null,null,now(),now(),null);emit('score',`${c.email} score ${score} → new MQL ${id}`,{},trace);audit('scoring','lead.create',id,{score},trace);enqueue('Lead',id,trace)}
  return score}
// ---------- CRM sync connector: durable job queue, retries with backoff, dead-letter queue, two-way pull with conflict rules ----------
function enqueue(object,id,trace){run("INSERT OR IGNORE INTO sync_jobs(object,local_id,status,next_at,trace,created_at) VALUES(?,?,'pending',?,?,?)",object,id,Date.now(),trace||null,now())}
function payload(object,id){if(object==='Campaign'){const c=one('SELECT * FROM campaigns WHERE id=?',id);return['Campaign',id,{Name:c.name,Type:c.channel,Status:c.status,BudgetedCost:c.budget,ActualCost:c.spend,Region__c:c.region,Code__c:c.code,StartDate:c.start_date,EndDate:c.end_date,Country__c:c.country,Product__c:c.product,Event_Id__c:c.event_id}]}
  if(object==='CampaignMember'){const m=one('SELECT m.*,c.email FROM members m JOIN contacts c ON c.id=m.contact_id WHERE m.id=?',id);return['CampaignMember',id,{CampaignExt:m.campaign_id,ContactExt:m.contact_id,Email:m.email,Status:m.status}]}
  const l=one('SELECT l.*,c.email,c.first,c.last,c.title,a.name company FROM leads l JOIN contacts c ON c.id=l.contact_id LEFT JOIN accounts a ON a.id=c.account_id WHERE l.id=?',id);
  return['Lead',id,{Email:l.email,FirstName:l.first,LastName:l.last,Company:l.company||'Unknown',Title:l.title,Status:l.status,Score__c:l.score,CampaignExt:l.campaign_id}]}
const TBL={Campaign:'campaigns',CampaignMember:'members',Lead:'leads'};const MAX_ATTEMPTS=+(process.env.SYNC_MAX_ATTEMPTS||5);let busy=false;
async function syncTick(){if(busy)return;busy=true;try{const jobs=all("SELECT * FROM sync_jobs WHERE status='pending' AND next_at<=? ORDER BY id LIMIT 25",Date.now());
  await Promise.all(jobs.map(async j=>{const[t,ext,body]=payload(j.object,j.local_id);try{
    const r=await fetch(`${URLS.crm}/services/data/v59.0/sobjects/${t}/External_Id__c/${encodeURIComponent(ext)}`,{method:'PATCH',headers:{'content-type':'application/json','x-mops-trace':j.trace||''},body:JSON.stringify(body)});
    const out=await r.json();if(!r.ok)throw Object.assign(new Error(`${r.status} ${out.error}`),{status:r.status});
    run(`UPDATE ${TBL[j.object]} SET crm_id=? WHERE id=?`,out.id,j.local_id);if(j.object==='Lead')run('UPDATE leads SET synced_at=? WHERE id=?',now(),j.local_id);
    run("DELETE FROM sync_jobs WHERE object=? AND local_id=? AND status='done'",j.object,j.local_id);run("UPDATE sync_jobs SET status='done',done_at=?,attempts=attempts+1 WHERE id=?",now(),j.id);
    emit('sync',`→ CRM ${t} ${j.local_id} ⇒ ${out.id}${j.attempts?` (after ${j.attempts} retr${j.attempts>1?'ies':'y'})`:''}`,{object:t},j.trace)}
  catch(e){const a=j.attempts+1;const dead=a>=MAX_ATTEMPTS||(e.status&&e.status<500&&e.status!==429);const wait=Math.min(30000,400*2**a)+Math.random()*200;
    if(dead){run("DELETE FROM sync_jobs WHERE object=? AND local_id=? AND status='dead'",j.object,j.local_id);run("UPDATE sync_jobs SET status='dead',attempts=?,last_error=? WHERE id=?",a,e.message,j.id);emit('error',`✖ ${j.object} ${j.local_id} moved to failure queue: ${e.message}`,{},j.trace)}
    else{run('UPDATE sync_jobs SET attempts=?,next_at=?,last_error=? WHERE id=?',a,Date.now()+wait,e.message,j.id);emit('retry',`↻ ${j.object} ${j.local_id} failed (${e.message}); retry ${a} in ${Math.round(wait)}ms`,{},j.trace)}}}));
  }finally{busy=false}}
async function pull(trace){const since=one("SELECT v FROM kv WHERE k='crm_cursor'")?.v||'1970';const r=await fetch(`${URLS.crm}/services/data/v59.0/changes?since=${encodeURIComponent(since)}`,{headers:{'x-mops-trace':trace||''}});
  if(!r.ok)throw err(r.status,'CRM changes feed '+r.status);const ch=await r.json();let applied=0,conflicts=0;
  for(const L of ch.Lead){const l=one('SELECT * FROM leads WHERE id=?',L.External_Id__c);if(!l)continue;const unsynced=l.synced_at&&l.updated_at>l.synced_at;
    // Rule: sales owns status/owner/conversion (CRM wins); marketing owns the score (engine wins, value pushed back).
    if(L.Score__c!=null&&Math.round(L.Score__c)!==Math.round(l.score)){run('INSERT INTO conflicts(object,local_id,field,local_val,remote_val,winner,rule,at) VALUES(?,?,?,?,?,?,?,?)','Lead',l.id,'Score__c',l.score,L.Score__c,'engine','marketing owns score'+(unsynced?' (both sides changed)':''),now());conflicts++;
      emit('conflict',`⚔ Lead ${l.id} Score: engine ${l.score} vs CRM ${L.Score__c} → engine wins (marketing-owned field), re-pushing`,{},trace);enqueue('Lead',l.id,trace)}
    if(L.Status!==l.status||L.OwnerName!==l.owner){if(unsynced&&L.Status!==l.status){run('INSERT INTO conflicts(object,local_id,field,local_val,remote_val,winner,rule,at) VALUES(?,?,?,?,?,?,?,?)','Lead',l.id,'Status',l.status,L.Status,'crm','sales owns status',now());conflicts++;emit('conflict',`⚔ Lead ${l.id} Status: engine ${l.status} vs CRM ${L.Status} → CRM wins (sales-owned field)`,{},trace)}
      run('UPDATE leads SET status=?,owner=?,opp_id=?,synced_at=? WHERE id=?',L.Status,L.OwnerName,L.ConvertedOpportunityId,now(),l.id);applied++;emit('sync',`← CRM Lead ${l.id}: ${L.Status}${L.OwnerName?' · '+L.OwnerName:''}${L.ConvertedOpportunityId?' · opp '+L.ConvertedOpportunityId:''}`,{},trace)}}
  run("INSERT OR REPLACE INTO kv VALUES('crm_cursor',?)",ch.cursor);if(applied||conflicts)audit('crm-sync','pull',null,{applied,conflicts,opps:ch.Opportunity.length},trace);return{applied,conflicts,opportunities:ch.Opportunity.length}}
// ---------- email ----------
const mailer=nodemailer.createTransport({host:'127.0.0.1',port:PORTS.smtp,secure:false,ignoreTLS:true,pool:true,maxConnections:5});
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('base64url').slice(0,16);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(tpl,c,send,extra){const B=PUBLIC+'/svc/engine';const unsub=`${B}/u/${send.id}.${sign(send.id)}`;
  const vars={first:c.first,last:c.last,company:c.account||'',title:c.title,unsubscribe:unsub,...extra};
  let html=tpl.html.replace(/\{\{(\w+)\}\}/g,(_,k)=>E(vars[k]??''));
  html=html.replace(/href="(https?:[^"]+)"/g,(m,u)=>u.startsWith(unsub)?m:`href="${B}/t/c/${send.id}?u=${encodeURIComponent(u)}"`);
  html+=`<img src="${B}/t/o/${send.id}.gif" width="1" height="1" alt="">`;return{html,subject:tpl.subject.replace(/\{\{(\w+)\}\}/g,(_,k)=>vars[k]??''),unsub}}
async function sendCampaign({campaignId,segmentId,rules,templateId,extra={}},trace){const camp=one('SELECT * FROM campaigns WHERE id=?',campaignId);if(!camp)throw err(404,'campaign not found');
  const tpl=one('SELECT * FROM templates WHERE id=?',templateId||'TPL-INVITE');const seg=segmentId?one('SELECT * FROM segments WHERE id=?',segmentId):null;
  const list=resolve(seg?JSON.parse(seg.rules):rules||{});const out={audience:list.length,sent:0,suppressed:0,reasons:{},byLaw:{},failed:0};
  emit('segment',`resolved ${list.length} contacts for ${camp.code}`,{},trace);
  for(const c of list){const g=canEmail(c);const sid=nextId('send','S',6);out.byLaw[g.law]=(out.byLaw[g.law]||0)+1;
    if(!g.ok){run('INSERT INTO sends(id,campaign_id,contact_id,template_id,status,reason,law) VALUES(?,?,?,?,?,?,?)',sid,campaignId,c.id,tpl.id,'suppressed',g.reason,g.law);out.suppressed++;out.reasons[g.reason]=(out.reasons[g.reason]||0)+1;continue}
    const m=render(tpl,c,{id:sid},extra);
    try{const info=await mailer.sendMail({from:'"Northwind Networks" <events@northwind.example>',to:c.email,subject:m.subject,html:m.html+`<p style="font-size:11px;color:#888">Northwind Networks · 1 Example Way, Bengaluru · <a href="${m.unsub}">Unsubscribe</a></p>`,
        headers:{'List-Unsubscribe':`<${m.unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click','X-Mops-Campaign':camp.code,'X-Mops-Send':sid,'X-Mops-Trace':trace||''}});
      run('INSERT INTO sends(id,campaign_id,contact_id,template_id,status,law,smtp_id,sent_at) VALUES(?,?,?,?,?,?,?,?)',sid,campaignId,c.id,tpl.id,'sent',g.law,info.messageId,now());out.sent++;
      upsertMember(campaignId,c.id,'Sent',trace)}catch(e){run('INSERT INTO sends(id,campaign_id,contact_id,template_id,status,reason,law) VALUES(?,?,?,?,?,?,?)',sid,campaignId,c.id,tpl.id,'failed',e.message,g.law);out.failed++}}
  emit('consent',`consent check: ${out.sent} allowed, ${out.suppressed} suppressed (${Object.entries(out.reasons).map(([k,v])=>v+' '+k).join(', ')||'none'})`,out.byLaw,trace);
  emit('smtp',`handed ${out.sent} emails to SMTP :${PORTS.smtp}`,{},trace);audit('srisha','email.send',campaignId,out,trace);return out}
function upsertMember(cid,contact,status,trace){const RANK={Sent:1,Opened:2,Clicked:3,Registered:4,Attended:5};const m=one('SELECT * FROM members WHERE campaign_id=? AND contact_id=?',cid,contact);
  if(m){if((RANK[status]||0)>(RANK[m.status]||0)){run('UPDATE members SET status=?,updated_at=? WHERE id=?',status,now(),m.id);enqueue('CampaignMember',m.id,trace)}return m.id}
  const id=nextId('mem','CM',6);run('INSERT INTO members VALUES(?,?,?,?,?,?,?)',id,cid,contact,status,null,now(),now());enqueue('CampaignMember',id,trace);return id}
// ---------- registration (Cvent replacement) ----------
function upsertContact(f,source,trace){const email=String(f.email||'').trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw err(400,'valid email required');
  let c=one('SELECT * FROM contacts WHERE email=?',email);if(c)return{c,created:false};const dom=email.split('@')[1];
  let a=one('SELECT * FROM accounts WHERE domain=? OR lower(name)=lower(?)',dom,f.company||'');if(!a&&f.company){const id=nextId('acct','A9',3);run('INSERT INTO accounts VALUES(?,?,?,?,?,?)',id,f.company,f.region||'India','Commercial','Unknown',dom);a={id,region:f.region||'India'}}
  const id=nextId('contact','C9',4);run('INSERT INTO contacts(id,email,first,last,title,account_id,region,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,email,f.first||'',f.last||'',f.title||'',a?.id||null,f.region||a?.region||'India',source,now(),now());
  audit('system','contact.create',id,{source},trace);return{c:one('SELECT * FROM contacts WHERE id=?',id),created:true}}
function register(ev,f,trace){const{c,created}=upsertContact(f,'event:'+ev.slug,trace);emit('event',`registration ${c.email} for ${ev.name}${created?' (new contact)':''}`,{},trace);
  if(f.consent==='on'||f.consent===true||f.consent==='1'){recordConsent(c.id,'opted_in','express consent','registration form '+ev.slug,`checkbox ticked; ip ${f.ip||'n/a'}`,trace);emit('consent',`ledger: ${c.email} opted_in via form (${LAW[c.region]})`,{},trace)}
  run('INSERT INTO registrations(event_id,contact_id,consent,at) VALUES(?,?,?,?)',ev.id,c.id,f.consent?1:0,now());upsertMember(ev.campaign_id,c.id,'Registered',trace);
  let lead=one("SELECT * FROM leads WHERE contact_id=? AND campaign_id=?",c.id,ev.campaign_id);if(!lead){const id=nextId('lead','LD');run('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,c.id,ev.campaign_id,'Registered',0,null,null,null,now(),now(),null);audit('system','lead.create',id,{event:ev.id},trace)}
  rescore(c.id,trace);return c}
function regPage(ev,msg){const n=one('SELECT count(*) n FROM registrations WHERE event_id=?',ev.id).n;return`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>${E(ev.name)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,system-ui,sans-serif;background:radial-gradient(1200px 600px at 20% 0%,#2a2366,transparent),#06070a;color:#f4f4f6}form{width:min(420px,92vw);background:#ffffff0a;border:1px solid #ffffff14;backdrop-filter:blur(22px);border-radius:24px;padding:30px}h1{margin:0 0 4px;font-size:24px;letter-spacing:-.02em}p{color:#a4a4b0;margin:0 0 18px;font-size:14px}input,select{width:100%;padding:12px 14px;margin:5px 0;border-radius:12px;border:1px solid #ffffff1f;background:#ffffff08;color:#fff;font-size:14px}label.ck{display:flex;gap:10px;font-size:12.5px;color:#a4a4b0;margin:12px 0;align-items:flex-start}label.ck input{width:auto;margin-top:2px}button{width:100%;padding:13px;border:0;border-radius:12px;background:linear-gradient(90deg,#9d8cff,#4fe3c1);color:#06070a;font-weight:700;font-size:15px;cursor:pointer}.ok{background:#5ee0a022;border:1px solid #5ee0a055;color:#bff5d9;padding:10px 12px;border-radius:12px;margin-bottom:12px;font-size:14px}</style>
<form method=post>${msg?`<div class=ok>${E(msg)}</div>`:''}<h1>${E(ev.name)}</h1><p>${E(ev.city)} · ${E(ev.date)} · ${n}/${ev.capacity} registered</p><input name=first placeholder="First name" required><input name=last placeholder="Last name"><input name=email type=email placeholder="Work email" required><input name=company placeholder=Company><input name=title placeholder="Job title"><select name=region>${Object.keys(LAW).map(r=>`<option>${r}</option>`).join('')}</select><label class=ck><input type=checkbox name=consent> Yes, Northwind Networks may email me about events and products. I can unsubscribe any time.</label><button>Register</button></form>`}
// ---------- seed ----------
async function seed(trace){for(const t of['accounts','contacts','consent_ledger','segments','templates','campaigns','budget_requests','members','leads','sends','events','registrations','signals','audit','sync_jobs','conflicts','kv','seq','uploads','upload_rows','scheduled_sends'])run('DELETE FROM '+t);
  const S=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data.seed.json')));const ts='2026-09-01T00:00:00.000Z';
  db.transaction(()=>{for(const a of S.accounts)run('INSERT INTO accounts VALUES(?,?,?,?,?,?)',a.id,a.name,a.region,a.segment,a.industry,a.domain);
    const extra=[['A201','Helvetia Grid AG','EMEA','Enterprise','Energy','helvetiagrid.example'],['A202','Lumen Bank SE','EMEA','Enterprise','Finance','lumenbank.example'],['A203','Prairie Health Inc','US','Enterprise','Healthcare','prairiehealth.example'],['A204','Copperline Retail','US','Commercial','Retail','copperline.example']];
    for(const a of extra)run('INSERT INTO accounts VALUES(?,?,?,?,?,?)',...a);
    const reg=Object.fromEntries([...S.accounts.map(a=>[a.id,a.region]),...extra.map(a=>[a[0],a[2]])]);
    const ins=(c,region)=>{run('INSERT INTO contacts(id,email,first,last,title,account_id,region,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',c.id,c.email,c.first,c.last,c.title,c.accountId,region,'migrated from legacy MAP',ts,ts);
      if(c.consent!=='unknown')run('INSERT INTO consent_ledger(contact_id,channel,status,law,basis,source,evidence,at) VALUES(?,?,?,?,?,?,?,?)',c.id,'email',c.consent,LAW[region],c.consent==='opted_in'?'express consent':'unsubscribe','legacy MAP migration','consentDate '+(c.consentDate||''),ts)};
    for(const c of S.contacts)ins(c,reg[c.accountId]);
    const fn=['Anna','Lukas','Sofia','Jonas','Emma','Mateo','Olivia','Liam','Ava','Noah','Mia','Ethan'],T=['CIO','CTO','CISO','IT Director','VP Infrastructure','Network Manager'];const cs=['opted_in','unknown','opted_out','opted_in'];
    extra.forEach((a,ai)=>{for(let i=0;i<6;i++){const f=fn[(ai*6+i)%12];ins({id:`C2${ai}${i}0`,email:`${f.toLowerCase()}.${ai}${i}@${a[5]}`,first:f,last:['Meyer','Brooks','Rossi','Novak','Clark','Diaz'][i],title:T[i],accountId:a[0],consent:cs[(i+ai)%4]},a[2])}});
    for(const k of S.campaigns){k.code=k.code||makeCode(k.channel,k.region);run('INSERT INTO campaigns(id,code,name,channel,region,fy_quarter,budget,spend,status,owner,crm_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',k.id,k.code,k.name,k.channel,k.region,(k.code||'').slice(0,6)||null,k.budget,k.spend,k.status,k.owner,null,ts,ts)}
    for(const l of S.leads){const mid='CM-H'+l.id;run('INSERT INTO members VALUES(?,?,?,?,?,?,?)',mid,l.campaignId,l.contactId,l.stage==='Opportunity'?'Attended':'Responded',null,l.created+'T00:00:00.000Z',ts);
      run('INSERT INTO leads VALUES(?,?,?,?,?,?,?,?,?,?,?)',l.id,l.contactId,l.campaignId,l.stage==='Opportunity'?'Converted':l.stage==='MQL'?'MQL':'Open',50,null,null,null,l.created+'T00:00:00.000Z',ts,ts)}
    for(const s of S.intent6s)run('INSERT INTO signals(source,account_id,kind,keyword,score,at) VALUES(?,?,?,?,?,?)','6sense-style (seed)',s.accountId,'intent',s.keywords.join('|'),s.intentScore,s.at);
    for(const w of S.adobeWeb)run('INSERT INTO signals(source,account_id,contact_id,kind,keyword,score,at) VALUES(?,?,?,?,?,?,?)','Adobe-style (seed)',w.accountId,w.contactId,'web',w.page,5,w.at);
    run('INSERT INTO templates VALUES(?,?,?,?,?)','TPL-INVITE','Event invite','{{first}}, you are invited: {{event_name}}',`<div style="font-family:Arial;max-width:560px"><h2>{{event_name}}</h2><p>Hi {{first}},</p><p>As {{title}} at {{company}}, you'll get a seat at our {{event_name}} on {{event_date}} in {{event_city}} — a working session on zero-trust and SASE roadmaps.</p><p><a href="{{event_link}}" style="background:#5b49e6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reserve my seat</a></p><p>See the agenda: <a href="https://northwind.example/agenda">northwind.example/agenda</a></p></div>`,now());
    run("INSERT INTO seq VALUES('send',0)");
    // --- scenarios the 'cover the marketer' watcher should find in the seeded data ---
    const ago=d=>new Date(Date.now()-d*864e5).toISOString();
    // (a) upcoming ANZ event, behind registration pace; 40 contacts opened the invite but did not register
    run('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)','EV-ANZ','anz-security-summit','ANZ Security Summit','K10',new Date(Date.now()+10*864e5).toISOString().slice(0,10),'Sydney',120,ago(25));
    const anz=all("SELECT c.id FROM contacts c WHERE c.region='ANZ' ORDER BY c.id");anz.slice(0,9).forEach((c,i)=>{run('INSERT INTO registrations(event_id,contact_id,consent,at) VALUES(?,?,?,?)','EV-ANZ',c.id,1,ago(20-i));run('INSERT OR REPLACE INTO members VALUES(?,?,?,?,?,?,?)','CM-ANZR'+i,'K10',c.id,'Registered',null,ago(20),ago(20))});
    anz.slice(9,49).forEach((c,i)=>{const sid='S-H'+i;run('INSERT INTO sends(id,campaign_id,contact_id,template_id,status,law,sent_at,opened_at) VALUES(?,?,?,?,?,?,?,?)',sid,'K10',c.id,'TPL-INVITE','sent',LAW.ANZ,ago(14),ago(13));run('INSERT OR REPLACE INTO members VALUES(?,?,?,?,?,?,?)','CM-ANZO'+i,'K10',c.id,'Opened',null,ago(13),ago(13))});
    // (f) India event that ended 2 days ago, with attendees
    run('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)','EV-PAST','india-cio-dinner','India CIO Dinner','K5',ago(2).slice(0,10),'Mumbai',40,ago(30));
    all("SELECT id FROM contacts WHERE region='India' ORDER BY id LIMIT 14").forEach((c,i)=>{run('INSERT INTO registrations(event_id,contact_id,consent,at) VALUES(?,?,?,?)','EV-PAST',c.id,1,ago(10));run('INSERT OR REPLACE INTO members VALUES(?,?,?,?,?,?,?)','CM-PAST'+i,'K5',c.id,i<11?'Attended':'Registered',null,ago(2),ago(2))});
    // (d) a booth-scan upload waiting to be processed; some rows have no consent
    run('INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?)','UP-0001','booth-scans-tech-expo.csv','K4','staged',8,0,0,ago(0.01));
    [['Asha','Rao','asha.rao@peakmills.example','Peak Mills','CIO','India','yes'],['Vikram','Das','vikram@peakmills.example','Peak Mills','CTO','India',''],['Mina','Kato','mina.kato@sorafin.example','Sora Finance','CISO','Japan','yes'],['Ken','Ito','ken.ito@sorafin.example','Sora Finance','IT Director','Japan',''],
     ['Grace','Lim','grace@lionport.example','Lion Port','CIO','ASEAN','no'],['Tom','Hale','tom.hale@outbackair.example','Outback Air','CTO','ANZ','yes'],['Jill','Park','jill@prairiehealth.example','Prairie Health Inc','VP Infrastructure','US',''],['Ravi','Nair','ravi@peakmills.example','Peak Mills','Network Manager','India','yes']]
     .forEach(r=>run("INSERT INTO upload_rows(upload_id,data,status) VALUES('UP-0001',?,'staged')",JSON.stringify({first:r[0],last:r[1],email:r[2],company:r[3],title:r[4],region:r[5],consent:r[6]})));
    run("INSERT INTO seq VALUES('up',1)");
    // (b) MQLs handed to sellers 3+ days ago with no follow-up
    all("SELECT id FROM leads WHERE status='MQL' ORDER BY id LIMIT 6").forEach((l,i)=>run("UPDATE leads SET owner=?,updated_at=? WHERE id=?",['Kenji Mori','Lena Ward'][i%2],ago(3+i%3),l.id));
    })();
  // Initial migration into the CRM via a bulk load (in production: Salesforce Bulk API 2.0), then keep in sync incrementally.
  const accts=all('SELECT * FROM accounts');const camps=all('SELECT * FROM campaigns'),leads=all('SELECT l.*,c.email,c.first,c.last,c.title,a.name company FROM leads l JOIN contacts c ON c.id=l.contact_id LEFT JOIN accounts a ON a.id=c.account_id'),mems=all('SELECT m.*,c.email FROM members m JOIN contacts c ON c.id=m.contact_id');
  const pipe=Object.fromEntries(S.leads.map(l=>[l.id,l]));const acct=Object.fromEntries(S.accounts.map(a=>[a.id,a.name]));
  const body={Account:accts.map(a=>({Ext:a.id,Name:a.name,Domain:a.domain,Segment:a.segment,Region:a.region})),Campaign:camps.filter(c=>c.id!=='K7').map(c=>({External_Id__c:c.id,Name:c.name,Type:c.channel,Status:c.status,BudgetedCost:c.budget,ActualCost:c.spend,Region__c:c.region,Code__c:c.code})),
    Lead:leads.map(l=>({External_Id__c:l.id,Email:l.email,FirstName:l.first,LastName:l.last,Company:l.company,Title:l.title,Status:l.status,Score__c:l.score,CampaignExt:l.campaign_id,...(l.owner?{OwnerName:l.owner,LastModifiedDate:l.updated_at,LastModifiedById:l.owner}:{})})),
    CampaignMember:mems.map(m=>({External_Id__c:m.id,CampaignExt:m.campaign_id,ContactExt:m.contact_id,Email:m.email,Status:m.status})),
    Opportunity:S.leads.filter(l=>l.stage==='Opportunity'&&l.pipeline).map(l=>({Name:acct[l.accountId]+' – opportunity',Amount:l.pipeline,StageName:'Proposal',AccountName:acct[l.accountId],LeadExt:l.id,CampaignExt:l.campaignId,CloseDate:'2026-12-31',CreatedDate:l.created+'T00:00:00.000Z'}))};
  await fetch(URLS.crm+'/admin/reset',{method:'POST'});const r=await(await fetch(URLS.crm+'/admin/bulk-load',{method:'POST',headers:{'content-type':'application/json','x-mops-trace':trace||''},body:JSON.stringify(body)})).json();
  db.transaction(()=>{for(const[k,id]of Object.entries(r.map)){const[t,ext]=k.split(':');if(TBL[t])run(`UPDATE ${TBL[t]} SET crm_id=? WHERE id=?`,id,ext);if(t==='Opportunity')run('UPDATE leads SET opp_id=? WHERE id=?',id,ext)}})();
  run("INSERT OR REPLACE INTO kv VALUES('crm_cursor',?)",now());audit('system','seed',null,{contacts:one('SELECT count(*) n FROM contacts').n,crmLoaded:r.loaded},trace);
  emit('seed',`seeded ${one('SELECT count(*) n FROM contacts').n} contacts, ${camps.length} campaigns; bulk-loaded ${r.loaded} CRM records`,{},trace);return{ok:true,crmLoaded:r.loaded}}
// ---------- HTTP API ----------
const spec=openapi('@mops Engine','Marketing automation (replaces Eloqua), campaigns/codes/budgets/approvals, consent ledger, registration (replaces Cvent), signals + scoring, CRM sync connector.',[
 ['GET /health','Health, record counts, sync queue'],['GET /contacts','Search contacts (?q=, ?limit=)'],['POST /contacts','Create/upsert a contact',{email:'a@b.example',first:'A',region:'India'}],['GET /contacts/:id','Contact 360: consent history, sends, memberships, leads, signals'],
 ['POST /segments','Create a segment from JSON rules or plain English',{name:'India CIOs opted in',text:'CIOs in India who opted in'}],['POST /segments/preview','Count + sample for rules without saving',{rules:{all:[{field:'title',op:'in',value:['CIO','CTO']},{field:'region',op:'eq',value:'India'}]}}],['GET /segments','List segments'],
 ['GET /consent/:contactId','Consent ledger for a contact'],['POST /consent','Record consent',{contactId:'C1001',status:'opted_in',basis:'express consent',source:'webinar form'}],['GET /u/:token','Unsubscribe page (link in every email)'],['POST /u/:token','One-click unsubscribe (RFC 8058)'],
 ['POST /templates','Create an email template',{id:'TPL-X',name:'Invite',subject:'Hi {{first}}',html:'<p>Hi {{first}}</p>'}],
 ['POST /campaigns','Create campaign + generate campaign code + request budget',{name:'Zero Trust Roundtable',channel:'Events',region:'India',budget:180000,owner:'Srisha R.'}],['GET /campaigns','List campaigns'],['POST /budget/:id/decide','Approve or reject a budget request',{decision:'approve',approver:'Chris (Director)'}],
 ['POST /campaigns/:id/send','Send a template to a segment with consent suppression',{segmentId:'SEG-0001',templateId:'TPL-INVITE'}],['GET /t/o/:send','Open-tracking pixel'],['GET /t/c/:send','Click tracking redirect (?u=)'],
 ['POST /events','Create an event + hosted registration page',{campaignId:'K1',name:'Zero Trust Roundtable',date:'2026-11-12',city:'Bengaluru',capacity:80}],['GET /r/:slug','Registration page'],['POST /r/:slug','Submit a registration (form or JSON)'],
 ['POST /signals/webhook','Ingest intent/web signals (JSON array)',[{source:'6sense',domain:'sakuraenergy.example',kind:'intent',keyword:'sase',score:82}]],['POST /signals/csv','Ingest a 6sense/Adobe-style CSV (text/csv body)'],
 ['GET /sync/status','Sync queue: pending, retrying, failure queue, conflicts'],['POST /sync/run','Run one push + pull cycle now'],['POST /sync/retry-failed','Move failure-queue jobs back to pending'],['GET /audit','Audit log'],['GET /export','Extract for the warehouse ELT'],['POST /admin/seed','Reset and seed fictional data']]);
const S_=service('engine',PORTS.engine,spec);
S_.get('/health',()=>({ok:true,service:'engine',counts:Object.fromEntries(['contacts','consent_ledger','segments','campaigns','members','leads','sends','events','registrations','signals','audit'].map(t=>[t,one(`SELECT count(*) n FROM ${t}`).n])),
  sync:Object.fromEntries(all('SELECT status,count(*) n FROM sync_jobs GROUP BY status').map(r=>[r.status,r.n])),retrying:one("SELECT count(*) n FROM sync_jobs WHERE status='pending' AND attempts>0").n,conflicts:one('SELECT count(*) n FROM conflicts').n,approvalLimit:APPROVAL_LIMIT}));
S_.get('/contacts',c=>all(`SELECT c.*,a.name account,${CURRENT_CONSENT} consent FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id ${c.query.q?'WHERE c.email LIKE ? OR c.last LIKE ? OR a.name LIKE ?':''} ORDER BY c.score DESC LIMIT ?`,...(c.query.q?Array(3).fill('%'+c.query.q+'%'):[]),+(c.query.limit||50)));
S_.post('/contacts',c=>upsertContact(c.body,c.body.source||'api',c.trace));
S_.get('/contacts/:id',c=>{const x=one('SELECT * FROM contacts WHERE id=? OR email=?',c.params.id,c.params.id);if(!x)throw err(404,'not found');const id=x.id;
  return{...x,canEmail:canEmail(x),consent:all('SELECT * FROM consent_ledger WHERE contact_id=? ORDER BY id',id),sends:all('SELECT * FROM sends WHERE contact_id=?',id),members:all('SELECT * FROM members WHERE contact_id=?',id),leads:all('SELECT * FROM leads WHERE contact_id=?',id),signals:all('SELECT * FROM signals WHERE contact_id=? OR account_id=? ORDER BY at DESC LIMIT 20',id,x.account_id)}});
S_.post('/segments/preview',c=>{const rules=c.body.rules||nlToRules(c.body.text||'');const r=resolve(rules);return{rules,count:r.length,sql:compile(rules).sql,sample:r.slice(0,5).map(x=>({id:x.id,email:x.email,title:x.title,region:x.region}))}});
S_.post('/segments',c=>{const rules=c.body.rules||nlToRules(c.body.text||'');const r=resolve(rules);const id=nextId('seg','SEG-');run('INSERT INTO segments VALUES(?,?,?,?,?)',id,c.body.name||c.body.text||id,JSON.stringify(rules),r.length,now());
  audit(c.body.actor||'srisha','segment.create',id,{rules,count:r.length},c.trace);emit('segment',`segment ${id} "${c.body.name||c.body.text}" → ${r.length} contacts`,{rules},c.trace);return{id,rules,count:r.length}});
S_.get('/segments',()=>all('SELECT * FROM segments ORDER BY created_at DESC').map(s=>({...s,rules:JSON.parse(s.rules)})));
S_.get('/consent/:id',c=>all('SELECT * FROM consent_ledger WHERE contact_id=? ORDER BY id',c.params.id));
S_.post('/consent',c=>{if(!['opted_in','opted_out'].includes(c.body.status))throw err(400,'status must be opted_in|opted_out');recordConsent(c.body.contactId,c.body.status,c.body.basis||'api',c.body.source||'api',c.body.evidence,c.trace);return consentOf(c.body.contactId)});
const unsubSend=t=>{const[id,sig]=String(t).split('.');if(!id||sign(id)!==sig)throw err(403,'invalid link');const s=one('SELECT * FROM sends WHERE id=?',id);if(!s)throw err(404,'unknown');return s};
const page=(res,h)=>{res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><meta name=viewport content="width=device-width"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,system-ui;background:#06070a;color:#f4f4f6}.c{background:#ffffff0a;border:1px solid #ffffff14;border-radius:22px;padding:30px;max-width:380px;text-align:center}button{padding:12px 20px;border:0;border-radius:12px;background:#ff6b81;color:#fff;font-weight:700;cursor:pointer}p{color:#a4a4b0}</style><div class=c>${h}</div>`)};
S_.get('/u/:token',(c,res)=>{const s=unsubSend(c.params.token);const ct=one('SELECT email FROM contacts WHERE id=?',s.contact_id);page(res,`<h2>Unsubscribe</h2><p>Stop marketing email to <b>${E(ct.email)}</b>?</p><form method=post><button>Unsubscribe me</button></form>`)});
S_.post('/u/:token',(c,res)=>{const s=unsubSend(c.params.token);const ct=one('SELECT * FROM contacts WHERE id=?',s.contact_id);recordConsent(s.contact_id,'opted_out','unsubscribe link','email '+s.id,'campaign '+s.campaign_id,c.trace);run('UPDATE sends SET unsub_at=? WHERE id=?',now(),s.id);
  emit('consent',`🛑 ${ct.email} unsubscribed → ledger opted_out; future sends suppressed`,{},c.trace);if(c.headers.accept?.includes('json'))return{ok:true};page(res,`<h2>You're unsubscribed</h2><p>${E(ct.email)} won't get marketing email from us. This was recorded in our consent ledger.</p>`)});
S_.post('/templates',c=>{run('INSERT OR REPLACE INTO templates VALUES(?,?,?,?,?)',c.body.id||nextId('tpl','TPL-'),c.body.name,c.body.subject,c.body.html,now());return{ok:true}});
S_.get('/templates',()=>all('SELECT id,name,subject FROM templates'));
S_.post('/campaigns',c=>{const b=c.body;if(!b.name||!b.channel||!b.region)throw err(400,'name, channel, region required');const id=nextId('camp','K-',4),code=makeCode(b.channel,b.region,b.startDate?new Date(b.startDate):undefined),amt=+b.budget||0;
  const needs=amt>APPROVAL_LIMIT;run('INSERT INTO campaigns(id,code,name,channel,region,fy_quarter,budget,spend,status,owner,crm_id,created_at,updated_at,start_date,end_date,country,product,intake_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,code,b.name,b.channel,b.region,fyq(b.startDate?new Date(b.startDate):undefined),needs?0:amt,0,needs?'Pending approval':'Planned',b.owner||'Srisha R.',null,now(),now(),b.startDate||null,b.endDate||null,b.country||null,b.product||null,b.intakeId||null);
  const br=nextId('br','BR-');run('INSERT INTO budget_requests VALUES(?,?,?,?,?,?,?,?,?,?)',br,id,amt,b.purpose||b.name,needs?'pending':'auto_approved',needs?null:'policy',needs?`> $${APPROVAL_LIMIT/1000}K needs director approval`:`≤ $${APPROVAL_LIMIT/1000}K auto-approved`,b.owner||'Srisha R.',now(),needs?null:now());
  audit(b.owner||'srisha','campaign.create',id,{code,budget:amt},c.trace);audit('policy','budget.'+(needs?'route_for_approval':'auto_approve'),br,{amount:amt,limit:APPROVAL_LIMIT},c.trace);
  emit('campaign',`campaign ${id} · code ${code} generated`,{code},c.trace);emit(needs?'approval':'campaign',needs?`budget $${amt/1000}K > $${APPROVAL_LIMIT/1000}K limit → routed to approver (${br})`:`budget $${amt/1000}K auto-approved (≤ $${APPROVAL_LIMIT/1000}K)`,{},c.trace);
  enqueue('Campaign',id,c.trace);return{id,code,budgetRequest:br,status:needs?'pending_approval':'approved'}});
S_.get('/campaigns',()=>all('SELECT * FROM campaigns ORDER BY created_at DESC'));
S_.get('/budget',()=>all('SELECT * FROM budget_requests ORDER BY requested_at DESC'));
S_.post('/budget/:id/decide',c=>{const b=one('SELECT * FROM budget_requests WHERE id=?',c.params.id);if(!b)throw err(404,'not found');if(b.status!=='pending')throw err(409,'already '+b.status);
  const ok=c.body.decision==='approve';run('UPDATE budget_requests SET status=?,approver=?,decided_at=? WHERE id=?',ok?'approved':'rejected',c.body.approver||'approver',now(),b.id);
  run('UPDATE campaigns SET status=?,budget=?,updated_at=? WHERE id=?',ok?'Planned':'Rejected',ok?b.amount:0,now(),b.campaign_id);audit(c.body.approver||'approver','budget.'+(ok?'approve':'reject'),b.id,{amount:b.amount},c.trace);
  emit('approval',`${c.body.approver||'approver'} ${ok?'approved':'rejected'} ${b.id} ($${b.amount/1000}K)`,{},c.trace);enqueue('Campaign',b.campaign_id,c.trace);return{ok:true,status:ok?'approved':'rejected'}});
S_.post('/campaigns/:id/event',c=>{run('UPDATE campaigns SET event_id=?,updated_at=? WHERE id=?',c.body.eventId,now(),c.params.id);enqueue('Campaign',c.params.id,c.trace);return{ok:true}});
S_.post('/campaigns/:id/status',c=>{run('UPDATE campaigns SET status=?,spend=COALESCE(?,spend),updated_at=? WHERE id=?',c.body.status,c.body.spend??null,now(),c.params.id);audit('srisha','campaign.status',c.params.id,c.body,c.trace);enqueue('Campaign',c.params.id,c.trace);return{ok:true}});
S_.post('/campaigns/:id/send',async c=>sendCampaign({...c.body,campaignId:c.params.id},c.trace));
const GIF=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
S_.get('/t/o/:sid',(c,res)=>{const id=c.params.sid.replace(/\.gif$/,'');const s=one('SELECT * FROM sends WHERE id=?',id);
  if(s&&!s.opened_at){run('UPDATE sends SET opened_at=? WHERE id=?',now(),id);upsertMember(s.campaign_id,s.contact_id,'Opened',c.trace);const sc=rescore(s.contact_id,c.trace);emit('track',`open ${id} → member Opened, score ${sc}`,{},c.trace)}
  res.writeHead(200,{'content-type':'image/gif','cache-control':'no-store'});res.end(GIF)});
S_.get('/t/c/:sid',(c,res)=>{const s=one('SELECT * FROM sends WHERE id=?',c.params.sid);const u=c.query.u||'/';
  if(s){if(!s.opened_at)run('UPDATE sends SET opened_at=? WHERE id=?',now(),s.id);if(!s.clicked_at){run('UPDATE sends SET clicked_at=? WHERE id=?',now(),s.id);upsertMember(s.campaign_id,s.contact_id,'Clicked',c.trace);const sc=rescore(s.contact_id,c.trace);emit('track',`click ${s.id} → ${u.slice(0,60)} · score ${sc}`,{},c.trace)}}
  res.writeHead(302,{location:/^https?:\/\//.test(u)?u:'/'});res.end()});
S_.post('/events',c=>{const b=c.body;const camp=one('SELECT * FROM campaigns WHERE id=?',b.campaignId);if(!camp)throw err(404,'campaign not found');const id=nextId('evt','EV-');
  const slug=(b.slug||b.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+id.slice(-4).toLowerCase()).replace(/^-|-$/g,'');run('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)',id,slug,b.name,b.campaignId,b.date,b.city,+b.capacity||100,now());
  audit('srisha','event.create',id,{slug},c.trace);emit('event',`event ${id} live at /r/${slug}`,{},c.trace);return{id,slug,url:`${PUBLIC}/svc/engine/r/${slug}`}});
S_.get('/events',()=>all('SELECT e.*,(SELECT count(*) FROM registrations r WHERE r.event_id=e.id) registrations FROM events e'));
S_.get('/r/:slug',(c,res)=>{const ev=one('SELECT * FROM events WHERE slug=?',c.params.slug);if(!ev)throw err(404,'no such event');res.writeHead(200,{'content-type':'text/html'});res.end(regPage(ev))});
S_.post('/r/:slug',(c,res)=>{const ev=one('SELECT * FROM events WHERE slug=?',c.params.slug);if(!ev)throw err(404,'no such event');const ct=register(ev,{...c.body,ip:c.headers['x-forwarded-for']||'local'},c.trace);
  if((c.headers['content-type']||'').includes('json'))return{ok:true,contactId:ct.id};res.writeHead(200,{'content-type':'text/html'});res.end(regPage(ev,`You're registered, ${ct.first||ct.email}. See you there!`))});
function ingest(rows,src,trace){let n=0,skipped=0;const touched=new Set();for(const r of rows){const a=r.domain?one('SELECT id FROM accounts WHERE domain=?',r.domain):r.account_id?{id:r.account_id}:null;const ct=r.email?one('SELECT id,account_id FROM contacts WHERE email=?',r.email.toLowerCase()):null;
  if(!a&&!ct){skipped++;continue}run('INSERT INTO signals(source,account_id,contact_id,kind,keyword,score,at) VALUES(?,?,?,?,?,?,?)',r.source||src,a?.id||ct?.account_id,ct?.id||null,r.kind||'intent',r.keyword||r.page||'',+r.score||0,r.at||now());n++;
  if(ct)touched.add(ct.id);else all('SELECT id FROM contacts WHERE account_id=?',a.id).forEach(x=>touched.add(x.id))}
  let mql=0;for(const id of touched){const before=one("SELECT count(*) n FROM leads WHERE status='MQL'").n;rescore(id,trace);mql+=one("SELECT count(*) n FROM leads WHERE status='MQL'").n-before}
  emit('signal',`ingested ${n} signals (${skipped} unmatched) → rescored ${touched.size} contacts, ${mql} new MQLs`,{},trace);audit('signals','ingest',src,{n,skipped,rescored:touched.size,mql},trace);return{ingested:n,unmatched:skipped,rescored:touched.size,newMQLs:mql}}
S_.post('/signals/webhook',c=>ingest([].concat(c.body),'webhook',c.trace));
S_.post('/signals/csv',c=>ingest(parseCSV(c.raw),'csv upload',c.trace));
S_.get('/sync/status',()=>({pending:one("SELECT count(*) n FROM sync_jobs WHERE status='pending'").n,retrying:all("SELECT object,local_id,attempts,last_error FROM sync_jobs WHERE status='pending' AND attempts>0"),failureQueue:all("SELECT * FROM sync_jobs WHERE status='dead'"),done:one("SELECT count(*) n FROM sync_jobs WHERE status='done'").n,conflicts:all('SELECT * FROM conflicts ORDER BY id DESC LIMIT 50')}));
S_.post('/sync/run',async c=>{await syncTick();let p={};try{p=await pull(c.trace)}catch(e){p={error:e.message}}return{pushed:true,pull:p}});
S_.post('/sync/drain',async c=>{const t0=Date.now();while(Date.now()-t0<(+c.body.timeoutMs||20000)){await syncTick();const p=one("SELECT count(*) n FROM sync_jobs WHERE status='pending'").n;if(!p)break;await new Promise(r=>setTimeout(r,150))}return{pending:one("SELECT count(*) n FROM sync_jobs WHERE status='pending'").n,dead:one("SELECT count(*) n FROM sync_jobs WHERE status='dead'").n,ms:Date.now()-t0}});
S_.post('/sync/pull',async c=>{for(let i=0;i<5;i++){try{return await pull(c.trace)}catch(e){emit('retry',`↻ changes feed failed (${e.message}), retrying`,{},c.trace);await new Promise(r=>setTimeout(r,300*2**i))}}throw err(502,'pull failed after retries')});
S_.post('/sync/retry-failed',c=>{const r=run("UPDATE sync_jobs SET status='pending',attempts=0,next_at=? WHERE status='dead' AND NOT EXISTS(SELECT 1 FROM sync_jobs j2 WHERE j2.object=sync_jobs.object AND j2.local_id=sync_jobs.local_id AND j2.status='pending')",Date.now());run("DELETE FROM sync_jobs WHERE status='dead'");emit('sync',`requeued ${r.changes} jobs from failure queue`,{},c.trace);return{requeued:r.changes}});
S_.get('/audit',c=>all('SELECT * FROM audit ORDER BY id DESC LIMIT ?',+(c.query.limit||100)));
S_.get('/export',()=>({contacts:all(`SELECT c.id,c.email,c.title,c.region,c.account_id,c.score,c.source,c.created_at,a.name account,a.segment,a.industry,COALESCE(${CURRENT_CONSENT},'unknown') consent FROM contacts c LEFT JOIN accounts a ON a.id=c.account_id`),
  campaigns:all('SELECT * FROM campaigns'),members:all('SELECT * FROM members'),leads:all('SELECT * FROM leads'),sends:all('SELECT * FROM sends'),budget_requests:all('SELECT * FROM budget_requests'),registrations:all('SELECT * FROM registrations'),signals:all('SELECT * FROM signals'),consent_ledger:all('SELECT * FROM consent_ledger'),__columns:Object.fromEntries(['campaigns','members','leads','sends','budget_requests','registrations','signals','consent_ledger'].map(t=>[t,db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name)]))}));
// ---- uploads: staged first, so rows can be checked (e.g. consent) before they touch the database ----
S_.post('/uploads/csv',c=>{const rows=parseCSV(c.raw);const id=nextId('up','UP-');run('INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?)',id,c.query.name||'upload.csv',c.query.campaignId||null,'staged',rows.length,0,0,now());
  const ins=db.prepare("INSERT INTO upload_rows(upload_id,data,status) VALUES(?,?,'staged')");db.transaction(()=>rows.forEach(r=>ins.run(id,JSON.stringify(r))))();audit('srisha','upload.stage',id,{rows:rows.length},c.trace);
  emit('upload',`staged ${rows.length} rows from ${c.query.name||'upload.csv'} (${id})`,{id},c.trace);return{id,rows:rows.length,status:'staged'}});
S_.get('/uploads',()=>all('SELECT * FROM uploads ORDER BY at DESC'));
S_.get('/uploads/:id',c=>({...one('SELECT * FROM uploads WHERE id=?',c.params.id),rows:all('SELECT * FROM upload_rows WHERE upload_id=?',c.params.id).map(r=>({...r,data:JSON.parse(r.data)}))}));
function importRow(u,r,trace){const d=JSON.parse(r.data);const{c}=upsertContact(d,'upload:'+u.id,trace);if(/^(y|yes|true|opted_in|1)$/i.test(d.consent||''))recordConsent(c.id,'opted_in','express consent',u.name,'booth/partner list consent column',trace);
  if(u.campaign_id)upsertMember(u.campaign_id,c.id,'Responded',trace);run("UPDATE upload_rows SET status='imported',contact_id=? WHERE id=?",c.id,r.id);return c.id}
S_.post('/uploads/:id/process',c=>{const u=one('SELECT * FROM uploads WHERE id=?',c.params.id);if(!u)throw err(404,'not found');const q=new Set((c.body.quarantine||[]).map(Number));let imp=0,qn=0;
  for(const r of all("SELECT * FROM upload_rows WHERE upload_id=? AND status='staged'",u.id)){if(q.has(r.id)){run("UPDATE upload_rows SET status='quarantined',reason=? WHERE id=?",c.body.reason||'quarantined',r.id);qn++}else{try{importRow(u,r,c.trace);imp++}catch(e){run("UPDATE upload_rows SET status='quarantined',reason=? WHERE id=?",e.message,r.id);qn++}}}
  run("UPDATE uploads SET status='processed',imported=imported+?,quarantined=quarantined+? WHERE id=?",imp,qn,u.id);audit(c.body.actor||'srisha','upload.process',u.id,{imported:imp,quarantined:qn},c.trace);emit('upload',`${u.id}: imported ${imp}, quarantined ${qn}`,{},c.trace);return{imported:imp,quarantined:qn}});
S_.post('/uploads/:id/release',c=>{const u=one('SELECT * FROM uploads WHERE id=?',c.params.id);let n=0;for(const r of all("SELECT * FROM upload_rows WHERE upload_id=? AND status='quarantined'",u.id)){importRow(u,r,c.trace);n++}
  run('UPDATE uploads SET imported=imported+?,quarantined=quarantined-? WHERE id=?',n,n,u.id);audit(c.body.actor||'srisha','upload.release',u.id,{released:n},c.trace);emit('upload',`${u.id}: released ${n} quarantined rows (no consent recorded → still suppressed from email)`,{},c.trace);return{released:n}});
// ---- budget shift between campaigns (delegated limit enforced by the caller's policy) ----
S_.post('/budget/shift',c=>{const{from,to,amount}=c.body;const a=one('SELECT * FROM campaigns WHERE id=?',from),b=one('SELECT * FROM campaigns WHERE id=?',to);if(!a||!b)throw err(404,'campaign not found');if(a.budget-a.spend<amount)throw err(409,'not enough unspent budget');
  run('UPDATE campaigns SET budget=budget-?,updated_at=? WHERE id=?',amount,now(),from);run('UPDATE campaigns SET budget=budget+?,updated_at=? WHERE id=?',amount,now(),to);audit(c.body.actor||'srisha','budget.shift',from+'→'+to,{amount},c.trace);
  enqueue('Campaign',from,c.trace);enqueue('Campaign',to,c.trace);emit('campaign',`moved $${Math.round(amount/1000)}K ${from} → ${to}`,{},c.trace);return{ok:true,from:one('SELECT id,budget,spend FROM campaigns WHERE id=?',from),to:one('SELECT id,budget,spend FROM campaigns WHERE id=?',to)}});
// ---- scheduled sends: a risk window during which an autopilot send can be undone ----
S_.post('/campaigns/:id/schedule',c=>{const id=nextId('sch','SCH-');const due=Date.now()+(+c.body.delayMs||600000);run('INSERT INTO scheduled_sends VALUES(?,?,?,?,?,?,?,?)',id,c.params.id,JSON.stringify(c.body),due,'scheduled',null,c.body.actor||'srisha',now());
  audit(c.body.actor||'srisha','send.schedule',id,{due:new Date(due).toISOString()},c.trace);emit('campaign',`send ${id} scheduled for ${new Date(due).toLocaleTimeString()} (undo window)`,{},c.trace);return{id,dueAt:due}});
S_.post('/scheduled/:id/cancel',c=>{const r=run("UPDATE scheduled_sends SET status='cancelled' WHERE id=? AND status='scheduled'",c.params.id);if(!r.changes)throw err(409,'already sent or cancelled');audit(c.body.actor||'srisha','send.cancel',c.params.id,{},c.trace);emit('campaign',`scheduled send ${c.params.id} cancelled`,{},c.trace);return{ok:true}});
S_.get('/scheduled',()=>all('SELECT * FROM scheduled_sends ORDER BY at DESC'));
setInterval(async()=>{for(const s of all("SELECT * FROM scheduled_sends WHERE status='scheduled' AND due_at<=?",Date.now())){run("UPDATE scheduled_sends SET status='sending' WHERE id=?",s.id);try{const r=await sendCampaign({...JSON.parse(s.body),campaignId:s.campaign_id},s.id);run("UPDATE scheduled_sends SET status='sent',result=? WHERE id=?",JSON.stringify(r),s.id)}catch(e){run("UPDATE scheduled_sends SET status='failed',result=? WHERE id=?",e.message,s.id)}}},1000);
S_.post('/leads/:id/owner',c=>{run('UPDATE leads SET owner=?,updated_at=? WHERE id=?',c.body.owner,now(),c.params.id);audit(c.body.actor||'srisha','lead.reassign',c.params.id,{owner:c.body.owner},c.trace);return{ok:true}});
S_.get('/leads',c=>all(`SELECT l.*,c.email FROM leads l JOIN contacts c ON c.id=l.contact_id ${c.query.status?'WHERE l.status=?':''} ORDER BY l.updated_at LIMIT 500`,...(c.query.status?[c.query.status]:[])));
S_.del('/templates/:id',c=>{run('DELETE FROM templates WHERE id=?',c.params.id);audit('srisha','template.delete',c.params.id,{},c.trace);return{ok:true}});
S_.get('/templates/:id',c=>one('SELECT * FROM templates WHERE id=?',c.params.id)||{__status:404});
S_.post('/admin/seed',c=>seed(c.trace));
S_.post('/admin/sync-interval',c=>{clearInterval(timer);timer=setInterval(syncTick,+c.body.ms||400);return{ok:true}});
let timer=setInterval(syncTick,+(process.env.SYNC_MS||400));setInterval(()=>pull().catch(()=>{}),+(process.env.PULL_MS||15000));
S_.listen().then(async()=>{if(!one('SELECT count(*) n FROM contacts').n){for(let i=0;i<40;i++){try{await seed();break}catch(e){await new Promise(r=>setTimeout(r,250))}}}});
module.exports={nlToRules,compile,canEmail,fyq};
