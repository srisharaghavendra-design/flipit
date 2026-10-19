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
const HANDOFFS=['Marketer types the Airtable (budget form)','Airtable notifies Chris M.','Chris M. replies to the marketer','Marketer emails the agency for an SOW','Agency returns the SOW','Marketer retypes the approved amount into Command Center (BAN/CC ID)','Command Center sends the BAN ID back','Marketer creates the campaign in SFDC and the event platform','Marketer exports a file and rebuilds the report'];
const CURRENCY={Germany:'EUR',France:'EUR','United Kingdom':'GBP',India:'INR',Singapore:'SGD','United States':'USD',Australia:'AUD',Japan:'JPY'};
function memInit(){core.db.exec('CREATE TABLE IF NOT EXISTS memory(k TEXT PRIMARY KEY, v TEXT, source TEXT, at TEXT)')}
function learnedRows(){memInit();return core.db.prepare('SELECT k,v,source,at FROM memory ORDER BY at DESC').all()}
function remember(row){memInit();const f=row.fields||{};const put=(k,v,s)=>{if(v)core.db.prepare('INSERT INTO memory(k,v,source,at) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, source=excluded.source, at=excluded.at').run(k,String(v),s,new Date().toISOString())};
 const agency=f.vendor||(f.country==='Germany'?'Rhine & Co Events':f.country==='United States'?'Harbor North Events':'');
 put('agency:'+(f.geo||'any'),agency,'Chris M. approved '+row.id);if(f.city)put('city:'+f.city,f.venue||f.city,'Chris M. approved '+row.id);put('amount:'+(f.program||'campaign'),String(row.budget&&row.budget.total||''),'Chris M. approved '+row.id);if(f.cost_center)put('cost:'+(f.geo||''),f.cost_center,'Chris M. approved '+row.id);row.learned=learnedRows().filter(m=>String(m.source).includes(row.id))}
function formOf(f){f=f||{};const S=seed();const program=f.program||f.channel||'Events',geo=f.geo||'EMEA';
 const peers=(S.campaigns||[]).filter(c=>(c.program||c.channel)===program&&c.geo===geo&&c.name!==f.campaign_name);const past=peers.slice().sort((a,b)=>(b.budget||0)-(a.budget||0))[0];const pastName=past?past.name:'a past campaign';const opp=(S.opps&&S.opps[0]&&S.opps[0].id)||'OPP-9001';
 const cc={Germany:'DE',France:'FR','United Kingdom':'GB',India:'IN',Singapore:'SG','United States':'US',Australia:'AU',Japan:'JP'};
 const spec=[['campaign_name','Campaign name',f.campaign_name,'the brief'],['geo','Region',f.geo,'the brief'],['country','Country',f.country,'the brief'],['city','City',f.city||f.city_venue,'calendar hold'],['program','Program',program,'program plan'],['campaign_type','Campaign type',program==='Events'?'Executive event':program,'past campaign '+pastName],['product','Product / architecture',f.product,'SFDC opp '+opp],['start_date','Start date',f.start_date,'calendar hold'],['objectives','Objectives',f.audience||f.goal,'the brief'],['audience','Audience',f.audience||f.goal,'past campaign '+pastName],['capacity','Capacity',f.capacity!=null&&f.capacity!==''?String(f.capacity):'','past campaign '+pastName],['budget','Amount',f.budget!=null&&f.budget!==''?String(f.budget):'','past campaign '+pastName],['currency','Currency',CURRENCY[f.country]||'','country table'],['agency','Agency',f.vendor||(f.country==='Germany'?'Rhine & Co Events':f.country==='United States'?'Harbor North Events':''),'agency roster'],['owner','Owner',f.owner||'Srisha R.','your profile'],['quarter','Fiscal quarter','FY27Q2','program plan'],['country_code','Country code',cc[f.country]||'','country table'],['event_name','Event name',f.campaign_name,'the brief'],['consent','Consent basis',f.country==='Germany'?'GDPR opt-in':'country consent law','policy'],['naming','Code pattern','FY{Q}-{RG}-{CH}-####','naming policy'],['sfdc_opp','SFDC opportunity',opp,'SFDC opp '+opp],['past_campaign','Past campaign',pastName,'past campaign '+pastName],['venue','Venue',f.venue||'',''],['cost_center','Cost center',f.cost_center||'',''],['client_pm','Our PM',f.client_pm||'',''],['agency_pm','Agency PM',f.agency_pm||'','']];
 const items=spec.map(([key,label,value,source])=>({key,label,value:value==null?'':String(value),source:source||'',open:!value}));const open=items.filter(i=>i.open);
 return{items,total:items.length,filled:items.length-open.length,open:open.map(i=>({key:i.key,label:i.label}))}}
function agentsOf(row,form){const f=row.fields||{};return[
 {id:'ag-budget',name:'Budget',state:row.budget?'done':'working',status:form?`filled ${form.filled} of ${form.total}`:'reading the brief'},
 {id:'ag-sow',name:'SOW',state:row.sow?'done':'idle',status:row.sow?(row.sow.selfCheck?row.sow.selfCheck.fix:'draft ready'):'waits for Chris M.'},
 {id:'ag-codes',name:'Codes & IDs',state:row.codes?'done':'idle',status:row.codes?`${row.codes.campaign_code} · ${row.codes.ban_id}`:'campaign code, SFDC id, event id, BAN / CC ID'},
 {id:'ag-setup',name:'Setup',state:row.setup?'done':'idle',status:row.setup?'page, invite, and upload file ready':'landing page, email, forms'},
 {id:'ag-compliance',name:'Compliance',state:row.sow&&row.sow.selfCheck?'done':'working',status:row.sow&&row.sow.selfCheck?row.sow.selfCheck.caught:`consent for ${f.country||'the country'}`},
 {id:'ag-data',name:'Data',state:row.setup&&row.setup.mapping?'done':'idle',status:row.setup&&row.setup.mapping?`${row.setup.mapping.mapped} columns mapped`:'maps a target list when you drop one'},
 {id:'ag-report',name:'Report',state:row.report?'done':'idle',status:row.report?'report is ready':'after launch'}]}
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
 if(!f.geo&&['ASEAN','ANZ','India','Japan'].includes(f.region))f.geo='APJ';
 if(!f.start_date){const mon=q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/);
  if(mon){const map={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};const month=map[mon[1].slice(0,3)]||map[mon[1]];const now=new Date();let year=now.getUTCFullYear();if(month<now.getUTCMonth()+1)year++;const iso=`${year}-${String(month).padStart(2,'0')}-18`;f.start_date=f.end_date=iso}}
 if(!f.product&&/ciso|security|zero trust/.test(q))f.product='Zero Trust';
 if(!f.audience&&/\bcisos?\b/.test(q))f.audience='CISOs';
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
  route:over?'Over $150K — Chris M. has to approve':'At or under $150K — this auto-approves when you submit',status:'draft',approver:over?'Chris M.':null,
  reasoning:[`${peers.length} past ${geo} ${program} campaign${peers.length===1?'':'s'} averaged ${money(avg)}.`,
   `Suggested split: ${lines.map(l=>`${l.name} ${money(l.amount)}`).join(', ')}.`,
   `${program} still has ${money(Math.max(0,envelope-spent))} of ${money(envelope)} after ${money(spent)} already spent.`,
   over?`${money(total)} is over the $150K rule, so Chris M. has to approve.`:`${money(total)} is inside the $150K rule.`]}}
function buildSow(row){const ZT=require('./zerotouch');const f={...row.fields,region:engineRegion(row.fields),venue:row.fields.venue};const a=row.codes||{};
 const z=ZT.sowPrefill(f,{campaign_code:a.campaign_code||'(generated at the next step)',sfdc_campaign_id:a.sfdc_campaign_id||'(generated at the next step)',event_id:a.event_id||'(generated at the next step)'});
 const agency=z.fields.find(x=>x.field==='Agency');if(agency&&(!agency.value||agency.value==='TBC')){agency.value=f.country==='Germany'?'Rhine & Co Events':f.country==='United States'?'Harbor North Events':'Northwind Preferred Agency';agency.source=`preferred agency for ${f.country} (fictional vendor list)`;agency.confidence='suggested'}
 const cur=z.fields.find(x=>x.field==='Currency');const guessed=f.currency||'USD';const correct=CURRENCY[f.country];let selfCheck=null;
 if(cur&&correct){if(guessed!==correct)selfCheck={caught:`Currency was ${guessed} on a ${f.country} SOW`,fix:`Set ${correct} from the country table`};cur.value=correct;if(selfCheck){cur.source=`self-check: ${f.country} → ${correct}`;cur.confidence='derived'}}
 z.fields.push({field:'Deliverables',value:f.program==='Events'?`Venue and hosting in ${f.city||f.country}, agenda, opted-in invite list, attendee file in the SFDC upload, post-event report`:'Campaign build, audience, and a results note against the goal',source:`${f.program} SOW template`,confidence:'derived'});
 z.fields.push({field:'Payment milestones',value:'50% on signature, 50% when the attendee list (or the campaign report) is delivered',source:'past Northwind event SOWs, 50/50',confidence:'derived'});
 z.fields.push({field:'Our PM',value:f.client_pm||'to confirm',source:f.client_pm?'edited by the marketer':'not in the intake',confidence:f.client_pm?'typed':'unknown'});
 z.fields.push({field:'Agency PM',value:f.agency_pm||'to confirm',source:f.agency_pm?'edited by the marketer':'not in the intake',confidence:f.agency_pm?'typed':'unknown'});
 const html=`<!doctype html><meta charset=utf-8><title>SOW ${row.id}</title><style>body{font-family:Calibri,Arial;max-width:760px;margin:32px auto;color:#111;line-height:1.45}h1{font-size:22px}td{border:1px solid #ccc;padding:6px 10px;vertical-align:top}td:first-child{background:#f4f3ef;width:200px}.s{color:#5b49e6;font-size:12px}</style><h1>Statement of Work · ${f.campaign_name}</h1><p class=s>Generated by @mops from intake ${row.id}. Each value shows where it came from. Fictional Northwind Networks data.</p><table>${z.fields.map(x=>`<tr><td>${x.field}</td><td>${x.value}<div class=s>${x.source} · ${x.confidence}</div></td></tr>`).join('')}</table>`;
 return{fields:z.fields,questions:z.questions,status:'needs answers',html,signOff:z.signOff,selfCheck}}
function applySowAnswers(row,answers){if(!answers)return;const kept={...(row.sow.answers||{}),...answers};const questions=row.sow.questions||[];
 for(const [k,v] of Object.entries(answers)){if(!v)continue;if(k==='venue')row.fields.venue=v;if(k==='cost_center')row.fields.cost_center=v;if(k==='client_pm')row.fields.client_pm=v;if(k==='agency_pm')row.fields.agency_pm=v;if(k==='agency_confirm')row.fields.vendor=v}
 row.sow=buildSow(row);row.sow.answers=kept;row.sow.questions=questions;const open=questions.filter(q=>!kept[q.key]);row.sow.status=open.length?'needs answers':'ready for review'}
function rowsOf(sow){return (sow?.fields||[]).map(x=>[x.field,`${x.value}  (${x.source})`])}
async function buildCodes(row){const f=row.fields;const t0=Date.now();const region=engineRegion(f);
 const created=await call('engine','/campaigns',{body:{name:f.campaign_name,channel:f.program,region,budget:row.budget.total,owner:f.owner||'Srisha R.',startDate:f.start_date,endDate:f.end_date||f.start_date,country:f.country,product:f.product,intakeId:row.id}});
 if(created.status==='pending_approval'&&row.budget.status==='approved')await call('engine',`/budget/${created.budgetRequest}/decide`,{body:{decision:'approve',approver:row.budget.approver||'Chris M.'}});
 await call('engine','/sync/drain',{body:{timeoutMs:15000}});
 const crm=await call('crm','/services/data/v59.0/sobjects/Campaign/'+created.id,{},'noflake');
 let event=null;if(f.program==='Events'||f.city){event=await call('engine','/events',{body:{campaignId:created.id,name:f.campaign_name,date:f.start_date,city:f.city||f.city_venue||f.country,capacity:+f.capacity||40}});await call('engine',`/campaigns/${created.id}/event`,{body:{eventId:event.id}})}
 const who=OWN[region]||OWN[f.geo]||OWN.APJ;
 const typed=['campaign_name','geo','country','program','product','start_date','end_date','city','audience','budget','owner','capacity','venue'].filter(k=>f[k]);
 const ccId=f.cost_center||'CC-4408';const qtr=(created.code||'FY27Q2').slice(0,6);const banId='BAN-'+qtr+'-'+String(ccId).replace(/^CC-?/,'');
 row.codes={campaign_id:created.id,campaign_code:created.code,budget_request:created.budgetRequest,sfdc_campaign_id:crm.Id,event_id:event?.id||null,event_url:event?.url||null,event_slug:event?.slug||null,fiscal_quarter:qtr,ban_id:banId,cc_id:ccId,sdr:who.sdr,ae:who.ae,sdrId:who.sdrId,aeId:who.aeId,fieldsReused:typed.length+4,retyped:0,generated:['campaign code','SFDC campaign ID','event ID','BAN ID','cost center','fiscal quarter','SDR / AE'],command:{tool:'Command Center (BAN/CC ID)',replacedBy:'Codes agent + the $150K approval policy',chain:['Approved amount posted without retyping','BAN ID '+banId,'Cost center '+ccId]},ms:Date.now()-t0};
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
 if(row.step==='budget')return{did:b?[...b.reasoning,...(row.learned||[]).map(m=>'Learned '+m.k+' = '+m.v)]:['Waiting on a complete intake.'],needs:b?.status==='approved'?['Nothing. Continue. The agency SOW goes out next.']:b?.status==='pending_approval'?['Over $150K. Chris M. approves in one click.']:['Confirm the open fields, then send it to Chris M.']};
 if(row.step==='sow')return{did:[...(s&&s.selfCheck?[`Self-check: ${s.selfCheck.caught}. ${s.selfCheck.fix}.`]:[]),...(row.sowRequest?[`SOW request ${row.sowRequest.status} to ${row.sowRequest.to}`]:[]),...(s?s.fields.filter(x=>x.confidence!=='unknown').slice(0,3).map(x=>`${x.field}: ${x.value} — ${x.source}`):[])],needs:s?(s.questions||[]).filter(q=>!(s.answers||{})[q.key]).map(q=>q.label):['Answer the flagged fields.']};
 if(row.step==='codes')return{did:c?[`BAN ID ${c.ban_id}`,`Cost center ${c.cc_id}`,`Campaign code ${c.campaign_code}`,`SFDC campaign ${c.sfdc_campaign_id}`,c.event_id?`Event ${c.event_id}`:null,`${c.fieldsReused} fields reused, ${c.retyped} retyped`].filter(Boolean):[],needs:['Nothing was retyped. Continue to setup.']};
 if(row.step==='setup')return{did:u?[`Registration page ${u.registrationUrl}`,`Invite drafted. ${u.consent.note}`,u.mapping?`Target list: ${u.mapping.mapped} columns mapped, ${u.mapping.rows} rows.`:'SFDC upload file is prefilled with the campaign ID, country, and product.']: [],needs:u?.mapping?['Confirm the mapping, then continue to launch.']:['Optional: drop a target list so the columns map themselves. Then launch.']};
 if(row.step==='launch')return{did:['Budget, SOW, codes, registration page, and the invite are ready.'],needs:['Press Launch. The campaign then shows under its program.']};
 if(row.step==='run')return{did:[`${f.campaign_name} is live in ${f.geo} · ${f.program}.`,`Next @mops action: ${row.campaign?.nextAction||'invite the list'}`],needs:['Nothing blocking. Continue when you want the report.']};
 return{did:[row.report?.summary||'Report is ready.'],needs:['Skim it. The campaign stays in the cockpit.']}}
function present(row,extra){if(!row)return null;const i=STEPS.indexOf(row.step);const nav=narrative(row);const ms=row.timings?.[row.step]||0;const form=formOf(row.fields);const rep=require('./fields').repeatEntry();
 return{...row,form,agents:agentsOf(row,form),learned:row.learned||learnedRows(),policies:[{name:'Approval',rule:'Over $150,000 goes to Chris M. At or under that, it auto-approves.'},{name:'Consent',rule:'The country sets the lawful basis before any invite is sent.'},{name:'Naming',rule:'Campaign codes are FY{quarter}-{region}-{channel}-{id}. BAN IDs follow the cost center.'}],
  compare:{today:{tools:rep.today.toolsTouched,handoffs:HANDOFFS.length,retyped:rep.today.fieldEntries,handoffList:HANDOFFS},mops:{conversations:1,approvals:1}},
  steps:STEPS.map((id,n)=>({id,label:LABELS[id],state:n<i?'done':n===i?'now':'todo'})),did:nav.did,needs:nav.needs,
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
 if(action==='answer'){row.fields={...row.fields,...(patch.fields||{})}}
 if(action==='save-budget'||action==='submit-budget'){if(patch.lines&&row.budget){for(const l of patch.lines){const x=row.budget.lines.find(n=>n.name===l.name);if(x&&l.amount!=null)x.amount=+l.amount}row.budget.total=row.budget.lines.reduce((s,l)=>s+l.amount,0);row.fields.budget=row.budget.total;const over=row.budget.total>150000;row.budget.route=over?'Over $150K — Chris M. has to approve':'At or under $150K — this auto-approves when you submit';row.budget.approver=over?'Chris M.':null}
  if(action==='submit-budget'){row.budget.status=row.budget.total>150000?'pending_approval':'approved';row.budget.submittedAt=new Date().toISOString()}}
 if(action==='approve-budget'){if(!row.budget)return present(row,{error:'No budget yet'});if(row.budget.status==='draft')return present(save(row),{error:'Submit the budget first'});row.budget.status='approved';row.budget.approver=row.budget.total>150000?(patch.approver||'Chris M.'):'policy';row.budget.approvedAt=new Date().toISOString();remember(row)}
 if(action==='continue'&&row.step==='budget'){if(row.budget.status!=='approved')return present(save(row),{error:row.budget.total>150000?'Submit the budget, then approve it.':'Submit the budget first.'});row.sow=buildSow(row);
  try{const info=require('./mail').deliver({from:'srisha@northwind.example',to:'ada.klein@rhine-events.example',subject:'SOW request: '+(row.fields.campaign_name||row.id),text:`Please draft the SOW for ${row.fields.campaign_name}.\n${row.fields.city||''}, ${row.fields.country||''}. ${row.fields.start_date||''}. Budget ${money(row.budget.total)} ${CURRENCY[row.fields.country]||'USD'}.\nAgency: ${row.fields.vendor||'on the roster'}.`});row.sowRequest={to:'ada.klein@rhine-events.example',subject:'SOW request: '+(row.fields.campaign_name||row.id),messageId:info.messageId,status:'sent'}}catch(e){row.sowRequest={status:'draft',error:e.message}}
  row.step='sow';row.timings.sow=Date.now()-t0;return present(save(row))}
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
