'use strict';

const fs = require('fs');
const path = require('path');
const { MODULES } = require('./modules');
const { MQL_THRESHOLD } = require('./score');

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function layout(active, body) {
  const nav = [['/platform', 'Cloud', 'home'], ['/platform/data', 'Data', 'data'], ['/platform/engage', 'Engage', 'engage'], ['/platform/ask', 'Ask', 'ask'], ['/platform/architecture', 'Architecture', 'arch']]
    .map(([href, label, id]) => `<a href="${href}" class="${id === active ? 'on' : ''}">${label}</a>`).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northwind Marketing Cloud</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f2ec;color:#1c1d1a;font:15px/1.45 ui-sans-serif,system-ui,sans-serif}
header{display:flex;gap:18px;align-items:baseline;padding:18px 28px;border-bottom:1px solid #ddd8cc;background:#fff}
header b{font-size:16px;letter-spacing:-.02em}nav{display:flex;gap:14px}nav a{color:#5c5a53;text-decoration:none}nav a.on{color:#1c1d1a;font-weight:650}
main{padding:22px 28px 60px;max-width:1180px}h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:0 0 6px;font-weight:600}
.sub{color:#5c5a53;margin:0 0 16px}.elon{background:#1c1d1a;color:#f4f2ec;border-radius:12px;padding:12px 14px;font-variant-numeric:tabular-nums}
.elon span{color:#d6ff4a}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
button,select,input,textarea{font:inherit}button{background:#1c1d1a;color:#fff;border:0;border-radius:999px;padding:8px 14px;cursor:pointer}
button.ghost{background:#fff;color:#1c1d1a;border:1px solid #ccc6b8}input,select,textarea{border:1px solid #ccc6b8;border-radius:10px;padding:8px 10px;background:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.card{background:#fff;border:1px solid #e4dfd2;border-radius:14px;padding:14px 14px 12px;min-height:120px}
.card h2{margin:0 0 4px;font-size:18px}.card p{margin:4px 0;color:#5c5a53}
.tag{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:650}
.tag.built{background:#e5f6d8;color:#1d5c24}.tag.next{background:#eeeae2;color:#5c5a53}
.schema{display:flex;flex-wrap:wrap;gap:8px}.box{background:#fff;border:1px solid #e4dfd2;border-radius:12px;padding:8px 10px;min-width:140px}
.box b{display:block}.box small{color:#5c5a53}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eeeae2;font-size:13px;vertical-align:top}
th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#5c5a53}
#log td:nth-child(4),#result{white-space:pre-wrap}#err{color:#8d2a2a;min-height:1.2em}
.arch{max-width:820px} .arch table{margin:8px 0 16px} .arch h2{margin:22px 0 6px;font-size:20px}
</style>
<header><b>Northwind Marketing Cloud</b><nav>${nav}</nav></header>
<script>
async function api(url, opt){const r=await fetch(url,Object.assign({headers:{'content-type':'application/json'}},opt));const j=await r.json().catch(()=>({ok:false,error:'Bad response'}));if(!r.ok||j.ok===false)throw new Error(j.error||('Request failed '+r.status));return j}
function err(e){const n=document.querySelector('#err');if(n)n.textContent=e.message||String(e)}
function elon(b){return 'Old tool: '+b.screens+' screens / '+b.fields+' fields / '+b.minutes+' minutes · @mops: 1 ask / '+b.secondsText}
async function paintElon(){const node=document.querySelector('#elon');if(!node)return;const m=await api('/api/platform/metrics');node.textContent=elon(m[node.dataset.module])}
document.addEventListener('click',async (ev)=>{
  const proof=ev.target.closest('[data-proof]');
  if(proof){proof.disabled=true;try{await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:proof.dataset.proof,channel:'App'})});location.reload()}catch(e){err(e);proof.disabled=false}}
});
</script><main>${body}<p id="err"></p></main>`;
}

function home() {
  const cards = MODULES.map(m => `<article class="card" data-module="${esc(m.id)}" data-status="${esc(m.status)}"><span class="tag ${esc(m.status)}">${esc(m.status)}</span><h2>${esc(m.name)}</h2><p>Replaces ${esc(m.replaces)}</p>${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.href ? `<p><a href="${esc(m.href)}">Open</a></p>` : ''}</article>`).join('');
  return layout('home', `<h1>One platform, six modules.</h1><p class="sub">Data core and Engage are running on this machine. The other four are next. Fictional Northwind data only.</p><div class="grid">${cards}</div><div id="elon" hidden></div>`);
}

function dataPage() {
  return layout('data', `<h1>Data core</h1><p class="sub">Replaces the Snowflake marts and the Airtable trackers. Every write is an append-only event.</p><p id="elon" data-module="data">Measuring…</p><div class="row"><button data-proof="${esc('@mops who can I email in Illinois')}">Run the proof ask</button><span id="counts"></span></div><h2>Schema</h2><div id="schema" class="schema"></div><h2>Tables</h2><div class="row"><select id="table"></select><input id="q" placeholder="Filter"><button id="load" class="ghost" type="button">Show</button></div><div id="rows"></div><h2>Event log</h2><div class="row"><input id="logq" placeholder="Search the why" value="venue"><button id="logbtn" class="ghost" type="button">Search</button></div><div id="log"></div>
<script>
function table(el, rows){if(!rows||!rows.length){el.textContent='No rows.';return}const cols=Object.keys(rows[0]).filter(k=>k!=='html'&&k!=='rules_json');el.innerHTML='<table><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,40).map(r=>'<tr>'+cols.map(c=>'<td>'+String(r[c]??'').replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])).slice(0,180)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
async function boot(){try{
  await paintElon();
  const counts=await api('/api/platform/data/counts');
  document.querySelector('#counts').textContent=counts.contacts+' contacts · '+counts.accounts+' accounts · '+counts.campaigns+' campaigns · '+counts.regions.join(', ')+' · '+counts.dialect;
  const schema=await api('/api/platform/data/schema');
  document.querySelector('#schema').innerHTML=schema.tables.map(t=>'<div class="box"><b>'+t.name+'</b><small>'+t.columns.slice(0,4).join(', ')+'</small></div>').join('');
  const tables=await api('/api/platform/data/tables');
  const sel=document.querySelector('#table');
  sel.innerHTML=tables.tables.map(t=>'<option value="'+t.name+'">'+t.name+' ('+t.rows+')</option>').join('');
  sel.value='contacts';
  async function show(){const q=document.querySelector('#q').value;const body=await api('/api/platform/data/tables/'+encodeURIComponent(sel.value)+'?q='+encodeURIComponent(q));table(document.querySelector('#rows'), body.rows)}
  document.querySelector('#load').onclick=()=>show().catch(err); await show();
  async function logs(){const body=await api('/api/platform/data/log?q='+encodeURIComponent(document.querySelector('#logq').value));table(document.querySelector('#log'), body.rows)}
  document.querySelector('#logbtn').onclick=()=>logs().catch(err); await logs();
  setInterval(()=>logs().catch(()=>{}), 4000);
}catch(e){err(e)}}
boot();
</script>`);
}

function engagePage() {
  return layout('engage', `<h1>Engage</h1><p class="sub">Replaces Eloqua. One ask builds the segment, the email, and the send. The mail catcher never leaves this machine.</p><p id="elon" data-module="engage">Measuring…</p><div class="row"><button data-proof="${esc('@mops send the Chicago invite to CIOs in Illinois who opened last month')}">Run the proof ask</button><button id="sim" class="ghost" type="button" data-simulate>Simulate opens and clicks</button><span>MQLs <b data-mql-count>…</b> · line is ${MQL_THRESHOLD}</span></div><h2>Segments</h2><div id="segments"></div><h2>Templates</h2><div id="templates"></div><h2>Send log</h2><div id="sends"></div><h2>Scoring leaderboard</h2><div id="board"></div>
<script>
function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function pct(n){return Math.round((n||0)*100)+'%'}
let mqls=0;
async function refresh(){
  const segs=await api('/api/platform/engage/segments');
  document.querySelector('#segments').innerHTML='<table><tr><th>Segment</th><th>Contacts</th></tr>'+segs.segments.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+s.count+'</td></tr>').join('')+'</table>';
  const tpls=await api('/api/platform/engage/templates');
  document.querySelector('#templates').innerHTML=tpls.templates.map(t=>'<p><b>'+esc(t.name)+'</b> — '+esc(t.subject)+'</p>').join('');
  const sends=await api('/api/platform/engage/sends');
  document.querySelector('#sends').innerHTML='<table><tr><th>When</th><th>Campaign</th><th>Sent</th><th>Open</th><th>Click</th></tr>'+sends.sends.map(s=>'<tr><td>'+esc(s.at)+'</td><td>'+esc(s.campaign_id)+'</td><td>'+s.recipients+'</td><td>'+pct(s.openRate)+'</td><td>'+pct(s.clickRate)+'</td></tr>').join('')+'</table>';
  const board=await api('/api/platform/engage/scores');
  mqls=board.mqls;
  document.querySelector('[data-mql-count]').textContent=board.mqls;
  document.querySelector('#board').innerHTML='<table><tr><th>Name</th><th>Title</th><th>State</th><th>Score</th><th>Stage</th></tr>'+board.top.map(p=>'<tr><td>'+esc(p.first_name)+' '+esc(p.last_name)+'</td><td>'+esc(p.title)+'</td><td>'+esc(p.state)+'</td><td>'+p.score+'</td><td>'+esc(p.stage)+'</td></tr>').join('')+'</table>';
  const chi=(sends.sends||[]).find(s=>s.idempotency_key==='ask:send-chicago');
  document.querySelector('#sim').dataset.send=chi?chi.id:'';
}
document.querySelector('#sim').onclick=async()=>{
  const id=document.querySelector('#sim').dataset.send;
  if(!id){err(new Error('Send the Chicago invite first.'));return}
  try{await api('/api/platform/engage/sends/'+id+'/simulate',{method:'POST',body:JSON.stringify({opens:true,clicks:true})});await refresh()}catch(e){err(e)}
};
boot();
async function boot(){try{await paintElon();await refresh()}catch(e){err(e)}}
</script>`);
}

function askPage() {
  const examples = [
    '@mops who can I email in Illinois',
    '@mops show me the Chicago campaign',
    '@mops why did the Chicago venue change',
    '@mops how many opted-in contacts are in each region',
    '@mops hold the German contacts who have no consent',
    '@mops send the Chicago invite to CIOs in Illinois who opened last month',
    '@mops draft a Chicago invite',
    '@mops who is an MQL on the Chicago invite',
    '@mops enroll clickers who have not registered into the Chicago nurture',
    '@mops what is the open rate on the Chicago invite'
  ];
  const chips = examples.map(t => `<button class="ghost" type="button" data-example="${esc(t)}">${esc(t.replace('@mops ', ''))}</button>`).join(' ');
  return layout('ask', `<h1>Ask</h1><p class="sub">The same sentence a marketer would tag in email or Webex. It runs the module APIs. No extra form.</p><div class="row"><select id="channel"><option>Email</option><option>Webex</option><option>App</option></select></div><textarea id="ask" rows="3" style="width:100%;max-width:760px">@mops send the Chicago invite to CIOs in Illinois who opened last month</textarea><div class="row"><button id="run" type="button">Run the ask</button></div><div class="row">${chips}</div><div id="result"></div>
<script>
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{document.querySelector('#ask').value=b.dataset.example});
document.querySelector('#run').onclick=async()=>{
  const node=document.querySelector('#result'); node.textContent='Running…';
  try{
    const body=await api('/api/platform/ask',{method:'POST',body:JSON.stringify({text:document.querySelector('#ask').value,channel:document.querySelector('#channel').value})});
    const calls=(body.calls||[]).map(c=>c.api+' · '+c.ms+'ms').join('\\n');
    node.textContent=body.reply+'\\n\\n'+body.ms+'ms · '+(body.module||'')+'\\n'+calls;
  }catch(e){err(e);node.textContent=''}
};
</script>`);
}

function architecture() {
  const md = fs.readFileSync(path.join(__dirname, 'ARCHITECTURE.md'), 'utf8');
  const html = md.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3>${esc(line.slice(4))}</h3>`;
    if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
    if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
    if (line.startsWith('|')) return `<p>${esc(line)}</p>`;
    if (line.startsWith('- ')) return `<p>• ${esc(line.slice(2))}</p>`;
    if (!line.trim()) return '';
    return `<p>${esc(line)}</p>`;
  }).join('');
  return layout('arch', `<article class="arch">${html}</article>`);
}

module.exports = { home, dataPage, engagePage, askPage, architecture };
