const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const reports = require('../reports');

const facts = {
  region: 'Americas', campaigns: 8, live: 6, spend: 420000, budget: 710000, leads: 140, mqls: 48,
  pipeline: 2400000, goal: 3600000, warehouseRegions: 3, warehouseBehind: 1,
  bars: [{ label: 'Events', spend: 180000, budget: 260000 }, { label: 'ABM', spend: 140000, budget: 220000 }, { label: 'Digital', spend: 100000, budget: 230000 }],
  risks: [{ name: 'Chicago CIO Salon', note: 'Registrations are light', fixed: false }, { name: 'Reminder queued', note: 'Already drafted', fixed: true }],
  actions: ['Invite the opted-in list', 'Ask Chris to sign the SOW'],
  names: ['Chicago CIO Salon', 'Hybrid Work Search']
};

test('weekly and monthly decks are real files', async () => {
  const weeklySlides = reports.slidesFor('weekly', facts, '2026-10-19');
  const monthlySlides = reports.slidesFor('monthly', facts, '2026-10-19');
  assert.ok(weeklySlides.length >= 5 && weeklySlides.length <= 8);
  assert.ok(monthlySlides.length > weeklySlides.length);
  assert.ok(monthlySlides.some(s => /quarter/i.test(s.title)));
  const pptxBuf = await reports.pptx('weekly', facts, '2026-10-19');
  const pdfBuf = reports.pdf('weekly', facts, '2026-10-19');
  const monthBuf = await reports.pptx('monthly', facts, '2026-10-19');
  assert.equal(pptxBuf.slice(0, 2).toString(), 'PK');
  assert.equal(pdfBuf.slice(0, 5).toString(), '%PDF-');
  assert.equal(monthBuf.slice(0, 2).toString(), 'PK');
  const dir = '/opt/cursor/artifacts';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'weekly.pptx'), pptxBuf);
  fs.writeFileSync(path.join(dir, 'weekly.pdf'), pdfBuf);
  fs.writeFileSync(path.join(dir, 'monthly.pptx'), monthBuf);
});

function zipXml(buf) {
  const zlib = require('zlib');
  let out = '';
  let i = 0;
  while (i + 30 < buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extra;
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString();
    const data = buf.subarray(start, start + comp);
    if (name.endsWith('.xml')) out += (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i = start + comp;
  }
  return out;
}

test('the deck wordmark follows BRAND_NAME', async () => {
  const { brandName, brandCompany } = require('../../brand');
  assert.equal(brandName(), 'Northwind');
  assert.equal(brandCompany(), 'Northwind Networks');
  assert.match(reports.pdf('weekly', facts, '2026-10-19').toString('latin1'), /\(NORTHWIND\) Tj/);
  const prev = process.env.BRAND_NAME;
  process.env.BRAND_NAME = 'Harborline';
  try {
    assert.equal(brandName(), 'Harborline');
    assert.equal(brandCompany(), 'Harborline Networks');
    const slides = reports.slidesFor('weekly', facts, '2026-10-19');
    assert.match(slides[0].sub, /^Harborline Networks ·/);
    const pdfBuf = reports.pdf('weekly', facts, '2026-10-19');
    assert.match(pdfBuf.toString('latin1'), /\(HARBORLINE\) Tj/);
    assert.doesNotMatch(pdfBuf.toString('latin1'), /\(NORTHWIND\) Tj/);
    const pptxBuf = await reports.pptx('weekly', facts, '2026-10-19');
    assert.match(zipXml(pptxBuf), /HARBORLINE/);
    process.env.BRAND_NAME = 'Harborline Networks';
    assert.equal(brandCompany(), 'Harborline Networks');
    process.env.BRAND_NAME = '  <Harbor&>  ';
    assert.equal(brandName(), 'Harbor');
  } finally {
    if (prev == null) delete process.env.BRAND_NAME;
    else process.env.BRAND_NAME = prev;
  }
});
