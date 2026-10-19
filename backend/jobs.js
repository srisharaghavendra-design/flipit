// The four jobs a field marketer actually does: budget, SOW, campaign code, list upload.
// Fictional Northwind data only. Nothing here is a second system of record — it edits the one lifecycle.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const PROGRAMS=['ABM','Digital','Events','Partner','Lead gen'];
const TYPES=['Executive event','Dinner','Roundtable','Summit','Webinar','ABM play','Digital campaign','Partner event','Lead gen'];
const TAX={Germany:{name:'VAT',rate:0.19},France:{name:'VAT',rate:0.20},'United Kingdom':{name:'VAT',rate:0.20},Netherlands:{name:'VAT',rate:0.21},India:{name:'GST',rate:0.18},Singapore:{name:'GST',rate:0.09},Australia:{name:'GST',rate:0.10},'New Zealand':{name:'GST',rate:0.15},Japan:{name:'Consumption tax',rate:0.10},'United States':{name:'Sales tax',rate:0},Canada:{name:'GST',rate:0.05}};
const CODE_RE=/^FY\d{2}Q[1-4]-(IND|JPN|ANZ|ASN|EMA|USA|GLB)-(ABM|DIG|PTR|LGN|EVT|GEN)-\d{4}$/;
const RG={India:'IND',Japan:'JPN',ANZ:'ANZ',ASEAN:'ASN',EMEA:'EMA',US:'USA',Americas:'USA'};
const CH={ABM:'ABM',Digital:'DIG',Partner:'PTR','Lead gen':'LGN',Events:'EVT'};
const seed=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','data.seed.json')));
const countries=()=>[...new Set(seed().regions.flatMap(r=>r.countries))];
function geoOf(country){const hit=(seed().regions||[]).find(r=>(r.countries||[]).includes(country));return hit?hit.id:''}
function quarterOf(date){if(!date)return'';const d=new Date(String(date).slice(0,10)+'T00:00:00Z');if(Number.isNaN(d.getTime()))return'';const m=d.getUTCMonth(),y=d.getUTCFullYear();const fy=(m>=7?y+1:y)%100;const q=Math.floor(((m-7+12)%12)/3)+1;return`FY${String(fy).padStart(2,'0')}Q${q}`}
const ROSTER={
 Germany:{name:'Rhine & Co Events',legal:'Rhine & Co Events GmbH',email:'ada.klein@rhine-events.example',pm:'Ada Klein'},
 'United States':{name:'Harbor North Events',legal:'Harbor North Events LLC',email:'jordan.hale@harbor-north.example',pm:'Jordan Hale'},
 India:{name:'Lotus Lane Experiences',legal:'Lotus Lane Experiences Pvt Ltd',email:'meera.iyer@lotus-lane.example',pm:'Meera Iyer'},
 Singapore:{name:'Bright Harbour Events',legal:'Bright Harbour Events Pte Ltd',email:'daniel.tan@bright-harbour.example',pm:'Daniel Tan'},
 Australia:{name:'Bright Harbour Events',legal:'Bright Harbour Events Pty Ltd',email:'jack.moore@bright-harbour.example',pm:'Jack Moore'},
 Japan:{name:'Sakura Gate Agency',legal:'Sakura Gate KK',email:'yuki.sato@sakura-gate.example',pm:'Yuki Sato'}};
function agencyOf(f){const hit=ROSTER[f&&f.country]||{name:'Northwind Preferred Agency',legal:'Northwind Preferred Agency',email:'desk@agencies.northwind.example',pm:'Agency desk'};if(f&&f.vendor)return{...hit,name:f.vendor,legal:f.vendor};return hit}
function money(n,cur){return require('./money').format(n,cur||'USD')}
function amountOf(v){const s=String(v??'').trim();if(!s)return null;const p=require('./money').parseMoney(s);if(p)return p.amount;const n=Number(s.replace(/[,\s]/g,'').replace(/k$/i,'000'));return Number.isFinite(n)?n:NaN}
function agencyFor(f){return agencyOf(f).name}
function budgetForm(f){f=f||{};
 const quarter=f.quarter||quarterOf(f.start_date);
 const items=[
  {key:'campaign_name',label:'Campaign name',value:f.campaign_name||'',source:'the brief'},
  {key:'product',label:'Product / architecture',value:f.product||'',source:'the brief'},
  {key:'country',label:'Country',value:f.country||'',source:'the brief'},
  {key:'city',label:'City',value:f.city||f.city_venue||'',source:'the brief'},
  {key:'start_date',label:'Start date',value:(f.start_date||'').slice(0,10),source:'calendar hold',type:'date'},
  {key:'end_date',label:'End date',value:(f.end_date||f.start_date||'').slice(0,10),source:'calendar hold',type:'date'},
  {key:'vendor',label:'Agency',value:agencyFor(f),source:f.vendor?'the brief':'agency roster'},
  {key:'campaign_type',label:'Campaign type',value:f.campaign_type||(f.program==='Events'?'Executive event':f.program||''),source:'program plan'},
  {key:'budget',label:'Amount',value:f.budget!=null&&f.budget!==''?String(f.budget):'',source:'the brief',type:'money'},
  {key:'currency',label:'Currency',value:f.currency||({Germany:'EUR',France:'EUR','United Kingdom':'GBP',India:'INR',Singapore:'SGD','United States':'USD',Australia:'AUD',Japan:'JPY'}[f.country])||'USD',source:f.currency?'the brief':'country table'},
  {key:'quarter',label:'Quarter',value:quarter,source:'fiscal calendar (August start)'},
  {key:'program',label:'Program',value:f.program||f.channel||'',source:'program plan'},
  {key:'owner',label:'Owner',value:f.owner||'Srisha R.',source:'your profile'}];
 const errors=validateBudget(Object.fromEntries(items.map(i=>[i.key,i.value])));
 return{items,errors,ok:!errors.length,choices:{country:countries(),program:PROGRAMS,campaign_type:TYPES,quarter:quarterChoices(quarter)}}}
function quarterChoices(current){const out=[];for(const y of [26,27,28])for(const q of [1,2,3,4])out.push(`FY${y}Q${q}`);if(current&&!out.includes(current))out.unshift(current);return out}
function validateBudget(v){const errors=[];const need=[['campaign_name','Campaign name'],['product','Product / architecture'],['country','Country'],['city','City'],['start_date','Start date'],['vendor','Agency'],['campaign_type','Campaign type'],['budget','Amount'],['currency','Currency'],['quarter','Quarter'],['program','Program'],['owner','Owner']];
 for(const[k,label]of need)if(!String(v[k]??'').trim())errors.push(label+' is required.');
 if(v.country&&!countries().includes(v.country))errors.push(v.country+' is not a Northwind country.');
 if(v.program&&!PROGRAMS.includes(v.program))errors.push('Program must be ABM, Digital, Events, Partner, or Lead gen.');
 if(v.campaign_type&&!TYPES.includes(v.campaign_type))errors.push('Campaign type is not one of the Airtable types.');
 if(v.quarter&&!/^FY\d{2}Q[1-4]$/.test(v.quarter))errors.push('Quarter looks like FY27Q2.');
 if(v.currency&&!/^[A-Z]{3}$/.test(String(v.currency)))errors.push('Currency is a 3-letter code such as USD or EUR.');
 const amt=amountOf(v.budget);if(String(v.budget??'').trim()&&(amt==null||Number.isNaN(amt)||amt<=0))errors.push('Amount has to be a number greater than zero.');
 const iso=/^\d{4}-\d{2}-\d{2}$/;
 if(v.start_date&&!iso.test(v.start_date))errors.push('Start date has to be a real date.');
 if(v.end_date&&!iso.test(v.end_date))errors.push('End date has to be a real date.');
 if(iso.test(v.start_date||'')&&iso.test(v.end_date||'')&&v.end_date<v.start_date)errors.push('End date is before the start date.');
 const expect=quarterOf(v.start_date);if(expect&&v.quarter&&v.quarter!==expect)errors.push(`Quarter should be ${expect} for a start date of ${v.start_date}.`);
 return errors}
function writeBudget(row,fields){const form=budgetForm({...row.fields,...fields,budget:fields.budget!=null?fields.budget:row.fields.budget});if(!form.ok)return form;
 const prev=row.budget||{};const old=+row.fields.budget||prev.total||0;
 for(const item of form.items){const v=item.value;if(item.key==='budget')row.fields.budget=amountOf(v);else row.fields[item.key]=v}
 if(row.fields.city)row.fields.city_venue=row.fields.city;
 if(row.fields.program)row.fields.channel=row.fields.program;
 if(fields.currency)row.fields.currency=String(fields.currency).toUpperCase();
 const geo=geoOf(row.fields.country);if(geo)row.fields.geo=geo;
 const next=require('./lifecycle').suggest(row.fields);
 const amountChanged=+row.fields.budget!==old;
 if(!amountChanged&&prev.status){next.status=prev.status;next.approver=prev.approver;next.approvedAt=prev.approvedAt;next.submittedAt=prev.submittedAt}
 else if(amountChanged&&(prev.status==='approved'||prev.status==='pending_approval'))next.status='draft';
 row.budget=next;return form}
function taxOf(country,amount,currency){const t=TAX[country]||{name:'Tax',rate:0};const base=Math.round(+amount||0);const tax=Math.round(base*t.rate);const cur=currency||({Germany:'EUR',France:'EUR','United Kingdom':'GBP',India:'INR',Singapore:'SGD',Australia:'AUD',Japan:'JPY','United States':'USD'}[country])||'USD';
 return{name:t.name,rate:t.rate,rateLabel:t.rate?Math.round(t.rate*1000)/10+'%':'none',base,tax,total:base+tax,currency:cur,note:t.rate?`${t.name} ${Math.round(t.rate*1000)/10}% on ${money(base,cur)} is ${money(tax,cur)}. Total with tax ${money(base+tax,cur)}. The budget amount is before tax.`:`No GST or VAT is added for ${country||'this country'}.`}}
function milestonesOf(amount,country){const base=Math.round(+amount||0);const split=country==='Japan'?[30,70]:[50,50];
 return[{name:'Signature',pct:split[0],amount:Math.round(base*split[0]/100),when:'On signature'},{name:'Delivery',pct:split[1],amount:base-Math.round(base*split[0]/100),when:'When the attendee list or the campaign report is delivered'}]}
function signRoute(amount,country,currency){const usd=require('./money').toUSD(+amount||0,currency||'USD')||0;const steps=[{role:'Our PM checks the draft',who:'Srisha R.',required:true}];
 if(usd>150000){steps.push({role:'Director approval',who:'Chris M.',required:true});steps.push({role:'Procurement',who:'Procurement',required:true})}
 else steps.push({role:'Field marketing manager signs',who:'Srisha R.',required:true});
 if(country==='Japan')steps.push({role:'Country lead co-sign',who:'Japan country lead',required:true});
 return{steps,signer:usd>150000?'Chris M.':'Srisha R.',usd,note:usd>150000?'Over $150,000 USD. Chris M. signs, then procurement.':'At or under $150,000 USD. You can sign this.'}}
function unzipEntry(buf,want){let off=0;while(off+30<buf.length){if(buf.readUInt32LE(off)!==0x04034b50){off++;continue}
  const method=buf.readUInt16LE(off+8),comp=buf.readUInt32LE(off+18),nameLen=buf.readUInt16LE(off+26),extra=buf.readUInt16LE(off+28);
  const name=buf.slice(off+30,off+30+nameLen).toString();const start=off+30+nameLen+extra;
  if(comp>8_000_000)throw new Error('That file is too large to read.');
  const data=buf.slice(start,start+comp);if(name===want){if(method===0)return data;if(method===8)return zlib.inflateRawSync(data,{maxOutputLength:2_000_000});throw new Error('Could not read the document body.')}
  off=start+comp}return null}
function pdfText(buf){const s=buf.toString('latin1');const out=[];const re=/\(((?:\\\)|[^)])*)\)\s*Tj/g;let m;while((m=re.exec(s)))out.push(m[1].replace(/\\([()\\])/g,'$1'));return out.join('\n')}
function extractSow(name,buf){const base=path.basename(String(name||'sow.txt')).replace(/[^\w.\- ()]/g,'').slice(0,80)||'sow.txt';
  if(!buf||!buf.length)throw new Error('The file was empty.');if(buf.length>1_200_000)throw new Error('Keep the SOW under 1.2 MB.');
  let text='';const lower=base.toLowerCase();
  if(lower.endsWith('.docx')){const xml=unzipEntry(buf,'word/document.xml');if(!xml)throw new Error('That DOCX has no document body.');text=xml.toString('utf8').replace(/<w:p[ >]/g,'\n').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
  else if(lower.endsWith('.pdf'))text=pdfText(buf);
  else if(/\.(txt|csv|md)$/.test(lower))text=buf.toString('utf8');
  else throw new Error('Upload a PDF, DOCX, or text file.');
  text=text.replace(/\s+\n/g,'\n').slice(0,20000);
  const grab=(...labels)=>{for(const label of labels){const m=text.match(new RegExp('(?:^|\\n)\\s*'+label+'\\s*[:\\-]\\s*([^\\n]+)', 'i'));if(m)return m[1].trim().slice(0,240)}return''};
  const taxLine=(text.match(/\b(GST|VAT|consumption tax)\b[^.\n]{0,40}/i)||[])[0]||'';
  const rate=taxLine.match(/(\d+(?:\.\d+)?)\s*%/);
  return{file:base,source:'extracted from '+base,text:text.slice(0,1500),currency:(grab('currency')||'').replace(/[^A-Za-z]/g,'').toUpperCase().slice(0,3),
   venue:grab('venue'),city:grab('city'),agency:grab('agency','agency legal name','legal name'),ourPm:grab('our pm','client pm','northwind pm'),agencyPm:grab('agency pm','vendor pm'),
   amount:grab('not-to-exceed','amount','budget','fee'),tax:taxLine.trim(),taxRate:rate?rate[1]+'%':'',signing:grab('signing authority'),start:grab('start date','event date'),end:grab('end date'),milestone:grab('payment milestones','milestones','milestone')}}
function applyExtract(row,ex){if(!row.sow)throw new Error('Send the SOW request first.');
 const set=(field,value)=>{if(!value)return;let f=row.sow.fields.find(x=>x.field.toLowerCase()===field.toLowerCase());if(!f){f={field,value:'',source:'',confidence:'extracted'};row.sow.fields.push(f)}f.value=value;f.source=ex.source;f.confidence='extracted'};
 if(ex.city){set('City',ex.city);if(!row.fields.city)row.fields.city=ex.city}
 if(ex.venue){set('Venue',ex.venue);row.fields.venue=ex.venue}
 if(ex.agency){set('Agency',ex.agency);row.fields.vendor=ex.agency}
 if(ex.ourPm){set('Our PM',ex.ourPm);row.fields.client_pm=ex.ourPm}
 if(ex.agencyPm){set('Agency PM',ex.agencyPm);row.fields.agency_pm=ex.agencyPm}
 if(ex.currency)set('Currency',ex.currency);
 if(ex.amount)set('Not-to-exceed',ex.amount);
 if(ex.tax)set('Tax (GST/VAT)',ex.tax);
 if(ex.signing)set('Signing authority',ex.signing);
 if(ex.milestone)set('Payment milestones',ex.milestone);
 const country=row.fields.country,expect=(TAX[country]||{}).name;
 row.sow.extracted=ex;row.sow.extractNote=ex.taxRate&&expect?`Read ${ex.tax} from ${ex.file}. The country table for ${country} uses ${expect}.`:`Read ${ex.file}.`;
 row.sow.html=require('./lifecycle').sowHtml(row)}
function engineDb(readonly){const Database=require('better-sqlite3');return new Database(path.join(require('./lib').DATA,'engine.db'),{readonly:!!readonly,fileMustExist:true})}
function codeTaken(code,exceptId){let db;try{db=engineDb(true)}catch(e){return null}try{const row=db.prepare('SELECT id,name,code FROM campaigns WHERE code=?').get(code);if(!row||row.id===exceptId)return null;return row}finally{db.close()}}
function codeJob(row){const f=row.fields||{};const region=RG[f.region]||RG[f.geo]||'GLB';const channel=CH[f.program||f.channel]||'GEN';const q=f.quarter||quarterOf(f.start_date)||'FY27Q2';
 const issued=row.codes&&row.codes.campaign_code;const clash=issued?codeTaken(issued,row.codes.campaign_id):null;
 return{pattern:'FY{quarter}-{region}-{channel}-{number}',legend:'Region IND JPN ANZ ASN EMA USA. Channel ABM DIG EVT PTR LGN. Example '+q+'-'+region+'-'+channel+'-0001.',
  code:issued||'',proposed:q+'-'+region+'-'+channel+'-####',editable:!!issued,duplicate:clash?`Already used by ${clash.name} (${clash.id}).`:'',
  links:row.codes?{ban:row.codes.ban_id,cc:row.codes.cc_id,sfdc:row.codes.sfdc_campaign_id,event:row.codes.event_id,campaign:row.codes.campaign_id}:null}}
function saveCode(row,code){code=String(code||'').trim().toUpperCase();if(!row.codes)return{error:'The code is issued after the SOW is answered.'};
 if(!CODE_RE.test(code))return{error:'Use FY27Q2-EMA-EVT-0001. Quarter, region, channel, then four digits.'};
 const clash=codeTaken(code,row.codes.campaign_id);if(clash)return{error:`${code} is already used by ${clash.name}. Pick another number.`};
 let db;try{db=engineDb(false);db.prepare('UPDATE campaigns SET code=?,fy_quarter=?,updated_at=? WHERE id=?').run(code,code.slice(0,6),new Date().toISOString(),row.codes.campaign_id)}catch(e){return{error:e.message.includes('UNIQUE')?'That code is already in use.':e.message}}finally{if(db)db.close()}
 const qtr=code.slice(0,6);row.codes.campaign_code=code;row.codes.fiscal_quarter=qtr;row.codes.cc_id=row.codes.cc_id||row.fields.cost_center||'CC-4408';row.codes.ban_id=require('./lifecycle').issueBan(row.id,qtr,row.codes.cc_id);row.codes.sfdc_note='Demo id minted in this app. Salesforce did not return it.';
 return{ok:true,code}}
function consentOf(emails){const out={};let db;try{db=engineDb(true)}catch(e){return out}
 const stmt=db.prepare("SELECT c.email,c.region,COALESCE((SELECT status FROM consent_ledger cl WHERE cl.contact_id=c.id AND channel='email' ORDER BY id DESC LIMIT 1),'unknown') status FROM contacts c WHERE lower(c.email)=lower(?)");
 try{for(const e of emails){const r=stmt.get(e);out[e.toLowerCase()]=r?{known:true,region:r.region,status:r.status}:{known:false,status:'unknown'}}}finally{db.close()}return out}
function holdReason(email,info,country){if(!info||!info.known)return'not in the contact book — consent unknown, held out';
 if(info.status==='opted_out')return`opted out${info.region?' · '+info.region:''} — do not upload`;
 if(info.status==='opted_in')return'';
 if(info.region==='US'||country==='United States')return'';
 return`no consent on record${info.region?' · '+info.region:''} — held out`}
async function previewUpload(row,{name,buf,csv,overrides}){
 if(csv&&!buf)buf=Buffer.from(String(csv),'utf8');
 if(!buf||!buf.length)throw new Error('Choose an Excel or CSV file.');
 if(buf.length>1_200_000)throw new Error('Keep the list under 1.2 MB.');
 const file=path.basename(String(name||'list.csv')).replace(/[^\w.\- ()]/g,'').slice(0,80)||'list.csv';
 const mapped=await require('./mapper').map(file,buf,{campaignId:row.codes&&row.codes.sfdc_campaign_id||'',defaultCountry:row.fields.country,leadSource:row.fields.program||'Event',overrides:overrides||null});
 if(mapped.stats.inputRows>5000)throw new Error('That list has more than 5,000 rows. Split it.');
 const book=consentOf(mapped.rows.map(r=>r.Email));
 const held=[],clean=[];
 for(const r of mapped.rows){const why=holdReason(r.Email,book[r.Email.toLowerCase()],r.Country);if(why)held.push({email:r.Email,name:(r.FirstName+' '+r.LastName).trim(),issue:why,owner:r._owner||'',ownerReason:r._ownerReason||''});else clean.push(r)}
 const text=buf.toString('utf8');const emails=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(e=>e.toLowerCase());const count={};for(const e of emails)count[e]=(count[e]||0)+1;
 const duplicates=Object.entries(count).filter(([,n])=>n>1).map(([email,n])=>({email,issue:`duplicate email on ${n} rows — one kept`}));
 const invalid=(mapped.quarantined||[]).slice(0,30).map(q=>({email:'',issue:q.reason||'invalid row'}));
 const report={input:mapped.stats.inputRows,ready:clean.length,duplicates:duplicates.length,invalid:invalid.length,consentHeld:held.length,formula:(mapped.quarantined||[]).filter(q=>/formula/i.test(q.reason||'')).length,owners:clean.filter(r=>r.OwnerId).length,unknownOwners:clean.filter(r=>r._unknown).length,rows:[...duplicates.slice(0,15),...invalid,...held.slice(0,40)]};
 const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
 const errorCsv='issue,email,detail\n'+report.rows.map(r=>[esc(r.issue),esc(r.email),esc(r.name||'')].join(',')).join('\n')+'\n';
 const TEMPLATE=mapped.template;const csvOut=TEMPLATE.join(',')+'\n'+clean.map(r=>TEMPLATE.map(k=>esc(r[k])).join(',')).join('\n')+(clean.length?'\n':'');
 return{file,headerRow:mapped.headerRow,skippedRowsAbove:mapped.skippedRowsAbove,mapping:mapped.mapping.map(m=>({column:m.column,index:m.index,target:m.target,confidence:m.confidence,method:m.method})),
  preview:clean.slice(0,12).map(r=>({name:(r.FirstName+' '+r.LastName).trim(),email:r.Email,company:r.Company,country:r.Country,owner:r._owner||'unassigned',ownerWhy:r._ownerReason||'no territory match',campaign:r.CampaignId})),
  stats:mapped.stats,report,errorCsv,csv:csvOut,confirmed:false,targets:TEMPLATE,needsConfirm:true}}
function sowDiff(row){const ex=row.sow&&row.sow.extracted;if(!ex)return[];const f=row.fields||{};const amount=row.budget&&row.budget.total||f.budget||'';const cur=f.currency||'';const tax=taxOf(f.country,amount);
 const pairs=[['Agency legal name',ex.agency,f.vendor],['Venue',ex.venue,f.venue],['City',ex.city,f.city],['Dates',[ex.start,ex.end].filter(Boolean).join(' to '),[f.start_date,f.end_date].filter(Boolean).join(' to ')],['Currency',ex.currency,cur],['Amount',ex.amount,amount?require('./money').format(amount,cur||'USD'):''],['Tax',ex.tax,tax.note],['Signing authority',ex.signing,(row.sow.signOffRoute&&row.sow.signOffRoute.signer)||''],['Our PM',ex.ourPm,f.client_pm],['Agency PM',ex.agencyPm,f.agency_pm],['Milestones',ex.milestone,milestonesOf(amount,f.country).map(m=>m.pct+'% '+m.name).join(', ')]];
 return pairs.map(([field,extracted,approved])=>{const a=String(extracted||'').trim(),b=String(approved||'').trim();return{field,extracted:a,approved:b,match:!!a&&!!b&&(a.toLowerCase()===b.toLowerCase()||b.toLowerCase().includes(a.toLowerCase())||a.toLowerCase().includes(b.toLowerCase()))}})}
function sowJob(row){const f=row.fields||{};const amount=row.budget&&row.budget.total||f.budget||0;const cur=f.currency||'USD';const tax=taxOf(f.country,amount);
 return{ready:!!row.sow,status:row.sow?row.sow.status:'not requested',request:row.sowRequest||null,agency:agencyOf(f),tax,milestones:milestonesOf(amount,f.country),route:signRoute(amount,f.country,cur),diff:sowDiff(row),
  ourPm:f.client_pm||'',agencyPm:f.agency_pm||'',fields:row.sow?row.sow.fields:[],questions:row.sow?row.sow.questions:[],answers:row.sow?row.sow.answers||{}:{},extracted:row.sow&&row.sow.extracted||null,extractNote:row.sow&&row.sow.extractNote||'',signedBy:row.sow&&row.sow.signedBy||null,selfCheck:row.sow&&row.sow.selfCheck||null}}
function pack(row){const upload=row.setup&&row.setup.uploadPreview||null;return{budget:budgetForm(row.fields),sow:sowJob(row),code:codeJob(row),upload:upload?{...upload,csv:undefined,csvReady:!!(upload.csv)}:null}}
module.exports={budgetForm,validateBudget,writeBudget,taxOf,milestonesOf,signRoute,extractSow,applyExtract,codeJob,saveCode,previewUpload,pack,quarterOf,CODE_RE,agencyOf,sowDiff,ROSTER};
