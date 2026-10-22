// Weekly and monthly field-marketing decks. Numbers come from the warehouse when it
// has rows, and from the fictional book otherwise. The wordmark is BRAND_NAME.
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { call } = require('./lib');
const { brandName, brandCompany, brandMark } = require('../brand');

const cache = new Map();

function book() {
  const file = path.join(__dirname, '..', 'data.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw.campaigns) ? raw.campaigns : [];
}

async function warehouseRows(name) {
  try {
    const out = await call('warehouse', '/query/' + name);
    return (out && out.rows) || [];
  } catch (e) { return []; }
}

function regionOf(c) {
  return c.geo || (c.region === 'US' ? 'Americas' : c.region) || '';
}

function inRegion(c, region) {
  if (!region || region === 'portfolio' || region === 'all') return true;
  const g = regionOf(c);
  return g === region || c.region === region || c.country === region;
}

function money(n) { return '$' + Math.round(+n || 0).toLocaleString('en-US'); }

async function gather(region) {
  const rows = book().filter(c => inRegion(c, region));
  const byRegion = await warehouseRows('by_region');
  const behindWh = await warehouseRows('behind_pace');
  const spend = rows.reduce((s, c) => s + (+c.spend || 0), 0);
  const budget = rows.reduce((s, c) => s + (+c.budget || 0), 0);
  const leads = rows.reduce((s, c) => s + (+c.leadCount || 0), 0);
  const mqls = rows.reduce((s, c) => s + (+c.mqls || 0), 0);
  const pipeline = rows.reduce((s, c) => s + (+c.pipeline || 0), 0);
  const goal = rows.reduce((s, c) => s + (+c.goal || 0), 0);
  const live = rows.filter(c => c.status === 'Live' || c.stage === 'Run' || c.stage === 'Leads');
  const risks = rows.filter(c => c.pace === 'behind').map(c => ({
    name: c.name, note: c.nextAction || 'Behind its goal', fixed: false
  }));
  let covered = [];
  try { covered = require('./cover').list().filter(x => x.status === 'done' || x.status === 'scheduled').slice(0, 4); } catch (e) { covered = []; }
  const fixed = covered.map(x => ({ name: x.title || x.rule, note: (x.after && x.after.text) || 'Already handled', fixed: true }));
  const actions = rows.map(c => c.nextAction).filter(Boolean).slice(0, 5);
  const programs = {};
  for (const c of rows) {
    const k = c.program || c.channel || 'Other';
    programs[k] = programs[k] || { label: k, spend: 0, budget: 0, leads: 0, pipeline: 0 };
    programs[k].spend += +c.spend || 0;
    programs[k].budget += +c.budget || 0;
    programs[k].leads += +c.leadCount || 0;
    programs[k].pipeline += +c.pipeline || 0;
  }
  return {
    region: region || 'portfolio',
    campaigns: rows.length,
    live: live.length,
    spend, budget, leads, mqls, pipeline, goal,
    bars: Object.values(programs),
    risks: risks.concat(fixed).slice(0, 6),
    actions: actions.length ? actions : ['No open actions in this slice.'],
    names: live.slice(0, 6).map(c => c.name),
    warehouseRegions: byRegion.length,
    warehouseBehind: behindWh.length
  };
}

function titleFor(period, region, when) {
  const place = !region || region === 'portfolio' ? 'the portfolio' : region;
  const stamp = when || new Date().toISOString().slice(0, 10);
  return period === 'monthly' ? `Monthly field report · ${place} · ${stamp.slice(0, 7)}` : `Weekly field report · ${place} · week of ${stamp}`;
}

function slidesFor(period, data, when) {
  const place = data.region === 'portfolio' ? 'Portfolio' : data.region;
  const title = titleFor(period, data.region, when);
  const bars = data.bars.length ? data.bars : [{ label: place, spend: data.spend, budget: data.budget }];
  const slides = [
    { kind: 'title', title, sub: brandCompany() + ' · fictional field marketing · not a customer system' },
    { kind: 'bars', title: 'Spend against budget', bars, note: `${money(data.spend)} spent of ${money(data.budget)} budget` },
    { kind: 'pair', title: 'Registrations and pipeline', left: data.leads + ' leads', right: money(data.pipeline) + ' pipeline', note: `Target pipeline ${money(data.goal)} · ${data.mqls} MQLs` },
    { kind: 'list', title: 'Campaigns live', items: data.names.length ? data.names : ['No live campaigns in this slice.'] },
    { kind: 'risks', title: 'Risks', items: data.risks.length ? data.risks : [{ name: 'Nothing flagged', note: 'Pace is inside the plan', fixed: true }] },
    { kind: 'list', title: "Next week's actions", items: data.actions }
  ];
  if (period === 'monthly') {
    slides.push({ kind: 'bars', title: 'Quarter-to-date trend by program', bars, note: 'Monthly view adds the quarter-to-date mix. Weekly stops at next week.' });
    slides.push({ kind: 'pair', title: 'Quarter to date', left: data.campaigns + ' campaigns', right: data.live + ' live', note: 'Trend is the same book, read across the quarter rather than the week.' });
  }
  return slides.slice(0, 8);
}

const INK = '1A1C1F';
const LIME = 'D6FF4A';
const MUTED = '8E939C';
const PAPER = 'F7F6F3';

async function pptx(period, data, when) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pres.layout = 'WIDE';
  pres.author = brandName() + ' @mops';
  pres.title = titleFor(period, data.region, when);
  const slides = slidesFor(period, data, when);
  for (const s of slides) {
    const slide = pres.addSlide();
    slide.background = { color: PAPER };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: LIME } });
    slide.addText(brandMark(), { x: 0.55, y: 0.28, w: 4, h: 0.28, fontFace: 'Calibri', fontSize: 11, color: MUTED, margin: 0 });
    if (s.kind === 'title') {
      slide.addText(s.title, { x: 0.55, y: 2.2, w: 11.5, h: 1.6, fontFace: 'Calibri', fontSize: 36, color: INK, margin: 0 });
      slide.addText(s.sub, { x: 0.55, y: 4.1, w: 10, h: 0.4, fontFace: 'Calibri', fontSize: 16, color: MUTED, margin: 0 });
      continue;
    }
    slide.addText(s.title, { x: 0.55, y: 0.62, w: 12, h: 0.55, fontFace: 'Calibri', fontSize: 28, color: INK, margin: 0 });
    if (s.kind === 'bars') {
      const labels = s.bars.map(b => b.label);
      slide.addChart(pres.ChartType.bar, [
        { name: 'Spend', labels, values: s.bars.map(b => Math.round(b.spend || 0)) },
        { name: 'Budget', labels, values: s.bars.map(b => Math.round(b.budget || 0)) }
      ], { x: 0.5, y: 1.4, w: 12.2, h: 4.8, barGrouping: 'clustered', showValue: false, chartColors: [LIME, '2C3138'], showLegend: true, legendPos: 'b' });
      slide.addText(s.note || '', { x: 0.55, y: 6.7, w: 12, h: 0.35, fontFace: 'Calibri', fontSize: 13, color: MUTED, margin: 0 });
    } else if (s.kind === 'pair') {
      slide.addText(s.left, { x: 0.55, y: 2.2, w: 5.5, h: 1.2, fontFace: 'Calibri', fontSize: 32, color: INK, margin: 0 });
      slide.addText(s.right, { x: 6.6, y: 2.2, w: 5.8, h: 1.2, fontFace: 'Calibri', fontSize: 32, color: INK, margin: 0 });
      slide.addText(s.note || '', { x: 0.55, y: 4.2, w: 11, h: 0.5, fontFace: 'Calibri', fontSize: 16, color: MUTED, margin: 0 });
    } else if (s.kind === 'list') {
      slide.addText(s.items.map(t => '–  ' + t).join('\n'), { x: 0.55, y: 1.6, w: 11.5, h: 4.8, fontFace: 'Calibri', fontSize: 20, color: INK, margin: 0 });
    } else if (s.kind === 'risks') {
      const lines = s.items.map(r => (r.fixed ? 'On track  ' : 'Open  ') + r.name + (r.note ? ' — ' + String(r.note).slice(0, 110) : ''));
      slide.addText(lines.join('\n'), { x: 0.55, y: 1.6, w: 11.5, h: 5, fontFace: 'Calibri', fontSize: 18, color: INK, margin: 0 });
    }
  }
  return pres.write({ outputType: 'nodebuffer' });
}

function escPdf(s) { return String(s || '').replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, ' '); }

function pdf(period, data, when) {
  const slides = slidesFor(period, data, when);
  const pages = slides.map(s => {
    const cmds = ['0.96 0.965 0.953 rg', '0 0 612 792 re f', '0.84 1 0.29 rg', '0 0 10 792 re f', 'BT', '/F1 11 Tf', '0.45 0.47 0.5 rg', '36 760 Td', '(' + escPdf(brandMark()) + ') Tj'];
    if (s.kind === 'title') {
      cmds.push('/F1 22 Tf', '0 0 0 rg', '1 0 0 1 36 520 Tm', '(' + escPdf(s.title).slice(0, 70) + ') Tj', '/F1 12 Tf', '0.45 0.47 0.5 rg', '1 0 0 1 36 490 Tm', '(' + escPdf(s.sub).slice(0, 90) + ') Tj');
    } else {
      cmds.push('/F1 18 Tf', '0 0 0 rg', '1 0 0 1 36 720 Tm', '(' + escPdf(s.title).slice(0, 60) + ') Tj');
      if (s.kind === 'bars') {
        const max = Math.max(1, ...s.bars.flatMap(b => [b.spend || 0, b.budget || 0]));
        s.bars.slice(0, 6).forEach((b, i) => {
          const y = 640 - i * 70;
          const sw = Math.max(4, Math.round((b.spend || 0) / max * 360));
          const bw = Math.max(4, Math.round((b.budget || 0) / max * 360));
          cmds.push('0.84 1 0.29 rg', `48 ${y} ${sw} 16 re f`, '0.17 0.19 0.22 rg', `48 ${y - 22} ${bw} 16 re f`, 'BT', '/F1 11 Tf', '0 0 0 rg', `1 0 0 1 48 ${y + 22} Tm`, '(' + escPdf(b.label).slice(0, 24) + ') Tj', 'ET');
        });
        cmds.push('BT', '/F1 11 Tf', '0.45 0.47 0.5 rg', '1 0 0 1 36 80 Tm', '(' + escPdf(s.note).slice(0, 90) + ') Tj');
      } else if (s.kind === 'pair') {
        cmds.push('BT', '/F1 22 Tf', '0 0 0 rg', '1 0 0 1 36 560 Tm', '(' + escPdf(s.left).slice(0, 28) + ') Tj', '1 0 0 1 320 560 Tm', '(' + escPdf(s.right).slice(0, 28) + ') Tj', '/F1 12 Tf', '0.45 0.47 0.5 rg', '1 0 0 1 36 500 Tm', '(' + escPdf(s.note).slice(0, 90) + ') Tj');
      } else {
        const items = s.kind === 'risks' ? s.items.map(r => (r.fixed ? 'On track ' : 'Open ') + r.name) : s.items;
        cmds.push('BT', '/F1 13 Tf', '0 0 0 rg');
        items.slice(0, 10).forEach((t, i) => { cmds.push('1 0 0 1 36 ' + (660 - i * 28) + ' Tm', '(' + escPdf(t).slice(0, 80) + ') Tj'); });
      }
    }
    cmds.push('ET');
    return cmds.join('\n');
  });
  const objs = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'];
  const kids = pages.map((_, i) => (3 + i * 2) + ' 0 R').join(' ');
  objs.push(`2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${kids}] >> endobj\n`);
  pages.forEach((stream, i) => {
    const pageObj = 3 + i * 2, content = pageObj + 1;
    objs.push(`${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> >> endobj\n`);
    objs.push(`${content} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`);
  });
  objs.push(`${3 + pages.length * 2} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`);
  let out = '%PDF-1.4\n'; const pos = [0];
  for (const o of objs) { pos.push(Buffer.byteLength(out)); out += o; }
  const xref = pos.length - 1; const start = Buffer.byteLength(out);
  out += 'xref\n0 ' + (xref + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= xref; i++) out += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer << /Size ' + (xref + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF';
  return Buffer.from(out);
}

async function build(opts) {
  const period = opts.period === 'monthly' ? 'monthly' : 'weekly';
  const region = opts.region || 'Americas';
  const when = opts.when || new Date().toISOString().slice(0, 10);
  const trace = require('./trace');
  const data = await trace.run(async () => {
    const t0 = Date.now();
    trace.add({ service: 'Report agent', name: 'Read the warehouse', ms: 1, status: 'ok', request: { period, region }, response: { source: 'warehouse, then the ' + brandName() + ' book' }, rows: [] });
    const facts = await gather(region);
    trace.add({ service: 'Warehouse', name: 'Campaign performance', ms: Date.now() - t0, status: 'ok', request: { region }, response: { campaigns: facts.campaigns, spend: facts.spend, pipeline: facts.pipeline, warehouseRegions: facts.warehouseRegions }, rows: facts.bars.slice(0, 6) });
    trace.add({ service: 'Report agent', name: 'Build the deck', ms: 1, status: 'ok', request: { slides: period === 'monthly' ? 8 : 6 }, response: { format: 'pptx and pdf' }, rows: [] });
    return facts;
  });
  const facts = data.value;
  const [pptxBuf, pdfBuf] = await Promise.all([pptx(period, facts, when), Promise.resolve(pdf(period, facts, when))]);
  const id = 'RPT-' + period.slice(0, 1).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
  const deck = { id, period, region, when, title: titleFor(period, region, when), slides: slidesFor(period, facts, when), facts, pptx: pptxBuf, pdf: pdfBuf, trace: data.steps };
  cache.set(id, deck);
  return deck;
}

function get(id) { return cache.get(id) || null; }

function schedule(opts) {
  const period = opts.period === 'monthly' ? 'monthly' : 'weekly';
  const region = opts.region || 'Americas';
  const to = opts.to || 'maria.alvarez@northwind.example';
  const info = require('./mail').deliver({
    from: 'mops@northwind.example',
    to,
    subject: `Scheduled: ${period} ${region} report, Mondays at 9:00`,
    text: `This queues the ${period} report for ${region} every Monday at 9:00 to ${to}. The deck is held in the demo mail catcher. Nothing was sent through a company mail system.`
  });
  return { ok: true, when: 'Monday 9:00', period, region, to, messageId: info.messageId, queued: true };
}

function demoWorkbook() {
  const XLSX = require('xlsx');
  const rows = [
    ['Full Name', 'Work e-mail', 'Org', 'Job title', 'Where', 'Opt in'],
    ['Nina Vale', 'nina.vale@acme.example', 'Acme Metals', 'CIO', 'Chicago, United States', 'yes'],
    ['Nina Vale', 'nina.vale@acme.example', 'Acme Metals', 'CIO', 'Chicago, United States', 'yes'],
    ['Jürgen Weiß', 'juergen.weiss@nordbahn.example', 'Nordbahn', 'Director', 'Berlin, Germany', '']
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Attendees');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { build, get, schedule, gather, slidesFor, pdf, pptx, demoWorkbook, cache };
