// Field-overlap map: which facts get re-typed into which tool today. A realistic mapping (labelled assumption, to confirm with Srisha).
const FACTS={campaign_name:'Campaign name',start_date:'Start date',end_date:'End date',country:'Country',region:'Region / geo',product:'Product / architecture',channel:'Channel / tactic',budget:'Budget',owner:'Owner',fiscal_quarter:'Fiscal quarter',city_venue:'City / venue',event_name:'Event name',audience:'Target audience',vendor:'Vendor / agency',cost_center:'Cost center',capacity:'Capacity / seats',campaign_code:'Campaign code',sfdc_campaign_id:'SFDC campaign ID',event_id:'Event ID'};
const DERIVED=new Set(['campaign_code','sfdc_campaign_id','event_id','fiscal_quarter','region']); // with @mops these are generated, never typed
const ARTEFACTS={
 budget:{label:'Budget request (finance form/email)',tool:'Finance tool + email',fields:['campaign_name','start_date','end_date','country','product','channel','budget','owner','fiscal_quarter','cost_center','vendor']},
 code:{label:'Campaign code',tool:'Code generator / tracker sheet',fields:['campaign_name','fiscal_quarter','country','region','channel','product','owner']},
 sfdc:{label:'SFDC campaign',tool:'Salesforce',fields:['campaign_name','start_date','end_date','country','region','product','channel','budget','owner','campaign_code','fiscal_quarter']},
 sow:{label:'SOW',tool:'Word template + procurement',fields:['vendor','campaign_name','start_date','end_date','country','city_venue','product','budget','cost_center','owner','campaign_code','audience','capacity']},
 event:{label:'Event ID / event platform',tool:'Event platform',fields:['event_name','start_date','end_date','city_venue','country','product','capacity','owner','campaign_code','sfdc_campaign_id']},
 upload:{label:'SFDC upload template',tool:'Excel + Data Import Wizard',fields:['sfdc_campaign_id','campaign_code','country','product','owner']}};
function repeatEntry(){const count={};let total=0;for(const a of Object.values(ARTEFACTS))for(const f of a.fields){count[f]=(count[f]||0)+1;total++}
  const unique=Object.keys(count).length,typedOnce=Object.keys(count).filter(f=>!DERIVED.has(f)).length;
  return{assumption:'Field overlap per artefact is a realistic mapping (assumption), to confirm with Srisha. Per-row upload data (names, emails) is excluded on both sides.',
    today:{fieldEntries:total,uniqueFacts:unique,reEntries:total-unique,avgTimesEachFactTyped:+(total/unique).toFixed(1),toolsTouched:new Set(Object.values(ARTEFACTS).map(a=>a.tool)).size},
    mops:{fieldEntries:typedOnce,uniqueFacts:unique,reEntries:0,timesEachFactTyped:1,generatedNotTyped:[...DERIVED].map(f=>FACTS[f]),toolsTouched:1},
    perFact:Object.entries(count).sort((a,b)=>b[1]-a[1]).map(([f,n])=>({fact:FACTS[f],key:f,timesTypedToday:n,timesTypedWithMops:DERIVED.has(f)?0:1})),
    perArtefact:Object.entries(ARTEFACTS).map(([k,a])=>({artefact:a.label,tool:a.tool,fieldsTypedToday:a.fields.length,fieldsTypedWithMops:0}))}}
module.exports={FACTS,ARTEFACTS,DERIVED,repeatEntry};
