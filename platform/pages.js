'use strict';

const fs = require('fs');
const path = require('path');
const { MODULES, BASELINES } = require('./modules');
const { brandName } = require('../brand');
const { MQL_THRESHOLD } = require('./score');
const engage = require('./engage');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  data: '<path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  engage: '<path d="M4 6h16v9H8l-4 3z"/>',
  crm: '<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20v-1.5C3 15.5 5.2 14 8 14s5 1.5 5 4.5V20M13 20v-1c0-2 1.4-3.4 3.5-3.8"/>',
  plan: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  insights: '<path d="M5 19V10M10 19V5M15 19v-7M20 19V8"/>',
  brain: '<path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5.5A3.5 3.5 0 0 0 9 18h1V5zM15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5A3.5 3.5 0 0 1 15 18h-1V5z"/>',
  ask: '<path d="M5 6h14v8H9l-4 3z"/>',
  arch: '<path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5"/>'
};

function layout(active, body) {
  const nav = [
    ['/platform', 'Cloud', 'home'],
    ['/platform/data', 'Data', 'data'],
    ['/platform/engage', 'Engage', 'engage'],
    ['/platform/crm', 'CRM', 'crm'],
    ['/platform/spend', 'Spend', 'plan'],
    ['/platform/insights', 'Insights', 'insights'],
    ['/platform/brain', 'Brain', 'brain'],
    ['/platform/ask', 'Ask', 'ask'],
    ['/platform/architecture', 'Architecture', 'arch']
  ].map(([href, label, id]) => `<a href="${href}" class="${id === active ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg><span>${label}</span></a>`).join('');
  const mark = esc(brandName());
  const letter = esc((brandName().charAt(0) || 'N').toUpperCase());
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${mark} Marketing Cloud</title>
<style>
:root{color-scheme:light;--ink:#1c1d1a;--muted:#5f5c55;--line:#e6e1d6;--paper:#f5f4f0;--card:#fff;--lime:#e4f5a8}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
a,a:visited{color:inherit;text-decoration:none}
.shell{display:flex;min-height:100vh;width:100%}
aside{width:228px;flex:none;background:#171814;color:#f4f2ec;padding:22px 14px;display:flex;flex-direction:column;gap:18px}
.brand{display:flex;gap:10px;align-items:center;font-weight:650;letter-spacing:-.03em;padding:0 8px}
.brand i{width:28px;height:28px;border-radius:8px;background:var(--lime);color:#171814;display:grid;place-items:center;font-style:normal;font-weight:750}
nav{display:flex;flex-direction:column;gap:2px}
nav a{display:flex;gap:10px;align-items:center;color:#c9c6bc;border-radius:10px;padding:8px 10px}
nav a svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
nav a.on{background:#2a2b26;color:#fff}
.workspace{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 28px;background:#fff;border-bottom:1px solid var(--line)}
.who{display:flex;gap:10px;align-items:center;color:var(--muted)}
.who b{color:var(--ink);font-weight:650}
select,input,textarea{border:1px solid #ddd6c8;border-radius:10px;padding:8px 10px;background:#fff;font:inherit;color:inherit}
main{width:100%;max-width:none;padding:28px 32px 80px}
h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:0 0 8px;font-weight:620}
h2{margin:28px 0 10px;font-size:18px;letter-spacing:-.02em}
h3{margin:0 0 8px;font-size:15px}
.sub{color:var(--muted);margin:0 0 18px;max-width:68ch}
.kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:18px 0 8px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin:12px 0}
.elon{background:#171814;color:#f4f2ec;border-radius:14px;padding:14px 16px;font-variant-numeric:tabular-nums}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
button,a.btn{display:inline-flex;align-items:center;gap:6px;background:#171814;color:#f6f4ee;border:0;border-radius:999px;padding:8px 14px;cursor:pointer;font:inherit;text-decoration:none}
button.ghost,a.btn.ghost{background:#fff;color:#171814;border:1px solid #ddd6c8}
button[hidden]{display:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;min-height:148px;display:flex;flex-direction:column;gap:6px}
.card h2{margin:0;font-size:18px}
.card p{margin:0;color:var(--muted)}
.card .btn{margin-top:auto;align-self:flex-start}
.tag{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:650;width:max-content}
.tag.built,.tag.ok{background:#e7f6d8;color:#1d5c24}
.tag.next{background:#eeeae2;color:#5c5a53}
.tag.wait{background:#fff1cc;color:#8a5b00}
.tag.hold{background:#fde8e4;color:#8d2a2a}
.tag.mod{background:#eef0ea;color:#3c4334}
.schema{display:flex;flex-wrap:wrap;gap:8px}
.box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:150px}
.box b{display:block}.box small{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #f0ece4;font-size:13px;vertical-align:top}
th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:650}
.answer{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:14px 0}
.answer .from{display:inline-block;background:#171814;color:#f4f2ec;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:650}
.answer .reply{font-size:18px;line-height:1.4;margin:12px 0 0}
details{margin-top:12px}summary{cursor:pointer;color:var(--muted)}
details ul{margin:8px 0;padding-left:18px;color:#3c3b36}
#err{color:#8d2a2a;min-height:1.2em}
.arch h2{margin:22px 0 6px}.arch h3{margin:16px 0 4px;font-size:16px}
.arch ul{margin:6px 0 12px;padding-left:18px}.arch li{margin:4px 0}
.arch code{background:#efeae0;padding:1px 5px;border-radius:5px;font-family:ui-monospace,monospace;font-size:.92em}
.boards{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.policy{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.today{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.8fr);gap:16px;align-items:stretch}
.today .panel{min-height:320px}
.stat{font-size:40px;line-height:1;letter-spacing:-.04em;font-weight:620;margin:8px 0}
.feed p{margin:0;padding:10px 0;border-bottom:1px solid #f0ece4}
.feed p:last-child{border-bottom:0}
.feed small{color:var(--muted)}
@media(max-width:900px){
  .shell{flex-direction:column}
  aside{width:100%}
  nav{flex-direction:row;flex-wrap:wrap}
  .boards,.today{grid-template-columns:1fr}
}
</style>
<div class="shell">
<aside><a class="brand" href="/platform"><i>${letter}</i><span>${mark}</span></a><nav>${nav}</nav></aside>
<div class="workspace">
<header class="top"><div class="who" id="who">Signed in</div><div class="row" style="margin:0"><select id="switch" aria-label="Switch user"></select><button id="reset" class="ghost" type="button">Reset demo</button></div></header>
<script>
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function when(v){const m=/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})/.exec(String(v||''));if(!m)return '';const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];let h=Number(m[4]);const ap=h<12?'am':'pm';h=h%12||12;return Number(m[3])+' '+months[Number(m[2])-1]+', '+h+':'+m[5]+' '+ap}
async function api(url, opt){const r=await fetch(url,Object.assign({headers:{'content-type':'application/json'}},opt));const j=await r.json().catch(()=>({ok:false,error:'Bad response'}));if(!r.ok||j.ok===false)throw new Error(j.error||('Request failed '+r.status));return j}
function err(e){const n=document.querySelector('#err');if(n)n.textContent=e.message||String(e)}
function elon(b){return 'Old tool vs @mops: Old tool: '+b.screens+' screens / '+b.fields+' fields / '+b.minutes+' minutes · @mops: 1 ask / '+b.secondsText}
async function paintElon(){const node=document.querySelector('#elon');if(!node)return;const m=await api('/api/platform/metrics');node.textContent=elon(m[node.dataset.module])}
function paintAnswer(body){const node=document.querySelector('#answer');if(!node)return;const calls=(body.calls||[]).map(c=>'<li>'+esc(c.api)+' · '+c.ms+'ms</li>').join('');const downloads=(body.downloads||[]).map(d=>'<a class="btn" href="'+esc(d.href)+'">'+esc(d.label)+'</a>').join('');node.innerHTML='<article class="answer"><span class="from">'+esc(body.channel||'App')+'</span><p class="reply">'+esc(body.reply||'')+'</p>'+(downloads?'<div class="row">'+downloads+'</div>':'')+'<details><summary>Show the backend steps</summary><ul>'+calls+'</ul><p>'+(body.ms||0)+'ms</p></details></article>'}
document.addEventListener('click',async (ev)=>{
  const proof=ev.target.closest('[data-proof]');
  if(!proof)return;
  proof.disabled=true;
  try{
    const saved=localStorage.getItem('mops-channel');
    const body=await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:proof.dataset.proof,channel:proof.dataset.channel||saved||'App'})});
    paintAnswer(body);
    await paintElon();
    if(window.afterAsk)await window.afterAsk();
  }catch(e){err(e)}
  proof.disabled=false;
});
window.whoReady=(async()=>{
  const s=await api('/api/session');
  const users=await api('/api/login/users');
  document.querySelector('#who').innerHTML='Signed in as <b>'+esc(s.user.name)+'</b>';
  const sel=document.querySelector('#switch');
  sel.innerHTML=users.users.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('');
  sel.value=s.user.id;
  document.body.dataset.user=s.user.id;
  document.body.dataset.role=s.user.role;
  sel.onchange=async()=>{await api('/api/login',{method:'POST',body:JSON.stringify({user:sel.value})});location.reload()};
})();
document.querySelector('#reset').onclick=async()=>{
  if(!confirm('Reset the demo? The next ask will be a first run.'))return;
  try{await api('/api/platform/reset',{method:'POST',body:'{}'});location.reload()}catch(e){err(e)}
};
</script>
<main>${body}<p id="err"></p></main>
</div></div>`;
}

function home() {
  const cards = MODULES.map(m => `<article class="card" data-module="${esc(m.id)}" data-status="${esc(m.status)}"><span class="tag ${esc(m.status)}">${esc(m.status)}</span><h2>${esc(m.name)}</h2><p>Replaces ${esc(m.replaces)}</p>${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.href ? `<p><a class="btn" href="${esc(m.href)}">Open</a></p>` : ''}</article>`).join('');
  const names = Object.fromEntries(MODULES.map(m => [m.id, m.name]));
  return layout('home', `<h1>One platform, six modules.</h1><p class="sub">Data core, Engage, CRM, Plan and spend, Insights, and the Brain API are running on this machine. Fictional ${esc(brandName())} data only.</p><div class="grid">${cards}</div><h2>What @mops did today</h2><div class="today"><div id="today" class="panel feed">Loading…</div><div id="saved" class="panel">Loading…</div></div>
<script>
const NAME=${JSON.stringify(names)};
function noise(why){return /Loaded the fictional .+ book|Scored from title|Minted the campaign code from the region|Recorded \\$|Recorded opted_in|Recorded opted_out|Recorded unknown consent|Approved \\$180,000 because Chris/.test(why||'')}
async function boot(){try{
  await window.whoReady;
  const [feed, metrics]=await Promise.all([api('/api/platform/brain/why?limit=80'), api('/api/platform/metrics')]);
  const mods=Object.entries(metrics).filter(([,b])=>b&&b.minutes);
  const all=mods.reduce((s,[,b])=>s+b.minutes,0);
  const ran=mods.filter(([,b])=>b.runs);
  const saved=ran.reduce((s,[,b])=>s+b.minutes,0);
  document.querySelector('#saved').innerHTML='<p class="kicker">Time saved</p><p class="stat">'+(saved||all).toLocaleString('en-US')+' min</p><p>'+(saved?('Saved '+saved+' minutes across '+ran.length+' '+(ran.length===1?'ask':'asks')+' run here. All six take '+all+' minutes in the old tools.'):('The six asks take '+all+' minutes in the old tools.'))+' @mops does each in &lt;1 sec.</p>'+mods.map(([k,b])=>'<p><b>'+esc(NAME[k]||k)+'</b> · '+b.minutes+' min before · '+esc(b.secondsText)+'</p>').join('');
  const rows=(feed.rows||[]).filter(r=>!noise(r.why)).slice(0,8);
  document.querySelector('#today').innerHTML=rows.length?rows.map(r=>'<p><small>'+esc(when(r.at)||'')+' · '+esc(r.module)+' · '+esc(r.actor)+'</small><br>'+esc(r.why)+'</p>').join(''):'Nothing yet today.';
}catch(e){err(e)}}
boot();
</script>`);
}

function tableScript() {
  return `function money(n){return '$'+Math.round(Number(n)||0).toLocaleString('en-US')}
const LABEL={costPerLead:'Cost per lead',mqls:'MQLs',pipeline:'Pipeline',target:'Target',budget:'Budget',actual:'Actual',campaigns:'Campaigns',leads:'Leads',region:'Region',program:'Program',variance:'Left',name:'Name',title:'Title',state:'State',score:'Score',stage:'Stage',email:'Email',owner_name:'Owner',status:'Status',attempts:'Attempts',last_error:'Last error',type:'Type',company:'Company',country:'Country'};
const MONEY=new Set(['costPerLead','pipeline','target','budget','actual','variance','amount','spend','goal','left']);
function head(c){if(LABEL[c])return LABEL[c];const s=String(c).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');return s.charAt(0).toUpperCase()+s.slice(1)}
function cell(c,v){if(v==null||v==='')return '—';if(c==='source_message'&&v==='EM-JH-1014')return "Jordan Hale's email, 14 Oct";const stamp=when(v);if(stamp&&(c==='at'||c==='created_at'||/^\\d{4}-\\d{2}-\\d{2}T/.test(String(v))))return esc(stamp);if(MONEY.has(c)&&v!==''&&!isNaN(Number(v)))return money(v);if(typeof v==='number')return Number(v).toLocaleString('en-US');return esc(v).slice(0,180)}
function table(el, rows){if(!rows||!rows.length){el.textContent='No rows.';return}const cols=Object.keys(rows[0]);el.innerHTML='<table><thead><tr>'+cols.map(c=>'<th>'+esc(head(c))+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,40).map(r=>'<tr>'+cols.map(c=>'<td>'+cell(c,r[c])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}`;
}

function dataPage() {
  const proof = BASELINES.data.proof;
  return layout('data', `<h1>Data core</h1><p class="sub">Replaces the Snowflake marts and the Airtable trackers. Every write is an append-only event. Each person has one name and one state.</p><p class="elon" id="elon" data-module="data">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><span id="counts"></span></div><div id="answer"></div><h2>Schema</h2><div id="schema" class="schema"></div><h2>Tables</h2><div class="row"><select id="table"></select><input id="q" placeholder="Filter"><button id="load" class="ghost" type="button">Show</button></div><div id="rows" class="panel"></div><h2>Event log</h2><div class="row"><input id="logq" placeholder="Search the why" value="venue"><button id="logbtn" class="ghost" type="button">Search</button></div><div id="log" class="panel"></div>
<script>
${tableScript()}
async function boot(){try{
  await window.whoReady;
  await paintElon();
  const schema=await api('/api/platform/data/schema');
  document.querySelector('#schema').innerHTML=schema.tables.map(t=>'<div class="box"><b>'+esc(t.name)+'</b><small>'+esc(t.columns.slice(0,4).join(', '))+'</small></div>').join('');
  const sel=document.querySelector('#table');
  async function refreshCounts(){
    const counts=await api('/api/platform/data/counts');
    document.querySelector('#counts').textContent=counts.contacts.toLocaleString('en-US')+' contacts · '+counts.accounts+' accounts · '+counts.campaigns+' campaigns · '+counts.regions.join(', ')+' · '+counts.dialect;
    const tables=await api('/api/platform/data/tables');
    const keep=sel.value||'contacts';
    sel.innerHTML=tables.tables.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+' ('+t.rows.toLocaleString('en-US')+')</option>').join('');
    sel.value=[...sel.options].some(o=>o.value===keep)?keep:'contacts';
  }
  async function show(){const q=document.querySelector('#q').value;const body=await api('/api/platform/data/tables/'+encodeURIComponent(sel.value)+'?q='+encodeURIComponent(q));table(document.querySelector('#rows'), body.rows)}
  async function logs(){const body=await api('/api/platform/data/log?q='+encodeURIComponent(document.querySelector('#logq').value));table(document.querySelector('#log'), body.rows)}
  document.querySelector('#load').onclick=()=>show().catch(err);
  document.querySelector('#logbtn').onclick=()=>logs().catch(err);
  window.afterAsk=async()=>{await refreshCounts();await show();await logs()};
  await refreshCounts();
  await show();
  await logs();
}catch(e){err(e)}}
boot();
</script>`);
}

async function engagePage() {
  const proof = BASELINES.engage.proof;
  const board = await engage.scores();
  const mqls = Number(board.mqls) || 0;
  return layout('engage', `<h1>Engage</h1><p class="sub">Replaces Eloqua. One ask builds the segment, the email, and the send. The mail catcher never leaves this machine.</p><p class="elon" id="elon" data-module="engage">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><button id="sim" class="ghost" type="button" data-simulate>Simulate a realistic response</button><span>MQLs <b data-mql-count>${mqls}</b> · an MQL is a score of ${MQL_THRESHOLD} or higher · about 45% open, about 12% click</span></div><div id="answer"></div><h2>Segments</h2><div id="segments" class="panel"></div><h2>Templates</h2><div id="templates" class="panel"></div><h2>Send log</h2><p class="sub">One row per campaign. Notes to a single person stay off this list. Simulate runs once per send.</p><div id="sends" class="panel"></div><h2>Leaderboards</h2><div class="boards"><div class="panel"><h3>Illinois</h3><div id="board-il"></div></div><div class="panel"><h3>Texas</h3><div id="board-tx"></div></div></div>
<script>
function pct(n){return Math.round((n||0)*100)+'%'}
function board(el, rows){el.innerHTML='<table><tr><th>Name</th><th>Title</th><th>State</th><th>Score</th><th>Stage</th></tr>'+(rows||[]).map(p=>'<tr data-contact="'+esc(p.id)+'"><td>'+esc(p.first_name)+' '+esc(p.last_name)+'</td><td>'+esc(p.title)+'</td><td>'+esc(p.state)+'</td><td>'+Number(p.score).toLocaleString('en-US')+'</td><td><span class="tag '+(p.stage==='mql'?'ok':'')+'">'+esc(p.stage)+'</span></td></tr>').join('')+'</table>'}
async function refresh(){
  const all=await api('/api/platform/engage/scores');
  document.querySelector('[data-mql-count]').textContent=all.mqls;
  const segs=await api('/api/platform/engage/segments');
  document.querySelector('#segments').innerHTML='<table><tr><th>Segment</th><th>Contacts</th></tr>'+segs.segments.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+Number(s.count).toLocaleString('en-US')+'</td></tr>').join('')+'</table>';
  const tpls=await api('/api/platform/engage/templates');
  document.querySelector('#templates').innerHTML=tpls.templates.map(t=>'<p><b>'+esc(t.name)+'</b> — '+esc(t.subject)+'</p>').join('');
  const sends=await api('/api/platform/engage/sends');
  document.querySelector('#sends').innerHTML='<table><tr><th>Campaign</th><th>Sent</th><th>Open</th><th>Click</th></tr>'+sends.sends.map(s=>'<tr data-recipients="'+s.recipients+'"><td>'+esc(s.campaign||s.campaign_id)+'</td><td>'+Number(s.recipients).toLocaleString('en-US')+'</td><td>'+pct(s.openRate)+'</td><td>'+pct(s.clickRate)+'</td></tr>').join('')+'</table>';
  const il=await api('/api/platform/engage/scores?state=Illinois');
  const tx=await api('/api/platform/engage/scores?state=Texas');
  board(document.querySelector('#board-il'), il.top);
  board(document.querySelector('#board-tx'), tx.top);
  const chi=(sends.sends||[]).find(s=>s.idempotency_key==='ask:send-chicago')||(sends.sends||[]).find(s=>s.campaign_id==='CAMP-CHI');
  document.querySelector('#sim').dataset.send=chi?chi.id:'';
}
document.querySelector('#sim').onclick=async()=>{
  const id=document.querySelector('#sim').dataset.send;
  if(!id){err(new Error('Send the Chicago invite first.'));return}
  try{await api('/api/platform/engage/sends/'+id+'/simulate',{method:'POST',body:JSON.stringify({opens:true,clicks:true})});await refresh()}catch(e){err(e)}
};
window.afterAsk=refresh;
async function boot(){try{await window.whoReady;await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function askPage() {
  const examples = Object.values(BASELINES).map(b => b.proof).concat([
    '@mops why did the Chicago venue change',
    '@mops who is an MQL on the Chicago invite',
    '@mops what is the cost per lead for Chicago',
    '@mops how much pipeline did Chicago source',
    '@mops what is left in the Americas budget',
    '@mops approve Chicago'
  ]);
  const chips = examples.map(t => `<button class="ghost" type="button" data-example="${esc(t)}">${esc(t.replace('@mops ', ''))}</button>`).join(' ');
  return layout('ask', `<h1>Ask</h1><p class="sub">The same sentence a marketer would tag in email or Webex. It runs the module APIs. The channel stays where you left it.</p><div class="row"><label for="channel">Channel</label><select id="channel"><option>Email</option><option>Webex</option><option>App</option></select></div><textarea id="ask" rows="3" style="width:100%" placeholder="Tag @mops the way you would in email or Webex"></textarea><div class="row"><button id="run" type="button">Run the ask</button></div><div class="row">${chips}</div><div id="answer"></div>
<script>
const channel=document.querySelector('#channel');
const saved=localStorage.getItem('mops-channel');
if(saved)channel.value=saved;
channel.onchange=()=>localStorage.setItem('mops-channel', channel.value);
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{document.querySelector('#ask').value=b.dataset.example});
document.querySelector('#run').onclick=async()=>{
  document.querySelector('#answer').textContent='';
  try{
    localStorage.setItem('mops-channel', channel.value);
    const body=await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:document.querySelector('#ask').value,channel:channel.value})});
    paintAnswer(body);
  }catch(e){err(e)}
};
</script>`);
}

function crmPage() {
  const proof = BASELINES.crm.proof;
  return layout('crm', `<h1>CRM bridge</h1><p class="sub">Replaces the Salesforce connector. Mock campaign, lead, and campaign-member objects, a queue that retries, and a messy badge export.</p><p class="elon" id="elon" data-module="crm">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><a class="btn ghost" href="/platform/samples/chicago-attendees.xlsx">Download the sample Excel</a></div><div id="answer"></div><p id="tally" class="sub"></p><h2>Held rows</h2><div id="held" class="panel"></div><h2>Account owners</h2><div id="owners" class="panel"></div><h2>Salesforce objects</h2><div id="objects" class="panel"></div><h2>Sync queue</h2><div id="queue" class="panel"></div>
<script>
${tableScript()}
async function refresh(){
  const objects=await api('/api/platform/crm/objects');
  table(document.querySelector('#objects'), objects.objects);
  const queue=await api('/api/platform/crm/queue');
  table(document.querySelector('#queue'), queue.jobs);
  const owners=await api('/api/platform/crm/owners');
  document.querySelector('#owners').innerHTML=(owners.owners||[]).map(o=>'<p>'+esc(o.label|| (o.name+' ('+o.role+')'))+'</p>').join('')||'No owners yet.';
  const uploads=await api('/api/platform/crm/uploads');
  const latest=uploads.uploads[0];
  const held=(latest&&latest.held)||[];
  const tally=document.querySelector('#tally');
  tally.textContent=latest?(latest.accepted+' campaign members loaded. Held '+held.length+'. Held rows are not in Salesforce.'):'No upload yet.';
  table(document.querySelector('#held'), held.map(h=>({name:h.name,reason:h.reason})));
}
window.afterAsk=refresh;
async function boot(){try{await window.whoReady;await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function spendPage() {
  const proof = BASELINES.plan.proof;
  return layout('plan', `<h1>Plan and spend</h1><p class="sub">Replaces Command Center and Airtable. Maria files the budget. Over $150,000 it sits with Chris M. as Waiting on Chris. He approves here, or with @mops approve Chicago. The BAN and the code are minted then.</p><p class="elon" id="elon" data-module="plan">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><button id="approve" type="button" hidden>Approve Chicago</button></div><div id="answer"></div><h2>Approval queue</h2><div id="packets" class="panel"></div><h2>SOW — three fields only a person knows</h2><div class="row"><input id="our_pm" placeholder="Our project manager"><input id="po_number" placeholder="Purchase order"><input id="venue_contact" placeholder="Day-of venue contact"><button id="save" class="ghost" type="button">Save those three</button></div><div id="sow" class="panel"></div><h2>Actuals vs budget</h2><div id="actuals" class="panel"></div>
<script>
${tableScript()}
async function refresh(){
  const packets=await api('/api/platform/spend/packets');
  const view=(packets.packets||[]).map(p=>({campaign:p.campaignId,amount:p.amountUsd,status:p.label,approver:p.approver||'Policy',ban:p.ban||'',code:p.campaignCode||''}));
  table(document.querySelector('#packets'), view);
  const waiting=(packets.packets||[]).find(p=>p.campaignId==='CAMP-CHI'&&p.status==='pending');
  const button=document.querySelector('#approve');
  button.hidden=!(document.body.dataset.role==='approver'&&waiting);
  const sow=(packets.packets||[]).find(p=>p.campaignId==='CAMP-CHI')||(packets.packets||[])[0];
  const short={our_pm:'PM',po_number:'PO',venue_contact:'venue contact'};
  const fields=(sow&&sow.sow&&sow.sow.fields)||{};
  ['our_pm','po_number','venue_contact'].forEach(function(id){const el=document.querySelector('#'+id);if(el&&fields[id])el.value=fields[id]});
  const note=document.querySelector('#sow');
  if(!sow)note.textContent='File the Chicago budget to draft the SOW.';
  else if(sow.open.length)note.textContent='Waiting on you: '+sow.open.map(f=>f.short||short[f.key]||f.label).join(', ');
  else note.textContent='Saved, SOW ready for review';
  const chicago=(packets.packets||[]).find(p=>p.campaignId==='CAMP-CHI');
  if(!chicago||chicago.status!=='approved'){
    document.querySelector('#actuals').textContent='Actuals show after approval.';
  }else{
    const actuals=await api('/api/platform/spend/actuals');
    table(document.querySelector('#actuals'), actuals.rows.slice(0,12).map(r=>({campaign:r.name,region:r.region,budget:r.budget,actual:r.actual,left:r.variance})));
  }
}
document.querySelector('#save').onclick=async()=>{
  try{
    await api('/api/platform/spend/sow',{method:'POST',body:JSON.stringify({campaignId:'CAMP-CHI',answers:{our_pm:document.querySelector('#our_pm').value,po_number:document.querySelector('#po_number').value,venue_contact:document.querySelector('#venue_contact').value}})});
    await refresh();
  }catch(e){err(e)}
};
document.querySelector('#approve').onclick=async()=>{
  try{
    const body=await api('/api/platform/spend/approve',{method:'POST',body:JSON.stringify({campaignId:'CAMP-CHI'})});
    paintAnswer({channel:'App',reply:'Chris M. approved '+money(body.amountUsd)+'. BAN '+body.ban+'. Code '+body.campaignCode+'.',calls:[],ms:body.ms});
    await refresh();
  }catch(e){err(e)}
};
window.afterAsk=refresh;
async function boot(){try{await window.whoReady;await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function insightsPage() {
  const proof = BASELINES.insights.proof;
  return layout('insights', `<h1>Insights</h1><p class="sub">Replaces Power BI and Tableau. The numbers are the live book. The weekly deck has a pipeline target that is not the actual pipeline. The PowerPoint and the PDF are real files.</p><p class="elon" id="elon" data-module="insights">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><a class="btn ghost" href="/api/platform/insights/reports/weekly.pptx?region=Americas">Weekly PowerPoint</a><a class="btn ghost" href="/api/platform/insights/reports/weekly.pdf?region=Americas">Weekly PDF</a><a class="btn ghost" href="/api/platform/insights/reports/monthly.pptx?region=portfolio">Monthly PowerPoint</a><a class="btn ghost" href="/api/platform/insights/reports/monthly.pdf?region=portfolio">Monthly PDF</a></div><div id="answer"></div><h2>By region</h2><div id="regions" class="panel"></div><h2>By program</h2><div id="programs" class="panel"></div>
<script>
${tableScript()}
async function refresh(){
  const body=await api('/api/platform/insights/dashboard');
  table(document.querySelector('#regions'), body.regions);
  table(document.querySelector('#programs'), body.programs);
}
window.afterAsk=refresh;
async function boot(){try{await window.whoReady;await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function brainPage() {
  const proof = BASELINES.brain.proof;
  return layout('brain', `<h1>Brain API</h1><p class="sub">The tag, the policy, and a why feed across every module. Rules decide. Nothing here calls a model.</p><p class="elon" id="elon" data-module="brain">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button></div><div id="answer"></div><h2>Policy</h2><div id="policy" class="policy"></div><h2>Why feed</h2><div class="row"><input id="whyq" placeholder="Search the why" value="Chicago"><button id="whybtn" class="ghost" type="button">Search</button></div><div id="why" class="panel"></div>
<script>
${tableScript()}
function chips(rows){return '<table><tr><th>When</th><th>Module</th><th>Channel</th><th>Who</th><th>Why</th></tr>'+rows.map(r=>'<tr><td>'+esc(when(r.at)||r.at)+'</td><td><span class="tag mod">'+esc(r.module)+'</span></td><td>'+esc(r.channel)+'</td><td>'+esc(r.actor)+'</td><td>'+esc(r.why)+'</td></tr>').join('')+'</table>'}
async function load(){const body=await api('/api/platform/brain/why?q='+encodeURIComponent(document.querySelector('#whyq').value));document.querySelector('#why').innerHTML=body.rows.length?chips(body.rows):'No rows.'}
async function boot(){try{
  await window.whoReady;
  await paintElon();
  const policy=await api('/api/platform/brain/policy');
  document.querySelector('#policy').innerHTML=policy.rules.map(r=>'<article class="card"><span class="tag wait">'+esc(r.name)+'</span><p>'+esc(r.text)+'</p></article>').join('');
  document.querySelector('#whybtn').onclick=()=>load().catch(err);
  await load();
}catch(e){err(e)}}
window.afterAsk=load;
boot();
</script>`);
}

function inlineMd(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function architecture() {
  const md = fs.readFileSync(path.join(__dirname, 'ARCHITECTURE.md'), 'utf8');
  const lines = md.split('\n');
  let html = '';
  let list = false;
  const close = () => { if (list) { html += '</ul>'; list = false; } };
  for (const line of lines) {
    if (line.startsWith('### ')) { close(); html += `<h3>${inlineMd(line.slice(4))}</h3>`; }
    else if (line.startsWith('## ')) { close(); html += `<h2>${inlineMd(line.slice(3))}</h2>`; }
    else if (line.startsWith('# ')) { close(); html += `<h1>${inlineMd(line.slice(2))}</h1>`; }
    else if (line.startsWith('- ')) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inlineMd(line.slice(2))}</li>`; }
    else if (!line.trim()) close();
    else { close(); html += `<p>${inlineMd(line)}</p>`; }
  }
  close();
  return layout('arch', `<article class="arch">${html}</article>`);
}

module.exports = { home, dataPage, engagePage, askPage, crmPage, spendPage, insightsPage, brainPage, architecture };
