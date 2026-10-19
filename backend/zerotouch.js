// Zero-touch budget + SOW: @mops drafts, the human only reviews. All data fictional (Northwind Networks).
const{call}=require('./lib');const core=require('./core');
core.db.exec('CREATE TABLE IF NOT EXISTS zt_budgets(id TEXT PRIMARY KEY,quarter TEXT,draft TEXT,status TEXT,decision TEXT,ms INT,at TEXT,decided_at TEXT)');
const DATA={
  pipelineGoal:{'FY27Q2':4200000,'FY27Q3':4600000},// fictional APJ field-marketing sourced-pipeline goal
  calendar:[{date:'2026-11-12',name:'ANZ Security Summit (Sydney)',channel:'Events',country:'Australia'},{date:'2026-11-26',name:'Northwind Partner Day Bengaluru',channel:'Partner',country:'India'},{date:'2026-12-03',name:'Tokyo CIO roundtable',channel:'Events',country:'Japan'},{date:'2027-01-14',name:'ASEAN SASE webinar series',channel:'Digital',country:'Singapore'}],
  rateCards:{'Bright Harbour Events':{countries:['Australia','New Zealand','Singapore'],venuePerHead:95,fnbPerHead:70,avFlat:9000,feePct:12},
    'Lotus Lane Experiences':{countries:['India','Singapore','Malaysia'],venuePerHead:38,fnbPerHead:28,avFlat:4500,feePct:10},
    'Sakura Gate Agency':{countries:['Japan'],venuePerHead:120,fnbPerHead:85,avFlat:11000,feePct:14}},
  pastSows:[{id:'SOW-H1',vendor:'Bright Harbour Events',country:'Australia',channel:'Events',capacity:100,total:61000,paymentTerms:'50/50',listSlaDays:2},
    {id:'SOW-H2',vendor:'Lotus Lane Experiences',country:'India',channel:'Events',capacity:150,total:24500,paymentTerms:'50/50',listSlaDays:2},
    {id:'SOW-H3',vendor:'Sakura Gate Agency',country:'Japan',channel:'Events',capacity:40,total:31000,paymentTerms:'30/70',listSlaDays:3},
    {id:'SOW-H4',vendor:'Bright Harbour Events',country:'Singapore',channel:'Events',capacity:80,total:47000,paymentTerms:'50/50',listSlaDays:2}],
  vendorHistory:{'Bright Harbour Events':{events:7,onTimeListPct:100,avgOverrunPct:3},'Lotus Lane Experiences':{events:5,onTimeListPct:80,avgOverrunPct:6},'Sakura Gate Agency':{events:3,onTimeListPct:100,avgOverrunPct:9}}};
const nextQ=()=>'FY27Q2';
async function budgetDraft(quarter){const t0=Date.now();quarter=quarter||nextQ();
  const rows=(await call('warehouse','/sql',{body:{sql:"SELECT channel,count(*) n,sum(budget) b,sum(sourced_pipeline) p FROM marts.campaign_performance GROUP BY 1"}},'zt')).rows.map(r=>({channel:r.channel,n:+r.n,spend:+r.b,pipe:+r.p,roi:+r.p/+r.b}));
  const goal=DATA.pipelineGoal[quarter];const cal=DATA.calendar;
  // weight = ROI x (1 + 0.5 per calendar item in that channel); spend needed per channel = share of goal / ROI, with a 15% safety margin
  const w=rows.map(r=>({...r,cal:cal.filter(c=>c.channel===r.channel),wt:r.roi*(1+0.5*cal.filter(c=>c.channel===r.channel).length)}));const W=w.reduce((a,r)=>a+r.wt,0);
  const lines=w.map(r=>{const pipeShare=goal*r.wt/W,amt=Math.round(pipeShare/r.roi*1.15/1000)*1000;
    return{channel:r.channel,amount:amt,expectedPipeline:Math.round(pipeShare),why:`${r.n} past campaigns returned ${r.roi.toFixed(1)}x pipeline per $ (warehouse)${r.cal.length?`; on the calendar: ${r.cal.map(c=>c.name).join(', ')}`:''}; +15% margin`}}).sort((a,b)=>b.amount-a.amount);
  const total=lines.reduce((a,l)=>a+l.amount,0);
  const draft={quarter,goal,total,blendedRoi:+(lines.reduce((a,l)=>a+l.expectedPipeline,0)/total).toFixed(2),lines,
    reasoning:[`Goal ${quarter}: $${(goal/1e6).toFixed(1)}M sourced pipeline.`,`Weighted toward channels with the best past ROI in the warehouse, boosted where the calendar already has events.`,`Each line sized to deliver its share of the goal at its historical ROI, plus a 15% margin.`],
    reviewAssumption:'human review assumed 15s: tap Approve or adjust one line'};
  const id='BUD-'+quarter+'-'+Date.now().toString(36).slice(-4).toUpperCase(),ms=Date.now()-t0;
  core.db.prepare('INSERT INTO zt_budgets VALUES(?,?,?,?,?,?,?,?)').run(id,quarter,JSON.stringify(draft),'draft',null,ms,new Date().toISOString(),null);
  return{id,ms,status:'draft',...draft}}
function decide(id,{action,adjust}){const r=core.db.prepare('SELECT * FROM zt_budgets WHERE id=?').get(id);if(!r)return null;const d=JSON.parse(r.draft);
  if(action==='adjust'&&adjust){for(const[ch,amt]of Object.entries(adjust)){const l=d.lines.find(x=>x.channel===ch);if(l)l.amount=+amt}d.total=d.lines.reduce((a,l)=>a+l.amount,0)}
  const st=action==='adjust'?'approved (adjusted)':'approved';core.db.prepare('UPDATE zt_budgets SET draft=?,status=?,decision=?,decided_at=? WHERE id=?').run(JSON.stringify(d),st,JSON.stringify({action,adjust}),new Date().toISOString(),id);return{id,status:st,...d}}
const latestBudget=()=>{const r=core.db.prepare('SELECT * FROM zt_budgets ORDER BY at DESC LIMIT 1').get();return r?{id:r.id,status:r.status,ms:r.ms,at:r.at,...JSON.parse(r.draft)}:null};
// SOW smart prefill + targeted questions (NOT zero-touch): derive what is derivable with a source per field,
// ask only the truly unknown fields in one @mops question, and require a human final review + sign-off.
core.db.exec('CREATE TABLE IF NOT EXISTS sow_state(id TEXT PRIMARY KEY,fields TEXT,questions TEXT,answers TEXT,status TEXT,signed_by TEXT,at TEXT,signed_at TEXT)');
const CURRENCY={Australia:'AUD','New Zealand':'NZD',India:'INR',Japan:'JPY',Singapore:'SGD',Malaysia:'MYR',Indonesia:'IDR',Thailand:'THB',Germany:'EUR',France:'EUR','United Kingdom':'GBP','United States':'USD'};
const SIGN=[[50000,'Field marketing manager'],[150000,'Director, field marketing'],[Infinity,'VP marketing + procurement']];// fictional threshold rules
const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
function sowPrefill(f,a={}){const F=[],Q=[];const put=(field,value,source,confidence='derived')=>F.push({field,value,source,confidence});
  let vendor=f.vendor,vsrc='typed in the intake';
  if(!vendor){const c=Object.entries(DATA.rateCards).filter(([,r])=>r.countries.includes(f.country)).sort((x,y)=>DATA.vendorHistory[y[0]].onTimeListPct-DATA.vendorHistory[x[0]].onTimeListPct||DATA.vendorHistory[y[0]].events-DATA.vendorHistory[x[0]].events);
    vendor=c[0]?.[0]||null;const h=vendor&&DATA.vendorHistory[vendor];vsrc=vendor?`preferred-vendor history: covers ${f.country}, ${h.events} past events, ${h.onTimeListPct}% lists on time`:'no preferred vendor for '+f.country}
  put('Agency',vendor||'TBC',vsrc,f.vendor?'typed':'suggested');Q.push({key:'agency_confirm',label:`Confirm agency: ${vendor||'which agency?'}`});
  put('Event dates',f.start_date+(f.end_date&&f.end_date!==f.start_date?' to '+f.end_date:''),'intake','typed');
  put('SOW start date',addDays(f.start_date,-30),'event start − 30 days (planning buffer, rule)');
  put('SOW end date',addDays(f.end_date||f.start_date,14),'event end + 14 days (attendee list + invoice buffer, rule)');
  put('City',f.city_venue||f.country,f.city_venue?'intake':'intake (country only)',f.city_venue?'typed':'derived');
  const venueBooked=f.venue;if(venueBooked)put('Venue',f.venue,'intake','typed');else{put('Venue','to confirm','not booked yet','unknown');Q.push({key:'venue',label:'Venue (or "not booked yet")'})}
  put('Currency',CURRENCY[f.country]||'USD',`country ${f.country} → currency table`);
  const amt=+f.budget||0,cur=f.currency||CURRENCY[f.country]||'USD',usd=require('./money').toUSD(amt,cur)||0,sg=SIGN.find(([lim])=>usd<=lim)[1]+(f.region==='Japan'||f.country==='Japan'?' + Japan country lead co-sign':'');
  put('Signing authority',sg,`approval-threshold rules: ${require('./money').format(amt,cur)} is about $${usd.toLocaleString('en-US')} USD`);
  put('Not-to-exceed',amt?require('./money').format(amt,cur):'TBC','intake budget','typed');
  put('Cost center',f.cost_center||'to confirm',f.cost_center?'intake':'not in the intake',f.cost_center?'typed':'unknown');if(!f.cost_center)Q.push({key:'cost_center',label:'Cost center'});
  put('Campaign code / SFDC / event ID',[a.campaign_code,a.sfdc_campaign_id,a.event_id].filter(Boolean).join(' · '),'generated by @mops');
  const past=DATA.pastSows.filter(s=>s.vendor===vendor);if(past[0]){put('Payment terms',past[0].paymentTerms,`past SOW ${past[0].id} with ${vendor}`);put('Attendee list SLA',past[0].listSlaDays+' business days',`past SOW ${past[0].id}`)}
  Q.push({key:'client_pm',label:'Our project manager (Northwind side)'},{key:'agency_pm',label:'Agency project manager (name + email)'});
  const question=`@mops SOW for ${f.campaign_name}: I need ${Q.length} things: ${Q.map((q,i)=>`(${i+1}) ${q.label}`).join('; ')}. Reply in one line.`;
  return{fields:F,questions:Q,question,derived:F.filter(x=>x.confidence==='derived').length,vendor,status:'needs answers',signOff:'required: human final review + sign-off by '+sg,reviewAssumption:'human time assumed 3–5 min (answer the question + final review + sign-off); 4 min used'}}
function sowSave(id,p){core.db.prepare('INSERT OR REPLACE INTO sow_state VALUES(?,?,?,?,?,?,?,?)').run(id,JSON.stringify(p.fields),JSON.stringify(p.questions),'{}',p.status,null,new Date().toISOString(),null)}
function sowGet(id){const r=core.db.prepare('SELECT * FROM sow_state WHERE id=?').get(id);return r&&{id,fields:JSON.parse(r.fields),questions:JSON.parse(r.questions),answers:JSON.parse(r.answers),status:r.status,signedBy:r.signed_by,signedAt:r.signed_at}}
function sowAnswer(id,answers){const s=sowGet(id);if(!s)return null;const A={...s.answers,...answers};const open=s.questions.filter(q=>!A[q.key]);
  core.db.prepare('UPDATE sow_state SET answers=?,status=? WHERE id=?').run(JSON.stringify(A),open.length?'needs answers':'ready for final review',id);return sowGet(id)}
function sowSign(id,by){const s=sowGet(id);if(!s)return null;if(s.status!=='ready for final review')return{...s,error:'answer the open questions first'};if(!by)return{...s,error:'sign-off needs a named reviewer'};
  core.db.prepare("UPDATE sow_state SET status='signed off',signed_by=?,signed_at=? WHERE id=?").run(by,new Date().toISOString(),id);return sowGet(id)}
module.exports={DATA,budgetDraft,decide,latestBudget,sowPrefill,sowSave,sowGet,sowAnswer,sowSign,list:()=>core.db.prepare('SELECT id,quarter,status,ms,at FROM zt_budgets ORDER BY at DESC LIMIT 10').all()};
