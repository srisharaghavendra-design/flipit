// @mops agents: every function reads/writes ONE data layer (db) and returns an artifact saved to the thread.
const {brandName,brandCompany}=require('./brand');
const fmt=n=>'$'+Math.round(n).toLocaleString('en-US');
const uid=(p,arr)=>p+'-'+(arr.length+1).toString().padStart(3,'0');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
module.exports=(db,ctx)=>{
const acc=id=>db.accounts.find(a=>a.id===id), camp=id=>db.campaigns.find(c=>c.id===id);
const campOf=t=>t&&t.type==='campaign'?camp(t.refId):null;
const now=()=>new Date().toISOString();
const A={
// ---------- EMAIL AGENT (replaces Eloqua) ----------
build_segment({thread,query}){const q=(query||'').toLowerCase();const f={};
 const tmap={cio:'CIO',cto:'CTO',ciso:'CISO','it director':'IT Director','network manager':'Network Manager','vp infra':'VP Infrastructure','head of security':'Head of Security'};
 f.titles=Object.keys(tmap).filter(k=>new RegExp('\\b'+k+'s?\\b').test(q)).map(k=>tmap[k]);
 f.regions=['India','ANZ','ASEAN','Japan'].filter(r=>q.includes(r.toLowerCase()));
 f.segment=/enterprise/.test(q)?'Enterprise':/commercial/.test(q)?'Commercial':null;
 f.industry=['Financial Services','Healthcare','Telecom','Retail','Transport','Energy','Manufacturing'].find(i=>q.includes(i.toLowerCase().split(' ')[0]))||null;
 f.optedInOnly=/opt(ed)?[- ]?in|consent/.test(q);
 const c=campOf(thread);if(!f.regions.length&&c&&!/all regions/.test(q))f.regions=[c.region]; // reuse known context
 const match=db.contacts.filter(x=>{const a=acc(x.accountId);return(!f.titles.length||f.titles.includes(x.title))&&(!f.regions.length||f.regions.includes(a.region))&&(!f.segment||a.segment===f.segment)&&(!f.industry||a.industry===f.industry)&&(!f.optedInOnly||x.consent==='opted_in');});
 const seg={id:uid('SEG',db.segments),name:query,filters:f,contactIds:match.map(x=>x.id),threadId:thread.id,at:now()};db.segments.push(seg);
 const sup=match.filter(x=>x.consent!=='opted_in').length;
 return{kind:'Segment',title:`${seg.id}: ${match.length} contacts`,body:`Filters: titles=${f.titles.join('/')||'any'} · regions=${f.regions.join('/')||'any'} · segment=${f.segment||'any'}${f.industry?' · industry='+f.industry:''} · opted-in only=${f.optedInOnly}\n${sup} would be suppressed at send (no consent).`,
  table:{cols:['Name','Title','Account','Region','Consent'],rows:match.slice(0,8).map(x=>[x.first+' '+x.last,x.title,acc(x.accountId).name,acc(x.accountId).region,x.consent])},cites:match.slice(0,12).map(x=>x.id),data:{segmentId:seg.id,count:match.length}};},
draft_email({thread,segment_id,topic}){const seg=db.segments.find(s=>s.id===segment_id)||[...db.segments].reverse().find(s=>s.threadId===thread.id);if(!seg)return{error:'No segment yet – build one first.'};
 const c=campOf(thread);const tp=topic||(c?c.name:brandName()+' secure networking');
 const em={id:uid('EM',db.emails),segmentId:seg.id,campaignId:c?.id||null,code:c?.code||null,subject:`{{first}}, a 30-minute look at ${tp}`,
  body:`Hi {{first}},\n\nTeams like {{account}} are rethinking how they secure hybrid work without adding tools. We're hosting a short, practical session on ${tp} – real architectures from ${c?c.region:'APAC'} peers, no slideware.\n\nWould you like a seat?\n\nBest,\nSrisha R.\nField Marketing, ${brandCompany()}`,threadId:thread.id,status:'draft',at:now()};
 db.emails.push(em);return{kind:'Email draft',title:`${em.id} → ${seg.id} (${seg.contactIds.length} contacts)`,body:`Subject: ${em.subject}\n\n${em.body}`,data:{emailId:em.id},actions:[{label:'Send now',say:`@mops send ${em.id}`}]};},
send_email({thread,email_id}){const em=db.emails.find(e=>e.id===email_id)||[...db.emails].reverse().find(e=>e.threadId===thread.id&&e.status==='draft');if(!em)return{error:'No draft email to send.'};
 const seg=db.segments.find(s=>s.id===em.segmentId);let sent=0,sup=[];
 for(const cid of seg.contactIds){const x=db.contacts.find(c=>c.id===cid);if(x.consent!=='opted_in'){sup.push(x.email+' ('+x.consent+')');continue;}
  const a=acc(x.accountId);const msg={id:'M'+(db.outbox.length+1),emailId:em.id,contactId:x.id,to:x.email,subject:em.subject.replace('{{first}}',x.first),body:em.body.replace('{{first}}',x.first).replace('{{account}}',a.name),code:em.code,at:now(),opened:false,clicked:false,transport:ctx.sender.name};
  // mock engagement (deterministic) – real tracking endpoints /t/o/:id and /t/c/:id also update these
  const h=[...x.id+em.id].reduce((s,c)=>s*31+c.charCodeAt(0)>>>0,7)%100;msg.opened=h<44;msg.clicked=h<13;
  db.outbox.push(msg);ctx.sender.send(msg);sent++;}
 em.status='sent';em.sent=sent;em.suppressed=sup.length;
 const opens=db.outbox.filter(m=>m.emailId===em.id&&m.opened).length,clicks=db.outbox.filter(m=>m.emailId===em.id&&m.clicked).length;
 return{kind:'Email sent',title:`${em.id}: ${sent} sent · ${sup.length} suppressed (consent)`,body:`Transport: ${ctx.sender.name}. Tracking code: ${em.code||'none'}.\nOpens ${opens} (${sent?Math.round(opens/sent*100):0}%) · Clicks ${clicks} (${sent?Math.round(clicks/sent*100):0}%)\nSuppressed: ${sup.slice(0,5).join(', ')}${sup.length>5?' …':''}`,data:{sent,suppressed:sup.length,opens,clicks},link:{href:'/#outbox',label:'Open outbox'}};},
schedule_nurture({thread,email_id,steps}){const em=db.emails.find(e=>e.id===email_id)||[...db.emails].reverse().find(e=>e.threadId===thread.id);if(!em)return{error:'Draft or send an email first.'};
 const days=steps||[3,7,14];const DAY=ctx.dayMs;const t0=Date.now();
 const seq={id:uid('NUR',db.sequences),emailId:em.id,segmentId:em.segmentId,threadId:thread.id,steps:days.map((d,i)=>({n:i+1,day:d,dueAt:new Date(t0+d*DAY).toISOString(),subject:['Following up: the session recap','Peer story: how a bank cut tool sprawl','Last call – 1:1 architecture review'][i]||'Check-in',rule:i===0?'all non-openers':'non-clickers',status:'scheduled'}))};
 db.sequences.push(seq);return{kind:'Nurture scheduled',title:`${seq.id}: ${days.length} steps`,table:{cols:['Step','Day','Audience','Subject','Due'],rows:seq.steps.map(s=>[s.n,'+'+s.day,s.rule,s.subject,s.dueAt.slice(0,16).replace('T',' ')])},data:{sequenceId:seq.id}};},
// ---------- INSIGHT AGENT (replaces Power BI / Tableau) ----------
query_insight({thread,question}){const q=(question||'').toLowerCase();
 const geo=/americas|united states|\bus\b/.test(q)?'Americas':/emea|europe/.test(q)?'EMEA':/\bapj\b|apac|asia/.test(q)?'APJ':null;
 const program=/lead ?gen/.test(q)?'Lead gen':/\babm\b/.test(q)?'ABM':/digital/.test(q)?'Digital':/partner/.test(q)?'Partner':/event/.test(q)?'Events':null;
 if(/behind pace|behind\b/.test(q)){let rows=db.campaigns.filter(c=>c.pace==='behind'&&(!geo||c.geo===geo));if(!rows.length&&geo)rows=db.campaigns.filter(c=>c.pace==='behind'&&c.geo===geo);
  const title=`${geo||'Campaigns'} behind pace: ${rows.length}`;
  return{kind:'Insight',title,body:rows.length?rows.map(c=>`${c.name} (${c.geo} ${c.program||c.channel}): spent ${fmt(c.spend)} of ${fmt(c.budget)}, pipeline ${fmt(c.pipeline||0)} vs goal ${fmt(c.goal||0)}. Next: ${c.nextAction||'review'}`).join('\n'):'Nothing is behind pace in that slice.',table:{cols:['Campaign','Region','Program','Stage','Next'],rows:rows.map(c=>[c.name,c.geo,c.program||c.channel,c.stage,c.nextAction||''])},data:{geo,behind:rows.length}};}
 if(/how is|doing/.test(q)&&(geo||program)){const rows=db.campaigns.filter(c=>(!geo||c.geo===geo)&&(!program||(c.program||c.channel)===program)&&(!/quarter|q2|fy27/.test(q)||(c.quarter||'FY27Q2')==='FY27Q2'||true));
  const budget=rows.reduce((s,c)=>s+c.budget,0),spend=rows.reduce((s,c)=>s+c.spend,0),pipeline=rows.reduce((s,c)=>s+(c.pipeline||0),0),goal=rows.reduce((s,c)=>s+(c.goal||0),0),mqls=rows.reduce((s,c)=>s+(c.mqls||0),0);
  return{kind:'Insight',title:`${geo||'All regions'} ${program||'programs'} this quarter`,body:`${rows.length} campaigns. Budget ${fmt(budget)}, spend ${fmt(spend)} (${budget?Math.round(spend/budget*100):0}%). Pipeline ${fmt(pipeline)} vs goal ${fmt(goal)}. ${mqls} MQLs.`,chart:{type:'bar',labels:rows.map(c=>c.name).slice(0,8),datasets:[{label:'Pipeline $',data:rows.map(c=>c.pipeline||0).slice(0,8)}]},data:{geo,program,budget,spend,pipeline,goal,mqls,campaigns:rows.length}};}
 const by=/region/.test(q)?'region':/account/.test(q)?'account':/campaign/.test(q)?'campaign':/email|open|click/.test(q)?'email':/stage|funnel/.test(q)?'stage':'channel';
 let rows={},cites=[];
 if(by==='email'){for(const e of db.emails.filter(e=>e.status==='sent')){const m=db.outbox.filter(o=>o.emailId===e.id);rows[e.id]={sent:m.length,opens:m.filter(o=>o.opened).length,clicks:m.filter(o=>o.clicked).length};cites.push(e.id);}
  if(!cites.length)return{kind:'Insight',title:'No emails sent yet',body:'Send an email first, then ask again.'};
  return{kind:'Insight',title:'Email engagement',chart:{type:'bar',labels:Object.keys(rows),datasets:[{label:'Sent',data:Object.values(rows).map(v=>v.sent)},{label:'Opens',data:Object.values(rows).map(v=>v.opens)},{label:'Clicks',data:Object.values(rows).map(v=>v.clicks)}]},cites,body:'Computed from outbox records.'};}
 const L=db.leads.filter(l=>!/india/.test(q)||acc(l.accountId).region==='India');
 for(const l of L){const c=camp(l.campaignId),a=acc(l.accountId);const k=by==='region'?a.region:by==='account'?a.name:by==='campaign'?c.name:by==='stage'?l.stage:c.channel;rows[k]=rows[k]||{pipeline:0,leads:0,ids:[]};rows[k].pipeline+=l.pipeline;rows[k].leads++;rows[k].ids.push(l.id);}
 let ent=Object.entries(rows).sort((a,b)=>b[1].pipeline-a[1].pipeline);if(by==='account')ent=ent.slice(0,10);
 const total=ent.reduce((s,e)=>s+e[1].pipeline,0);
 let roi='';if(by==='channel'||by==='campaign'){const sp={};for(const c of db.campaigns){const k=by==='channel'?c.channel:c.name;sp[k]=(sp[k]||0)+c.spend;}roi='\nPipeline per $ spent: '+ent.map(([k,v])=>`${k} ${(v.pipeline/(sp[k]||1)).toFixed(1)}x`).join(' · ');}
 return{kind:'Insight',title:`Pipeline by ${by}${/india/.test(q)?' (India)':''}: ${fmt(total)} across ${ent.reduce((s,e)=>s+e[1].leads,0)} leads`,
  body:`Top: ${ent[0][0]} ${fmt(ent[0][1].pipeline)} (${Math.round(ent[0][1].pipeline/total*100)}%).${roi}`,
  chart:{type:by==='stage'?'doughnut':'bar',labels:ent.map(e=>e[0]),datasets:[{label:'Pipeline $',data:ent.map(e=>e[1].pipeline)},...(by==='stage'?[]:[{label:'Leads',data:ent.map(e=>e[1].leads),yAxisID:'y1',type:'line'}])]},
  cites:ent.flatMap(e=>e[1].ids.slice(0,2)).slice(0,14),data:{by,total}};},
// ---------- OPS AGENT ----------
create_campaign_code({thread}){const c=campOf(thread);if(!c)return{error:'Campaign codes live on campaign threads.'};if(c.code)return{kind:'Campaign code',title:c.code,body:'Already exists – reused, not re-created.'};
 c.code=`FY27Q2-${c.region.toUpperCase().slice(0,3)}-${c.channel.slice(0,3).toUpperCase()}-${1000+db.crmSync.length*7+Number(c.id.slice(1))*91}`;
 const sync={system:'CRM (mock)',object:'Campaign',externalId:c.code,campaignId:c.id,at:now(),status:'synced'};db.crmSync.push(sync);
 return{kind:'Campaign code',title:c.code,body:`Written to data layer and synced to mock CRM (Campaign object). Budget ${fmt(c.budget)}, owner ${c.owner}.`,data:sync};},
budget_request({thread,amount,justification}){const c=campOf(thread);amount=Number(amount)||Math.round((c?c.budget:50000)*0.5);
 const pipe=c?db.leads.filter(l=>l.campaignId===c.id).reduce((s,l)=>s+l.pipeline,0):0;
 const needs=amount>db.limits.approvalUSD;const b={id:uid('BR',db.budgets),campaignId:c?.id,threadId:thread.id,amount,justification:justification||(pipe?`Current pipeline ${fmt(pipe)} on ${fmt(c.spend)} spend (${(pipe/c.spend).toFixed(1)}x). Extend the play.`:'Projected 5x pipeline based on similar plays.'),status:needs?'pending_approval':'auto_approved',route:needs?'VP Marketing (over $150K)':'Finance – within limit',at:now()};
 db.budgets.push(b);if(!needs&&c)c.budget+=amount;
 return{kind:'Budget request',title:`${b.id}: ${fmt(amount)} – ${needs?'needs approval':'auto-approved'}`,body:`Campaign: ${c?c.name:'-'}\nJustification: ${b.justification}\nRouting: ${b.route}`,data:{budgetId:b.id,status:b.status},actions:needs?[{label:'Approve',api:`/api/budget/${b.id}/approve`},{label:'Reject',api:`/api/budget/${b.id}/reject`}]:[]};},
decide_budget({budget_id,decision,approver}){const b=db.budgets.find(x=>x.id===budget_id);if(!b)return{error:'Unknown budget'};if(b.status!=='pending_approval')return{error:`${b.id} already ${b.status}`};
 b.status=decision==='approve'?'approved':'rejected';b.decidedAt=now();b.approver=approver||null;if(b.status==='approved'){const c=camp(b.campaignId);if(c)c.budget+=b.amount;}
 return{kind:'Budget decision',title:`${b.id} ${b.status}`,body:`${fmt(b.amount)} ${b.status} by ${approver||'Srisha R.'}`};},
generate_sow({thread,vendor,scope,amount}){const c=campOf(thread);const s={id:uid('SOW',db.sows),campaignId:c?.id,threadId:thread.id,vendor:vendor||'Lotus Events Pvt Ltd',scope:scope||`Plan, produce and report on "${c?c.name:'the activity'}": venue, AV, catering, attendee management and post-event report.`,amount:Number(amount)||Math.round((c?c.budget:40000)*0.35),code:c?.code||'TBD',at:now()};
 db.sows.push(s);return{kind:'SOW',title:`${s.id}: ${s.vendor} – ${fmt(s.amount)}`,body:`Campaign code ${s.code} · Payment 50/50 · Acceptance: field marketing sign-off.`,link:{href:`/sow/${s.id}.doc`,label:'Download SOW (.doc)'},link2:{href:`/sow/${s.id}.html`,label:'View HTML'}};},
clean_upload({thread,csv}){if(!csv)return{error:'Attach a CSV.'};const rows=csv.trim().split(/\r?\n/).map(r=>r.split(',').map(x=>x.trim().replace(/^"|"$/g,'')));const h=rows.shift().map(x=>x.toLowerCase());
 const col=n=>h.findIndex(x=>n.some(k=>x.includes(k)));const ei=col(['mail']),ni=col(['name']),ci=col(['company','org','account']),ti=col(['title','role']);
 const seen=new Set(),clean=[],ex=[];const c=campOf(thread);let created=0,matched=0;
 for(const r of rows){const e=(r[ei]||'').toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)){ex.push(['invalid email',r.join(' | ')]);continue;}
  if(seen.has(e)){ex.push(['duplicate in file',e]);continue;}seen.add(e);
  const dom=e.split('@')[1];const comp=(r[ci]||'').toLowerCase();const a=db.accounts.find(a=>a.domain===dom)||db.accounts.find(a=>comp&&a.name.toLowerCase()===comp);
  if(!a){ex.push(['no account match',e+' / '+(r[ci]||'?')]);continue;}
  const name=(r[ni]||e.split('@')[0]).replace(/[._]/g,' ').replace(/\b\w/g,x=>x.toUpperCase());let ct=db.contacts.find(x=>x.email===e);
  if(ct)matched++;else{ct={id:'C'+(1001+db.contacts.length),first:name.split(' ')[0],last:name.split(' ').slice(1).join(' '),email:e,title:r[ti]||'Unknown',accountId:a.id,consent:'unknown',consentDate:null};db.contacts.push(ct);created++;}
  if(c&&!db.leads.find(l=>l.contactId===ct.id&&l.campaignId===c.id))db.leads.push({id:'L'+(5001+db.leads.length),contactId:ct.id,accountId:a.id,campaignId:c.id,stage:'MQL',pipeline:0,created:now().slice(0,10)});
  clean.push([name,e,a.name,ct.id]);}
 db.uploads.push({threadId:thread.id,at:now(),rows:rows.length,clean:clean.length,exceptions:ex.length});
 return{kind:'Lead upload',title:`${clean.length} loaded · ${ex.length} exceptions`,body:`${matched} matched existing contacts, ${created} new contacts created${c?`, leads attached to ${c.name}`:''}.`,table:{cols:['Name','Email','Matched account','Contact'],rows:clean.slice(0,8)},table2:{cols:['Exception','Row'],rows:ex}};},
mdf_status({thread}){const c=campOf(thread);const m=db.mdf.filter(x=>!c||x.campaignId===c.id);if(!m.length)return{kind:'MDF',title:'No MDF claims on this thread'};
 return{kind:'MDF',title:`${m.length} MDF claim(s)`,table:{cols:['Claim','Partner','Amount','Status','Due'],rows:m.map(x=>[x.id,x.partner,fmt(x.amount),x.status,x.due])}};},
// ---------- SYNC DOCTOR (step 6: Eloqua⇄SFDC sync failures) ----------
diagnose_sync({thread,fix}){const c=campOf(thread);const all=db.syncLog.filter(x=>!c||x.campaignId===c.id);const F=all.filter(x=>x.status==='failed');
 const why={DUPLICATE_VALUE:['Same person already exists in CRM','Merge into the existing CRM record, then re-sync'],REQUIRED_FIELD_MISSING:['Company field blank','Fill Company from the matched account (email domain)'],FIELD_CUSTOM_VALIDATION_EXCEPTION:['Campaign code missing in CRM','Create/sync the campaign code first, then re-sync'],UNABLE_TO_LOCK_ROW:['CRM record was busy (temporary lock)','Simple retry'],INVALID_EMAIL_ADDRESS:['Email is malformed','Cannot auto-fix: sent to a human for correction']};
 const H=all.filter(x=>x.status==='needs_human');if(!F.length)return{kind:'Sync doctor',title:H.length?`${all.length-H.length} of ${all.length} leads in CRM · ${H.length} waiting on a human (bad email)`:`All ${all.length} leads reached CRM`,body:H.length?'No silent failures. Remaining items need a corrected email address.':'No failed syncs on this thread.',table2:H.length?{cols:['Lead','Email on file'],rows:H.map(x=>[x.leadId,x.badEmail])}:undefined,data:{failed:0,human:H.length,total:all.length}};
 const groups={};for(const x of F)(groups[x.code]=groups[x.code]||[]).push(x);
 if(!fix){return{kind:'Sync doctor',title:`${F.length} of ${all.length} leads did not reach CRM – ${Object.keys(groups).length} causes`,
  body:'Each failed 20 times in a row, so the sync stopped retrying (Eloqua-style behaviour). Nobody was alerted.',
  table:{cols:['Cause','Leads','Plain-English reason','What @mops will do'],rows:Object.entries(groups).map(([k,v])=>[k,v.length,why[k][0],why[k][1]])},cites:F.slice(0,12).map(x=>x.leadId),data:{failed:F.length,total:all.length},actions:[{label:'Fix & retry',say:'@mops fix and retry the failed syncs'}]};}
 let fixed=0;const human=[];const rows=[];
 for(const x of F){const ct=db.contacts.find(q=>q.id===x.contactId);let note;
  if(x.code==='INVALID_EMAIL_ADDRESS'){human.push([x.leadId,x.badEmail||ct?.email]);x.status='needs_human';continue;}
  if(x.code==='DUPLICATE_VALUE')note='merged with existing CRM lead';
  else if(x.code==='REQUIRED_FIELD_MISSING')note='Company = '+(acc(ct.accountId)?.name||'?');
  else if(x.code==='FIELD_CUSTOM_VALIDATION_EXCEPTION'){const k=camp(x.campaignId);if(k&&!k.code){A.create_campaign_code({thread:{type:'campaign',refId:k.id}});}note='campaign code '+(k?.code||'')+' confirmed in CRM';}
  else note='retried after lock cleared';
  x.status='synced';x.fixedAt=now();x.fix=note;x.attempts++;fixed++;rows.push([x.leadId,x.code,note]);
  db.crmSync.push({system:'CRM (mock)',object:'Lead',externalId:x.leadId,at:now(),status:'synced',via:'sync doctor'});}
 return{kind:'Sync doctor',title:`${fixed} fixed & re-synced · ${human.length} need a human`,body:`Every fix is logged on the lead (audit trail).${human.length?' Malformed emails were not guessed – please correct them.':''}`,table:{cols:['Lead','Cause','Fix applied'],rows:rows.slice(0,10)},table2:{cols:['Needs human','Email on file'],rows:human},data:{fixed,human:human.length}};},
// ---------- SCORING AGENT (step 7: replaces Eloqua lead scoring program) ----------
lead_score({thread,account}){const q=(account||'').toLowerCase().replace(/[?.!]/g,'').trim();
 let a=q?db.accounts.find(x=>x.name.toLowerCase()===q)||db.accounts.find(x=>x.name.toLowerCase().split(' ').some(w=>w.length>2&&q.split(' ').includes(w))):null;
 if(!a&&thread?.type==='account')a=acc(thread.refId);if(!a)return{error:`I couldn't find an account called "${account||'?'}".`};
 const W={email_open:1,email_click:3,web_visit:2,content_download:5,webinar_attend:10,event_attend:15,form_fill:8};
 const FIT={CIO:20,CTO:20,CISO:18,'VP Infrastructure':15,'IT Director':12,'Head of Security':12,'Network Manager':8,'Procurement Manager':5};
 const ref=new Date('2026-10-18');const res=db.contacts.filter(x=>x.accountId===a.id).map(x=>{const acts=db.activities.filter(v=>v.contactId===x.id);
  const web=(db.adobeWeb||[]).filter(w=>w.contactId===x.id);let eng=0;for(const w of web){const days=(ref-new Date(w.at))/864e5;eng+=(w.page==='/pricing'||w.page==='/contact-sales'?4:2)*Math.pow(0.5,Math.max(0,days)/30);}for(const v of acts){const days=(ref-new Date(v.at))/864e5;eng+=W[v.type]*Math.pow(0.5,Math.max(0,days)/30);}// 30-day half-life
  const fit=FIT[x.title]||5;let score=Math.min(100,Math.round(fit+eng*2.2));const grade=score>=55?'Hot':score>=25?'Warm':'Cold';
  const six=(db.intent6s||[]).find(i=>i.accountId===a.id);const boost=six&&/Decision|Purchase/.test(six.buyingStage)?1.15:1;score=Math.min(100,Math.round(score*boost));const grade2=score>=55?'Hot':score>=25?'Warm':'Cold';const top=[...acts].sort((p,q)=>W[q.type]-W[p.type]).slice(0,2).map(v=>v.type.replace('_',' ')+' '+v.at.slice(5,10));const pw=web.filter(w=>/pricing|contact/.test(w.page)).length;return{x,score,grade:grade2,why:[...top,pw?`${pw}× pricing/contact page (Adobe)`:web.length?`${web.length} web visits (Adobe)`:''].filter(Boolean).join(', ')||'no activity',n:acts.length};}).sort((p,q)=>q.score-p.score);
 for(const r of res){db.crm.leadScores=db.crm.leadScores.filter(s=>s.contactId!==r.x.id);db.crm.leadScores.push({contactId:r.x.id,score:r.score,grade:r.grade,at:now()});}
 db.crmSync.push({system:'CRM (mock)',object:'Contact.Score',externalId:a.id,at:now(),status:'synced',count:res.length});
 const hot=res.filter(r=>r.grade==='Hot');
 return{kind:'Lead score',title:`${a.name}: ${hot.length} hot · ${res.filter(r=>r.grade==='Warm').length} warm · ${res.filter(r=>r.grade==='Cold').length} cold`,
  body:`Score = role fit + recent engagement (events 15, webinars 10, forms 8, downloads 5, clicks 3, visits 2, opens 1; halves every 30 days). 6sense (mock): ${(db.intent6s||[]).find(i=>i.accountId===a.id)?.buyingStage||'n/a'} stage, intent ${(db.intent6s||[]).find(i=>i.accountId===a.id)?.intentScore??a.intent}/100 on ${((db.intent6s||[]).find(i=>i.accountId===a.id)?.keywords||[]).join(', ')} (Decision/Purchase stage boosts scores 15%). Adobe web visits included (pricing/contact pages weigh double). Scores written to the mock CRM.${res.some(r=>r.x.consent!=='opted_in')?' Note: contacts without consent can be called by sellers but not emailed.':''}`,
  table:{cols:['Contact','Title','Score','Grade','Why','Consent'],rows:res.slice(0,8).map(r=>[r.x.first+' '+r.x.last,r.x.title,r.score,r.grade,r.why,r.x.consent])},cites:res.slice(0,8).map(r=>r.x.id),data:{accountId:a.id,stage:(db.intent6s||[]).find(i=>i.accountId===a.id)?.buyingStage,hot:hot.length,top:res[0]&&{id:res[0].x.id,score:res[0].score}}};},
// ---------- ATTRIBUTION AGENT (step 8: campaign influence on opportunities) ----------
credit_campaign({thread,opp_id,campaign}){let o=db.opps.find(x=>x.id===(opp_id||'').toUpperCase());if(!o&&thread?.type==='account')o=db.opps.find(x=>x.accountId===thread.refId);
 if(!o)return{error:'Which opportunity? Mention an OPP-xxxx or ask on the account thread.'};
 const cq=(campaign||'').toLowerCase();const k=db.campaigns.find(x=>cq&&x.name.toLowerCase().includes(cq))||db.campaigns.find(x=>cq&&cq.split(' ').some(w=>w.length>3&&x.name.toLowerCase().includes(w)));
 if(!k)return{error:`No campaign matching "${campaign||'?'}".`};
 const acts=db.activities.filter(v=>o.contactRoles.includes(v.contactId)&&v.campaignId).sort((p,q)=>p.at.localeCompare(q.at));
 const ev=acts.filter(v=>v.campaignId===k.id);const nm=id=>{const c=db.contacts.find(x=>x.id===id);return c.first+' '+c.last;};
 if(!ev.length){return{kind:'Attribution',title:`Not credited: no one on ${o.id} engaged with ${k.name}`,body:'I only credit campaigns with evidence (a contact on the opportunity touched the campaign). Flagged for your review instead of guessing.',data:{credited:false}};}
 const touched=[...new Set(acts.map(v=>v.campaignId))];const even=1/touched.length;
 const first=camp(acts[0].campaignId),last=camp(acts[acts.length-1].campaignId);
 o.influence=touched.map(id=>({campaignId:id,pct:Math.round(even*1000)/10,model:'even-split',by:'@mops',at:now()}));
 db.crmSync.push({system:'CRM (mock)',object:'CampaignInfluence',externalId:o.id,campaignId:k.id,at:now(),status:'synced'});
 const share=Math.round(o.amount*even);
 return{kind:'Attribution',title:`${k.name} credited on ${o.id}: ${fmt(share)} of ${fmt(o.amount)} (${Math.round(even*100)}%)`,
  body:`Evidence: ${ev.map(v=>nm(v.contactId)+' – '+v.type.replace('_',' ')+' '+v.at).join('; ')}.\nModel: even split across ${touched.length} campaigns that contacts on this opp engaged with. First touch: ${first.name}. Last touch: ${last.name}. Written to mock CRM Campaign Influence (no more manual records).`,
  table:{cols:['Campaign','Touches','Even-split credit','Influenced $'],rows:touched.map(id=>[camp(id).name,acts.filter(v=>v.campaignId===id).length,Math.round(even*100)+'%',fmt(share)])},cites:ev.map(v=>v.id),data:{credited:true,oppId:o.id,campaignId:k.id,share}};},
// ---------- SELLER AGENT (step 10: replaces reverse-ETL target lists) ----------
push_target_list({thread,top}){const c=campOf(thread);const reg=c?c.region:thread?.type==='account'?acc(thread.refId).region:null;const n=Number(top)||10;
 const ref=new Date('2026-10-18');const engOf=aid=>db.activities.filter(v=>{const x=db.contacts.find(q=>q.id===v.contactId);return x&&x.accountId===aid&&(ref-new Date(v.at))/864e5<=60;}).length;
 const list=db.accounts.filter(a=>!reg||a.region===reg).map(a=>({a,engaged:engOf(a.id),score:Math.round(((db.intent6s||[]).find(i=>i.accountId===a.id)?.intentScore??a.intent)*0.6+Math.min(40,engOf(a.id)*5))})).sort((p,q)=>q.score-p.score).slice(0,n);
 let created=0,skipped=0;const bySeller={};
 for(const t of list){const s=db.sellers.find(x=>x.region===t.a.region);const key=t.a.id+'|'+(c?.id||'');if(db.crm.tasks.find(x=>x.key===key)){skipped++;continue;}
  db.crm.tasks.push({id:'TSK-'+String(db.crm.tasks.length+1).padStart(3,'0'),key,accountId:t.a.id,owner:s.name,subject:`Target account: ${t.a.name}${c?' – '+c.name:''}`,score:t.score,at:now()});
  if(c)db.crm.campaignMembers.push({campaignId:c.id,accountId:t.a.id,at:now()});created++;(bySeller[s.name]=bySeller[s.name]||[]).push(t.a.name);}
 for(const [sn,accs] of Object.entries(bySeller)){const s=db.sellers.find(x=>x.name===sn);db.notifications.push({to:s.email,channel:'Webex (mock)',text:`@mops: ${accs.length} target accounts assigned to you${c?' for '+c.name:''}: ${accs.join(', ')}. Tasks are in CRM.`,at:now()});}
 db.crmSync.push({system:'CRM (mock)',object:'Task',externalId:c?.id||reg||'all',at:now(),status:'synced',count:created});
 return{kind:'Target list',title:`${created} target accounts pushed to sellers${skipped?` · ${skipped} already assigned (skipped)`:''}`,
  body:`Ranked by 6sense intent (60%, mock) + contact engagement in the last 60 days. Written as CRM tasks${c?' and campaign members':''}; ${Object.keys(bySeller).length} seller(s) notified on Webex (mock): ${Object.keys(bySeller).join(', ')||'none'}.`,
  table:{cols:['Account','Region','Intent','Engaged (60d)','Score','Seller'],rows:list.map(t=>[t.a.name,t.a.region,t.a.intent,t.engaged,t.score,db.sellers.find(x=>x.region===t.a.region).name])},cites:list.map(t=>t.a.id),data:{created,skipped,notified:Object.keys(bySeller).length}};},
// ---------- AUTOPILOT (live campaign state + recommendations + agentic ops) ----------
autopilot_tick({thread}){const c=campOf(thread);if(!c)return null;db.followups=db.followups||[];db.shifts=db.shifts||[];
 const L=db.leads.filter(l=>l.campaignId===c.id);const sl=db.syncLog.filter(x=>x.campaignId===c.id);
 const sent=db.emails.some(e=>e.campaignId===c.id&&e.status==='sent')||db.activities.some(v=>v.campaignId===c.id&&/email/.test(v.type));
 const opps=db.opps.filter(o=>o.contactRoles.some(cid=>db.activities.some(v=>v.contactId===cid&&v.campaignId===c.id)));
 const ST=['Budget','Setup','Invite','Engagement','Leads','SFDC sync','Opps','Attribution','Report'];
 const auto=[],recs=[];
 // agentic ops – low risk, executed by default
 if(!c.code){const r=A.create_campaign_code({thread});auto.push('Created campaign code '+r.title+' and synced to CRM');}
 const F=sl.filter(x=>x.status==='failed');if(F.length){const r=A.diagnose_sync({thread,fix:true});auto.push(`Sync doctor: ${r.title}`);}
 for(const o of opps)if(!o.influence.some(x=>x.campaignId===c.id)){const r=A.credit_campaign({thread:{type:'account',refId:o.accountId},opp_id:o.id,campaign:c.name});if(r.data?.credited)auto.push(`Attribution: ${c.name} credited on ${o.id} (evidence-based)`);}
 // recommendation engine
 const ref=new Date('2026-10-18');const hot=[...new Set(db.activities.filter(v=>v.campaignId===c.id&&/event_attend|webinar_attend|form_fill|content_download/.test(v.type)&&(ref-new Date(v.at))/864e5<=45).map(v=>v.contactId))]
  .map(id=>db.contacts.find(x=>x.id===id)).filter(x=>x&&!db.followups.some(f=>f.items.some(it=>it.contactId===x.id))).slice(0,3);
 if(hot.length&&!db.followups.some(f=>f.campaignId===c.id&&f.status==='pending')){const f={id:'FU-'+String(db.followups.length+1).padStart(3,'0'),campaignId:c.id,threadId:thread.id,status:'pending',items:hot.map(x=>{const a=acc(x.accountId);const s=db.sellers.find(q=>q.region===a.region);return{contactId:x.id,seller:s.name,text:`${s.name.split(' ')[0]}, ${x.first} ${x.last} (${x.title}, ${a.name}) engaged with ${c.name} recently. Suggest a call this week – talking point: ${c.channel==='Events'?'what they heard at the roundtable':'their interest in '+c.name}.`};}),at:now()};db.followups.push(f);
  recs.push({kind:'Recommendation',title:`${hot.length} hot contacts – seller follow-ups drafted (${f.id})`,table:{cols:['Contact','Seller','Draft note'],rows:f.items.map(it=>{const x=db.contacts.find(q=>q.id===it.contactId);return[x.first+' '+x.last,it.seller,it.text];})},actions:[{label:'Approve follow-ups',say:`@mops approve ${f.id}`}],data:{followupId:f.id}});}
 const roi=k=>db.leads.filter(l=>l.campaignId===k.id).reduce((s2,l)=>s2+l.pipeline,0)/(k.spend||1);const peers=db.campaigns.filter(k=>k.region===c.region&&k.id!==c.id&&k.spend);
 const best=peers.sort((p,q)=>roi(q)-roi(p))[0];const left=c.budget-c.spend;
 if(best&&roi(c)<roi(best)*0.5&&left>10000&&!db.shifts.some(x=>x.from===c.id&&x.status==='pending')){const amt=Math.round(left*0.2/1000)*1000;const sh={id:'SH-'+String(db.shifts.length+1).padStart(3,'0'),from:c.id,to:best.id,amount:amt,status:'pending',at:now()};db.shifts.push(sh);
  recs.push({kind:'Recommendation',title:`Shift ${fmt(amt)} to ${best.name} (${sh.id})`,body:`Pipeline per $: this campaign ${roi(c).toFixed(1)}x vs ${best.name} ${roi(best).toFixed(1)}x (same region). Moving 20% of unspent budget. Money moves always need your approval.`,actions:[{label:'Approve shift',say:`@mops approve ${sh.id}`}],data:{shiftId:sh.id}});}
 db.abmRecs=db.abmRecs||[];const surge=(db.intent6s||[]).filter(i=>{const a=acc(i.accountId);return a.region===c.region&&/Decision|Purchase/.test(i.buyingStage)&&i.intentScore>=70&&!db.abmRecs.includes(i.accountId)&&!L.some(l=>l.accountId===i.accountId);}).slice(0,3);
 if(surge.length){surge.forEach(i=>db.abmRecs.push(i.accountId));recs.push({kind:'Recommendation',title:`${surge.length} in-market accounts not in this campaign – add them`,body:'6sense (mock) shows these in Decision/Purchase stage with high intent; Adobe shows recent web visits. None are in this campaign yet.',table:{cols:['Account','6sense stage','Intent','Topics','Adobe visits (30d)'],rows:surge.map(i=>[acc(i.accountId).name,i.buyingStage,i.intentScore,i.keywords.join(', '),(db.adobeWeb||[]).filter(w=>w.accountId===i.accountId).length])},actions:[{label:'Push to sellers',say:'@mops push the target list to sellers'}]});}
 // stage state computed AFTER the auto ops, and sequential: a stage only ticks when every earlier stage is done (fixes stages ticked early)
 const sl2=db.syncLog.filter(x=>x.campaignId===c.id);const raw=[c.budget>0,!!c.code,sent,db.activities.some(v=>v.campaignId===c.id),L.length>0,sl2.length>0&&!sl2.some(x=>x.status==='failed'),opps.length>0,opps.some(o=>o.influence.some(x=>x.campaignId===c.id)),false];
 const done=[];raw.forEach((d,j)=>done.push(!!d&&(j===0||done[j-1])));let i=done.findIndex(d=>!d);if(i<0)i=8;
 const prev=c.state?.stage;c.state={stage:ST[i],index:i,stages:ST.map((n,j)=>({n,done:!!done[j]})),updatedAt:now()};
 if(!auto.length&&!recs.length&&prev===ST[i])return null;
 return{kind:'Autopilot',title:`${c.name}: stage ${i+1}/9 – ${ST[i]}${prev&&prev!==ST[i]?` (was ${prev})`:''}`,body:`Live state: ${ST.map((n,j)=>(done[j]?'✓ ':j===i?'▶ ':'· ')+n).join('  ')}\n${auto.length?'Done automatically (low-risk): \n- '+auto.join('\n- '):'No low-risk ops needed.'}${recs.length?`\n${recs.length} recommendation(s) need you.`:''}`,recs,data:{stage:ST[i],auto:auto.length,recs:recs.length}};},
approve_item({id}){id=(id||'').toUpperCase();const f=(db.followups||[]).find(x=>x.id===id);
 if(f){if(f.status!=='pending')return{error:`${id} already ${f.status}`};f.status='approved';for(const it of f.items){const x=db.contacts.find(q=>q.id===it.contactId);db.crm.tasks.push({id:'TSK-'+String(db.crm.tasks.length+1).padStart(3,'0'),key:'fu|'+it.contactId,accountId:x.accountId,owner:it.seller,subject:'Follow up: '+x.first+' '+x.last,at:now()});const s=db.sellers.find(q=>q.name===it.seller);db.notifications.push({to:s.email,channel:'Webex (mock)',text:'@mops: '+it.text,at:now()});}
  return{kind:'Approved',title:`${id}: ${f.items.length} seller follow-ups sent (CRM tasks + Webex)`,data:{approved:id}};}
 const sh=(db.shifts||[]).find(x=>x.id===id);if(sh){if(sh.status!=='pending')return{error:`${id} already ${sh.status}`};sh.status='approved';camp(sh.from).budget-=sh.amount;camp(sh.to).budget+=sh.amount;
  return{kind:'Approved',title:`${id}: ${fmt(sh.amount)} moved ${camp(sh.from).name} → ${camp(sh.to).name}`,data:{approved:id}};}
 return{error:'Nothing pending with id '+id};},
// ---------- EVENT AGENT (replaces Cvent / RainFocus basics) ----------
create_event({thread,name,date,city,capacity}){const c=campOf(thread);const nm=name||(c?c.name:brandName()+' Executive Briefing');
 let e=db.events.find(e=>c&&e.campaignId===c.id);if(e)return{kind:'Event',title:`${e.name} already exists`,body:`${e.registrations.length}/${e.capacity} registered`,link:{href:`/r/${e.slug}`,label:'Open registration page'}};
 e={id:'E'+(db.events.length+1),campaignId:c?.id,name:nm,date:date||'2026-12-10',city:city||(c?{India:'Bengaluru',ANZ:'Sydney',ASEAN:'Singapore',Japan:'Tokyo'}[c.region]:'Singapore'),capacity:Number(capacity)||50,slug:nm.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40),registrations:[],code:c?.code||null};
 db.events.push(e);return{kind:'Event',title:`${e.id}: ${e.name}`,body:`${e.date} · ${e.city} · capacity ${e.capacity} · tracking code ${e.code||'none'}`,link:{href:`/r/${e.slug}`,label:'Open hosted registration page'}};},
event_status({thread}){const c=campOf(thread);const e=db.events.find(e=>c&&e.campaignId===c.id)||db.events[0];return{kind:'Event',title:`${e.name}: ${e.registrations.length}/${e.capacity} registered`,table:{cols:['Name','Email','Account','Consent'],rows:e.registrations.map(r=>[r.name,r.email,r.account||'new',r.consent])},link:{href:`/r/${e.slug}`,label:'Registration page'}};}
};
return A;};
module.exports.esc=esc;module.exports.fmt=fmt;
