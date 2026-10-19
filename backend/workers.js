// Workers that react to the event log: inbound email → agent → emailed reply; autopilot healer; warehouse loader; cover watcher.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const{call,invoke}=require('./lib');const core=require('./core'),agent=require('./agent');const{resolve,limits:loadLimits}=require('./loadsize');
const{deliver}=require('./mail');
const bus=(...a)=>require('./hub').bus(...a);const say=(kind,msg,data={},trace)=>bus({svc:'autopilot',kind,msg,data,trace});
const BOX=(process.env.MOPS_INBOX||'mops@mops.local').toLowerCase();
// ---- surface 1: email. Anyone can CC mops@; the reply goes back to the whole thread. ----
function cleanBody(t){const out=[];for(const l of String(t||'').split(/\r?\n/)){if(/^>/.test(l)||/^On .+wrote:$/.test(l.trim())||/^-{2,}\s*$/.test(l))break;out.push(l)}return out.join('\n').trim()}
core.subscribe('inbound-email',/^mail\.inbound$/,async e=>{const m=await call('mail','/messages/'+e.data.id);if(m.headers['x-mops-surface']==='reply')return;
  const body=cleanBody(m.text);const text=(body.match(/@mops[^\n]*/i)||[body.split('\n')[0]||m.subject])[0];const r=await agent.handle({text,surface:'email',sender:m.mail_from});
  const others=[...new Set([...(m.rcpt||'').split(','),...(m.cc||'').split(',')].map(s=>s.trim().toLowerCase()).filter(x=>x&&x!==BOX&&x!==m.mail_from.toLowerCase()))];
  deliver({from:'"@mops" <'+BOX+'>',to:m.mail_from,cc:others,subject:/^re:/i.test(m.subject)?m.subject:'Re: '+m.subject,inReplyTo:m.message_id,references:m.message_id,headers:{'X-Mops-Surface':'reply','X-Mops-Trace':r.trace},
    text:r.reply+'\n\n— @mops (reply to this email to continue)\n\n> '+body.split('\n').join('\n> '),html:`<div style="font-family:Arial;font-size:14px;white-space:pre-wrap">${r.reply.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div><p style="color:#888;font-size:12px">— @mops · reply to continue</p>`});
  bus({svc:'mail',kind:'smtp',msg:`📤 @mops emailed reply to ${m.mail_from}${others.length?' cc '+others.join(', '):''}`,data:{},trace:r.trace})});
// ---- surface 2: Webex-style bot webhook (HMAC-SHA1 signature like Webex's X-Spark-Signature) ----
const WEBEX_SECRET=process.env.MOPS_WEBEX_SECRET||'dev-webex-secret';
async function webex(raw,sig){const want=crypto.createHmac('sha1',WEBEX_SECRET).update(raw).digest('hex');if(sig!==want)return{status:401,body:{error:'bad signature'}};
  const b=JSON.parse(raw);const d=b.data||{};const r=await agent.handle({text:d.text||'',surface:'webex',sender:d.personEmail||'unknown'});
  return{status:200,body:{roomId:d.roomId,markdown:r.reply,action:r.action,trace:r.trace}}}
// ---- self-healing autopilot: watches for sync jobs landing in the failure queue, diagnoses, waits for recovery, requeues, verifies ----
const incidents=[];let healing=false;
core.subscribe('autopilot-healer',/^engine\.error$/,async e=>{if(!/failure queue/.test(e.msg)||healing)return;healing=true;const t0=Date.now(),inc={id:'INC-'+(incidents.length+1),opened:new Date().toISOString(),trigger:e.msg,steps:[]};incidents.unshift(inc);
  const step=m=>{inc.steps.push({at:Date.now()-t0,m});say('heal',`🩺 ${inc.id}: ${m}`,{},inc.id)};
  try{step('detected a CRM sync job in the failure queue; diagnosing');let ok=0,probes=0;
    while(ok<2&&Date.now()-t0<120000){probes++;try{const r=await invoke('crm','GET','/services/data/v59.0/changes?since='+encodeURIComponent(new Date().toISOString()));if(r.status<400)ok++;else{ok=0;if(probes%3===1)step(`CRM probe ${probes}: HTTP ${r.status} → CRM is down, holding retries (not burning API calls)`)}}catch{ok=0}await new Promise(r=>setTimeout(r,1000))}
    step(`CRM healthy again after ${probes} probes; requeueing failure queue`);await new Promise(r=>setTimeout(r,800));const q=await call('engine','/sync/retry-failed',{body:{}},inc.id);const d=await call('engine','/sync/drain',{body:{timeoutMs:20000}},inc.id);const s=await call('engine','/sync/status');
    inc.resolved=s.failureQueue.length===0&&d.pending===0;inc.ms=Date.now()-t0;step(inc.resolved?`✅ healed: ${q.requeued} job(s) replayed, failure queue empty, CRM in sync (${(inc.ms/1000).toFixed(1)}s, no human)`:`still ${s.failureQueue.length} failing; escalating to Srisha`)}
  finally{healing=false}});
async function injectFailure(){const ms=+(process.env.MOPS_OUTAGE_MS||14000);await call('crm','/admin/outage',{body:{ms}},'INJECT');const r=await call('engine','/campaigns',{body:{name:'Self-heal probe campaign',channel:'Digital',region:'Japan',budget:10000}},'INJECT');
  await call('engine','/sync/drain',{body:{timeoutMs:Math.max(20000,ms+5000)}},'INJECT');await core.drain(Math.max(90000,ms+30000));
  return{injected:true,campaign:r.id,note:'CRM returns 503 for the outage window; jobs exhaust retries, land in the failure queue, autopilot heals inside this request.'}}
// ---- warehouse loader: event-driven incremental refresh (debounced) ----
let eltTimer=null;core.subscribe('warehouse-loader',/^engine\.(event|upload|sync)$/,async()=>{clearTimeout(eltTimer);eltTimer=setTimeout(()=>call('warehouse','/elt/run',{body:{}},'auto-elt').catch(()=>{}),+(process.env.ELT_DEBOUNCE_MS||8000))});
// ---- cover watcher: event-triggered scan (debounced) + periodic ----
const cover=require('./cover');let covT=null;core.subscribe('cover-watcher',/^(engine|crm|warehouse)\.(event|upload|campaign|sales|elt|score)$/,async()=>{clearTimeout(covT);covT=setTimeout(()=>cover.scan('event').catch(()=>{}),2500)});
if(process.env.COVER_MS!=='0'&&!process.env.VERCEL){const t=setInterval(()=>cover.scan('timer').catch(()=>{}),+(process.env.COVER_MS||30000));if(t.unref)t.unref()}
// ---- load test launcher (in-process; the HTTP handler awaits it so Vercel finishes the work before freezing) ----
let load={status:'idle'};async function startLoad(opts={}){if(load.status==='running')return load;const size=resolve(opts);load={status:'running',started:new Date().toISOString(),contacts:size.contacts,sends:size.sends,capped:size.capped,label:size.limits.label,phases:{}};
  try{const result=await require('./loadtest').run({contacts:size.contacts,sends:size.sends},x=>{if(x.phase)load.phases[x.phase]={...load.phases[x.phase],...x};if(x.final)load={...load,...x.final,status:x.final.error?'failed':'done',label:size.limits.label};bus({svc:'load',kind:'load',msg:x.msg||'',data:x,trace:'LOAD'})});
    if(load.status==='running')load={...load,...result,status:result.error?'failed':'done'}}catch(e){load={...load,status:'failed',error:e.message}}return load}
// ---- efficiency report: baseline (labelled source) vs measured machine time + assumed human time, per task and end to end ----
let lastMap=null;const setLastMap=m=>lastMap=m;
function efficiency(){const BL=JSON.parse(fs.readFileSync(path.join(__dirname,'..','baselines.json')));const dir=(process.env.MOPS_RUNS_DIR||path.join(__dirname,'runs'));
  const runs=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^run-.*\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f)))).filter(r=>r.ok):[];
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null};
  const stepMs=k=>med(runs.map(r=>r.steps.filter(s=>s.task===k).reduce((a,s)=>a+s.ms,0)).filter(x=>x>0));
  const it=require('./intake').list()[0];const T=it?.timings||{};
  const zb=require('./zerotouch').latestBudget();const machine={budget:zb?zb.ms:null,code:T['budget+code']??stepMs('code'),code_sfdc:T['budget+code']!=null?(T['budget+code']+(T.sfdc||0)+(lastMap?.ms||0)):null,sow:T.sow??null,upload:lastMap?.ms??stepMs('upload'),report:stepMs('report')!=null?stepMs('report')+(stepMs('attribution')||0):null,
    email:stepMs('email'),event:T.event??stepMs('event'),sync:stepMs('sync'),attribution:stepMs('attribution')};
  const src={budget:'zero-touch budget draft',code:'intake',code_sfdc:'intake + Excel mapping',sow:'intake',upload:'Excel mapping',report:'campaign run (ELT + query)'};
  const tasks=Object.entries(BL.tasks).map(([k,t])=>{const ms=machine[k];const base={task:k,label:t.label,source:t.source,sourceNote:t.sourceNote||'unverified placeholder',baselineMinutes:t.baselineMinutes,baselineRange:t.baselineRange||null,baselineWaitHours:t.baselineWaitHours||0,humanMinutesAssumed:t.mopsHumanMinutes,humanNote:t.mopsHumanNote||''};
    if(ms==null)return{...base,measured:false};const mopsMin=ms/60000+t.mopsHumanMinutes;const x=t.baselineMinutes/mopsMin;
    return{...base,measured:true,measuredFrom:src[k]||'campaign runs',machineSeconds:+(ms/1000).toFixed(2),mopsMinutes:+mopsMin.toFixed(2),speedup:Math.floor(x*10)/10,meets20x:x>=20,
      speedupRange:(t.baselineRange||t.mopsHumanRange)?(()=>{const br=t.baselineRange||[t.baselineMinutes,t.baselineMinutes],hr=t.mopsHumanRange||[t.mopsHumanMinutes,t.mopsHumanMinutes];return[+(br[0]/(hr[1]+ms/60000)).toFixed(1),+(br[1]/(hr[0]+ms/60000)).toFixed(1)]})():null,headline:t.source!=='PLACEHOLDER'}});
  const e2=BL.endToEnd;const parts=e2.tasks.map(k=>tasks.find(t=>t.task===k));const ok=parts.every(p=>p&&p.measured);
  let endToEnd=null;if(ok){const base=parts.reduce((a,p)=>a+p.baselineMinutes,0),human=e2.mopsIntakeMinutes+parts.reduce((a,p)=>a+p.humanMinutesAssumed,0),mach=parts.reduce((a,p)=>a+p.machineSeconds,0)/60;const mm=human+mach;
    const waitH=parts.reduce((a,p)=>a+(p.baselineWaitHours||0),0);const srisha=parts.filter(p=>p.source==='SRISHA');const sb=srisha.reduce((a,p)=>a+p.baselineMinutes,0),sm=e2.mopsIntakeMinutes+srisha.reduce((a,p)=>a+p.humanMinutesAssumed+p.machineSeconds/60,0);
    endToEnd={label:e2.label,tasks:e2.tasks,baselineTouchMinutes:base,mopsTouchMinutes:+mm.toFixed(2),touchSpeedup:Math.floor(base/mm*10)/10,meets20x:base/mm>=20,intakeMinutesAssumed:e2.mopsIntakeMinutes,humanMinutes:+human.toFixed(2),machineMinutes:+mach.toFixed(3),
      elapsed:{baselineHours:+(waitH+base/60).toFixed(1),mopsMinutes:+mm.toFixed(2),speedup:Math.round((waitH*60+base)/mm),note:'baseline includes the assumed 72h agency wait for the post-event report'},
      srishaOnly:{tasks:srisha.map(p=>p.task),baselineMinutes:sb,mopsMinutes:+sm.toFixed(2),speedup:+(sb/sm).toFixed(1),note:"only the tasks Srisha estimated (no assumptions on the baseline side)"}}}
  const head=tasks.filter(t=>t.measured&&t.headline);return{runs:runs.length,tasks,endToEnd,under20x:head.filter(t=>!t.meets20x).map(t=>`${t.label}: ${t.speedup}x`),repeatEntry:require('./fields').repeatEntry(),
    note:"Baselines: SRISHA = Srisha's estimate; ASSUMPTION = labelled assumption; PLACEHOLDER = unverified, excluded from headline. Machine time is MEASURED (latest intake, mapping and campaign runs). Human time with @mops is ASSUMED per task (see humanNote)."}}
module.exports={setLastMap,webex,injectFailure,incidents,startLoad,getLoad:()=>load,loadLimits,efficiency,cleanBody};
