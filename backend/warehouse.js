// Warehouse: DuckDB laid out like Snowflake (RAW → STAGING → MARTS). An ELT job extracts from the engine and the CRM,
// loads RAW tables, then rebuilds the marts with SQL. The insight agent queries these marts instead of Power BI/Tableau.
const path=require('path'),fs=require('fs');const{DuckDBInstance}=require('@duckdb/node-api');const{PORTS,URLS,DATA,now,emitter,service,err,openapi}=require('./lib');
const emit=emitter('warehouse');let con;const runs=[];
const q=async(sql)=>(await con.runAndReadAll(sql)).getRowObjectsJson();
const MARTS={
 campaign_performance:`CREATE OR REPLACE TABLE marts.campaign_performance AS
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
 // Multi-touch (linear) attribution: an opportunity's amount is split equally across every campaign its contact touched.
 attribution:`CREATE OR REPLACE TABLE marts.attribution AS
  WITH opp AS (SELECT o.Id opp_id,o.Amount amount,l.contact_id FROM raw.crm_opportunity o JOIN raw.engine_leads l ON l.id=o.LeadExt),
  touch AS (SELECT DISTINCT opp.opp_id,opp.amount,m.campaign_id FROM opp JOIN raw.engine_members m ON m.contact_id=opp.contact_id),
  n AS (SELECT opp_id,count(*) k FROM touch GROUP BY 1)
  SELECT t.campaign_id,c.code,c.name,c.channel,c.region,count(DISTINCT t.opp_id) influenced_opps,round(sum(t.amount/n.k)) linear_pipeline,
   round(sum(t.amount)) influenced_pipeline FROM touch t JOIN n USING(opp_id) JOIN raw.engine_campaigns c ON c.id=t.campaign_id GROUP BY ALL ORDER BY linear_pipeline DESC`,
 pipeline_by_channel:`CREATE OR REPLACE TABLE marts.pipeline_by_channel AS SELECT channel,count(*) campaigns,sum(budget) budget,sum(sourced_pipeline) sourced_pipeline,
   CASE WHEN sum(budget)>0 THEN round(sum(sourced_pipeline)/sum(budget),1) END pipeline_per_dollar FROM marts.campaign_performance GROUP BY 1 ORDER BY 4 DESC`,
 funnel:`CREATE OR REPLACE TABLE marts.funnel AS SELECT * FROM (VALUES
   ('Audience',(SELECT count(*) FROM raw.engine_sends)),('Emailed (consented)',(SELECT count(*) FROM raw.engine_sends WHERE status='sent')),
   ('Opened',(SELECT count(*) FROM raw.engine_sends WHERE opened_at IS NOT NULL)),('Clicked',(SELECT count(*) FROM raw.engine_sends WHERE clicked_at IS NOT NULL)),
   ('Registered',(SELECT count(*) FROM raw.engine_registrations)),('MQL',(SELECT count(*) FROM raw.engine_leads WHERE status IN('MQL','Working','Converted'))),
   ('Opportunity',(SELECT count(*) FROM raw.crm_opportunity))) t(stage,n)`,
 consent_health:`CREATE OR REPLACE TABLE marts.consent_health AS SELECT region,consent,count(*) contacts FROM raw.engine_contacts GROUP BY ALL ORDER BY 1,2`};
const QUERIES={campaign:"SELECT * FROM marts.campaign_performance WHERE campaign_id=$1 OR code=$1",pipeline_by_channel:'SELECT * FROM marts.pipeline_by_channel',attribution:'SELECT * FROM marts.attribution LIMIT 15',
 funnel:'SELECT * FROM marts.funnel',consent_health:'SELECT * FROM marts.consent_health',top_campaigns:'SELECT code,name,channel,sourced_pipeline,mqls FROM marts.campaign_performance ORDER BY sourced_pipeline DESC LIMIT 10'};
async function elt(trace){const t0=Date.now();emit('elt','ELT started: extracting from engine + CRM',{},trace);
  const[e,c]=await Promise.all([fetch(URLS.engine+'/export').then(r=>r.json()),fetch(URLS.crm+'/export').then(r=>r.json())]);const tmp=path.join(DATA,'elt');fs.mkdirSync(tmp,{recursive:true});const loaded={};
  const load=async(name,rows,cols)=>{const f=path.join(tmp,name+'.json');
    if(!rows.length){await con.run(`CREATE OR REPLACE TABLE raw.${name} (${(cols||['_empty']).map(x=>`"${x}" VARCHAR`).join(',')})`);loaded[name]=0;return}
    fs.writeFileSync(f,JSON.stringify(rows));await con.run(`CREATE OR REPLACE TABLE raw.${name} AS SELECT * FROM read_json_auto('${f}',maximum_object_size=200000000,sample_size=-1)`);loaded[name]=rows.length};
  const ec=e.__columns||{},cc=c.__columns||{};delete e.__columns;delete c.__columns;
  for(const[k,v]of Object.entries(e))await load('engine_'+k,v,ec[k]);for(const[k,v]of Object.entries(c))await load('crm_'+k.toLowerCase(),v,cc[k.toLowerCase()]);
  const total=Object.values(loaded).reduce((a,b)=>a+b,0);emit('elt',`loaded ${total} rows into ${Object.keys(loaded).length} RAW tables`,loaded,trace);
  for(const[k,sql]of Object.entries(MARTS)){try{await con.run(sql)}catch(x){emit('error',`mart ${k} failed: ${x.message}`,{},trace);throw x}}
  const r={at:now(),ms:Date.now()-t0,rows:total,tables:loaded,marts:Object.keys(MARTS)};runs.unshift(r);runs.length=Math.min(runs.length,20);emit('elt',`rebuilt ${Object.keys(MARTS).length} marts in ${r.ms}ms`,{},trace);return r}
const spec=openapi('Warehouse (Snowflake-style, DuckDB)','RAW tables loaded by ELT from engine + CRM; MARTS rebuilt with SQL; named queries replace BI dashboards.',[
 ['POST /elt/run','Run the ELT job now (extract → load RAW → rebuild MARTS)'],['GET /elt/runs','Recent ELT runs'],['GET /query/:name','Named query: campaign (?p=K-0001), pipeline_by_channel, attribution, funnel, consent_health, top_campaigns'],
 ['POST /sql','Read-only SQL (SELECT/WITH only)',{sql:'SELECT * FROM marts.funnel'}],['GET /tables','List schemas/tables with row counts'],['GET /health','Health']]);
const S=service('warehouse',PORTS.warehouse,spec);
S.post('/elt/run',c=>elt(c.trace));S.get('/elt/runs',()=>runs);
S.get('/query/:name',async c=>{const s=QUERIES[c.params.name];if(!s)throw err(404,'unknown query; try '+Object.keys(QUERIES));const p=await con.prepare(s);if(s.includes('$1'))p.bindVarchar(1,c.query.p||'');const rows=(await p.runAndReadAll()).getRowObjectsJson();emit('query',`insight query "${c.params.name}" → ${rows.length} rows`,{},c.trace);return{name:c.params.name,sql:s,rows}});
S.post('/sql',async c=>{const s=String(c.body.sql||'').trim();if(!/^(select|with)\b/i.test(s)||/;\s*\S/.test(s))throw err(400,'read-only single SELECT only');return{rows:await q(s)}});
S.get('/tables',()=>q("SELECT schema_name,table_name,estimated_size rows FROM duckdb_tables() ORDER BY 1,2"));
S.get('/health',async()=>{const t=await q("SELECT schema_name s,count(*) n,sum(estimated_size) r FROM duckdb_tables() GROUP BY 1");return{ok:true,service:'warehouse',counts:Object.fromEntries(t.map(x=>[x.s+'_tables',+x.n]).concat(t.map(x=>[x.s+'_rows',+x.r]))),lastElt:runs[0]||null}});
(async()=>{const inst=await DuckDBInstance.create(path.join(DATA,'warehouse.duckdb'));con=await inst.connect();await con.run('CREATE SCHEMA IF NOT EXISTS raw;CREATE SCHEMA IF NOT EXISTS marts');await S.listen();
  if(process.env.ELT_MS!=='0')setInterval(()=>elt().catch(()=>{}),+(process.env.ELT_MS||60000))})();
