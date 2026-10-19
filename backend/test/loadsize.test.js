const test = require('node:test');
const assert = require('node:assert/strict');
const { limits, resolve } = require('../loadsize');

test('a small host does not default to a million contacts', () => {
  const lim = limits({}, 512 * 1024 * 1024);
  assert.ok(lim.defaultContacts <= 5000);
  assert.ok(lim.defaultSends <= 500);
  assert.ok(lim.maxContacts < 1_000_000);
  assert.ok(lim.maxSends < 100_000);
  const d = resolve({}, lim);
  assert.equal(d.contacts, lim.defaultContacts);
  assert.equal(d.sends, lim.defaultSends);
  assert.equal(d.capped, false);
});

test('the CI-sized load test still fits under the small-host cap', () => {
  const lim = limits({}, 512 * 1024 * 1024);
  const r = resolve({ contacts: 20000, sends: 2000 }, lim);
  assert.equal(r.contacts, 20000);
  assert.equal(r.sends, 2000);
  assert.equal(r.capped, false);
});

test('a request for 1M contacts is clamped unless explicitly allowed', () => {
  const small = limits({}, 8 * 1024 ** 3);
  const clamped = resolve({ contacts: 1_000_000, sends: 100_000 }, small);
  assert.equal(clamped.contacts, small.maxContacts);
  assert.ok(clamped.contacts < 1_000_000);
  assert.equal(clamped.capped, true);
  const open = limits({ LOAD_ALLOW_MILLION: '1' }, 8 * 1024 ** 3);
  const full = resolve({ contacts: 1_000_000, sends: 100_000 }, open);
  assert.equal(full.contacts, 1_000_000);
  assert.equal(full.sends, 100_000);
  assert.equal(full.capped, false);
});

test('Vercel Hobby uses a small labelled default even on a large machine', () => {
  const lim = limits({ VERCEL: '1' }, 64 * (1024 ** 3));
  assert.equal(lim.vercel, true);
  assert.ok(lim.defaultContacts <= 2000);
  assert.ok(lim.defaultSends <= 200);
  assert.ok(lim.maxContacts <= 8000);
  assert.ok(lim.maxSends <= 800);
  assert.match(lim.label, /Hobby/);
  const clamped = resolve({ contacts: 1_000_000, sends: 100_000 }, lim);
  assert.equal(clamped.contacts, lim.maxContacts);
  assert.equal(clamped.capped, true);
});

test('LOAD_DEFAULT_CONTACTS and LOAD_MAX_CONTACTS override the memory guess', () => {
  const lim = limits({ LOAD_DEFAULT_CONTACTS: '100', LOAD_DEFAULT_SENDS: '10', LOAD_MAX_CONTACTS: '150', LOAD_MAX_SENDS: '20' }, 512 * 1024 * 1024);
  assert.deepEqual(resolve({}, lim), { contacts: 100, sends: 10, capped: false, limits: lim });
  assert.equal(resolve({ contacts: 999, sends: 99 }, lim).contacts, 150);
});
