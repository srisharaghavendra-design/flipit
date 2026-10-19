// Warehouse: SQLite laid out like Snowflake (RAW → MARTS). DuckDB is not used: its native addon does not load reliably
// inside a Vercel Hobby function. The marts and the named queries are the same shape the insight agent expects.
const path=require('path'),Database=require('better-sqlite3');const{PORTS,DATA,now,emitter,service,err,openapi,call}=require('./lib');
const emit=emitter('warehouse');const db=new Database(path.join(DATA,'warehouse.db'));db.pragma('journal_mode=WAL');const runs=[];
const sqlName=s=>String(s).replace(/\b(raw|marts)\./gi,(_,x)=>x.toLowerCase()+'_');
function cell(v){if(v==null)return null;if(typeof v==='number'||typeof v==='bigint'||typeof v==='boolean')return typeof v==='boolean'?v?1:0:v;if(typeof v==='object')return JSON.stringify(v);return v}
function ident(k){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))throw new Error('bad column '+k);return'"'+k+'"'}
const MARTS={
 campaign_performance:`CREATE TABLE marts.campaign_performance AS
  SELECT c.id campaign_id,c.code,c.name,c.channel,c.region,c.budget,c.spend,c.status,
   (SELECT count(*) FROM raw.engine_sends s WHERE s.campaign_id=c.id AND s.status='sent') sent,
   (SELECT count(*) FROM raw.engine_sends s WHERE s.campaign_id=c.id AND s.status='suppressed') suppressed,
   (SELECT count(*) FROM raw.engine_sends s WHERE s.campaign_id=c.id AND s.opened_at IS NOT NULL) opens,
   (SELECT count(*) FROM raw.engine_sends s WHERE s.campaign_id=c.id AND s.clicked_at IS NOT NULL) clicks,
   (SELECT count(*) FROM raw.engine_members m WHERE m.campaign_id=c.id AND m.status IN('Registered','Attended')) registrations,
   (SELECT count(*) FROM raw.engine_leads l WHERE l.campaign_id=c.id) leads,
   (SELECT count(*) FROM raw.engine_leads l WHERE l.campaign_id=c.id AND l.status IN('MQL','Working','Converted')) mqls,
   COALESCE((SELECT sum(o.Amount) FROM raw.crm_opportunity o WHERE o.CampaignExt=c.id),0) sourced_pipeline
  FROM raw.engine_campaigns c`,
 attribution:`CREATE TABLE marts.attribution AS
  WITH opp AS (SELECT o.Id opp_id,o.Amount amount,l.contact_id FROM raw.crm_opportunity o JOIN raw.engine_leads l ON l.id=o.LeadExt),
  touch AS (SELECT DISTINCT opp.opp_id,opp.amount,m.campaign_id FROM opp JOIN raw.engine_members m ON m.contact_id=opp.contact_id),
  n AS (SELECT opp_id,count(*) k FROM touch GROUP BY opp_id)
  SELECT t.campaign_id,c.code,c.name,c.channel,c.region,count(DISTINCT t.opp_id) influenced_opps,round(sum(t.amount*1.0/n.k)) linear_pipeline,
   round(sum(t.amount)) influenced_pipeline FROM touch t JOIN n USING(opp_id) JOIN raw.engine_campaigns c ON c.id=t.campaign_id
   GROUP BY t.campaign_id,c.code,c.name,c.channel,c.region ORDER BY linear_pipeline DESC`,
 pipeline_by_channel:`CREATE TABLE marts.pipeline_by_channel AS SELECT channel,count(*) campaigns,sum(budget) budget,sum(sourced_pipeline) sourced_pipeline,
   CASE WHEN sum(budget)>0 THEN round(sum(sourced_pipeline)*1.0/sum(budget),1) END pipeline_per_dollar FROM marts.campaign_performance GROUP BY channel ORDER BY sourced_pipeline DESC`,
 funnel:`CREATE TABLE marts.funnel AS
   SELECT 'Audience' stage, (SELECT count(*) FROM raw.engine_sends) n
   UNION ALL SELECT 'Emailed (consented)', (SELECT count(*) FROM raw.engine_sends WHERE status='sent')
   UNION ALL SELECT 'Opened', (SELECT count(*) FROM raw.engine_sends WHERE opened_at IS NOT NULL)
   UNION ALL SELECT 'Clicked', (SELECT count(*) FROM raw.engine_sends WHERE clicked_at IS NOT NULL)
   UNION ALL SELECT 'Registered', (SELECT count(*) FROM raw.engine_registrations)
   UNION ALL SELECT 'MQL', (SELECT count(*) FROM raw.engine_leads WHERE status IN ('MQL','Working','Converted'))
   UNION ALL SELECT 'Opportunity', (SELECT count(*) FROM raw.crm_opportunity)`,
 consent_health:`CREATE TABLE marts.consent_health AS SELECT region,consent,count(*) contacts FROM raw.engine_contacts GROUP BY region,consent ORDER BY region,consent`};
const QUERIES={campaign:'SELECT * FROM marts.campaign_performance WHERE campaign_id=? OR code=?',pipeline_by_channel:'SELECT * FROM marts.pipeline_by_channel',attribution:'SELECT * FROM marts.attribution LIMIT 15',
 funnel:'SELECT * FROM marts.funnel',consent_health:'SELECT * FROM marts.consent_health',top_campaigns:'SELECT code,name,channel,sourced_pipeline,mqls FROM marts.campaign_performance ORDER BY sourced_pipeline DESC LIMIT 10'};
function counts(){const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const out={raw_tables:0,raw_rows:0,marts_tables:0,marts_rows:0};
  for(const t of tables){const n=db.prepare(`SELECT count(*) n FROM ${ident(t.name)}`).get().n;
    if(t.name.startsWith('raw_')){out.raw_tables++;out.raw_rows+=n}else if(t.name.startsWith('marts_')){out.marts_tables++;out.marts_rows+=n}}
  return out}
function load(name,rows,cols){const table='raw_'+name;db.exec(`DROP TABLE IF EXISTS ${table}`);
  const keys=rows.length?[...new Set(rows.flatMap(r=>Object.keys(r)))]:(cols&&cols.length?cols:['_empty']);
  db.exec(`CREATE TABLE ${table} (${keys.map(ident).join(',')})`);
  if(!rows.length)return 0;
  const ins=db.prepare(`INSERT INTO ${table} (${keys.map(ident).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`);
  db.transaction(list=>{for(const r of list)ins.run(...keys.map(k=>cell(r[k])))})(rows);return rows.length}
async function elt(trace){const t0=Date.now();emit('elt','ELT started: extracting from engine + CRM',{},trace);
  const e=await call('engine','/export'),c=await call('crm','/export');for(const k of['__ms','__http','__status']){delete e[k];delete c[k]}
  const loaded={};const ec=e.__columns||{},cc=c.__columns||{};delete e.__columns;delete c.__columns;
  for(const[k,v]of Object.entries(e))loaded['engine_'+k]=load('engine_'+k,Array.isArray(v)?v:[],ec[k]);
  for(const[k,v]of Object.entries(c))loaded['crm_'+k.toLowerCase()]=load('crm_'+k.toLowerCase(),Array.isArray(v)?v:[],cc[k.toLowerCase()]);
  const total=Object.values(loaded).reduce((a,b)=>a+b,0);emit('elt',`loaded ${total} rows into ${Object.keys(loaded).length} RAW tables`,loaded,trace);
  for(const[k,sql]of Object.entries(MARTS)){try{db.exec('DROP TABLE IF EXISTS marts_'+k);db.exec(sqlName(sql))}catch(x){emit('error',`mart ${k} failed: ${x.message}`,{},trace);const e=new Error(`mart ${k}: ${x.message}`);e.status=500;throw e}}
  const r={at:now(),ms:Date.now()-t0,rows:total,tables:loaded,marts:Object.keys(MARTS)};runs.unshift(r);runs.length=Math.min(runs.length,20);emit('elt',`rebuilt ${Object.keys(MARTS).length} marts in ${r.ms}ms`,{},trace);return r}
const spec=openapi('Warehouse (Snowflake-style, SQLite)','RAW tables loaded by ELT from engine + CRM; MARTS rebuilt with SQL; named queries replace BI dashboards. SQLite stands in for Snowflake so this runs inside a Vercel function.',[
 ['POST /elt/run','Run the ELT job now (extract → load RAW → rebuild MARTS)'],['GET /elt/runs','Recent ELT runs'],['GET /query/:name','Named query: campaign (?p=K-0001), pipeline_by_channel, attribution, funnel, consent_health, top_campaigns'],
 ['POST /sql','Read-only SQL (SELECT/WITH only). raw. and marts. names are accepted.',{sql:'SELECT * FROM marts.funnel'}],['GET /tables','List tables with row counts'],['GET /health','Health']]);
const S=service('warehouse',PORTS.warehouse,spec);
S.post('/elt/run',c=>elt(c.trace));S.get('/elt/runs',()=>runs);
S.get('/query/:name',c=>{const s=QUERIES[c.params.name];if(!s)throw err(404,'unknown query; try '+Object.keys(QUERIES).join(', '));
  const rows=s.includes('?')?db.prepare(sqlName(s)).all(c.query.p||'',c.query.p||''):db.prepare(sqlName(s)).all();
  emit('query',`insight query "${c.params.name}" → ${rows.length} rows`,{},c.trace);return{name:c.params.name,sql:s,rows}});
S.post('/sql',c=>{const s=String(c.body.sql||'').trim();if(!/^(select|with)\b/i.test(s)||/;\s*\S/.test(s))throw err(400,'read-only single SELECT only');return{rows:db.prepare(sqlName(s)).all()}});
S.get('/tables',()=>{const t=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1").all();
  return t.map(x=>({schema:x.name.startsWith('marts_')?'marts':'raw',table_name:x.name.replace(/^(raw|marts)_/,''),rows:db.prepare(`SELECT count(*) n FROM ${x.name}`).get().n}))});
S.get('/health',()=>({ok:true,service:'warehouse',engine:'sqlite',counts:counts(),lastElt:runs[0]||null}));
if(process.env.ELT_MS!=='0'&&!process.env.VERCEL){const t=setInterval(()=>elt().catch(()=>{}),+(process.env.ELT_MS||60000));if(t.unref)t.unref()}
module.exports={elt};
