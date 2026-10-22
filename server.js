// @mops platform. One JSON data layer (data.json), agents in agents.js, and the five backend services in this same process.
// LLM tool-calling when MOPS_API_KEY is set (OpenAI-compatible: xAI / OpenAI); otherwise rule router calling the SAME tools.
if(process.env.VERCEL&&!process.env.MOPS_DATA_DIR)process.env.MOPS_DATA_DIR='/tmp/mops';
if(process.env.VERCEL&&!process.env.MOPS_RUNS_DIR)process.env.MOPS_RUNS_DIR='/tmp/mops/runs';
const http=require('http'),fs=require('fs'),path=require('path');const mk=require('./agents.js');const{esc,fmt}=mk;
const {brandName,brandCompany}=require('./brand');
const DATA_DIR=process.env.MOPS_DATA_DIR||__dirname;fs.mkdirSync(DATA_DIR,{recursive:true});const DB=path.join(DATA_DIR,'data.json');if(!fs.existsSync(DB))fs.copyFileSync(path.join(__dirname,'data.seed.json'),DB);
// Literal paths so the Vercel file tracer ships the UI, seed, and fixtures with this server.
fs.statSync(path.join(__dirname,'ui/index.html'));
fs.statSync(path.join(__dirname,'ui/home.html'));
fs.statSync(path.join(__dirname,'ui/webinar.html'));
fs.statSync(path.join(__dirname,'webinar/sample-badges.csv'));
fs.statSync(path.join(__dirname,'webinar/replay.json'));
fs.statSync(path.join(__dirname,'webinar/chat.js'));
fs.statSync(path.join(__dirname,'ui/engine.html'));
fs.statSync(path.join(__dirname,'ui/data.html'));
fs.statSync(path.join(__dirname,'ui/chart.min.js'));
fs.statSync(path.join(__dirname,'data.seed.json'));
fs.statSync(path.join(__dirname,'baselines.json'));
fs.statSync(path.join(__dirname,'platform/ARCHITECTURE.md'));
fs.statSync(path.join(__dirname,'platform/migrations/001_core.sql'));
fs.statSync(path.join(__dirname,'platform/migrations/002_engage.sql'));
fs.statSync(path.join(__dirname,'platform/migrations/003_ops.sql'));
fs.statSync(path.join(__dirname,'platform/migrations/004_brain.sql'));
fs.statSync(path.join(__dirname,'platform/migrations/005_live.sql'));
fs.statSync(path.join(__dirname,'ui/sandbox.js'));
fs.statSync(path.join(__dirname,'platform/ops-trace.json'));
fs.statSync(path.join(__dirname,'platform/samples/chicago-attendees.xlsx'));
fs.statSync(path.join(__dirname,'backend/test/fixtures/abm_target_list.csv'));
fs.statSync(path.join(__dirname,'backend/test/fixtures/booth_badge_scans.xlsx'));
fs.statSync(path.join(__dirname,'backend/test/fixtures/event_attendees_export.xlsx'));
let db=JSON.parse(fs.readFileSync(DB));db.company=brandCompany();
let jsonFile=DB;
const save=()=>fs.writeFileSync(jsonFile,JSON.stringify(db));
function bindJson(dir){
  const file=dir?path.join(dir,'data.json'):DB;
  if(dir&&!fs.existsSync(file))fs.copyFileSync(path.join(__dirname,'data.seed.json'),file);
  if(file===jsonFile)return;
  db=JSON.parse(fs.readFileSync(file));db.company=brandCompany();jsonFile=file;
}
const KEY=process.env.MOPS_API_KEY,BASE=process.env.MOPS_API_BASE||'https://api.x.ai/v1',MODEL=process.env.MOPS_MODEL||'grok-4';
// Mail never leaves the process. An external MOPS_SMTP_URL is ignored on purpose.
let sender={name:'in-process-catcher',send(m){try{require('./backend/mail').deliver({from:process.env.MOPS_FROM||'mops@mops.local',to:m.to,subject:m.subject,text:m.body})}catch(e){console.error('mail',e.message)}}};
if(process.env.MOPS_SMTP_URL)console.error('Refusing external SMTP. Demo mail stays in the in-process catcher.');
const ctx={sender,dayMs:Number(process.env.MOPS_DAY_MS)||86400000};
let A=mk(db,ctx);
require('./backend/lifecycle').onLaunch(c=>{if(db.campaigns.some(x=>x.id===c.id))return;db.campaigns.push(c);db.threads.push({id:'T-'+c.id,type:'campaign',refId:c.id,title:c.name,messages:[{who:'@mops',at:new Date().toISOString(),text:`Launched ${c.name}. Code ${c.code}. SFDC ${c.sfdcId}. It now sits in ${c.geo} · ${c.program}.`,artifacts:[]}]});save();});
const T=id=>db.threads.find(t=>t.id===id);
const STACK=[['Eloqua','Email agent','Segments from plain English, consent suppression, send, nurture, opens/clicks','build_segment, draft_email, send_email, schedule_nurture'],
['Power BI / Tableau','Insight agent','Ask a question, get computed numbers + chart with cited records','query_insight'],
['Campaign code tool','Ops agent','Generates codes, writes to data layer, syncs mock CRM','create_campaign_code'],
['Budget forms / email approvals','Ops agent','Budget request, $150K threshold, approve/reject','budget_request, decide_budget'],
['Word SOW templates','Ops agent','SOW generated from thread context, .doc download','generate_sow'],
['List upload tool','Ops agent','CSV clean, dedupe, match to accounts, exceptions','clean_upload'],
['Cvent / RainFocus (basics)','Event agent','Event record + hosted registration page writing to data layer','create_event, event_status'],
['Partner portal (MDF lookup)','Ops agent','MDF claim status on the thread','mdf_status'],
['Eloqua⇄SFDC sync monitoring','Sync doctor','Finds failed lead syncs, explains why, fixes and retries, escalates what it cannot fix','diagnose_sync'],
['Eloqua lead scoring program','Scoring agent','Fit + decaying engagement score, written to CRM','lead_score'],
['Manual campaign influence','Attribution agent','Evidence-based influence on opportunities, even-split model','credit_campaign'],
['Reverse ETL (Census/Hightouch)','Seller agent','Target accounts as CRM tasks + seller notifications','push_target_list'],
['Status meetings / campaign trackers','Autopilot','Live campaign state, proactive updates, next-best-action recommendations, low-risk ops by default','autopilot_tick, approve_item'],
['Email / chat follow-ups','Living threads','Every action saved to its thread; context reused','all']];
// ---------- tool schema for LLM ----------
const P=(o,req=[])=>({type:'object',properties:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='string'?{type:'string',description:v}:v])),required:req});
const SCHEMA={build_segment:['Build a contact segment from natural language',P({query:'e.g. CIOs in India enterprise accounts who opted in'},['query'])],
draft_email:['Draft an email to a segment',P({segment_id:'SEG-xxx (optional: latest on thread)',topic:'topic'})],
send_email:['Send a drafted email; consent suppression enforced automatically',P({email_id:'EM-xxx (optional)'})],
schedule_nurture:['Schedule a nurture sequence after an email',P({email_id:'EM-xxx',steps:{type:'array',items:{type:'number'},description:'day offsets'}})],
query_insight:['Answer an analytics question with computed numbers and a chart',P({question:'the question'},['question'])],
create_campaign_code:['Create campaign code for this campaign thread and sync to CRM',P({})],
budget_request:['Create a budget request (>$150K needs approval)',P({amount:{type:'number'},justification:'why'})],
decide_budget:['Approve or reject a pending budget request',P({budget_id:'BR-xxx',decision:{type:'string',enum:['approve','reject']}},['budget_id','decision'])],
generate_sow:['Generate a statement of work document',P({vendor:'vendor',scope:'scope',amount:{type:'number'}})],
clean_upload:['Clean/dedupe/match an attendee or lead CSV',P({csv:'CSV text with header'},['csv'])],
mdf_status:['MDF claim status',P({})],create_event:['Create an event + hosted registration page',P({name:'',date:'YYYY-MM-DD',city:'',capacity:{type:'number'}})],
event_status:['Registrations for the event on this thread',P({})],
diagnose_sync:['Find leads that failed to sync to CRM, explain causes; fix=true to fix and retry',P({fix:{type:'boolean'}})],
lead_score:['Score contacts at an account (fit + engagement) and say who is hot',P({account:'account name (optional on account thread)'})],
credit_campaign:['Credit a campaign as influence on an opportunity, evidence-based',P({opp_id:'OPP-xxxx (optional on account thread)',campaign:'campaign name or keyword'},['campaign'])],
push_target_list:['Push ranked target accounts to sellers as CRM tasks and notify them',P({top:{type:'number'}})]};
function run(name,args,thread,opts){if(opts&&opts.model&&['send_email','decide_budget','clean_upload','schedule_nurture'].includes(name))return{error:'A person has to approve this. The model cannot spend, send, change consent, or write the CRM.',title:'Needs a person',kind:'Blocked'};if(!A[name])return{error:'unknown tool '+name};try{const r=A[name]({...args,thread});if(!r.error)r.tool=name;return r;}catch(e){return{error:e.message}}}
// ---------- rule router (offline demo; exercises every module) ----------
function rules(text,thread,csv){const q=text.toLowerCase();const out=[];const go=(n,a={})=>out.push(run(n,a,thread));
 const money=(q.match(/\$?\s?(\d+(?:\.\d+)?)\s?(k|m)\b/)||[]);const amt=money[1]?money[1]*(money[2]==='m'?1e6:1e3):undefined;
 const id=(p)=>(text.match(new RegExp(p+'-\\d+','i'))||[])[0]?.toUpperCase();
 if(csv||/upload|attendee list|clean (this|the) list/.test(q)){go('clean_upload',{csv:csv||text.split('\n').slice(1).join('\n')});return out;}
 if(/sfdc|salesforce|crm|sync/.test(q)&&/why|didn|fail|missing|fix|retry|reach/.test(q)){go('diagnose_sync',{fix:/\bfix|retry/.test(q)});return out;}
 if(/\bhot\b|warm|who.*(engaged|interested)|lead score|score/.test(q)){go('lead_score',{account:(text.match(/(?:at|for|in)\s+([A-Z][\w&. ]+?)(?:\?|$|[,.])/)||[])[1]});return out;}
 if(/\bcredit|attribut|influence/.test(q)){go('credit_campaign',{opp_id:id('OPP'),campaign:(text.match(/credit\s+(?:the\s+)?(.+?)\s+(?:on|to|for)\b/i)||text.match(/(?:for|to)\s+(?:the\s+)?(.+?)$/i)||[])[1]});return out;}
 if(/target list|push .*(seller|sales)|target accounts/.test(q)){go('push_target_list',{top:(q.match(/top\s+(\d+)/)||[])[1]});return out;}
 if(/approve/.test(q)&&(id('FU')||id('SH'))){go('approve_item',{id:id('FU')||id('SH')});return out;}
 if(/autopilot|status update|what.?s next/.test(q)){const r=A.autopilot_tick({thread});out.push(r?{...r,tool:'autopilot_tick'}:{kind:'Autopilot',title:'No change since last check'});if(r)out.push(...r.recs);return out;}
 if(/\b(approve|reject)\b/.test(q)&&id('BR')){go('decide_budget',{budget_id:id('BR'),decision:/approve/.test(q)?'approve':'reject'});return out;}
 if(/send/.test(q)&&id('EM')){go('send_email',{email_id:id('EM')});if(/nurture/.test(q))go('schedule_nurture',{email_id:id('EM')});return out;}
 if(/segment|email|nurture|invite/.test(q)&&!/how|which|engagement|open rate/.test(q)){const segq=(text.match(/(?:to|segment(?: of)?|for)\s+(.+?)(?:\s+(?:about|and send|and schedule|then)|[.?!]|$)/i)||[])[1]||text;
  go('build_segment',{query:segq});if(/email|invite|send|nurture/.test(q)){go('draft_email',{topic:(text.match(/about\s+(.+?)(?:[.,]| and |$)/i)||[])[1]});
  if(/\bsend\b/.test(q))go('send_email');if(/nurture/.test(q))go('schedule_nurture');}return out;}
 if(/code/.test(q))go('create_campaign_code');
 if(/budget/.test(q))go('budget_request',{amount:amt});
 if(/\bsow\b|statement of work/.test(q))go('generate_sow',{vendor:(text.match(/(?:with|vendor)\s+([A-Z][\w&. ]+?)(?:\s+for|\s+at|[,.]|$)/)||[])[1],amount:/budget/.test(q)?undefined:amt});
 if(/mdf/.test(q))go('mdf_status');
 if(/registrations?|who registered|signups/.test(q)&&!/create|set ?up/.test(q))go('event_status');
 else if(/event|registration page|roundtable/.test(q)&&/create|set ?up|launch|plan/.test(q))go('create_event',{capacity:(q.match(/(\d+)\s*(guests|seats|people)/)||[])[1],date:(text.match(/\d{4}-\d{2}-\d{2}/)||[])[0]});
 if(!out.length&&/how|which|what|show|pipeline|report|chart|roi|engagement|top|by /.test(q))go('query_insight',{question:text});
 if(!out.length)out.push({kind:'Help',title:'I can do these here',body:'Try: "segment CIOs in India enterprise accounts who opted in and email them about SASE, send and nurture" · "pipeline by channel" · "create a campaign code" · "budget request $200K" · "SOW with Lotus Events" · "set up the event for 40 guests" · "who registered?" · "MDF status" · "why did these leads not reach SFDC?" · "who is hot at Acme?" · "credit the roundtable on this opp" · "push the target list to sellers" · or attach a CSV.'});
 return out;}
// ---------- LLM loop ----------
async function llm(text,thread,csv){const tools=Object.entries(SCHEMA).map(([n,[d,p]])=>({type:'function',function:{name:n,description:d,parameters:p}}));
 const recent=thread.messages.slice(-12).map(m=>`${m.who}: ${m.text}${(m.artifacts||[]).map(a=>` [${a.kind}: ${a.title}]`).join('')}`).join('\n');
 const rows=csv?String(csv).split(/\n/).filter(Boolean).length-1:0;
 const msgs=[{role:'system',content:`You are @mops, the field marketing operator for ${brandCompany()} (fictional). You replace Eloqua, Power BI, Cvent, campaign-code, SOW and upload tools by calling functions over one data layer. Thread: "${thread.title}" (${thread.type} ${thread.refId}). Never ask for info already in the thread or data. Do not spend, send email, change consent, or write the CRM. A person has to approve those. Act with tools, then reply in <=3 short sentences.\nThread so far:\n${recent}`},{role:'user',content:text+(rows>0?`\nA list is attached (${rows} rows). Do not ask for the rows.`:'')}];
 const arts=[];for(let i=0;i<6;i++){const r=await fetch(BASE+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+KEY},body:JSON.stringify({model:MODEL,messages:msgs,tools})});
  const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j).slice(0,200));const m=j.choices[0].message;msgs.push(m);
  if(!m.tool_calls?.length)return{reply:m.content,arts};
  for(const tc of m.tool_calls){let a={};try{a=JSON.parse(tc.function.arguments||'{}')}catch{}if(a.csv)delete a.csv;const res=run(tc.function.name,a,thread,{model:true});arts.push(res);msgs.push({role:'tool',tool_call_id:tc.id,content:JSON.stringify({title:res.title,body:res.body,error:res.error})});}}
 return{reply:'Done.',arts};}
const VIA=['Outlook','Webex','Slack','Meeting','Partner portal'];
async function post(threadId,who,text,csv,via){const t=T(threadId);if(!t)throw new Error('no thread');const m={who,text,at:new Date().toISOString()};if(VIA.includes(via))m.via=via;t.messages.push(m);
 if(!/@mops/i.test(text)){save();return t;}const t0=Date.now();const body=text.replace(/@mops/ig,'').trim();let reply,arts,mode='rules';
 if(KEY){try{({reply,arts}=await llm(body,t,csv));mode='llm';}catch(e){console.error('LLM failed, falling back',e.message);}}
 if(mode==='rules'){arts=rules(body,t,csv);reply=arts.filter(a=>!a.error).map(a=>a.title).join(' · ')||arts.map(a=>a.error).join(' ');}
 t.messages.push({who:'@mops',mode,text:reply,artifacts:arts,ms:Date.now()-t0,at:new Date().toISOString()});save();return t;}
// ---------- efficiency ledger (baselines are placeholders, see baselines.json) ----------
function baselines(){return JSON.parse(fs.readFileSync(path.join(__dirname,'baselines.json')));}
function ledger(){const BL=baselines(),k2t={};for(const[id,t]of Object.entries(BL.tasks))t.kinds.forEach(k=>k2t[k]=id);const out=[];
 for(const th of db.threads)th.messages.forEach((m,i)=>{if(m.who!=='@mops')return;const seen=new Set();for(const a of m.artifacts||[]){if(a.error)continue;const key=a.kind==='Delegated'?'Delegated:'+(a.risk||'low'):a.kind;const task=k2t[key];if(!task||seen.has(task))continue;seen.add(task);
  const b=BL.tasks[task],asked=m.mode!=='delegated'&&m.mode!=='autopilot';const touches=asked?1:0,human=asked?b.mopsHumanMinutes:Math.min(b.mopsHumanMinutes,BL.touchMinutes);const mops=human+(m.ms??1500)/60000;
  out.push({task,label:b.label,thread:th.id,at:m.at,auto:!asked,baselineMinutes:b.baselineMinutes,baselineHandoffs:b.baselineHandoffs,baselineToolSwitches:b.baselineToolSwitches,baselineSteps:b.baselineSteps,mopsMinutes:+mops.toFixed(2),mopsTouches:touches,mopsMachineMs:m.ms??null,ratio:+(b.baselineMinutes/mops).toFixed(1)});}});return out;}
function efficiency(){const since=Date.now()-7*864e5,L=ledger().filter(e=>new Date(e.at)>=since),BL=baselines(),by={};for(const e of L){const g=by[e.task]||(by[e.task]={task:e.task,label:e.label,n:0,baseline:0,mops:0,touches:0,baselineSteps:0,switchesAvoided:0});g.n++;g.baseline+=e.baselineMinutes;g.mops+=e.mopsMinutes;g.touches+=e.mopsTouches;g.baselineSteps+=e.baselineSteps;g.switchesAvoided+=e.baselineToolSwitches;}
 const tasks=Object.values(by).map(g=>({...g,mops:+g.mops.toFixed(1),ratio:+(g.baseline/g.mops).toFixed(1)})).sort((a,b)=>b.baseline-a.baseline);const base=L.reduce((s,e)=>s+e.baselineMinutes,0),mops=L.reduce((s,e)=>s+e.mopsMinutes,0);
 return{placeholder:true,window:'last 7 days',label:BL._label,tasks,entries:L.length,ratio:mops?+(base/mops).toFixed(1):0,savedMinutes:Math.round(base-mops),baselineMinutes:base,mopsMinutes:+mops.toFixed(1),switchesAvoided:L.reduce((s,e)=>s+e.baselineToolSwitches,0),handoffsAvoided:L.reduce((s,e)=>s+e.baselineHandoffs,0),touches:L.reduce((s,e)=>s+e.mopsTouches,0),baselineSteps:L.reduce((s,e)=>s+e.baselineSteps,0),config:BL.tasks};}
// ---------- nurture scheduler ----------
function tickNurture(force){let n=0;for(const s of db.sequences){const st=s.steps.find(x=>x.status==='scheduled');if(!st||(!force&&new Date(st.dueAt)>new Date()))continue;
 const prev=db.outbox.filter(m=>m.emailId===s.emailId&&!m.step);const aud=prev.filter(m=>st.rule==='all non-openers'?!m.opened:!m.clicked);
 for(const m of aud){const x=db.contacts.find(c=>c.id===m.contactId);if(x.consent!=='opted_in')continue;db.outbox.push({...m,id:'M'+(db.outbox.length+1),subject:st.subject,step:st.n,seq:s.id,at:new Date().toISOString(),opened:false,clicked:false});sender.send(m);}
 st.status='sent';st.sent=aud.length;n++;T(s.threadId)?.messages.push({who:'@mops',mode:'scheduler',text:`Nurture ${s.id} step ${st.n} sent to ${aud.length} (${st.rule}).`,artifacts:[],at:new Date().toISOString()});}
 if(n)save();return n;}
function autopilot(){let n=0;for(const t of db.threads.filter(t=>t.type==='campaign')){const r=A.autopilot_tick({thread:t});if(!r)continue;n++;
 t.messages.push({who:'@mops',mode:'autopilot',text:r.title,artifacts:[r,...r.recs],at:new Date().toISOString()});}if(n)save();return n;}
// Delegation policy: @mops decides low/medium-risk items itself (seller follow-ups, budget shifts <= limit). Budgets over $150K and big shifts still need the human.
function delegate(limit){limit=limit||Number(process.env.MOPS_DELEGATE_LIMIT)||25000;const by={};
 for(const f of (db.followups||[]).filter(x=>x.status==='pending')){const r=A.approve_item({id:f.id});if(!r.error)(by[f.threadId]=by[f.threadId]||[]).push({...r,kind:'Delegated',risk:'low',title:r.title.replace(/^FU-\d+: /,'')});}
 for(const sh of (db.shifts||[]).filter(x=>x.status==='pending'&&x.amount<=limit)){const c=db.campaigns.find(x=>x.id===sh.from);const r=A.approve_item({id:sh.id});if(!r.error)(by['T-'+c.id]=by['T-'+c.id]||[]).push({...r,kind:'Delegated',risk:'medium',title:r.title.replace(/^SH-\d+: /,''),data:{...r.data,amount:sh.amount,to:sh.to}});}
 let n=0;for(const[tid,arts]of Object.entries(by)){const t=T(tid);if(!t)continue;n+=arts.length;t.messages.push({who:'@mops',mode:'delegated',text:'Decided within your rules',artifacts:arts,at:new Date().toISOString()});}
 if(n)save();return n;}
const nurtureTimer=setInterval(()=>tickNurture(false),15000);if(nurtureTimer.unref)nurtureTimer.unref();
if(process.env.MOPS_AUTOPILOT!=='0'){const ap=setInterval(autopilot,Number(process.env.MOPS_AUTOPILOT_MS)||60000);if(ap.unref)ap.unref()}
// ---------- pages ----------
function sowHtml(s){const c=db.campaigns.find(x=>x.id===s.campaignId);return`<html><head><meta charset="utf-8"><title>${s.id}</title><style>body{font-family:Calibri,Arial;max-width:760px;margin:40px auto;line-height:1.5}h1{color:#4f46e5}td{padding:6px 10px;border:1px solid #ccc}</style></head><body>
<h1>Statement of Work ${s.id}</h1><p><b>Client:</b> ${esc(brandCompany())} (fictional) &nbsp; <b>Vendor:</b> ${esc(s.vendor)}</p><table><tr><td>Campaign</td><td>${esc(c?c.name:'-')}</td></tr><tr><td>Campaign code</td><td>${esc(s.code)}</td></tr><tr><td>Region</td><td>${esc(c?c.region:'-')}</td></tr><tr><td>Fee</td><td>${fmt(s.amount)}</td></tr></table>
<h3>1. Scope</h3><p>${esc(s.scope)}</p><h3>2. Deliverables</h3><ul><li>Project plan within 5 business days</li><li>Execution per scope</li><li>Attendee/lead file in ${esc(brandName())} upload format within 48h</li><li>Post-activity report</li></ul><h3>3. Payment</h3><p>50% on signature, 50% on acceptance. Invoices must quote ${esc(s.code)}.</p><h3>4. Acceptance</h3><p>Field marketing owner sign-off.</p><p><br>${esc(brandCompany())}: ______________ &nbsp;&nbsp; ${esc(s.vendor)}: ______________</p><p style="color:#888;font-size:12px">Generated by @mops ${s.at.slice(0,10)}</p></body></html>`;}
function regPage(e,msg){return`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${esc(e.name)}</title><style>body{font-family:Inter,system-ui;background:linear-gradient(135deg,#0f172a,#312e81);color:#fff;min-height:100vh;margin:0;display:grid;place-items:center}.c{background:#fff;color:#0f172a;border-radius:18px;padding:32px;width:380px;box-shadow:0 20px 60px #0006}h1{margin:0 0 4px;font-size:22px}p{color:#64748b;margin:0 0 18px}input{width:100%;box-sizing:border-box;padding:11px;margin:6px 0;border:1px solid #cbd5e1;border-radius:10px;font-size:14px}button{width:100%;padding:12px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-weight:600;margin-top:10px;cursor:pointer}.ok{background:#dcfce7;color:#166534;padding:10px;border-radius:10px;margin-bottom:10px}label{font-size:13px;color:#334155}</style></head><body><form class="c" method="post">
<div style="color:#4f46e5;font-weight:700;font-size:13px">${esc(brandCompany()).toUpperCase()}</div><h1>${esc(e.name)}</h1><p>${esc(e.date)} · ${esc(e.city)} · ${e.capacity-e.registrations.length} seats left</p>${msg?`<div class="ok" id="ok">${msg}</div>`:''}
<input name="name" placeholder="Full name" required><input name="email" type="email" placeholder="Work email" required><input name="company" placeholder="Company"><input name="title" placeholder="Job title"><label><input type="checkbox" name="consent" style="width:auto"> Email me about ${esc(brandName())} events</label><button>Register</button></form></body></html>`;}
// ---------- http ----------
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const body=req=>new Promise((resolve,reject)=>{let b='';let n=0;let tooBig=false;req.on('data',c=>{n+=c.length;if(n>8_000_000){tooBig=true;return}b+=c});req.on('end',()=>{if(tooBig)reject(Object.assign(new Error('Request is too large'),{status:413}));else resolve(b)});req.on('error',reject)});
const J=(res,o,c=200)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
const guard=require('./backend/guard.js');const{ready}=require('./backend/ready.js');
// Messages that reach @mops on any surface (email, Webex, Engine room) also land in the app's campaign thread.
require('./backend/agent.js').attach(({surface,sender,text,reply})=>{const t=T('T-K1');if(!t)return;const at=new Date().toISOString();t.messages.push({who:sender,via:{email:'Outlook',webex:'Webex',app:'App'}[surface]||surface,text,at},{who:'@mops',mode:'rules',text:reply,artifacts:[],at});save();});
let gate=Promise.resolve(),depth=0;
function lock(fn){const run=gate.then(fn,fn);gate=run.then(()=>{},()=>{});return run}
function mock(method,url,headers,raw){const waiters=[];let ended=false;const req={method,url,headers,socket:{remoteAddress:'127.0.0.1'},
  on(ev,fn){if(ev!=='data'&&ev!=='end'&&ev!=='error')return;if(ended){if(ev==='data'&&raw)fn(raw);if(ev==='end')fn();return}waiters.push([ev,fn])},
  flush(){if(ended)return;ended=true;for(const[ev,fn]of waiters){if(ev==='data'&&raw)fn(raw);if(ev==='end')fn()}}};
  return req}
async function carry(req,res){let raw;try{raw=await body(req)}catch(e){return J(res,{error:'Request is too large. Please retry.'},e.status||413)}
  let pack;try{pack=JSON.parse(raw||'{}')}catch(e){return J(res,{error:'Could not read that request. Please retry.'},400)}
  const headers={cookie:req.headers.cookie||'','content-type':pack.contentType||'application/json',accept:'application/json','x-mops-internal':req.headers['x-mops-internal']||''};
  if(pack.log!=null&&pack.log!=='')headers['x-mops-log']=String(pack.log);
  const inner=mock(pack.method||'GET',pack.path||'/',headers,pack.body||'');
  const chunks=[];let status=200,rh={};const innerRes={writableEnded:false,get headersSent(){return this._s},
    writeHead(c,h){status=c;rh=h||{};this._s=true},setHeader(k,v){rh[k]=v},
    write(c){chunks.push(Buffer.from(c));return true},
    end(c){if(c!=null)chunks.push(Buffer.isBuffer(c)?c:Buffer.from(String(c)));this.writableEnded=true;this._s=true}};
  const pending=handleRequest(inner,innerRes);inner.flush();await pending;
  const buf=Buffer.concat(chunks);const ct=String(rh['content-type']||rh['Content-Type']||'');const binary=/pdf|octet|officedocument|word|sheet|zip/.test(ct);
  let log='';try{log=require('./backend/journal').exportLog()}catch(e){}
  return J(res,{status,headers:rh,body:binary?buf.toString('base64'):buf.toString('utf8'),binary,log})}
function attachLog(req,res){const journal=require('./backend/journal');
  const token=req.headers['x-mops-log'];const id=req.headers['x-mops-log-id'];
  const raw=token==null?'':Array.isArray(token)?String(token[0]):String(token);
  try{
    if(raw!==''){const sig=journal.sigOf(raw);if(sig!==journal.currentSig())journal.apply(raw)}
    else if(id&&id===journal.currentSig()){}
  }catch(e){console.error('journal',e&&e.message||e)}
  const origWrite=res.writeHead.bind(res),origEnd=res.end.bind(res);
  res.writeHead=function(code,h){const headers=h&&typeof h==='object'&&!Array.isArray(h)?Object.assign({},h):{};
    try{const log=journal.exportLog();journal.remember(log);req._mopsLog=log;headers['x-mops-log-id']=journal.sigOf(log);if(log.length<6000)headers['x-mops-log']=log}catch(e){console.error('journal export',e&&e.message||e)}
    try{return origWrite(code,headers)}catch(e){console.error('headers',e&&e.message||e);delete headers['x-mops-log'];return origWrite(code,headers)}};
  res.end=function(chunk,enc,cb){try{if(req._mopsLog&&chunk!=null){const text=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);
    if(text.charCodeAt(0)===123){const obj=JSON.parse(text);if(obj&&typeof obj==='object'&&!Array.isArray(obj)&&obj.mopsLog==null){obj.mopsLog=req._mopsLog;chunk=JSON.stringify(obj)}}}}catch(e){console.error('embed log',e&&e.message||e)}
    return origEnd(chunk,enc,cb)}}
function servePage(res,file,req){try{let raw=fs.readFileSync(file);const text=raw.toString('utf8');if(text.includes('__BRAND__')||text.includes('__BRAND_JSON__')||text.includes('__SANDBOX_FLAG__')){let name=brandName();let accent='';try{const company=req&&require('./platform/workspace').sessionUser(req);if(company&&company.company){name=company.company;accent=company.color||''}}catch(e){}const safe=name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const workspace=req&&(require('./backend/sandbox').workspaceFromRequest(req)||require('./platform/workspace').sessionUser(req));const sandbox=require('./backend/sandbox').enabled()&&!workspace?'true':'false';raw=text.replaceAll('__BRAND_JSON__',JSON.stringify(name)).replaceAll('__BRAND__',safe).replaceAll('__SANDBOX_FLAG__',sandbox);if(accent&&/^#[0-9a-fA-F]{6}$/.test(accent))raw=raw.toString('utf8').replace('--accent: #0f6e56','--accent: '+accent)}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(raw)}catch(e){console.error('page',e&&e.message||e);if(!res.headersSent)J(res,{error:'The page did not load. Please retry.'},500)}}
function pinWorkspace(req,res){let token='';try{token=new URL(req.url||'/','http://x').searchParams.get('ws')||''}catch(e){token=''}const sandbox=require('./backend/sandbox');if(!token||!sandbox.readWorkspace(token))return;const cookie=sandbox.workspaceCookie(token);const orig=res.writeHead.bind(res);res.writeHead=function(code,h){const headers=h&&typeof h==='object'&&!Array.isArray(h)?Object.assign({},h):{};const prev=headers['set-cookie'];const list=prev==null?[]:(Array.isArray(prev)?prev.slice():[prev]);list.push(cookie);headers['set-cookie']=list;return orig(code,headers)}}
async function handleInner(req,res){pinWorkspace(req,res);const HUB=require('./backend/hub.js');let u;try{u=new URL(req.url,'http://x')}catch(e){u=new URL('/','http://x')}const p=u.pathname;
 if(p==='/login'||p==='/login/'){res.writeHead(303,{location:'/','cache-control':'no-store'});return res.end()}
 if(p==='/api/logout'&&req.method==='POST'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','set-cookie':'mops_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'});return res.end('{"ok":true}')}
 if(p==='/health'||p==='/healthz'||p==='/api/health')return J(res,{ok:true,service:'mops',company:brandCompany()});
 ready().catch(e=>console.error('boot',e&&e.message||e));
 if(p.startsWith('/platform/t/')||p.startsWith('/platform/p/'))return require('./platform').publicRoute(req,res,u);
 attachLog(req,res);
 try{
 if(await guard.handle(req,res,p))return;
 if((p==='/api/inbound/email'||p==='/api/inbound/webex')&&req.method==='POST')return require('./platform/inbound').http(req,res,u);
 if(p==='/signup'||p==='/onboarding'||p==='/api/signup'||p.startsWith('/api/workspace'))return require('./platform/workspace').http(req,res,u);
 if((p==='/api/sandbox'||p==='/api/sandbox/sync')){
  const sandbox=require('./backend/sandbox');
  if(req.method==='GET'&&p==='/api/sandbox')return J(res,{enabled:sandbox.enabled(),expiresMs:sandbox.BOX_MS});
  if(req.method==='POST'&&p==='/api/sandbox/sync'){const raw=await body(req);let log=[];try{log=JSON.parse(raw||'{}').log||[]}catch(e){log=[]}return J(res,await sandbox.sync(log))}
  res.writeHead(404);return res.end('not found');
 }
 if(p.startsWith('/platform')||p.startsWith('/api/platform')){
  const sandbox=require('./backend/sandbox');
  const company=require('./platform/workspace').sessionUser(req);
  const scope=require('./platform/scope');
  if(company)return sandbox.run(company.dir,()=>scope.bind({id:company.tenantId,name:company.company,color:company.color,inbound:company.inbound},()=>require('./platform').handle(req,res,u)));
  if(req.method==='GET'&&!p.startsWith('/api/'))return require('./platform').handle(req,res,u);
  const dir=await sandbox.prepare(req,res);
  if(dir===false)return;
  return sandbox.run(dir,()=>{bindJson(dir);return require('./platform').handle(req,res,u)});
 }
 if(p==='/webinar'||p==='/webinar/')return servePage(res,path.join(__dirname,'ui','webinar.html'),req);
 if(p.startsWith('/api/webinar'))return require('./webinar/engine').http(req,res);
 if(p==='/')return servePage(res,path.join(__dirname,'ui','home.html'),req);
 if(p==='/classic'||p==='/classic/')return servePage(res,path.join(__dirname,'ui','index.html'),req);
 if(p==='/engine'||p==='/engine/')return servePage(res,path.join(__dirname,'ui','engine.html'),req);
 if(p==='/engine/data'||p==='/engine/data/')return servePage(res,path.join(__dirname,'ui','data.html'),req);
 await ready();
 if(p==='/api/carry'&&req.method==='POST')return carry(req,res);
 if(p==='/health'||p==='/healthz')return J(res,{ok:true,service:'mops',company:brandCompany()});
 if(await HUB.handle(req,res,p,u))return;
 if(p==='/api/state')return J(res,{company:db.company,mode:KEY?'llm':'rules',model:KEY?MODEL:null,sender:sender.name,stack:STACK,threads:db.threads.map(t=>({id:t.id,title:t.title,type:t.type,n:t.messages.length})),
  counts:{accounts:db.accounts.length,contacts:db.contacts.length,optedIn:db.contacts.filter(c=>c.consent==='opted_in').length,campaigns:db.campaigns.length,leads:db.leads.length,events:db.events.length,registrations:db.events.reduce((s,e)=>s+e.registrations.length,0),budgets:db.budgets.length,sows:db.sows.length,segments:db.segments.length,emailsSent:db.outbox.length,crmSync:db.crmSync.length}});
 if(p.startsWith('/api/thread/'))return J(res,T(p.split('/')[3])||{});
 if(p==='/api/post'&&req.method==='POST'){const b=JSON.parse(await body(req));return J(res,await post(b.threadId,b.who||'Srisha R.',b.text,b.csv,b.via))}
 if(p==='/api/tool'&&req.method==='POST'){const b=JSON.parse(await body(req));const t=T(b.threadId);const r=run(b.tool,b.args||{},t);t.messages.push({who:'@mops',mode:'direct',text:r.title||r.error,artifacts:[r],at:new Date().toISOString()});save();return J(res,r)}
 const m=p.match(/^\/api\/budget\/(BR-\d+)\/(approve|reject)$/);if(m&&req.method==='POST'){if(!req.mopsUser||req.mopsUser.role!=='approver')return J(res,{error:'Only an approver can decide a budget.'},403);const r=A.decide_budget({budget_id:m[1],decision:m[2],approver:req.mopsUser.name});const b=db.budgets.find(x=>x.id===m[1]);if(b&&!r.error)T(b.threadId).messages.push({who:'@mops',mode:'direct',text:r.title,artifacts:[r],at:new Date().toISOString()});save();try{require('./backend/auth').audit({userId:req.mopsUser.id,role:req.mopsUser.role,region:(req.mopsUser.regions||[]).join(','),action:'budget.'+m[2],object:m[1],before:null,after:{status:r.title,approver:req.mopsUser.name}})}catch(e){}return J(res,r,r.error?400:200)}
 if(p==='/api/delegate'&&req.method==='POST')return J(res,{decided:delegate()});
 if(p==='/api/autopilot/run'&&req.method==='POST')return J(res,{updated:autopilot()});
 if(p==='/api/nurture/run'&&req.method==='POST')return J(res,{stepsSent:tickNurture(true)});
 if(p==='/api/efficiency')return J(res,efficiency());
 if(p==='/api/ledger')return J(res,ledger());
 if(p==='/api/outbox')return J(res,db.outbox.slice(-200).reverse());
 if(p==='/api/briefing'){const LC=require('./backend/lifecycle');const draft=LC.present(LC.ensure());const f=draft.fields||{},form=draft.form||{filled:0,total:0,open:[],items:[]};
  const rows=db.campaigns.filter(c=>c.status!=='Draft'&&(c.geo||'')===f.geo&&(c.program||c.channel)===(f.program||f.channel));
  const goal=rows.reduce((s,c)=>s+(+c.goal||0),0),pipeline=rows.reduce((s,c)=>s+(+c.pipeline||0),0),gap=Math.max(0,goal-pipeline);
  const sources=[...new Set((form.items||[]).filter(i=>i.value&&i.source).map(i=>i.source))].slice(0,6);
  return J(res,{id:draft.id,name:f.campaign_name,geo:f.geo,program:f.program,gap,goal,pipeline,campaigns:rows.length,budget:draft.budget&&draft.budget.total,route:draft.budget&&draft.budget.route,status:draft.budget&&draft.budget.status,filled:form.filled,total:form.total,open:form.open,sources,agents:draft.agents,compare:draft.compare,policies:draft.policies,learned:draft.learned||[],selfCheck:draft.sow&&draft.sow.selfCheck||null,accounts:db.accounts.length})}
 if(p==='/api/portfolio'){const user=req.mopsUser;let geo=u.searchParams.get('region')||'all',program=u.searchParams.get('program')||'all',quarter=u.searchParams.get('quarter')||'all';
  const order=['ABM','Digital','Events','Partner','Lead gen'];let cs=db.campaigns.filter(c=>c.status!=='Draft');
  if(user&&user.role!=='admin'){const allow=new Set(user.regions||[]);cs=cs.filter(c=>allow.has(c.geo));if(geo!=='all'&&!allow.has(geo))geo=allow.values().next().value||'all'}
  if(geo&&geo!=='all')cs=cs.filter(c=>(c.geo||'')===geo);if(program&&program!=='all')cs=cs.filter(c=>(c.program||c.channel)===program);if(quarter&&quarter!=='all')cs=cs.filter(c=>(c.quarter||'FY27Q2')===quarter);
  const sum=k=>cs.reduce((s,c)=>s+(+c[k]||0),0);const groups={};for(const name of order)groups[name]=[];for(const c of cs){const name=c.program||c.channel;(groups[name]=groups[name]||[]).push({id:c.id,name:c.name,program:c.program||c.channel,geo:c.geo,region:c.region,country:c.country,quarter:c.quarter||'FY27Q2',stage:c.stage||'Run',pace:c.pace||'on pace',nextAction:c.nextAction||'',budget:c.budget,spend:c.spend,goal:c.goal||0,pipeline:c.pipeline||0,bookings:c.bookings||0,mqls:c.mqls||0,leadCount:c.leadCount||0,code:c.code,sfdcId:c.sfdcId,owner:c.owner,status:c.status,needsApproval:!!c.needsApproval,consent:c.consent||null})}
  return J(res,{source:'campaign-ledger',regions:db.regions||[],programs:db.programs||[],quarter,summary:{campaigns:cs.length,budget:sum('budget'),spend:sum('spend'),pipeline:sum('pipeline'),goal:sum('goal'),mqls:sum('mqls')},groups})}
 if(p==='/api/data')return J(res,{campaigns:db.campaigns,regions:db.regions||[],programs:db.programs||[],budgets:db.budgets,events:db.events.map(e=>({...e,registrations:e.registrations.length})),sequences:db.sequences,crmSync:db.crmSync,syncLog:db.syncLog,opps:db.opps,crm:db.crm,notifications:db.notifications,mdf:db.mdf,uploads:db.uploads,followups:db.followups||[],shifts:db.shifts||[],leads:db.leads.map(l=>[l.created,l.pipeline||0,l.campaignId,l.accountId]),accounts:db.accounts.map(a=>[a.id,a.name,a.region,a.city||'']),intent:(db.intent6s||[]).slice(0,40),web:(db.adobeWeb||[]).slice(0,40),consent:['opted_in','unknown','opted_out'].map(k=>[k,db.contacts.filter(c=>c.consent===k).length])});
 if(p==='/api/reset'&&req.method==='POST'){if(!req.mopsUser||req.mopsUser.role!=='admin')return J(res,{error:'Admin only.'},403);db=JSON.parse(fs.readFileSync(path.join(__dirname,'data.seed.json')));A=mk(db,ctx);save();try{require('./backend/lifecycle').resetDemo()}catch{}return J(res,{ok:1})}
 let s;if((s=p.match(/^\/sow\/(SOW-\d+)\.(doc|html)$/))){const w=db.sows.find(x=>x.id===s[1]);if(!w){res.writeHead(404);return res.end()}
  res.writeHead(200,s[2]==='doc'?{'content-type':'application/msword','content-disposition':`attachment; filename="${w.id}.doc"`}:{'content-type':'text/html'});return res.end(sowHtml(w))}
 if((s=p.match(/^\/r\/([\w-]+)$/))){const e=db.events.find(x=>x.slug===s[1]);if(!e){res.writeHead(404);return res.end('No event')}
  if(req.method==='POST'){const f=new URLSearchParams(await body(req));const email=(f.get('email')||'').toLowerCase().trim();let msg;
   if(e.registrations.find(r=>r.email===email))msg='You are already registered.';else if(e.registrations.length>=e.capacity)msg='Sorry, the event is full.';else{
    const dom=email.split('@')[1];const a=db.accounts.find(a=>a.domain===dom);let ct=db.contacts.find(c=>c.email===email);const consent=f.get('consent')?'opted_in':(ct?.consent||'unknown');
    if(!ct){const nm=(f.get('name')||'').split(' ');ct={id:'C'+(1001+db.contacts.length),first:nm[0],last:nm.slice(1).join(' '),email,title:f.get('title')||'Unknown',accountId:a?.id||null,consent,consentDate:new Date().toISOString().slice(0,10)};if(a)db.contacts.push(ct);}else if(f.get('consent')){ct.consent='opted_in';ct.consentDate=new Date().toISOString().slice(0,10);}
    e.registrations.push({name:f.get('name'),email,company:f.get('company'),account:a?.name||null,contactId:a?ct.id:null,consent,at:new Date().toISOString()});
    if(a&&e.campaignId)db.leads.push({id:'L'+(5001+db.leads.length),contactId:ct.id,accountId:a.id,campaignId:e.campaignId,stage:'MQL',pipeline:0,created:new Date().toISOString().slice(0,10)});
    const th=db.threads.find(t=>t.refId===e.campaignId);th?.messages.push({who:'@mops',mode:'event',text:`New registration: ${f.get('name')} (${a?a.name:'unmatched company'}) – ${e.registrations.length}/${e.capacity}`,artifacts:[],at:new Date().toISOString()});save();msg='You are registered! See you there.';}
   res.writeHead(200,{'content-type':'text/html'});return res.end(regPage(e,msg))}
  res.writeHead(200,{'content-type':'text/html'});return res.end(regPage(e))}
 if((s=p.match(/^\/t\/(o|c)\/(M\d+)$/))){const mm=db.outbox.find(x=>x.id===s[2]);if(mm){mm.opened=true;if(s[1]==='c')mm.clicked=true;save();}res.writeHead(s[1]==='c'?302:200,s[1]==='c'?{location:'/r/'+(db.events[0]?.slug||'')}:{'content-type':'image/gif'});return res.end()}
 if((s=p.match(/^\/outbox\/(M\d+)$/))){const mm=db.outbox.find(x=>x.id===s[1]);res.writeHead(200,{'content-type':'text/html'});return res.end(`<div style="font-family:system-ui;max-width:620px;margin:30px auto"><p><b>To:</b> ${esc(mm.to)}<br><b>Subject:</b> ${esc(mm.subject)}</p><pre style="white-space:pre-wrap;font-family:inherit">${esc(mm.body)}</pre><a href="/t/c/${mm.id}">Reserve my seat</a><img src="/t/o/${mm.id}" width=1 height=1></div>`)}
 const root=path.join(__dirname,'ui');const f=path.join(root,p==='/'?'index.html':p);if(f.startsWith(root)&&fs.existsSync(f)&&fs.statSync(f).isFile()){res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});return res.end(fs.readFileSync(f))}
 res.writeHead(404);res.end('not found');}catch(e){if(e.status!==413)console.error(e);if(!res.headersSent){const code=e.status===413?413:(e.status&&e.status<500?e.status:200);J(res,{error:e.status===413?'Request is too large':(e.message||'Something went wrong. Please retry.')},code)}}}
async function handleRequest(req,res){let path='/';try{path=new URL(req.url,'http://x').pathname}catch(e){}
 try{
 if(path==='/login'||path==='/login/'){res.writeHead(303,{location:'/','cache-control':'no-store'});return res.end()}
 if(depth>0)return handleInner(req,res);
 return await lock(async()=>{depth++;try{return await handleInner(req,res)}finally{depth--}})}catch(e){console.error(e);if(!res.headersSent){try{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({error:'Something went wrong. Please retry.'}))}catch(e2){console.error(e2)}}}}
function listen(){const{listenServices}=require('./backend/lib.js');const port=process.env.PORT||process.env.MOPS_PORT||8787;
  return ready().then(()=>{const srv=http.createServer(handleRequest);srv.listen(port,'0.0.0.0',()=>console.log(`@mops on :${port} mode=${KEY?'llm':'rules'} sender=${sender.name}`));if(!process.env.VERCEL)listenServices()})}
module.exports={handleRequest,listen,ready};
if(require.main===module)listen().catch(e=>{console.error(e);process.exit(1)});
