'use strict';

const fs = require('fs');
const path = require('path');
const { MODULES, BASELINES } = require('./modules');
const { MQL_THRESHOLD } = require('./score');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function layout(active, body) {
  const nav = [
    ['/platform', 'Cloud', 'home'], ['/platform/data', 'Data', 'data'], ['/platform/engage', 'Engage', 'engage'],
    ['/platform/crm', 'CRM', 'crm'], ['/platform/spend', 'Spend', 'plan'], ['/platform/insights', 'Insights', 'insights'],
    ['/platform/ask', 'Ask', 'ask'], ['/platform/architecture', 'Architecture', 'arch']
  ].map(([href, label, id]) => `<a href="${href}" class="${id === active ? 'on' : ''}">${label}</a>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northwind Marketing Cloud</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}
body{margin:0;background:#f4f2ec;color:#1c1d1a;font:15px/1.45 ui-sans-serif,system-ui,sans-serif}
a,a:visited{color:inherit;text-decoration:none}
header{display:flex;gap:22px;align-items:center;flex-wrap:wrap;padding:16px 32px;border-bottom:1px solid #ddd8cc;background:#fff}
header b{font-size:16px;letter-spacing:-.02em}
nav{display:flex;gap:8px 16px;flex-wrap:wrap}
nav a{color:#5c5a53;padding:6px 0;border-bottom:2px solid transparent}
nav a.on{color:#1c1d1a;font-weight:650;border-bottom-color:#1c1d1a}
main{width:100%;max-width:none;padding:28px 32px 72px}
h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:0 0 6px;font-weight:600}
h2{margin:22px 0 8px;font-size:20px}
.sub{color:#5c5a53;margin:0 0 16px}
.kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5c5a53;margin:0 0 6px}
.elon{background:#1c1d1a;color:#f4f2ec;border-radius:12px;padding:12px 14px;font-variant-numeric:tabular-nums}
.elon span{color:#d6ff4a}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
button,a.btn{display:inline-block;background:#1c1d1a;color:#f4f2ec;border:0;border-radius:999px;padding:8px 14px;cursor:pointer;font:inherit;text-decoration:none}
button.ghost,a.btn.ghost{background:#fff;color:#1c1d1a;border:1px solid #ccc6b8}
input,select,textarea{border:1px solid #ccc6b8;border-radius:10px;padding:8px 10px;background:#fff;font:inherit;color:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{background:#fff;border:1px solid #e4dfd2;border-radius:14px;padding:14px 14px 12px;min-height:132px}
.card h2{margin:0 0 4px;font-size:18px}.card p{margin:4px 0;color:#5c5a53}
.tag{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:650}
.tag.built{background:#e5f6d8;color:#1d5c24}.tag.next{background:#eeeae2;color:#5c5a53}
.schema{display:flex;flex-wrap:wrap;gap:8px}.box{background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:8px 10px;min-width:140px}
.box b{display:block}.box small{color:#5c5a53}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eeeae2;font-size:13px;vertical-align:top}
th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#5c5a53}
.answer{background:#fff;border:1px solid #e4dfd2;border-radius:16px;padding:16px 18px;margin:14px 0}
.answer .from{display:inline-block;background:#1c1d1a;color:#f4f2ec;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:650}
.answer .reply{font-size:18px;line-height:1.35;margin:10px 0 0}
details{margin-top:10px}summary{cursor:pointer;color:#5c5a53}
details ul{margin:8px 0;padding-left:18px;color:#3c3b36}
#err{color:#8d2a2a;min-height:1.2em}
.arch h2{margin:22px 0 6px}.arch h3{margin:16px 0 4px;font-size:16px}
.arch ul{margin:6px 0 12px;padding-left:18px}.arch li{margin:4px 0}
.arch code{background:#efeae0;padding:1px 5px;border-radius:5px;font-family:ui-monospace,monospace;font-size:.92em}
.boards{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:800px){.boards{grid-template-columns:1fr}}
</style>
<header><b>Northwind Marketing Cloud</b><nav>${nav}</nav></header>
<script>
function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function api(url, opt){const r=await fetch(url,Object.assign({headers:{'content-type':'application/json'}},opt));const j=await r.json().catch(()=>({ok:false,error:'Bad response'}));if(!r.ok||j.ok===false)throw new Error(j.error||('Request failed '+r.status));return j}
function err(e){const n=document.querySelector('#err');if(n)n.textContent=e.message||String(e)}
function elon(b){return 'Old tool vs @mops: Old tool: '+b.screens+' screens / '+b.fields+' fields / '+b.minutes+' minutes · @mops: 1 ask / '+b.secondsText}
async function paintElon(){const node=document.querySelector('#elon');if(!node)return;const m=await api('/api/platform/metrics');node.textContent=elon(m[node.dataset.module])}
function paintAnswer(body){const node=document.querySelector('#answer');if(!node)return;const calls=(body.calls||[]).map(c=>'<li>'+esc(c.api)+' · '+c.ms+'ms</li>').join('');node.innerHTML='<article class="answer"><span class="from">'+esc(body.channel||'App')+'</span><p class="reply">'+esc(body.reply||'')+'</p><details><summary>Show the backend steps</summary><ul>'+calls+'</ul><p>'+(body.ms||0)+'ms</p></details></article>'}
document.addEventListener('click',async (ev)=>{
  const proof=ev.target.closest('[data-proof]');
  if(!proof)return;
  proof.disabled=true;
  try{
    const body=await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:proof.dataset.proof,channel:proof.dataset.channel||'App'})});
    paintAnswer(body);
    await paintElon();
    if(window.afterAsk)await window.afterAsk();
  }catch(e){err(e)}
  proof.disabled=false;
});
</script><main>${body}<p id="err"></p></main>`;
}

function home() {
  const cards = MODULES.map(m => `<article class="card" data-module="${esc(m.id)}" data-status="${esc(m.status)}"><span class="tag ${esc(m.status)}">${esc(m.status)}</span><h2>${esc(m.name)}</h2><p>Replaces ${esc(m.replaces)}</p>${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.href ? `<p><a class="btn" href="${esc(m.href)}">Open</a></p>` : ''}</article>`).join('');
  return layout('home', `<h1>One platform, six modules.</h1><p class="sub">Data core, Engage, CRM, Plan and spend, and Insights are running on this machine. The Brain API is next. Fictional Northwind data only.</p><div class="grid">${cards}</div>`);
}

function tableScript() {
  return `function table(el, rows){if(!rows||!rows.length){el.textContent='No rows.';return}const cols=Object.keys(rows[0]);el.innerHTML='<table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,40).map(r=>'<tr>'+cols.map(c=>'<td>'+esc(r[c]).slice(0,180)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}`;
}

function dataPage() {
  const proof = BASELINES.data.proof;
  return layout('data', `<h1>Data core</h1><p class="sub">Replaces the Snowflake marts and the Airtable trackers. Every write is an append-only event.</p><p class="kicker">Old tool vs @mops</p><p id="elon" data-module="data">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><span id="counts"></span></div><div id="answer"></div><h2>Schema</h2><div id="schema" class="schema"></div><h2>Tables</h2><div class="row"><select id="table"></select><input id="q" placeholder="Filter"><button id="load" class="ghost" type="button">Show</button></div><div id="rows"></div><h2>Event log</h2><div class="row"><input id="logq" placeholder="Search the why" value="venue"><button id="logbtn" class="ghost" type="button">Search</button></div><div id="log"></div>
<script>
${tableScript()}
async function boot(){try{
  await paintElon();
  const counts=await api('/api/platform/data/counts');
  document.querySelector('#counts').textContent=counts.contacts+' contacts · '+counts.accounts+' accounts · '+counts.campaigns+' campaigns · '+counts.regions.join(', ')+' · '+counts.dialect;
  const schema=await api('/api/platform/data/schema');
  document.querySelector('#schema').innerHTML=schema.tables.map(t=>'<div class="box"><b>'+esc(t.name)+'</b><small>'+esc(t.columns.slice(0,4).join(', '))+'</small></div>').join('');
  const tables=await api('/api/platform/data/tables');
  const sel=document.querySelector('#table');
  sel.innerHTML=tables.tables.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+' ('+t.rows+')</option>').join('');
  sel.value='contacts';
  async function show(){const q=document.querySelector('#q').value;const body=await api('/api/platform/data/tables/'+encodeURIComponent(sel.value)+'?q='+encodeURIComponent(q));table(document.querySelector('#rows'), body.rows)}
  document.querySelector('#load').onclick=()=>show().catch(err); await show();
  async function logs(){const body=await api('/api/platform/data/log?q='+encodeURIComponent(document.querySelector('#logq').value));table(document.querySelector('#log'), body.rows)}
  document.querySelector('#logbtn').onclick=()=>logs().catch(err); await logs();
}catch(e){err(e)}}
boot();
</script>`);
}

function engagePage() {
  const proof = BASELINES.engage.proof;
  return layout('engage', `<h1>Engage</h1><p class="sub">Replaces Eloqua. One ask builds the segment, the email, and the send. The mail catcher never leaves this machine.</p><p class="kicker">Old tool vs @mops</p><p id="elon" data-module="engage">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><button id="sim" class="ghost" type="button" data-simulate>Simulate a realistic response</button><span>MQLs <b data-mql-count>…</b> · line is ${MQL_THRESHOLD} · about 45% open, about 12% click</span></div><div id="answer"></div><h2>Segments</h2><div id="segments"></div><h2>Templates</h2><div id="templates"></div><h2>Send log</h2><div id="sends"></div><h2>Leaderboards</h2><div class="boards"><div><h3>Illinois</h3><div id="board-il"></div></div><div><h3>Texas</h3><div id="board-tx"></div></div></div>
<script>
function pct(n){return Math.round((n||0)*100)+'%'}
function board(el, rows){el.innerHTML='<table><tr><th>Name</th><th>Title</th><th>State</th><th>Score</th><th>Stage</th></tr>'+(rows||[]).map(p=>'<tr data-contact="'+esc(p.id)+'"><td>'+esc(p.first_name)+' '+esc(p.last_name)+'</td><td>'+esc(p.title)+'</td><td>'+esc(p.state)+'</td><td>'+p.score+'</td><td>'+esc(p.stage)+'</td></tr>').join('')+'</table>'}
async function refresh(){
  const segs=await api('/api/platform/engage/segments');
  document.querySelector('#segments').innerHTML='<table><tr><th>Segment</th><th>Contacts</th></tr>'+segs.segments.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+s.count+'</td></tr>').join('')+'</table>';
  const tpls=await api('/api/platform/engage/templates');
  document.querySelector('#templates').innerHTML=tpls.templates.map(t=>'<p><b>'+esc(t.name)+'</b> — '+esc(t.subject)+'</p>').join('');
  const sends=await api('/api/platform/engage/sends');
  document.querySelector('#sends').innerHTML='<table><tr><th>When</th><th>Campaign</th><th>Sent</th><th>Open</th><th>Click</th></tr>'+sends.sends.map(s=>'<tr><td>'+esc(s.at)+'</td><td>'+esc(s.campaign_id)+'</td><td>'+s.recipients+'</td><td>'+pct(s.openRate)+'</td><td>'+pct(s.clickRate)+'</td></tr>').join('')+'</table>';
  const all=await api('/api/platform/engage/scores');
  document.querySelector('[data-mql-count]').textContent=all.mqls;
  const il=await api('/api/platform/engage/scores?state=Illinois');
  const tx=await api('/api/platform/engage/scores?state=Texas');
  board(document.querySelector('#board-il'), il.top);
  board(document.querySelector('#board-tx'), tx.top);
  const chi=(sends.sends||[]).find(s=>s.idempotency_key==='ask:send-chicago');
  document.querySelector('#sim').dataset.send=chi?chi.id:'';
}
document.querySelector('#sim').onclick=async()=>{
  const id=document.querySelector('#sim').dataset.send;
  if(!id){err(new Error('Send the Chicago invite first.'));return}
  try{await api('/api/platform/engage/sends/'+id+'/simulate',{method:'POST',body:JSON.stringify({opens:true,clicks:true})});await refresh()}catch(e){err(e)}
};
window.afterAsk=refresh;
async function boot(){try{await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function askPage() {
  const examples = Object.values(BASELINES).map(b => b.proof).concat([
    '@mops why did the Chicago venue change',
    '@mops who is an MQL on the Chicago invite',
    '@mops what is the cost per lead for Chicago',
    '@mops how much pipeline did Chicago source',
    '@mops what is left in the Americas budget'
  ]);
  const chips = examples.map(t => `<button class="ghost" type="button" data-example="${esc(t)}">${esc(t.replace('@mops ', ''))}</button>`).join(' ');
  return layout('ask', `<h1>Ask</h1><p class="sub">The same sentence a marketer would tag in email or Webex. It runs the module APIs.</p><div class="row"><label for="channel">Channel</label><select id="channel"><option>Email</option><option>Webex</option><option>App</option></select></div><textarea id="ask" rows="3" style="width:100%" placeholder="Tag @mops the way you would in email or Webex"></textarea><div class="row"><button id="run" type="button">Run the ask</button></div><div class="row">${chips}</div><div id="answer"></div>
<script>
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{document.querySelector('#ask').value=b.dataset.example});
document.querySelector('#run').onclick=async()=>{
  document.querySelector('#answer').textContent='';
  try{
    const body=await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:document.querySelector('#ask').value,channel:document.querySelector('#channel').value})});
    paintAnswer(body);
  }catch(e){err(e)}
};
</script>`);
}

function crmPage() {
  const proof = BASELINES.crm.proof;
  return layout('crm', `<h1>CRM bridge</h1><p class="sub">Replaces the Salesforce connector. Mock campaign, lead, and campaign-member objects, a queue that retries, and a messy badge export.</p><p class="kicker">Old tool vs @mops</p><p id="elon" data-module="crm">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><a class="btn ghost" href="/platform/samples/chicago-attendees.xlsx">Download the sample Excel</a></div><div id="answer"></div><h2>Salesforce objects</h2><div id="objects"></div><h2>Sync queue</h2><div id="queue"></div><h2>Chicago account owner</h2><div id="owners"></div>
<script>
${tableScript()}
async function refresh(){
  const objects=await api('/api/platform/crm/objects');
  table(document.querySelector('#objects'), objects.objects);
  const queue=await api('/api/platform/crm/queue');
  table(document.querySelector('#queue'), queue.jobs);
  const owners=await api('/api/platform/crm/owners');
  document.querySelector('#owners').textContent=owners.owner.name+' ('+owners.owner.role+') owns '+owners.count+' Chicago accounts.';
}
window.afterAsk=refresh;
async function boot(){try{await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function spendPage() {
  const proof = BASELINES.plan.proof;
  return layout('plan', `<h1>Plan and spend</h1><p class="sub">Replaces Command Center and Airtable. One ask files the budget, applies the $150,000 rule, mints the BAN and the code, and drafts the SOW.</p><p class="kicker">Old tool vs @mops</p><p id="elon" data-module="plan">Measuring…</p><p class="sub">$150,000 auto-approves. $150,001 and above goes to Chris M.</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button></div><div id="answer"></div><h2>Request</h2><div id="packets"></div><h2>SOW — three fields only a person knows</h2><div class="row"><input id="our_pm" placeholder="Our project manager"><input id="po_number" placeholder="Purchase order"><input id="venue_contact" placeholder="Day-of venue contact"><button id="save" class="ghost" type="button">Save those three</button></div><div id="sow"></div><h2>Actuals vs budget</h2><div id="actuals"></div>
<script>
${tableScript()}
async function refresh(){
  const packets=await api('/api/platform/spend/packets');
  const view=(packets.packets||[]).map(p=>({campaign:p.campaignId,amount:p.amountUsd,status:p.status,approver:p.approver||'auto',ban:p.ban,code:p.campaignCode,open:p.open.length}));
  table(document.querySelector('#packets'), view);
  const sow=packets.packets&&packets.packets[0];
  document.querySelector('#sow').textContent=sow?sow.sow.agency+' · '+(sow.open.length?sow.open.map(f=>f.label).join(', ')+' still open':'ready'):'File the Chicago budget to draft the SOW.';
  const actuals=await api('/api/platform/spend/actuals');
  table(document.querySelector('#actuals'), actuals.rows.slice(0,12).map(r=>({campaign:r.name,region:r.region,budget:r.budget,actual:r.actual,left:r.variance})));
}
document.querySelector('#save').onclick=async()=>{
  try{
    await api('/api/platform/spend/sow',{method:'POST',body:JSON.stringify({campaignId:'CAMP-CHI',answers:{our_pm:document.querySelector('#our_pm').value,po_number:document.querySelector('#po_number').value,venue_contact:document.querySelector('#venue_contact').value}})});
    await refresh();
  }catch(e){err(e)}
};
window.afterAsk=refresh;
async function boot(){try{await paintElon();await refresh()}catch(e){err(e)}}
boot();
</script>`);
}

function insightsPage() {
  const proof = BASELINES.insights.proof;
  return layout('insights', `<h1>Insights</h1><p class="sub">Replaces Power BI and Tableau. The numbers are the live book. The PowerPoint and the PDF are real files.</p><p class="kicker">Old tool vs @mops</p><p id="elon" data-module="insights">Measuring…</p><div class="row"><button data-proof="${esc(proof)}">Run the proof ask</button><a class="btn ghost" href="/api/platform/insights/reports/weekly.pptx?region=Americas">Weekly PowerPoint</a><a class="btn ghost" href="/api/platform/insights/reports/weekly.pdf?region=Americas">Weekly PDF</a><a class="btn ghost" href="/api/platform/insights/reports/monthly.pptx?region=portfolio">Monthly PowerPoint</a><a class="btn ghost" href="/api/platform/insights/reports/monthly.pdf?region=portfolio">Monthly PDF</a></div><div id="answer"></div><h2>By region</h2><div id="regions"></div><h2>By program</h2><div id="programs"></div>
<script>
${tableScript()}
async function refresh(){
  const body=await api('/api/platform/insights/dashboard');
  table(document.querySelector('#regions'), body.regions);
  table(document.querySelector('#programs'), body.programs);
}
window.afterAsk=refresh;
async function boot(){try{await paintElon();await refresh()}catch(e){err(e)}}
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

module.exports = { home, dataPage, engagePage, askPage, crmPage, spendPage, insightsPage, architecture };
