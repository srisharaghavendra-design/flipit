// Campaign lifecycle: intake → budget → SOW → codes & IDs → setup → launch → run → report.
// One record, filled once. Later steps read it. Nothing is retyped.
const fs=require('fs'),path=require('path');
const{call}=require('./lib');const core=require('./core');const{docx,pdf}=require('./docgen');
core.db.exec('CREATE TABLE IF NOT EXISTS lifecycle(id TEXT PRIMARY KEY,step TEXT,payload TEXT,at TEXT,updated_at TEXT)');
const STEPS=['intake','budget','sow','codes','setup','launch','run','report'];
const LABELS={intake:'Intake',budget:'Budget',sow:'SOW',codes:'Codes & IDs',setup:'Setup',launch:'Launch',run:'Run',report:'Report'};
const BASE={intake:12,budget:5,sow:17.5,codes:10,setup:15,launch:2,run:30,report:25};
const MIX={
 Events:{venue:.30,agency:.16,'F&B':.18,swag:.08,digital:.10,travel:.18},
 Digital:{agency:.22,swag:.04,digital:.62,travel:.12},
 ABM:{venue:.12,agency:.20,'F&B':.08,swag:.10,digital:.28,travel:.22},
 Partner:{venue:.18,agency:.14,'F&B':.16,swag:.20,digital:.14,travel:.18},
 'Lead gen':{agency:.18,swag:.06,digital:.58,travel:.12,'F&B':.06}};
const NEED={campaign_name:'Campaign name',geo:'Region (APJ, EMEA, or Americas)',country:'Country',program:'Program (ABM, Digital, Events, Partner, or Lead gen)',product:'Product / architecture',start_date:'Start date',city:'City',audience:'Goal or target accounts',budget:'Rough budget'};
const GEO_OF={India:'APJ',Japan:'APJ',ANZ:'APJ',ASEAN:'APJ',EMEA:'EMEA',US:'Americas',Americas:'Americas',APJ:'APJ'};
const OWN={EMEA:{sdr:'Lena Ward',ae:'Jonas Meyer',sdrId:'005NW0000SDR01',aeId:'005NW0000AE001'},US:{sdr:'Jill Park',ae:'Noah Brooks',sdrId:'005NW0000SDR02',aeId:'005NW0000AE002'},Americas:{sdr:'Jill Park',ae:'Noah Brooks',sdrId:'005NW0000SDR02',aeId:'005NW0000AE002'},India:{sdr:'Dev Rao',ae:'Anika Shah',sdrId:'005NW0000SDR03',aeId:'005NW0000AE003'},ANZ:{sdr:'Amelia Clarke',ae:'Chris Hale',sdrId:'005NW0000SDR04',aeId:'005NW0000AE004'},ASEAN:{sdr:'Daniel Tan',ae:'Priya Nair',sdrId:'005NW0000SDR05',aeId:'005NW0000AE005'},Japan:{sdr:'Yui Mori',ae:'Kenji Sato',sdrId:'005NW0000SDR06',aeId:'005NW0000AE006'},APJ:{sdr:'Dev Rao',ae:'Anika Shah',sdrId:'005NW0000SDR03',aeId:'005NW0000AE003'}};
const money=n=>'$'+Math.round(+n||0).toLocaleString('en-US');
const seed=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','data.seed.json')));
let launchHook=()=>{};const onLaunch=fn=>{launchHook=fn};
function save(row){row.updated_at=new Date().toISOString();core.db.prepare('INSERT OR REPLACE INTO lifecycle(id,step,payload,at,updated_at) VALUES(?,?,?,?,?)').run(row.id,row.step,JSON.stringify(row),row.at||row.updated_at,row.updated_at);return row}
function get(id){const r=core.db.prepare('SELECT payload FROM lifecycle WHERE id=?').get(id);return r&&JSON.parse(r.payload)}
function engineRegion(f){if(['India','Japan','ANZ','ASEAN','EMEA','US'].includes(f.region))return f.region;if(f.geo==='Americas')return 'US';if(f.geo==='EMEA')return 'EMEA';if(f.geo==='APJ')return 'India';return 'India'}
function parse(text){const IN=require('./intake');const f=IN.parse(text||'');const q=(' '+(text||'')+' ').toLowerCase();
 if(/\bapj\b|apac|asia pacific/.test(q))f.geo='APJ';else if(/\bemea\b|europe/.test(q))f.geo='EMEA';else if(/\bamericas\b|north america/.test(q))f.geo='Americas';
 if(/\babm\b/.test(q))f.program='ABM';else if(/partner/.test(q))f.program='Partner';else if(/lead ?gen/.test(q))f.program='Lead gen';else if(/digital|webinar|paid/.test(q))f.program='Digital';else if(/event|summit|roundtable|dinner|conference|workshop|breakfast|salon/.test(q))f.program='Events';
 if(!f.program&&f.channel)f.program=f.channel;if(f.program)f.channel=f.program;
 if(!f.geo&&f.region)f.geo=GEO_OF[f.region];
 if(/\bfrankfurt\b/.test(q)){f.city='Frankfurt';f.city_venue=f.city_venue||'Frankfurt';f.country=f.country||'Germany';f.region='EMEA';f.geo='EMEA'}
 if(f.city_venue&&!f.city)f.city=f.city_venue.split(',')[0];
 const g=String(text||'').match(/\b(?:goal|targeting|for)\s+([^,.]{3,80})/i);if(g&&!f.audience)f.audience=g[1].trim();
 if(/target accounts/.test(q)&&!f.audience)f.audience='target accounts';
 if(f.geo==='Americas'&&!f.region)f.region='US';if(f.geo==='EMEA'&&!['India','Japan','ANZ','ASEAN','EMEA','US'].includes(f.region))f.region='EMEA';
 return f}
function missingOf(f){const keys=['campaign_name','geo','country','program','product','start_date','audience','budget'];if((f.program||f.channel)==='Events')keys.push('city');
 return keys.filter(k=>!(f[k]||(k==='city'&&(f.city||f.city_venue))||(k==='audience'&&f.goal)||(k==='geo'&&GEO_OF[f.region])||(k==='program'&&f.channel))).map(k=>({key:k,label:NEED[k]}))}
function suggest(f,S){S=S||seed();const program=f.program||f.channel||'Events',geo=f.geo||GEO_OF[f.region]||'APJ';
 const peers=S.campaigns.filter(c=>(c.program||c.channel)===program&&c.geo===geo);const all=S.campaigns.filter(c=>(c.program||c.channel)===program);
 const avg=peers.length?Math.round(peers.reduce((s,c)=>s+c.budget,0)/peers.length):(+f.budget||80000);const mix=MIX[program]||MIX.Events;const total=+f.budget||avg;
 const lines=Object.entries(mix).map(([name,p])=>{const peer=peers[0];const amount=Math.round(total*p);
  const why=peer?`Past ${geo} ${program} averaged ${money(avg)}. ${peer.name} was ${money(peer.budget)}. ${name} is ${Math.round(p*100)}% of that shape.`:`No past ${geo} ${program} campaign yet, so this is the standard ${program} mix.`;
  return{name,amount,why}}).filter(l=>l.amount>0);
 const drift=total-lines.reduce((s,l)=>s+l.amount,0);if(lines[0])lines[0].amount+=drift;
 const envelope=(S.programs.find(p=>p.id===program)||{}).budget||0;const spent=all.reduce((s,c)=>s+(c.spend||0),0);const over=total>150000;
 return{lines,total,program,geo,programBudget:envelope,programSpend:spent,remaining:envelope-spent,threshold:150000,
  route:over?'Over $150K — Chris (Director) has to approve':'At or under $150K — this auto-approves when you submit',status:'draft',approver:over?'Chris (Director)':null,
  reasoning:[`${peers.length} past ${geo} ${program} campaign${peers.length===1?'':'s'} averaged ${money(avg)}.`,
   `Suggested split: ${lines.map(l=>`${l.name} ${money(l.amount)}`).join(', ')}.`,
   `${program} still has ${money(Math.max(0,envelope-spent))} of ${money(envelope)} after ${money(spent)} already spent.`,
   over?`${money(total)} is over the $150K rule, so it will not auto-approve.`:`${money(total)} is inside the $150K rule.`]}}
function buildSow(row){const ZT=require('./zerotouch');const f={...row.fields,region:engineRegion(row.fields),venue:row.fields.venue};const a=row.codes||{};
 const z=ZT.sowPrefill(f,{campaign_code:a.campaign_code||'(generated at the next step)',sfdc_campaign_id:a.sfdc_campaign_id||'(generated at the next step)',event_id:a.event_id||'(generated at the next step)'});
 const agency=z.fields.find(x=>x.field==='Agency');if(agency&&(!agency.value||agency.value==='TBC')){agency.value=f.country==='Germany'?'Rhine & Co Events':f.country==='United States'?'Harbor North Events':'Northwind Preferred Agency';agency.source=`preferred agency for ${f.country} (fictional vendor list)`;agency.confidence='suggested'}
 const cur=z.fields.find(x=>x.field==='Currency');if(cur&&f.country==='Germany'){cur.value='EUR';cur.source='country Germany → EUR'}
 if(cur&&f.country==='France'){cur.value='EUR';cur.source='country France → EUR'}
 if(cur&&f.country==='United Kingdom'){cur.value='GBP';cur.source='country United Kingdom → GBP'}
 z.fields.push({field:'Deliverables',value:f.program==='Events'?`Venue and hosting in ${f.city||f.country}, agenda, opted-in invite list, attendee file in the SFDC upload, post-event report`:'Campaign build, audience, and a results note against the goal',source:`${f.program} SOW template`,confidence:'derived'});
 z.fields.push({field:'Payment milestones',value:'50% on signature, 50% when the attendee list (or the campaign report) is delivered',source:'past Northwind event SOWs, 50/50',confidence:'derived'});
 z.fields.push({field:'Our PM',value:f.client_pm||'to confirm',source:f.client_pm?'edited by the marketer':'not in the intake',confidence:f.client_pm?'typed':'unknown'});
 z.fields.push({field:'Agency PM',value:f.agency_pm||'to confirm',source:f.agency_pm?'edited by the marketer':'not in the intake',confidence:f.agency_pm?'typed':'unknown'});
 const html=`<!doctype html><meta charset=utf-8><title>SOW ${row.id}</title><style>body{font-family:Calibri,Arial;max-width:760px;margin:32px auto;color:#111;line-height:1.45}h1{font-size:22px}td{border:1px solid #ccc;padding:6px 10px;vertical-align:top}td:first-child{background:#f4f3ef;width:200px}.s{color:#5b49e6;font-size:12px}</style><h1>Statement of Work · ${f.campaign_name}</h1><p class=s>Generated by @mops from intake ${row.id}. Each value shows where it came from. Fictional Northwind Networks data.</p><table>${z.fields.map(x=>`<tr><td>${x.field}</td><td>${x.value}<div class=s>${x.source} · ${x.confidence}</div></td></tr>`).join('')}</table>`;
 return{fields:z.fields,questions:z.questions,status:'needs answers',html,signOff:z.signOff}}
function applySowAnswers(row,answers){if(!answers)return;const kept={...(row.sow.answers||{}),...answers};const questions=row.sow.questions||[];
 for(const [k,v] of Object.entries(answers)){if(!v)continue;if(k==='venue')row.fields.venue=v;if(k==='cost_center')row.fields.cost_center=v;if(k==='client_pm')row.fields.client_pm=v;if(k==='agency_pm')row.fields.agency_pm=v;if(k==='agency_confirm')row.fields.vendor=v}
 row.sow=buildSow(row);row.sow.answers=kept;row.sow.questions=questions;const open=questions.filter(q=>!kept[q.key]);row.sow.status=open.length?'needs answers':'ready for review'}
function rowsOf(sow){return (sow?.fields||[]).map(x=>[x.field,`${x.value}  (${x.source})`])}
async function buildCodes(row){const f=row.fields;const t0=Date.now();const region=engineRegion(f);
 const created=await call('engine','/campaigns',{body:{name:f.campaign_name,channel:f.program,region,budget:row.budget.total,owner:f.owner||'Srisha R.',startDate:f.start_date,endDate:f.end_date||f.start_date,country:f.country,product:f.product,intakeId:row.id}});
 if(created.status==='pending_approval'&&row.budget.status==='approved')await call('engine',`/budget/${created.budgetRequest}/decide`,{body:{decision:'approve',approver:row.budget.approver||'Chris (Director)'}});
 await call('engine','/sync/drain',{body:{timeoutMs:15000}});
 const crm=await call('crm','/services/data/v59.0/sobjects/Campaign/'+created.id,{},'noflake');
 let event=null;if(f.program==='Events'||f.city){event=await call('engine','/events',{body:{campaignId:created.id,name:f.campaign_name,date:f.start_date,city:f.city||f.city_venue||f.country,capacity:+f.capacity||40}});await call('engine',`/campaigns/${created.id}/event`,{body:{eventId:event.id}})}
 const who=OWN[region]||OWN[f.geo]||OWN.APJ;
 const typed=['campaign_name','geo','country','program','product','start_date','end_date','city','audience','budget','owner','capacity','venue'].filter(k=>f[k]);
 row.codes={campaign_id:created.id,campaign_code:created.code,budget_request:created.budgetRequest,sfdc_campaign_id:crm.Id,event_id:event?.id||null,event_url:event?.url||null,event_slug:event?.slug||null,fiscal_quarter:(created.code||'').slice(0,6),sdr:who.sdr,ae:who.ae,sdrId:who.sdrId,aeId:who.aeId,fieldsReused:typed.length+4,retyped:0,generated:['campaign code','SFDC campaign ID','event ID','fiscal quarter','SDR / AE'],ms:Date.now()-t0};
 row.timings.codes=row.codes.ms;return row.codes}
async function buildSetup(row){const f=row.fields,c=row.codes;const t0=Date.now();const region=engineRegion(f);
 const prev=await call('engine','/segments/preview',{body:{rules:{all:[{field:'region',op:'eq',value:region},{field:'consent',op:'eq',value:'opted_in'}]}}});
 const link=c.event_url||'(registration page is created with the event)';
 row.setup={registrationUrl:link,email:{status:'draft',subject:`{{first}}, you’re invited: ${f.campaign_name}`,body:`Hi {{first}},\n\nYou’re invited to ${f.campaign_name} on ${f.start_date}${f.city?' in '+f.city:''}. We’ll spend the hour on ${f.product}, with ${f.audience}.\n\nReserve a seat: ${link}\n\nSrisha R.\nField marketing, Northwind Networks`},consent:{region,optedIn:prev.count,note:`${prev.count} contacts in ${region} are opted in and can be invited. Everyone else is suppressed.`},mapping:null,
  uploadCsv:'FirstName,LastName,Email,Company,Title,Country,CampaignId,Status,LeadSource,Product_Interest__c,OwnerId\n'+`,,,,,${f.country},${c.sfdc_campaign_id},Registered,${f.program},${f.product},${c.aeId}\n`,ms:Date.now()-t0};
 row.timings.setup=row.setup.ms}
function mapCsv(text){const lines=String(text||'').trim().split(/\r?\n/).filter(Boolean);if(!lines.length)return{rows:0,mapping:[],mapped:0};
 const header=lines[0].split(',').map(s=>s.trim().toLowerCase().replace(/^"|"$/g,''));
 const syn={email:['email','e-mail','mail'],first:['first','firstname','given'],last:['last','lastname','surname'],company:['company','account','org','organisation','organization'],title:['title','job','role'],country:['country','nation']};
 const mapping=Object.entries(syn).map(([target,words])=>{const i=header.findIndex(h=>words.some(w=>h.includes(w)));return{target,source:i>=0?header[i]:null,auto:i>=0}});
 return{rows:Math.max(0,lines.length-1),mapping,mapped:mapping.filter(m=>m.auto).length,unmapped:mapping.filter(m=>!m.auto).map(m=>m.target)}}
async function doLaunch(row){const f=row.fields,c=row.codes;const t0=Date.now();
 await call('engine',`/campaigns/${c.campaign_id}/status`,{body:{status:'Live'}});
 const camp={id:c.campaign_id,code:c.campaign_code,sfdcId:c.sfdc_campaign_id,name:f.campaign_name,channel:f.program,program:f.program,region:engineRegion(f),geo:f.geo,country:f.country,city:f.city,budget:row.budget.total,spend:0,status:'Live',owner:f.owner||'Srisha R.',quarter:c.fiscal_quarter||'FY27Q2',stage:'Run',pace:'on pace',goal:Math.round(row.budget.total*4),pipeline:0,bookings:0,mqls:0,leadCount:0,nextAction:'Invite the opted-in list — the draft is ready',needsApproval:false,consent:{opted_in:0,unknown:0,opted_out:0},eventId:c.event_id,lifecycleId:row.id};
 try{launchHook(camp)}catch(e){camp.hookError=e.message}
 try{await call('warehouse','/elt/run',{body:{}})}catch{}
 row.campaign=camp;row.timings.launch=Date.now()-t0;row.step='run';return camp}
async function buildReport(row){const t0=Date.now();let q=null;
 try{q=(await call('warehouse','/query/campaign?p='+encodeURIComponent(row.codes.campaign_id))).rows?.[0]}catch{}
 row.report={campaign:row.campaign,warehouse:q,summary:`${row.fields.campaign_name} is live. Code ${row.codes.campaign_code}. SFDC ${row.codes.sfdc_campaign_id}. Budget ${money(row.budget.total)}. Next: ${row.campaign?.nextAction||'run the invite.'}`,ms:Date.now()-t0};
 row.timings.report=row.report.ms;row.step='report'}
function narrative(row){const f=row.fields||{},b=row.budget,s=row.sow,c=row.codes,u=row.setup;
 if(row.step==='intake')return{did:row.missing?.length?[`Filled ${Object.keys(f).filter(k=>f[k]).length} fields from what you typed.`]:['Filled region, country, program, product, dates, city, audience, and budget from one brief.'],needs:row.missing?.length?row.missing.map(m=>'Still need '+m.label):['Nothing else. Continue to the budget.']};
 if(row.step==='budget')return{did:b?[...b.reasoning]:['Waiting on a complete intake.'],needs:b?.status==='approved'?['Nothing. Continue to the SOW.']:b?.status==='pending_approval'?['This is over $150K. Approve it, or edit a line and submit again.']:['Edit any line that looks wrong, then submit.']};
 if(row.step==='sow')return{did:s?s.fields.filter(x=>x.confidence!=='unknown').slice(0,4).map(x=>`${x.field}: ${x.value} — ${x.source}`):[],needs:s?(s.questions||[]).filter(q=>!(s.answers||{})[q.key]).map(q=>q.label):['Answer the flagged fields.']};
 if(row.step==='codes')return{did:c?[`Campaign code ${c.campaign_code}`,`SFDC campaign ${c.sfdc_campaign_id}`,c.event_id?`Event ${c.event_id}`:null,`SDR ${c.sdr} · AE ${c.ae}`,`${c.fieldsReused} fields reused, ${c.retyped} retyped`].filter(Boolean):[],needs:['Check the IDs. Nothing to retype. Continue to setup.']};
 if(row.step==='setup')return{did:u?[`Registration page ${u.registrationUrl}`,`Invite drafted. ${u.consent.note}`,u.mapping?`Target list: ${u.mapping.mapped} columns mapped, ${u.mapping.rows} rows.`:'SFDC upload file is prefilled with the campaign ID, country, and product.']: [],needs:u?.mapping?['Confirm the mapping, then continue to launch.']:['Optional: drop a target list so the columns map themselves. Then launch.']};
 if(row.step==='launch')return{did:['Budget, SOW, codes, registration page, and the invite are ready.'],needs:['Press Launch. The campaign then shows under its program.']};
 if(row.step==='run')return{did:[`${f.campaign_name} is live in ${f.geo} · ${f.program}.`,`Next @mops action: ${row.campaign?.nextAction||'invite the list'}`],needs:['Nothing blocking. Continue when you want the report.']};
 return{did:[row.report?.summary||'Report is ready.'],needs:['Skim it. The campaign stays in the cockpit.']}}
function present(row,extra){if(!row)return null;const i=STEPS.indexOf(row.step);const nav=narrative(row);const ms=row.timings?.[row.step]||0;
 return{...row,steps:STEPS.map((id,n)=>({id,label:LABELS[id],state:n<i?'done':n===i?'now':'todo'})),did:nav.did,needs:nav.needs,
  timer:{step:row.step,baselineMin:BASE[row.step],mopsMs:ms,note:`Manual baseline ${BASE[row.step]} min. @mops did its part in ${(ms/1000).toFixed(2)}s. The rest is your review.`},
  downloads:row.sow?{docx:`/api/engine/lifecycle/${row.id}/sow.docx`,pdf:`/api/engine/lifecycle/${row.id}/sow.pdf`,html:`/api/engine/lifecycle/${row.id}/sow.html`,upload:`/api/engine/lifecycle/${row.id}/upload.csv`}:null,...extra}}
function ensure(){if(get('LC-DEMO'))return get('LC-DEMO');const S=seed();const d=S.lifecycleDraft;const t0=Date.now();
 const row={id:'LC-DEMO',step:'budget',at:new Date().toISOString(),fields:{...d.fields},missing:[],budget:suggest(d.fields,S),sow:null,codes:null,setup:null,report:null,campaign:null,timings:{intake:220,budget:Date.now()-t0},log:[]};
 return save(row)}
function resetDemo(){core.db.prepare("DELETE FROM lifecycle WHERE id='LC-DEMO'").run();return ensure()}
async function start({text,fields}={}){const t0=Date.now();const f={...parse(text||''),...(fields||{})};if(f.program)f.channel=f.program;const miss=missingOf(f);
 const id='LC-'+Date.now().toString(36).slice(-6).toUpperCase();
 const row={id,step:'intake',at:new Date().toISOString(),fields:f,missing:miss,budget:null,sow:null,codes:null,setup:null,report:null,campaign:null,timings:{intake:Date.now()-t0},log:[]};
 if(!miss.length){row.budget=suggest(f);row.step='budget';row.timings.budget=Date.now()-t0}
 return present(save(row))}
async function act(id,{action,patch}={}){const row=get(id)||(id==='LC-DEMO'?ensure():null);if(!row)return null;const t0=Date.now();patch=patch||{};
 if(action==='save-intake'){row.fields={...row.fields,...(patch.fields||{})};if(row.fields.program)row.fields.channel=row.fields.program;row.missing=missingOf(row.fields);row.timings.intake=(row.timings.intake||0)+(Date.now()-t0)}
 if(action==='continue'&&row.step==='intake'){row.missing=missingOf(row.fields);if(row.missing.length)return present(save(row),{error:'Still missing '+row.missing.map(m=>m.label).join(', ')});row.budget=suggest(row.fields);row.step='budget';row.timings.budget=Date.now()-t0;return present(save(row))}
 if(action==='save-budget'||action==='submit-budget'){if(patch.lines&&row.budget){for(const l of patch.lines){const x=row.budget.lines.find(n=>n.name===l.name);if(x&&l.amount!=null)x.amount=+l.amount}row.budget.total=row.budget.lines.reduce((s,l)=>s+l.amount,0);row.fields.budget=row.budget.total;const over=row.budget.total>150000;row.budget.route=over?'Over $150K — Chris (Director) has to approve':'At or under $150K — this auto-approves when you submit';row.budget.approver=over?'Chris (Director)':null}
  if(action==='submit-budget'){row.budget.status=row.budget.total>150000?'pending_approval':'approved';row.budget.submittedAt=new Date().toISOString()}}
 if(action==='approve-budget'){if(!row.budget)return present(row,{error:'No budget yet'});if(row.budget.status==='draft')return present(save(row),{error:'Submit the budget first'});row.budget.status='approved';row.budget.approver=row.budget.total>150000?(patch.approver||'Chris (Director)'):'policy';row.budget.approvedAt=new Date().toISOString()}
 if(action==='continue'&&row.step==='budget'){if(row.budget.status!=='approved')return present(save(row),{error:row.budget.total>150000?'Submit the budget, then approve it.':'Submit the budget first.'});row.sow=buildSow(row);row.step='sow';row.timings.sow=Date.now()-t0;return present(save(row))}
 if(action==='save-sow'){applySowAnswers(row,patch.answers||{});if(patch.fields){for(const [k,v] of Object.entries(patch.fields)){const fld=row.sow.fields.find(x=>x.field===k);if(fld){fld.value=v;fld.source='edited by the marketer';fld.confidence='typed';row.sow.html=buildSow(row).html}}}}
 if(action==='continue'&&row.step==='sow'){const open=(row.sow.questions||[]).filter(q=>!(row.sow.answers||{})[q.key]);if(open.length)return present(save(row),{error:'Still need: '+open.map(q=>q.label).join(', ')});const kept=row.sow.answers,questions=row.sow.questions;await buildCodes(row);row.sow=buildSow(row);row.sow.answers=kept;row.sow.questions=questions;row.sow.status='ready for review';row.step='codes'}
 else if(action==='continue'&&row.step==='codes'){await buildSetup(row);row.step='setup'}
 else if(action==='continue'&&row.step==='setup'){row.step='launch';row.timings.launch=Date.now()-t0}
 if(action==='upload'){row.setup=row.setup||{};row.setup.mapping=mapCsv(patch.csv||'');}
 if(action==='launch'&&(row.step==='launch'||row.step==='setup')){await doLaunch(row)}
 if(action==='continue'&&row.step==='run'){await buildReport(row)}
 return present(save(row))}
function list(){ensure();return core.db.prepare('SELECT id,step,at FROM lifecycle ORDER BY at DESC').all()}
function file(id,kind){const row=get(id);if(!row)return null;if(kind==='html')return{type:'text/html',body:row.sow?.html||'SOW is not ready yet'};
 if(kind==='docx'){if(!row.sow)return null;return{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',body:docx('Statement of Work · '+(row.fields.campaign_name||id),rowsOf(row.sow)),name:`${id}-sow.docx`}}
 if(kind==='pdf'){if(!row.sow)return null;return{type:'application/pdf',body:pdf('Statement of Work',[(row.fields.campaign_name||''),...rowsOf(row.sow).map(([k,v])=>k+': '+v)]),name:`${id}-sow.pdf`}}
 if(kind==='csv')return{type:'text/csv',body:row.setup?.uploadCsv||'FirstName,LastName,Email,Company,Title,Country,CampaignId\n',name:`${id}-sfdc-upload.csv`};
 return null}
module.exports={parse,missingOf,suggest,ensure,resetDemo,start,act,get:id=>present(get(id)||(id==='LC-DEMO'?ensure():null)),list,file,present,onLaunch,STEPS};
