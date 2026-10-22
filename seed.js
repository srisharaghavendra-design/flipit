// Generates fictional book data -> data.seed.json + data.json. Deterministic. The company line follows BRAND_NAME.
const {brandCompany}=require('./brand');
const fs=require('fs');let s=42;const r=()=>(s=(s*1103515245+12345)%2147483648)/2147483648;const pick=a=>a[Math.floor(r()*a.length)];
const regions={India:['Bengaluru','Mumbai','Delhi','Hyderabad','Pune'],ANZ:['Sydney','Melbourne','Auckland'],ASEAN:['Singapore','Jakarta','Kuala Lumpur','Bangkok'],Japan:['Tokyo','Osaka']};
const pre=['Tata','Indus','Kaveri','Lotus','Saffron','Harbour','Southern Cross','Kiwi','Merlion','Batik','Garuda','Sakura','Fuji','Orbit','Zenith','Nimbus','Aurora','Vertex','Summit','Coral'];
const suf=['Bank','Health','Telecom','Retail','Logistics','Energy','Insurance','Steel','Pharma','Airlines'];
const ind={Bank:'Financial Services',Insurance:'Financial Services',Health:'Healthcare',Pharma:'Healthcare',Telecom:'Telecom',Retail:'Retail',Logistics:'Transport',Airlines:'Transport',Energy:'Energy',Steel:'Manufacturing'};
const accounts=[];const used=new Set();
for(let i=0;i<40;i++){let n;do n=pick(pre)+' '+pick(suf);while(used.has(n));used.add(n);const reg=Object.keys(regions)[i%4];const sx=n.split(' ').pop();
 accounts.push({id:'A'+(101+i),name:n,region:reg,city:pick(regions[reg]),segment:r()<0.55?'Enterprise':'Commercial',industry:ind[sx],domain:n.toLowerCase().replace(/[^a-z]/g,'')+'.example',intent:Math.round(r()*100)});}
const fn=['Aarav','Priya','Rohan','Ananya','Vikram','Meera','Arjun','Kavya','Liam','Olivia','Noah','Mia','Wei','Siti','Hiro','Yuki','Ravi','Sneha','Jack','Chloe','Ahmad','Mei','Kenji','Divya','Sam'];
const ln=['Sharma','Iyer','Nair','Patel','Reddy','Gupta','Smith','Brown','Wilson','Tan','Lim','Wong','Rahman','Sato','Tanaka','Kumar','Rao','Taylor','Ng','Suzuki'];
const titles=['CIO','CIO','CTO','CISO','VP Infrastructure','IT Director','Network Manager','Head of Security','Procurement Manager'];
const contacts=[];
for(let i=0;i<300;i++){const a=accounts[i%40];const f=pick(fn),l=pick(ln);const t=i<40?(i%3?'CIO':'CTO'):pick(titles);
 const opt=r();contacts.push({id:'C'+(1001+i),first:f,last:l,email:`${f}.${l}${i}@${a.domain}`.toLowerCase(),title:t,accountId:a.id,consent:opt<0.68?'opted_in':opt<0.85?'unknown':'opted_out',consentDate:'2026-0'+(1+Math.floor(r()*9))+'-1'+Math.floor(r()*9)});}
const ch=[['ABM','India CIO Value Accelerator','India',180000],['Digital','SASE Paid Social Q3','ASEAN',95000],['Partner','Kiwi Partner MDF Play','ANZ',120000],['Lead gen','Zero Trust Webinar Series','India',40000],['Events','Bengaluru CIO Roundtable','India',60000],['ABM','Japan Top-20 Accounts','Japan',150000],['Digital','Hybrid Work Search Q3','ANZ',70000],['Partner','Merlion Reseller Co-marketing','ASEAN',85000],['Lead gen','Network Assessment Offer','Japan',35000],['Events','Sydney Security Summit','ANZ',110000]];
const campaigns=ch.map((c,i)=>({id:'K'+(1+i),channel:c[0],name:c[1],region:c[2],budget:c[3],spend:Math.round(c[3]*(0.4+r()*0.5)),code:i<6?`FY27Q2-${c[2].toUpperCase().slice(0,3)}-${c[0].slice(0,3).toUpperCase()}-${1200+i*37}`:null,status:'Live',owner:'Srisha R.'}));
const stages=['MQL','SQL','Opportunity','Won'];const leads=[];
for(let i=0;i<220;i++){const c=contacts[Math.floor(r()*300)];const k=campaigns.filter(x=>x.code)[Math.floor(r()*6)];const st=pick(stages);
 leads.push({id:'L'+(5001+i),contactId:c.id,accountId:c.accountId,campaignId:k.id,stage:st,pipeline:st==='MQL'?0:Math.round((10+r()*90))*1000,created:'2026-'+String(7+Math.floor(r()*3)).padStart(2,'0')+'-'+String(1+Math.floor(r()*27)).padStart(2,'0')});}
const mdf=[{id:'MDF-311',partner:'Kiwi Integrators',campaignId:'K3',amount:42000,status:'Proof of execution pending',due:'2026-10-30'},{id:'MDF-312',partner:'Merlion Systems',campaignId:'K8',amount:28000,status:'Approved – payment scheduled',due:'2026-11-05'}];
const events=[{id:'E1',campaignId:'K5',name:'Bengaluru CIO Roundtable',date:'2026-12-10',city:'Bengaluru',capacity:40,slug:'blr-cio-roundtable',registrations:[]}];
const threads=campaigns.map(k=>({id:'T-'+k.id,type:'campaign',refId:k.id,title:k.name,messages:[{who:'Srisha R.',at:'2026-10-15T09:00:00Z',text:`Kick-off: ${k.name} (${k.channel}, ${k.region}). Budget $${k.budget.toLocaleString()}.`}]}));
threads.unshift({id:'T-A101',type:'account',refId:'A101',title:accounts[0].name+' (account)',messages:[{who:'Seller – Dev Rao',at:'2026-10-16T10:00:00Z',text:'They are evaluating SASE. Any marketing we can run?'}]});
// ---- v3 additions (separate RNG so existing data stays identical) ----
let s2=7;const r2=()=>(s2=(s2*1103515245+12345)%2147483648)/2147483648;const pick2=a=>a[Math.floor(r2()*a.length)];
accounts.push({id:'A141',name:'Acme Corp',region:'India',city:'Mumbai',segment:'Enterprise',industry:'Financial Services',domain:'acmecorp.example',intent:82});
const acmeP=[['Neha','Kapoor','CIO','opted_in'],['Rahul','Menon','CISO','opted_in'],['Farah','Ali','VP Infrastructure','opted_in'],['Karan','Joshi','Network Manager','unknown'],['Isha','Bose','IT Director','opted_in'],['Tom','Fernandes','Procurement Manager','opted_out']];
acmeP.forEach((x,i)=>contacts.push({id:'C'+(1301+i),first:x[0],last:x[1],email:`${x[0]}.${x[1]}@acmecorp.example`.toLowerCase(),title:x[2],accountId:'A141',consent:x[3],consentDate:'2026-08-12'}));
// engagement activity stream (what Eloqua/website/event tools record today)
const W={email_open:1,email_click:3,web_visit:2,content_download:5,webinar_attend:10,event_attend:15,form_fill:8};const types=Object.keys(W);
const activities=[];const addAct=(cid,type,date,camp)=>activities.push({id:'ACT-'+String(activities.length+1).padStart(4,'0'),contactId:cid,type,at:date,campaignId:camp||null});
for(let i=0;i<300;i++){const n=Math.floor(r2()*4);for(let j=0;j<n;j++)addAct(contacts[i].id,pick2(types),'2026-'+String(7+Math.floor(r2()*3)).padStart(2,'0')+'-'+String(1+Math.floor(r2()*27)).padStart(2,'0'),pick2(campaigns).id);}
[['C1301','event_attend','2026-09-24','K5'],['C1301','content_download','2026-10-05','K4'],['C1301','web_visit','2026-10-14'],['C1301','web_visit','2026-10-16'],['C1301','email_click','2026-10-12','K1'],
 ['C1302','webinar_attend','2026-10-02','K4'],['C1302','event_attend','2026-09-24','K5'],['C1302','email_click','2026-10-09','K1'],
 ['C1303','email_open','2026-08-03','K1'],['C1303','web_visit','2026-07-20'],
 ['C1305','form_fill','2026-10-10','K4'],['C1305','email_open','2026-10-11','K1'],
 ['C1304','email_open','2026-06-02','K2']].forEach(a=>addAct(...a));
// opportunities (SFDC) with contact roles
const opps=[{id:'OPP-9001',accountId:'A141',name:'Acme Corp – SASE rollout',amount:420000,stage:'Proposal',close:'2026-12-15',owner:'Dev Rao',contactRoles:['C1301','C1302','C1305'],influence:[]},
 {id:'OPP-9002',accountId:'A101',name:accounts[0].name+' – Campus refresh',amount:180000,stage:'Discovery',close:'2027-01-30',owner:'Dev Rao',contactRoles:[contacts.find(c=>c.accountId==='A101').id],influence:[]}];
// Eloqua→SFDC lead sync log with realistic failure reasons (simulated)
const errs=[['DUPLICATE_VALUE','A Lead with this email already exists in CRM'],['REQUIRED_FIELD_MISSING','Company is blank'],['FIELD_CUSTOM_VALIDATION_EXCEPTION','Campaign code not found in CRM'],['UNABLE_TO_LOCK_ROW','Record locked by another process'],['INVALID_EMAIL_ADDRESS','Email address is malformed']];
const syncLog=[];leads.slice(0,60).forEach((l,i)=>{const fail=i%5===1||i%7===3;const e=errs[i%5];syncLog.push({id:'SYN-'+String(i+1).padStart(3,'0'),leadId:l.id,contactId:l.contactId,campaignId:l.campaignId,at:'2026-10-17T'+String(8+i%10).padStart(2,'0')+':'+String(i%60).padStart(2,'0')+':00Z',status:fail?'failed':'synced',code:fail?e[0]:null,error:fail?e[1]:null,attempts:fail?20:1});});
syncLog.filter(x=>x.code==='INVALID_EMAIL_ADDRESS').forEach(x=>{const c=contacts.find(c=>c.id===x.contactId);x.badEmail=c.email.replace('@','@@');});
const sellers=[{name:'Dev Rao',region:'India',email:'dev.rao@northwind.example'},{name:'Amelia Clarke',region:'ANZ',email:'amelia.clarke@northwind.example'},{name:'Daniel Tan',region:'ASEAN',email:'daniel.tan@northwind.example'},{name:'Yui Mori',region:'Japan',email:'yui.mori@northwind.example'}];
threads.splice(1,0,{id:'T-A141',type:'account',refId:'A141',title:'Acme Corp (account)',messages:[{who:'Seller – Dev Rao',at:'2026-10-17T11:00:00Z',text:'OPP-9001 (SASE rollout, $420K) just hit Proposal. Neha and Rahul were at the roundtable – can marketing get credit sorted and tell me who else is warm?'}]});
// mock 6sense (account intent + buying stage) and Adobe Analytics (web visits) – fictional
const BS=['Target','Awareness','Consideration','Decision','Purchase'];const KW=['SASE','zero trust','SD-WAN','firewall','campus Wi-Fi','observability'];
const intent6s=accounts.map(a=>({accountId:a.id,source:'6sense (mock)',buyingStage:a.id==='A141'?'Decision':BS[Math.floor(r2()*4)],intentScore:a.id==='A141'?88:Math.round(r2()*100),keywords:[pick2(KW),pick2(KW)].filter((v,i,x)=>x.indexOf(v)===i),at:'2026-10-17'}));
const PAGES=['/sase','/zero-trust','/pricing','/case-studies/bank','/webinars','/contact-sales'];const adobeWeb=[];
for(const c of contacts){const n=c.accountId==='A141'?(c.id==='C1301'?5:c.id==='C1303'?3:1):Math.floor(r2()*2);for(let j=0;j<n;j++)adobeWeb.push({contactId:c.id,accountId:c.accountId,source:'Adobe Analytics (mock)',page:c.id==='C1301'&&j<2?'/pricing':pick2(PAGES),at:'2026-10-'+String(1+Math.floor(r2()*17)).padStart(2,'0')});}
// Region → Program → Campaign. Added after the original RNG so K1–K10, leads, and the activity stream stay put.
const GEO={India:'APJ',Japan:'APJ',ANZ:'APJ',ASEAN:'APJ',EMEA:'EMEA',US:'Americas'};
const CTRY={India:'India',Japan:'Japan',ANZ:'Australia',ASEAN:'Singapore',EMEA:'Germany',US:'United States'};
const RG={India:'IND',Japan:'JPN',ANZ:'ANZ',ASEAN:'ASN',EMEA:'EMA',US:'USA'};
const CHC={ABM:'ABM',Digital:'DIG',Partner:'PTR','Lead gen':'LGN',Events:'EVT'};
const META={
 K1:{stage:'Leads',pace:'on pace',nextAction:'Brief sellers on the hot CIO touches'},
 K2:{stage:'Run',pace:'on pace',nextAction:'Check ASEAN paid social against the quarter goal'},
 K3:{stage:'Report',pace:'on pace',nextAction:'Chase MDF proof of execution before 30 Oct'},
 K4:{stage:'Setup',pace:'on pace',nextAction:'Booth list is staged — review the rows with no consent'},
 K5:{stage:'Follow-up',pace:'on pace',nextAction:'Post-event follow-up is drafted — needs your OK to send'},
 K6:{stage:'Leads',pace:'on pace',nextAction:'Hand the warm Japan accounts to Yui'},
 K7:{stage:'Setup',pace:'behind',nextAction:'Campaign code is missing in CRM — I can create it'},
 K8:{stage:'Run',pace:'on pace',nextAction:'Partner co-marketing is live — watch the MDF claim'},
 K9:{stage:'Invite',pace:'on pace',nextAction:'Assessment offer is pacing — no action unless replies drop'},
 K10:{stage:'Invite',pace:'behind',nextAction:'Registrations are behind pace — the reminder is scheduled'}};
const EXTRA=[
 ['K11','ABM','EMEA Enterprise 12','EMEA','Germany',160000,0.71,'behind','Leads','Three accounts went quiet after the first touch — draft the follow-up',18,410000,24000,6.1,'Srisha R.'],
 ['K12','Digital','DACH SASE Always-on','EMEA','Germany',78000,0.74,'on pace','Run','Creative is live — check cost per MQL on Friday',22,190000,0,4.4,'Lena Ward'],
 ['K13','Events','Paris Campus Roundtable','EMEA','France',92000,0.68,'on pace','Invite','Venue is held — send the opted-in CIO list',9,80000,0,3.2,'Lena Ward'],
 ['K14','Partner','UK Reseller MDF Sprint','EMEA','United Kingdom',110000,0.66,'behind','Run','Two partners have not sent proof of execution',11,140000,0,3.6,'Srisha R.'],
 ['K15','Lead gen','EMEA Assessment Offer','EMEA','Germany',44000,0.8,'on pace','Leads','Offer is ahead of the MQL goal — leave it running',31,210000,18000,5.4,'Lena Ward'],
 ['K16','ABM','UK Top-15 Financial','EMEA','United Kingdom',145000,0.7,'on pace','Leads','Four accounts are in buying stage — brief the AE',14,520000,60000,5.8,'Srisha R.'],
 ['K17','Digital','France Paid Social Q2','EMEA','France',69000,0.77,'behind','Run','Spend is fine, pipeline is behind the goal — pause the weak ad set',16,90000,0,4.2,'Lena Ward'],
 ['K18','Events','Amsterdam Secure Access Day','EMEA','Netherlands',98000,0.67,'on pace','Setup','Hold the venue line and confirm the agency PM',4,40000,0,3.4,'Srisha R.'],
 ['K19','ABM','US Strategic 20','US','United States',175000,0.73,'on pace','Leads','Pipeline is ahead — ask the AE which five accounts to double down on',20,890000,120000,6.4,'Jill Park'],
 ['K20','Digital','Americas Hybrid Work Search','US','United States',84000,0.76,'on pace','Run','Search is on pace — no change this week',27,260000,20000,4.6,'Jill Park'],
 ['K21','Events','Chicago CIO Salon','US','United States',96000,0.66,'behind','Invite','Registrations are light versus the room we booked',7,55000,0,3.1,'Noah Brooks'],
 ['K22','Partner','Canada Co-sell Play','US','Canada',72000,0.7,'on pace','Run','Co-sell list is with the partner — wait on their seller notes',8,160000,0,4.0,'Jill Park'],
 ['K23','Lead gen','US Network Assessment','US','United States',39000,0.82,'on pace','Report','Quarter readout is ready for you to skim',34,240000,40000,6.0,'Noah Brooks'],
 ['K24','ABM','Brazil Top Accounts','US','Brazil',128000,0.69,'behind','Leads','Local events landed, pipeline has not — plan a seller workshop',12,150000,0,4.8,'Jill Park'],
 ['K25','Events','NYC Security Breakfast','US','United States',88000,0.72,'on pace','Follow-up','Breakfast ran yesterday — follow-up draft is waiting',15,110000,0,3.5,'Noah Brooks'],
 ['K26','Digital','LATAM Retargeting','US','Mexico',56000,0.75,'on pace','Run','Retargeting is cheap and on pace',19,130000,0,4.3,'Jill Park'],
 ['K27','ABM','ASEAN Top-10 Banks','ASEAN','Singapore',150000,0.7,'on pace','Leads','Two banks opened the architecture note — loop Daniel in',13,480000,0,5.5,'Daniel Tan'],
 ['K28','Digital','India SASE Always-on','India','India',66000,0.78,'on pace','Run','Always-on is funding itself — leave the budget',29,220000,15000,4.7,'Srisha R.'],
 ['K29','Events','Tokyo Executive Breakfast','Japan','Japan',74000,0.67,'on pace','Invite','Sakura Gate is holding the room — invite the opted-in list',6,30000,0,3.3,'Yui Mori'],
 ['K30','Partner','India MDF Wave 2','India','India',99000,0.71,'on pace','Run','Claims are in — one proof package still missing',10,175000,0,3.8,'Dev Rao'],
 ['K31','Lead gen','ANZ Assessment Blitz','ANZ','Australia',37000,0.84,'behind','Leads','Clicks are up, MQLs are behind — rewrite the offer line',21,70000,0,4.1,'Amelia Clarke'],
 ['K32','Events','Singapore Architecture Workshop','ASEAN','Singapore',108000,0.68,'on pace','Setup','Workshop date is set — SOW is with the agency',5,45000,0,3.6,'Daniel Tan']];
for(const row of EXTRA){const [id,channel,name,region,country,budget,ratio,pace,stage,nextAction,leadCount,pipeline,bookings,goalX,owner]=row;
 campaigns.push({id,channel,program:channel,name,region,country,geo:GEO[region],budget,spend:Math.round(budget*ratio),code:`FY27Q2-${RG[region]}-${CHC[channel]}-${id.slice(1).padStart(4,'0')}`,status:'Live',owner,pace,stage,nextAction,leadCount,mqls:Math.max(3,Math.round(leadCount*0.62)),pipeline,bookings,goal:Math.round(budget*goalX),quarter:'FY27Q2',sfdcId:'701NW0000'+id.slice(1).padStart(5,'0')+'AA'});}
for(const k of campaigns){const m=META[k.id]||{};k.program=k.program||k.channel;k.geo=k.geo||GEO[k.region]||'APJ';k.country=k.country||CTRY[k.region]||k.region;k.quarter=k.quarter||'FY27Q2';k.stage=k.stage||m.stage||'Run';k.pace=k.pace||m.pace||'on pace';k.nextAction=k.nextAction||m.nextAction||'Watch pipeline against the quarter goal';k.sfdcId=k.sfdcId||('701NW0000'+String(k.id.replace(/\D/g,'')).padStart(5,'0')+'AA');
 if(k.leadCount==null){const ls=leads.filter(l=>l.campaignId===k.id);k.leadCount=ls.length;k.mqls=ls.filter(l=>['MQL','SQL','Opportunity','Won'].includes(l.stage)).length;k.pipeline=ls.reduce((s,l)=>s+(l.pipeline||0),0);k.bookings=Math.round((k.pipeline||0)*(k.stage==='Report'?0.16:0.04));}
 k.goal=k.goal||Math.max(k.pipeline?Math.round(k.pipeline/0.62):0,Math.round(k.budget*4));k.needsApproval=false;if(!k.consent){const n=58+(k.id.charCodeAt(k.id.length-1)*3)%24;k.consent={opted_in:n,unknown:16,opted_out:100-n-16};}}
for(const k of campaigns)if(!threads.some(t=>t.refId===k.id))threads.push({id:'T-'+k.id,type:'campaign',refId:k.id,title:k.name,messages:[{who:'Srisha R.',at:'2026-10-12T09:00:00Z',text:`Kick-off: ${k.name} (${k.program}, ${k.geo}). Budget $${k.budget.toLocaleString()}.`}]});
const regionBook=[{id:'APJ',name:'APJ',countries:['India','Japan','Australia','New Zealand','Singapore','Indonesia','Malaysia','Thailand']},{id:'EMEA',name:'EMEA',countries:['United Kingdom','Germany','France','Netherlands','United Arab Emirates']},{id:'Americas',name:'Americas',countries:['United States','Canada','Brazil','Mexico']}];
const programs=[{id:'ABM',name:'ABM',budget:1400000},{id:'Digital',name:'Digital',budget:820000},{id:'Events',name:'Events',budget:980000},{id:'Partner',name:'Partner',budget:640000},{id:'Lead gen',name:'Lead gen',budget:380000}];
const lifecycleDraft={id:'LC-DEMO',step:'budget',name:'Frankfurt Zero Trust Executive Dinner',fields:{campaign_name:'Frankfurt Zero Trust Executive Dinner',geo:'EMEA',region:'EMEA',country:'Germany',program:'Events',channel:'Events',product:'zero trust',start_date:'2026-11-19',end_date:'2026-11-19',city:'Frankfurt',city_venue:'Frankfurt',audience:'CIOs and CISOs at 25 target accounts',goal:'25 target accounts',budget:168000,capacity:40,owner:'Srisha R.'}};
const db={company:brandCompany(),limits:{approvalUSD:150000},regions:regionBook,programs,lifecycleDraft,accounts,contacts,campaigns,leads,mdf,events,budgets:[],sows:[],segments:[],emails:[],outbox:[],sequences:[],uploads:[],crmSync:[],threads,activities,opps,syncLog,sellers,crm:{tasks:[],campaignMembers:[],leadScores:[]},notifications:[],intent6s,adobeWeb};
fs.writeFileSync(__dirname+'/data.seed.json',JSON.stringify(db));fs.writeFileSync(__dirname+'/data.json',JSON.stringify(db));
console.log('seeded',accounts.length,'accounts',contacts.length,'contacts',leads.length,'leads');
