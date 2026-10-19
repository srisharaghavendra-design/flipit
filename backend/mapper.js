// Auto-map any messy event/ABM spreadsheet (xlsx or csv, any delimiter, junk rows above the header) to the SFDC upload template,
// then look up the SFDC owner ID (named account AE or territory SDR) from the CRM for every row.
const XLSX=require('xlsx');const{call}=require('./lib');
const TEMPLATE=['FirstName','LastName','Email','Company','Title','Phone','Country','CampaignId','Status','LeadSource','OwnerId'];
const SYN={FirstName:['first name','firstname','first','given name','fname','first_name','forename'],LastName:['last name','lastname','surname','family name','lname','last_name'],FullName:['full name','name','attendee name','contact name','attendee','delegate name','contact'],
 Email:['email','e-mail','email address','e-mail address','work email','business email','email id','mail','work_email','e mail address','e mail'],Company:['company','organisation','organization','account','company name','org','employer','account name','firm'],
 Title:['title','job title','designation','role','position','job role','job_title'],Phone:['phone','mobile','ph','phone number','mobile number','tel','telephone','contact number','cell'],
 Country:['country','geo','location','country/region','nation','location (city, country)','market'],Status:['attended','attended?','status','attendance','checked in','check-in','showed up','member status','scan type','lead type']};
const COUNTRIES=['India','Japan','Australia','New Zealand','Singapore','Malaysia','Indonesia','Thailand','Philippines','Vietnam','Germany','France','United Kingdom','Switzerland','Netherlands','United States','Canada'];
const ALIAS={in:'India',ind:'India',jp:'Japan',jpn:'Japan',au:'Australia',aus:'Australia',nz:'New Zealand',sg:'Singapore',sgp:'Singapore',my:'Malaysia',uk:'United Kingdom',gb:'United Kingdom',us:'United States',usa:'United States','u.s.':'United States',de:'Germany',anz:'Australia'};
const norm=s=>String(s??'').toLowerCase().replace(/[_\-.]+/g,' ').replace(/\s+/g,' ').trim();
function readFile(name,buf){let wb;const isText=/\.(csv|txt|tsv)$/i.test(name);
  if(isText){const t=buf.toString('utf8').replace(/^\uFEFF/,'');const first=t.split(/\r?\n/).slice(0,10).join('\n');const d=[';','\t','|',','].map(c=>[c,(first.match(new RegExp(c==='|'?'\\|':c,'g'))||[]).length]).sort((a,b)=>b[1]-a[1])[0][0];wb=XLSX.read(t,{type:'string',FS:d,raw:true})}
  else wb=XLSX.read(buf,{type:'buffer'});const sh=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:false,blankrows:false})}
function score(h){const n=norm(h);let best=[null,0];for(const[k,list]of Object.entries(SYN)){for(const s of list){const sc=n===s?1:(n.includes(s)&&s.length>3)?0.75:0;if(sc>best[1])best=[k,sc]}}return best}
function findHeader(rows){let bi=0,bs=-1;rows.slice(0,15).forEach((r,i)=>{const s=r.reduce((a,c)=>a+(score(c)[1]>0?1:0),0);if(s>bs){bs=s;bi=i}});return bi}
const isEmail=v=>/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v).trim());const isPhone=v=>/^[+()\d][\d\s()\-.]{6,}$/.test(String(v).trim());
function country(v){const s=String(v||'').trim();if(!s)return'';const parts=s.split(/[,/|-]/).map(x=>x.trim());for(const p of parts.reverse()){const hit=COUNTRIES.find(c=>c.toLowerCase()===p.toLowerCase())||ALIAS[p.toLowerCase()];if(hit)return hit}
  const city={sydney:'Australia',melbourne:'Australia',mumbai:'India',bengaluru:'India',bangalore:'India',pune:'India',tokyo:'Japan',osaka:'Japan',auckland:'New Zealand','kuala lumpur':'Malaysia',jakarta:'Indonesia'};for(const[k,c]of Object.entries(city))if(s.toLowerCase().includes(k))return c;return''}
function status(v){const s=norm(v);if(!s)return'Registered';if(/^(y|yes|true|1|attended|checked in|present|x|✓)$/.test(s))return'Attended';if(/^(n|no|false|0|no show|absent)$/.test(s))return'Registered';if(/scan|visited|booth/.test(s))return'Responded';return/regist/.test(s)?'Registered':'Responded'}
async function map(name,buf,{campaignId,leadSource='Event',defaultCountry}={}){const rows=readFile(name,buf);const hi=findHeader(rows);const header=rows[hi]||[];const body=rows.slice(hi+1).filter(r=>r.some(c=>String(c).trim()));
  const mapping=header.map((h,i)=>{const[k,s]=score(h);return{column:String(h),index:i,target:k,confidence:s,method:k?'header':null}});
  // value sniffing for unknown/ambiguous columns
  for(const m of mapping){const vals=body.slice(0,20).map(r=>r[m.index]).filter(v=>String(v).trim());if(!vals.length)continue;const share=f=>vals.filter(f).length/vals.length;
    if(share(isEmail)>0.8&&m.target!=='Email'){m.target='Email';m.confidence=0.9;m.method='values look like emails'}
    else if(!m.target&&share(isPhone)>0.8){m.target='Phone';m.confidence=0.7;m.method='values look like phone numbers'}
    else if(!m.target&&share(v=>!!country(v))>0.8){m.target='Country';m.confidence=0.7;m.method='values look like countries'}}
  const used=new Set();for(const m of mapping.sort((a,b)=>b.confidence-a.confidence)){if(!m.target)continue;if(used.has(m.target)){m.target=null;m.method='duplicate, ignored';m.confidence=0;continue}used.add(m.target)}mapping.sort((a,b)=>a.index-b.index);
  const col=t=>mapping.find(m=>m.target===t);const out=[],quarantine=[];
  for(const r of body){const g=t=>{const m=col(t);return m?String(r[m.index]??'').trim():''};let fn=g('FirstName'),ln=g('LastName');
    if(!fn&&!ln&&g('FullName')){let full=g('FullName');if(full.includes(',')){const[a,b]=full.split(',');full=b.trim()+' '+a.trim()}const p=full.split(/\s+/);fn=p.slice(0,-1).join(' ')||p[0];ln=p.length>1?p.at(-1):''}
    const email=g('Email').toLowerCase();const row={FirstName:fn,LastName:ln||'[not provided]',Email:email,Company:g('Company')||(email.split('@')[1]||'').split('.')[0],Title:g('Title'),Phone:g('Phone').replace(/[^\d+]/g,''),Country:country(g('Country'))||defaultCountry||'',CampaignId:campaignId||'',Status:status(g('Status')),LeadSource:leadSource,OwnerId:''};
    if(!isEmail(email)){quarantine.push({row:r,reason:'missing/invalid email'});continue}out.push(row)}
  const seen=new Set(),dedup=out.filter(r=>!seen.has(r.Email)&&seen.add(r.Email));const dups=out.length-dedup.length;
  const owners=await call('crm','/owners/lookup',{body:dedup.map(r=>({company:r.Company,email:r.Email,country:r.Country}))});const arr=Array.isArray(owners)?owners:Object.values(owners).filter(x=>x&&typeof x==='object');
  dedup.forEach((r,i)=>{r.OwnerId=arr[i]?.OwnerId||'';r._owner=arr[i]?.OwnerName;r._ownerReason=arr[i]?.reason});
  const csv=TEMPLATE.join(',')+'\n'+dedup.map(r=>TEMPLATE.map(k=>/[",\n]/.test(r[k])?`"${String(r[k]).replace(/"/g,'""')}"`:r[k]).join(',')).join('\n')+'\n';
  return{file:name,headerRow:hi+1,skippedRowsAbove:hi,mapping,rows:dedup,duplicatesRemoved:dups,quarantined:quarantine,csv,template:TEMPLATE,
    stats:{inputRows:body.length,output:dedup.length,ownersFound:dedup.filter(r=>r.OwnerId).length,lowConfidence:mapping.filter(m=>m.target&&m.confidence<0.8).length}}}
module.exports={map,readFile,TEMPLATE};
