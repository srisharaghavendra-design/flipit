// Auto-map any messy event/ABM spreadsheet (xlsx or csv, any delimiter, junk rows above the header) to the SFDC upload template,
// then look up the SFDC owner ID (named account AE or territory SDR) from the CRM for every row.
// Workbooks are read as zip+XML. The SheetJS parser is not used on untrusted uploads.
const zlib=require('zlib');const{call,handlers,URLS}=require('./lib');
const TEMPLATE=['FirstName','LastName','Email','Company','Title','Phone','Country','CampaignId','Status','LeadSource','OwnerId'];
const SYN={FirstName:['first name','firstname','first','given name','fname','first_name','forename'],LastName:['last name','lastname','surname','family name','lname','last_name'],FullName:['full name','name','attendee name','contact name','attendee','delegate name','contact'],
 Email:['email','e-mail','email address','e-mail address','work email','business email','email id','mail','work_email','e mail address','e mail'],Company:['company','organisation','organization','account','company name','org','employer','account name','firm'],
 Title:['title','job title','designation','role','position','job role','job_title'],Phone:['phone','mobile','ph','phone number','mobile number','tel','telephone','contact number','cell'],
 Consent:['consent','opt in','opt-in','opted in','permission','gdpr','lawful basis','consent captured'],
 Country:['country','geo','location','country/region','nation','location (city, country)','market'],Status:['attended','attended?','status','attendance','checked in','check-in','showed up','member status','scan type','lead type']};
const COUNTRIES=['India','Japan','Australia','New Zealand','Singapore','Malaysia','Indonesia','Thailand','Philippines','Vietnam','Germany','France','United Kingdom','Switzerland','Netherlands','United States','Canada'];
const ALIAS={in:'India',ind:'India',jp:'Japan',jpn:'Japan',au:'Australia',aus:'Australia',nz:'New Zealand',sg:'Singapore',sgp:'Singapore',my:'Malaysia',uk:'United Kingdom',gb:'United Kingdom',us:'United States',usa:'United States','u.s.':'United States',de:'Germany',anz:'Australia'};
const norm=s=>String(s??'').toLowerCase().replace(/[_\-.]+/g,' ').replace(/\s+/g,' ').trim();
function zipEntry(buf,want){let off=0;while(off+30<buf.length){if(buf.readUInt32LE(off)!==0x04034b50){off++;continue}
  const method=buf.readUInt16LE(off+8),comp=buf.readUInt32LE(off+18),nameLen=buf.readUInt16LE(off+26),extra=buf.readUInt16LE(off+28);
  const name=buf.slice(off+30,off+30+nameLen).toString();const start=off+30+nameLen+extra;const data=buf.slice(start,start+comp);
  if(name===want){if(comp>8_000_000)throw new Error('That sheet is too large.');if(method===0)return data;if(method===8)return zlib.inflateRawSync(data,{maxOutputLength:4_000_000});throw new Error('Could not read the workbook.')}
  off=start+comp}return null}
function xmlText(s){return String(s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#10;/g,'\n')}
function xlsxRows(buf){const ss=zipEntry(buf,'xl/sharedStrings.xml');const strings=[];
  if(ss){const xml=ss.toString('utf8');const re=/<si\b[^>]*>([\s\S]*?)<\/si>/g;let m;while((m=re.exec(xml)))strings.push(xmlText(m[1]))}
  let sheet=zipEntry(buf,'xl/worksheets/sheet1.xml');
  if(!sheet){for(let i=1;i<=3&&!sheet;i++)sheet=zipEntry(buf,'xl/worksheets/sheet'+i+'.xml')}
  if(!sheet)throw new Error('That workbook has no sheet. Save it as .xlsx or .csv.');
  const xml=sheet.toString('utf8');const rows=[];const rowRe=/<row\b[^>]*>([\s\S]*?)<\/row>/g;let rm;
  while((rm=rowRe.exec(xml))){const cells=[];const cellRe=/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;let cm;
    while((cm=cellRe.exec(rm[1]))){const ref=(cm[1].match(/\br="([A-Z]+)/)||[])[1];const idx=ref?ref.split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1:cells.length;while(cells.length<idx)cells.push('');
      const t=(cm[1].match(/\bt="(\w+)"/)||[])[1];const inner=cm[2]||'';const formula=(inner.match(/<f[^>]*>([\s\S]*?)<\/f>/)||[])[1];let val=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1]||'';
      if(formula)val=formula.startsWith('=')?formula:'='+formula;else if(t==='s')val=strings[+val]||'';else if(t==='inlineStr'||t==='str')val=(inner.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]||val;
      cells.push(xmlText(val))}
    if(cells.some(c=>String(c).trim()))rows.push(cells)}
  return rows}
function splitLine(line,d){const out=[];let f='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'&&line[i+1]==='"'){f+='"';i++}else if(c==='"')q=false;else f+=c}else if(c==='"')q=true;else if(c===d){out.push(f);f=''}else f+=c}out.push(f);return out}
function readText(buf){const t=buf.toString('utf8').replace(/^\uFEFF/,'');const lines=t.split(/\r?\n/).filter(l=>l.length);if(!lines.length)return[];
  const sample=lines.slice(0,10).join('\n');const d=[';','\t','|',','].map(c=>[c,(sample.match(new RegExp(c==='|'?'\\|':c,'g'))||[]).length]).sort((a,b)=>b[1]-a[1])[0][0];
  return lines.map(l=>splitLine(l,d))}
function readFile(name,buf){const lower=String(name||'').toLowerCase();
  if(/\.(pdf|docx|doc)$/.test(lower))throw new Error('This is not a lead list. Upload it on the SOW step.');
  if(/\.xls$/.test(lower)&&!lower.endsWith('.xlsx'))throw new Error('Save the workbook as .xlsx or .csv.');
  if(buf.length>1_200_000)throw new Error('Keep the list under 1.2 MB.');
  if(/\.(csv|txt|tsv)$/i.test(lower)||!/\.xlsx$/i.test(lower)){const head=buf.slice(0,800).toString('utf8');if(/statement of work|not-to-exceed|gstin/i.test(head))throw new Error('This looks like an SOW, not a lead list.');return readText(buf)}
  if(buf[0]!==0x50||buf[1]!==0x4b)throw new Error('That file is not an .xlsx workbook.');
  return xlsxRows(buf)}
const FORMULA=/^[=+\-@\t\r]/;
const INJECT=/ignore previous|leak@|disregard (all |previous |your )|system prompt|you are now/i;
function neutralize(v){const s=String(v??'');return FORMULA.test(s)?"'"+s:s}
function risky(v){const s=String(v??'').trim();if(!s)return false;if(INJECT.test(s))return true;if(FORMULA.test(s)&&!/^\+\d[\d\s().-]{6,}$/.test(s))return true;return false}
const STRICT=new Set(['Germany','France','United Kingdom','Netherlands','India','Singapore','Australia','Switzerland','United Arab Emirates']);
function consentProblem(raw,country){const s=String(raw||'').trim().toLowerCase();const yes=/^(y|yes|true|1|opted[ _-]?in|granted|express)$/.test(s);if(STRICT.has(country)&&!yes)return`no consent on record for ${country} — quarantined (GDPR/DPDP)`;return''}
function score(h){const n=norm(h);let best=[null,0];for(const[k,list]of Object.entries(SYN)){for(const s of list){const sc=n===s?1:(n.includes(s)&&s.length>3)?0.75:0;if(sc>best[1])best=[k,sc]}}return best}
function findHeader(rows){let bi=0,bs=-1;rows.slice(0,15).forEach((r,i)=>{const s=r.reduce((a,c)=>a+(score(c)[1]>0?1:0),0);if(s>bs){bs=s;bi=i}});return bi}
const isEmail=v=>/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v).trim());const isPhone=v=>/^[+()\d][\d\s()\-.]{6,}$/.test(String(v).trim());
function country(v){const s=String(v||'').trim();if(!s)return'';const parts=s.split(/[,/|-]/).map(x=>x.trim());for(const p of parts.reverse()){const hit=COUNTRIES.find(c=>c.toLowerCase()===p.toLowerCase())||ALIAS[p.toLowerCase()];if(hit)return hit}
  const city={sydney:'Australia',melbourne:'Australia',mumbai:'India',bengaluru:'India',bangalore:'India',pune:'India',tokyo:'Japan',osaka:'Japan',auckland:'New Zealand','kuala lumpur':'Malaysia',jakarta:'Indonesia',chicago:'United States','new york':'United States',munich:'Germany',frankfurt:'Germany',berlin:'Germany',singapore:'Singapore',london:'United Kingdom',paris:'France'};for(const[k,c]of Object.entries(city))if(s.toLowerCase().includes(k))return c;return''}
function phoneCountry(p){const d=String(p||'').replace(/[^\d+]/g,'');if(d.startsWith('+91'))return'India';if(d.startsWith('+65'))return'Singapore';if(d.startsWith('+61'))return'Australia';if(d.startsWith('+49'))return'Germany';if(d.startsWith('+44'))return'United Kingdom';if(d.startsWith('+81'))return'Japan';if(d.startsWith('+1'))return'United States';return''}
async function lookupOwners(rows){let owners;
  if(handlers.crm)owners=await call('crm','/owners/lookup',{body:rows});
  else{const r=await fetch(URLS.crm+'/owners/lookup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rows)});if(!r.ok)throw new Error('Owner lookup failed');owners=await r.json()}
  return Array.isArray(owners)?owners:Object.values(owners||{}).filter(x=>x&&typeof x==='object')}
function status(v){const s=norm(v);if(!s)return'Registered';if(/^(y|yes|true|1|attended|checked in|present|x|✓)$/.test(s))return'Attended';if(/^(n|no|false|0|no show|absent)$/.test(s))return'Registered';if(/scan|visited|booth/.test(s))return'Responded';return/regist/.test(s)?'Registered':'Responded'}
async function map(name,buf,{campaignId,leadSource='Event',defaultCountry,overrides}={}){if(!buf||!buf.length)throw new Error('Choose an Excel or CSV file.');const rows=readFile(name,buf);const hi=findHeader(rows);const header=rows[hi]||[];const body=rows.slice(hi+1).filter(r=>r.some(c=>String(c).trim()));
  const mapping=header.map((h,i)=>{const[k,s]=score(h);return{column:String(h),index:i,target:k,confidence:s,method:k?'header':null}});
  // value sniffing for unknown/ambiguous columns
  for(const m of mapping){const vals=body.slice(0,20).map(r=>r[m.index]).filter(v=>String(v).trim());if(!vals.length)continue;const share=f=>vals.filter(f).length/vals.length;
    if(share(isEmail)>0.8&&m.target!=='Email'){m.target='Email';m.confidence=0.9;m.method='values look like emails'}
    else if(!m.target&&share(isPhone)>0.8){m.target='Phone';m.confidence=0.7;m.method='values look like phone numbers'}
    else if(!m.target&&share(v=>!!country(v))>0.8){m.target='Country';m.confidence=0.7;m.method='values look like countries'}}
  const used=new Set();for(const m of mapping.sort((a,b)=>b.confidence-a.confidence)){if(!m.target)continue;if(used.has(m.target)){m.target=null;m.method='duplicate, ignored';m.confidence=0;continue}used.add(m.target)}mapping.sort((a,b)=>a.index-b.index);
  if(Array.isArray(overrides)){for(const o of overrides){const m=mapping.find(x=>x.column===o.column||x.index===o.index);if(!m)continue;const target=o.target||null;if(target){const other=mapping.find(x=>x!==m&&x.target===target);if(other){other.target=null;other.method='replaced when you confirmed the mapping';other.confidence=0}}m.target=target;m.confidence=target?1:0;m.method=target?'confirmed by the marketer':'ignored by the marketer'}}
  const col=t=>mapping.find(m=>m.target===t);const out=[],quarantine=[];
  for(const r of body){const g=t=>{const m=col(t);return m?String(r[m.index]??'').trim():''};
    if(r.some(c=>risky(c))){const formula=r.some(c=>FORMULA.test(String(c??'').trim())&&!/^\+\d[\d\s().-]{6,}$/.test(String(c??'').trim()));quarantine.push({row:r,reason:formula?'formula cell — not imported':'prompt-injection text — quarantined',email:g('Email')});continue}
    let fn=g('FirstName'),ln=g('LastName');
    if(!fn&&!ln&&g('FullName')){let full=g('FullName');if(full.includes(',')){const[a,b]=full.split(',');full=b.trim()+' '+a.trim()}const p=full.split(/\s+/);fn=p.slice(0,-1).join(' ')||p[0];ln=p.length>1?p.at(-1):''}
    const email=g('Email').toLowerCase();if(!isEmail(email)){quarantine.push({row:r,reason:'missing/invalid email'});continue}
    const phone=g('Phone').replace(/[^\d+]/g,'');const where=country(g('Country'))||phoneCountry(phone)||defaultCountry||'';
    const why=consentProblem(g('Consent'),where);if(why){quarantine.push({row:r,reason:why,email});continue}
    const row={FirstName:neutralize(fn),LastName:neutralize(ln||'[not provided]'),Email:email,Company:neutralize(g('Company')||(email.split('@')[1]||'').split('.')[0]),Title:neutralize(g('Title')),Phone:phone,Country:where,CampaignId:campaignId||'',Status:status(g('Status')),LeadSource:leadSource,OwnerId:'',_consent:g('Consent')||(STRICT.has(where)?'':'unknown')};
    out.push(row)}
  const seen=new Set(),dedup=out.filter(r=>!seen.has(r.Email)&&seen.add(r.Email));const dups=out.length-dedup.length;
  const arr=await lookupOwners(dedup.map(r=>({company:r.Company,email:r.Email,country:r.Country,title:r.Title,phone:r.Phone})));
  dedup.forEach((r,i)=>{r.OwnerId=arr[i]?.OwnerId||'';r._owner=arr[i]?.OwnerName;r._ownerReason=arr[i]?.reason;r._unknown=!!arr[i]?.unknown});
  const cell=v=>{const s=neutralize(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  const csv=TEMPLATE.join(',')+'\n'+dedup.map(r=>TEMPLATE.map(k=>cell(r[k])).join(',')).join('\n')+(dedup.length?'\n':'');
  return{file:name,headerRow:hi+1,skippedRowsAbove:hi,mapping,rows:dedup,duplicatesRemoved:dups,quarantined:quarantine,csv,template:TEMPLATE,
    stats:{inputRows:body.length,output:dedup.length,ownersFound:dedup.filter(r=>r.OwnerId).length,lowConfidence:mapping.filter(m=>m.target&&m.confidence<0.8).length}}}
module.exports={map,readFile,TEMPLATE};
