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
