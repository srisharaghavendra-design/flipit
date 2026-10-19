// Fake-SFDC: a separate CRM service with its own database and a Salesforce-shaped REST API.
// Realistic behaviours: external-ID upserts, LastModifiedBy (integration user vs sales users), API rate limit (429),
// random transient failures (503) to exercise retries, and a changes feed the engine polls for two-way sync.
const path=require('path'),Database=require('better-sqlite3');const{PORTS,DATA,now,emitter,service,err,openapi}=require('./lib');
const emit=emitter('crm');const db=new Database(path.join(DATA,'crm.db'));db.pragma('journal_mode=WAL');
db.exec(`CREATE TABLE IF NOT EXISTS Campaign(Id TEXT PRIMARY KEY,External_Id__c TEXT UNIQUE,Name TEXT,Type TEXT,Status TEXT,BudgetedCost REAL,ActualCost REAL,Region__c TEXT,Code__c TEXT,LastModifiedDate TEXT,LastModifiedById TEXT);
CREATE TABLE IF NOT EXISTS Lead(Id TEXT PRIMARY KEY,External_Id__c TEXT UNIQUE,Email TEXT,FirstName TEXT,LastName TEXT,Company TEXT,Title TEXT,Status TEXT,Score__c REAL,OwnerName TEXT,CampaignExt TEXT,ConvertedOpportunityId TEXT,LastModifiedDate TEXT,LastModifiedById TEXT);
CREATE TABLE IF NOT EXISTS CampaignMember(Id TEXT PRIMARY KEY,External_Id__c TEXT UNIQUE,CampaignExt TEXT,ContactExt TEXT,Email TEXT,Status TEXT,LastModifiedDate TEXT,LastModifiedById TEXT);
CREATE TABLE IF NOT EXISTS Opportunity(Id TEXT PRIMARY KEY,Name TEXT,Amount REAL,StageName TEXT,AccountName TEXT,LeadExt TEXT,CampaignExt TEXT,CloseDate TEXT,CreatedDate TEXT,LastModifiedDate TEXT);
CREATE TABLE IF NOT EXISTS User(Id TEXT PRIMARY KEY,Name TEXT,Email TEXT,Role TEXT,Region TEXT);
CREATE TABLE IF NOT EXISTS Territory(Country TEXT PRIMARY KEY,Region TEXT,AE TEXT,SDR TEXT);
CREATE TABLE IF NOT EXISTS Account(Id TEXT PRIMARY KEY,Name TEXT,Domain TEXT,Segment TEXT,Country TEXT,OwnerId TEXT);
CREATE TABLE IF NOT EXISTS ApiLog(at TEXT,method TEXT,path TEXT,status INT);`);
for(const c of['StartDate','EndDate','Country__c','Product__c','Event_Id__c'])try{db.exec(`ALTER TABLE Campaign ADD COLUMN ${c} TEXT`)}catch{}
// Fictional sales org: users, territories (country → AE + SDR), named accounts (owned by an AE).
const USERS=[['005IN0AE1','Dev Rao','AE','India'],['005IN0SDR','Anika Shah','SDR','India'],['005JP0AE1','Kenji Mori','AE','Japan'],['005JP0SDR','Yui Sato','SDR','Japan'],['005AN0AE1','Lena Ward','AE','ANZ'],['005AN0SDR','Tom Reid','SDR','ANZ'],['005AS0AE1','Arjun Bose','AE','ASEAN'],['005AS0SDR','Mei Lin','SDR','ASEAN'],['005EM0AE1','Sara Klein','AE','EMEA'],['005EM0SDR','Luca Ferri','SDR','EMEA'],['005US0AE1','Jake Moss','AE','US'],['005US0SDR','Rosa Diaz','SDR','US']];
const COUNTRIES={India:'India',Japan:'Japan',Australia:'ANZ','New Zealand':'ANZ',Singapore:'ASEAN',Malaysia:'ASEAN',Indonesia:'ASEAN',Thailand:'ASEAN',Philippines:'ASEAN',Vietnam:'ASEAN',Germany:'EMEA',France:'EMEA','United Kingdom':'EMEA',Switzerland:'EMEA',Netherlands:'EMEA','United States':'US',Canada:'US'};
function seedOrg(){db.exec('DELETE FROM User;DELETE FROM Territory');for(const[i,n,r,g]of USERS)db.prepare('INSERT INTO User VALUES(?,?,?,?,?)').run(i,n,n.toLowerCase().replace(' ','.')+'@northwind.example',r,g);
  for(const[c,g]of Object.entries(COUNTRIES)){const ae=USERS.find(u=>u[3]===g&&u[2]==='AE')[0],sdr=USERS.find(u=>u[3]===g&&u[2]==='SDR')[0];db.prepare('INSERT INTO Territory VALUES(?,?,?,?)').run(c,g,ae,sdr)}}
seedOrg();
const PFX={Campaign:'701',Lead:'00Q',CampaignMember:'00v',Opportunity:'006'};
const COLS=Object.fromEntries(Object.keys(PFX).map(t=>[t,db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name)]));
const sfid=t=>PFX[t]+Math.random().toString(36).slice(2,8).toUpperCase()+Date.now().toString(36).slice(-6).toUpperCase();
const chaos={failRate:+(process.env.CRM_FAIL_RATE??0.12),limitPer10s:+(process.env.CRM_LIMIT??400),calls:[]};
function gate(c,m,p){const t=Date.now();if(chaos.until&&t>chaos.until){chaos.failRate=chaos.restore;chaos.until=0;emit('recover','CRM back to normal (outage over)',{})}chaos.calls=chaos.calls.filter(x=>t-x<10000);chaos.calls.push(t);
  const log=s=>db.prepare('INSERT INTO ApiLog VALUES(?,?,?,?)').run(now(),m,p,s);
  if(chaos.calls.length>chaos.limitPer10s){log(429);emit('error',`429 REQUEST_LIMIT_EXCEEDED on ${m} ${p}`,{},c.trace);throw err(429,'REQUEST_LIMIT_EXCEEDED')}
  if(c.headers['x-mops-trace']!=='noflake'&&Math.random()<chaos.failRate){log(503);emit('error',`503 transient failure on ${m} ${p}`,{},c.trace);throw err(503,'SERVER_UNAVAILABLE (simulated transient)')}log(200)}
const spec=openapi('Fake-SFDC (CRM)','Salesforce-shaped REST API with its own database. Stands in for SFDC so two-way sync, limits and failures are real.',[
 ['POST /services/data/v59.0/sobjects/:type','Create a record (Campaign, Lead, CampaignMember)',{Name:'FY27Q3-IND-EVT-0001'}],
 ['PATCH /services/data/v59.0/sobjects/:type/External_Id__c/:ext','Upsert by external id (what the engine uses)',{Status:'Responded'}],
 ['PATCH /services/data/v59.0/sobjects/:type/:id','Update by SFDC Id (sales users)'],
 ['GET /services/data/v59.0/sobjects/:type/:id','Read a record'],
 ['GET /services/data/v59.0/changes','Changes feed: records modified by non-integration users since ?since='],
 ['GET /export','Full extract for the warehouse ELT job'],['GET /owners/lookup','Owner ID lookup: ?company=&email=&country= → named-account AE or territory SDR'],['GET /territories','Territory → AE/SDR map'],
 ['GET /health','Health + record counts'],
 ['POST /admin/chaos','Set failure rate / rate limit',{failRate:0.2,limitPer10s:100}],
 ['POST /admin/simulate-sales','Sales reps work leads: qualify, convert to opportunities, edit fields (creates sync conflicts)',{n:6}]]);
const S=service('crm',PORTS.crm,spec);
function write(type,row,by,c){if(!PFX[type])throw err(404,'NOT_FOUND sobject '+type);const lm=row.LastModifiedDate;const keep=Object.fromEntries(Object.entries(row).filter(([k])=>COLS[type].includes(k)&&k!=='Id'));
  keep.LastModifiedDate=(by==='integration-seed'&&lm)?lm:now();if(COLS[type].includes('LastModifiedById'))keep.LastModifiedById=by==='integration-seed'?(row.LastModifiedById||'integration'):by;return keep}
S.post('/services/data/v59.0/sobjects/:type',c=>{gate(c,'POST',c.params.type);const t=c.params.type,k=write(t,c.body,'integration',c);const Id=sfid(t);
  db.prepare(`INSERT INTO ${t}(Id,${Object.keys(k)}) VALUES(?,${Object.keys(k).map(()=>'?')})`).run(Id,...Object.values(k));emit('write',`created ${t} ${Id}`,{type:t,Id},c.trace);return{id:Id,success:true,created:true}});
S.patch('/services/data/v59.0/sobjects/:type/External_Id__c/:ext',c=>{const t=c.params.type;gate(c,'PATCH',t);const k=write(t,c.body,'integration',c);
  const ex=db.prepare(`SELECT Id FROM ${t} WHERE External_Id__c=?`).get(c.params.ext);
  if(ex){if(Object.keys(k).length)db.prepare(`UPDATE ${t} SET ${Object.keys(k).map(x=>x+'=?')} WHERE Id=?`).run(...Object.values(k),ex.Id);emit('write',`upserted ${t} ${ex.Id} (${c.params.ext})`,{type:t,Id:ex.Id},c.trace);return{id:ex.Id,success:true,created:false}}
  const Id=sfid(t);k.External_Id__c=c.params.ext;db.prepare(`INSERT INTO ${t}(Id,${Object.keys(k)}) VALUES(?,${Object.keys(k).map(()=>'?')})`).run(Id,...Object.values(k));emit('write',`created ${t} ${Id} (${c.params.ext})`,{type:t,Id},c.trace);return{id:Id,success:true,created:true}});
S.patch('/services/data/v59.0/sobjects/:type/:id',c=>{const t=c.params.type;gate(c,'PATCH',t);const k=write(t,c.body,c.query.as||'sales.user',c);
  const r=db.prepare(`UPDATE ${t} SET ${Object.keys(k).map(x=>x+'=?')} WHERE Id=?`).run(...Object.values(k),c.params.id);if(!r.changes)throw err(404,'NOT_FOUND');return{success:true}});
S.get('/services/data/v59.0/sobjects/:type/:id',c=>{const t=c.params.type;if(!PFX[t])throw err(404,'NOT_FOUND');const r=db.prepare(`SELECT * FROM ${t} WHERE Id=? OR External_Id__c=?`).get(c.params.id,c.params.id);if(!r)throw err(404,'NOT_FOUND');return r});
S.get('/services/data/v59.0/changes',c=>{gate(c,'GET','changes');const since=c.query.since||'1970';const out={};
  for(const t of['Lead','Campaign','CampaignMember'])out[t]=db.prepare(`SELECT * FROM ${t} WHERE LastModifiedDate>? AND LastModifiedById!='integration' ORDER BY LastModifiedDate`).all(since);
  out.Opportunity=db.prepare('SELECT * FROM Opportunity WHERE LastModifiedDate>?').all(since);out.cursor=now();return out});
// Owner lookup: named account → its AE; else territory by country → SDR (new leads) — the step Srisha does by hand today.
function lookupOwner({company,domain,email,country}){domain=domain||(email||'').split('@')[1]||'';const acct=db.prepare('SELECT * FROM Account WHERE (Domain!=\'\' AND Domain=?) OR lower(Name)=lower(?)').get(domain,company||'');
  const u=id=>db.prepare('SELECT * FROM User WHERE Id=?').get(id);if(acct&&acct.OwnerId){const x=u(acct.OwnerId);return{OwnerId:x.Id,OwnerName:x.Name,role:x.Role,reason:`named account ${acct.Name} → account owner`}}
  const t=db.prepare('SELECT * FROM Territory WHERE lower(Country)=lower(?)').get(country||'');if(t){const x=u(t.SDR);return{OwnerId:x.Id,OwnerName:x.Name,role:x.Role,reason:`territory ${t.Country} (${t.Region}) → SDR`}}
  return{OwnerId:null,OwnerName:null,role:null,reason:'no territory match: route to MOps queue'}}
S.get('/owners/lookup',c=>lookupOwner(c.query));S.post('/owners/lookup',c=>[].concat(c.body).map(lookupOwner));S.get('/territories',()=>db.prepare('SELECT t.*,a.Name AE_Name,s.Name SDR_Name FROM Territory t JOIN User a ON a.Id=t.AE JOIN User s ON s.Id=t.SDR').all());S.get('/users',()=>db.prepare('SELECT * FROM User').all());
S.get('/export',()=>({...Object.fromEntries(Object.keys(PFX).map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()])),__columns:Object.fromEntries(Object.keys(PFX).map(t=>[t.toLowerCase(),COLS[t]]))}));
S.get('/health',()=>({ok:true,service:'crm',counts:Object.fromEntries(Object.keys(PFX).map(t=>[t,db.prepare(`SELECT count(*) n FROM ${t}`).get().n])),chaos:{failRate:chaos.failRate,limitPer10s:chaos.limitPer10s},apiCalls24h:db.prepare("SELECT count(*) n FROM ApiLog").get().n,errors:db.prepare("SELECT count(*) n FROM ApiLog WHERE status>=400").get().n}));
S.post('/admin/outage',c=>{chaos.restore=chaos.until?chaos.restore:chaos.failRate;chaos.failRate=1;chaos.until=Date.now()+(+c.body.ms||15000);emit('error',`⚡ injected CRM outage for ${(+c.body.ms||15000)/1000}s`,{},c.trace);return{until:chaos.until}});
S.del('/services/data/v59.0/sobjects/:type/External_Id__c/:ext',c=>{const t=c.params.type;if(!PFX[t])throw err(404,'NOT_FOUND');const r=db.prepare(`DELETE FROM ${t} WHERE External_Id__c=?`).run(c.params.ext);emit('write',`deleted ${t} ${c.params.ext}`,{},c.trace);return{deleted:r.changes}});
S.post('/admin/chaos',c=>{if(c.body.failRate!=null)chaos.failRate=+c.body.failRate;if(c.body.limitPer10s!=null)chaos.limitPer10s=+c.body.limitPer10s;return chaos});
S.post('/admin/bulk-load',c=>{const map={};const tx=db.transaction(b=>{for(const t of['Campaign','Lead','CampaignMember']){for(const r of b[t]||[]){const k=write(t,r,'integration-seed');k.External_Id__c=r.External_Id__c;const Id=sfid(t);
    db.prepare(`INSERT OR REPLACE INTO ${t}(Id,${Object.keys(k)}) VALUES(?,${Object.keys(k).map(()=>'?')})`).run(Id,...Object.values(k));map[t+':'+r.External_Id__c]=Id}}
  for(const a of b.Account||[]){const ae=db.prepare('SELECT AE FROM Territory WHERE Region=? LIMIT 1').get(a.Region);db.prepare('INSERT OR REPLACE INTO Account VALUES(?,?,?,?,?,?)').run('001'+a.Ext,a.Name,a.Domain,a.Segment,a.Region,a.Segment==='Enterprise'&&ae?ae.AE:null)}
  for(const o of b.Opportunity||[]){const Id=sfid('Opportunity');db.prepare('INSERT INTO Opportunity VALUES(?,?,?,?,?,?,?,?,?,?)').run(Id,o.Name,o.Amount,o.StageName,o.AccountName,o.LeadExt,o.CampaignExt,o.CloseDate,o.CreatedDate,'2026-01-01T00:00:00.000Z');map['Opportunity:'+o.LeadExt]=Id}});
  tx(c.body);emit('write',`bulk load (Bulk API 2.0 style): ${Object.keys(map).length} records`,{},c.trace);return{loaded:Object.keys(map).length,map}});
S.post('/admin/reset',()=>{for(const t of[...Object.keys(PFX),'ApiLog','Account'])db.exec(`DELETE FROM ${t}`);return{ok:true}});
const REPS=['Dev Rao','Anika Shah','Kenji Mori','Lena Ward'];
S.post('/admin/simulate-sales',c=>{const n=+(c.body.n||6);const leads=db.prepare("SELECT * FROM Lead WHERE ConvertedOpportunityId IS NULL AND Status!='Disqualified' ORDER BY Score__c DESC LIMIT ?").all(n);const did=[];
  const later=()=>new Date(Date.now()+5).toISOString();
  leads.forEach((l,i)=>{const rep=REPS[i%REPS.length];
    if(i%3==2){db.prepare("UPDATE Lead SET Status='Working',OwnerName=?,Score__c=?,LastModifiedDate=?,LastModifiedById=? WHERE Id=?").run(rep,(l.Score__c||0)-15,later(),rep,l.Id);did.push(`${rep} set ${l.Email} to Working and edited score`);return}
    const oid=sfid('Opportunity'),amt=[60000,95000,140000,220000,310000][i%5];
    db.prepare('INSERT INTO Opportunity VALUES(?,?,?,?,?,?,?,?,?,?)').run(oid,`${l.Company} – SASE`,amt,['Discovery','Proposal','Negotiation'][i%3],l.Company,l.External_Id__c,l.CampaignExt,new Date(Date.now()+60*864e5).toISOString().slice(0,10),now(),later());
    db.prepare("UPDATE Lead SET Status='Converted',OwnerName=?,ConvertedOpportunityId=?,LastModifiedDate=?,LastModifiedById=? WHERE Id=?").run(rep,oid,later(),rep,l.Id);did.push(`${rep} converted ${l.Email} → ${oid} $${amt/1000}K`)});
  did.forEach(d=>emit('sales',d,{},c.trace));return{changed:did.length,did}});
S.listen();
