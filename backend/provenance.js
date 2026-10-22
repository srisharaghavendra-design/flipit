// Provenance sits beside the audit log. Every field write records who changed it,
// which channel it came from, and the message it was read from.
const core = require('./core');

const INBOX = [
  { id: 'EM-JH-1014', channel: 'Email', actor: 'Jordan Hale', at: '2026-10-14T15:04:00.000Z', subject: 'River North Club moved', excerpt: 'The River North Club moved us to 19 March. The original room is gone — it is Salon B, one day only.', lifecycleHint: 'Chicago' },
  { id: 'WX-CHI-ROSA', channel: 'Webex', actor: 'Maria Alvarez', at: '2026-10-16T18:22:00.000Z', subject: 'Chicago owner', excerpt: 'Rosa Diaz covers the Chicago accounts. Put her on this one.', lifecycleHint: 'Chicago' },
  { id: 'APP-CHRIS-REV', channel: 'App', actor: 'Chris M.', at: '2026-10-18T11:10:00.000Z', subject: 'Budget revision', excerpt: 'Chris approved the Chicago revision at $180,000 in the app.', lifecycleHint: 'Chicago' }
];

function ensure() {
  core.db.exec(`CREATE TABLE IF NOT EXISTS provenance(
    id TEXT PRIMARY KEY, lifecycle_id TEXT, field TEXT, old_value TEXT, new_value TEXT,
    channel TEXT, actor TEXT, message_id TEXT, excerpt TEXT, why TEXT, at TEXT
  )`);
  core.db.exec(`CREATE TABLE IF NOT EXISTS inbound_messages(
    id TEXT PRIMARY KEY, channel TEXT, actor TEXT, at TEXT, subject TEXT, excerpt TEXT, lifecycle_hint TEXT
  )`);
  const ins = core.db.prepare('INSERT OR IGNORE INTO inbound_messages(id,channel,actor,at,subject,excerpt,lifecycle_hint) VALUES(?,?,?,?,?,?,?)');
  for (const m of INBOX) ins.run(m.id, m.channel, m.actor, m.at, m.subject, m.excerpt, m.lifecycleHint);
}

function touch(row, rec) {
  if (!row || !rec) return null;
  const oldValue = rec.oldValue == null ? '' : String(rec.oldValue);
  const newValue = rec.newValue == null ? '' : String(rec.newValue);
  if (!rec.force && oldValue === newValue) return null;
  ensure();
  const item = {
    id: rec.id || ('PV-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    field: String(rec.field || ''),
    oldValue, newValue,
    channel: rec.channel || 'App',
    actor: rec.actor || '@mops',
    messageId: rec.messageId || '',
    excerpt: String(rec.excerpt || '').slice(0, 280),
    why: String(rec.why || '').slice(0, 400),
    at: rec.at || new Date().toISOString()
  };
  row.changes = Array.isArray(row.changes) ? row.changes : [];
  if (row.changes.some(c => c.messageId === item.messageId && c.field === item.field && c.newValue === item.newValue)) return item;
  row.changes.push(item);
  if (row.changes.length > 40) row.changes = row.changes.slice(-40);
  try {
    core.db.prepare('INSERT OR REPLACE INTO provenance(id,lifecycle_id,field,old_value,new_value,channel,actor,message_id,excerpt,why,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(item.id, row.id, item.field, item.oldValue, item.newValue, item.channel, item.actor, item.messageId, item.excerpt, item.why, item.at);
  } catch (e) { console.error('provenance', e && e.message || e); }
  return item;
}

const NAMES = { campaign_name: 'the name', city: 'the city', country: 'the country', budget: 'the amount', currency: 'the currency', start_date: 'the start date', end_date: 'the end date', product: 'the product', audience: 'the audience', program: 'the program', venue: 'the venue', owner: 'the owner', campaign_type: 'the type', quarter: 'the quarter', vendor: 'the agency' };

function fromBrief(row, text, user) {
  if (!row || !row.fields) return;
  const excerpt = String(text || '').slice(0, 220);
  const actor = (user && user.name) || row.fields.owner || 'you';
  for (const [k, v] of Object.entries(row.fields)) {
    if (v == null || v === '' || typeof v === 'object') continue;
    if (!NAMES[k]) continue;
    touch(row, { field: k, oldValue: '', newValue: v, channel: 'App', actor, messageId: 'APP-BRIEF-' + row.id, excerpt, why: `Set ${NAMES[k]} to ${v} from the brief you sent in the app.` });
  }
}

function diff(row, before, meta) {
  if (!row || !row.fields) return;
  before = before || {};
  for (const [k, v] of Object.entries(row.fields)) {
    if (typeof v === 'object') continue;
    const old = before[k] == null ? '' : String(before[k]);
    const next = v == null ? '' : String(v);
    if (old === next || !NAMES[k]) continue;
    touch(row, { field: k, oldValue: old, newValue: next, channel: meta.channel || 'App', actor: meta.actor || 'you', messageId: meta.messageId || ('APP-EDIT-' + row.id), excerpt: meta.excerpt || 'Edited on the campaign card', why: `Changed ${NAMES[k]} from ${old || 'blank'} to ${next} because you edited it in the app.` });
  }
}

function noteAction(row, action, user) {
  if (!row || !action) return;
  const who = (user && user.name) || '@mops';
  if (action === 'approve-budget' && row.budget && row.budget.status === 'approved') {
    const money = require('./money').format(row.budget.total, row.fields.currency || 'USD');
    touch(row, { field: 'budget', oldValue: 'pending approval', newValue: money + ' approved', channel: 'App', actor: who, messageId: 'APP-' + row.id + '-approve', excerpt: who + ' tapped Approve in the app.', why: `Approved ${money} because ${who} approved it in the app.`, force: true });
  }
  if (action === 'reject-budget' && row.budget && row.budget.status === 'rejected') {
    touch(row, { field: 'budget', oldValue: 'pending approval', newValue: 'rejected', channel: 'App', actor: who, messageId: 'APP-' + row.id + '-reject', excerpt: who + ' tapped Reject.', why: `Rejected the budget because ${who} rejected it in the app.`, force: true });
  }
  if (action === 'submit-budget' && row.budget) {
    const money = require('./money').format(row.budget.total, row.fields.currency || 'USD');
    touch(row, { field: 'budget', oldValue: 'draft', newValue: row.budget.status, channel: 'App', actor: who, messageId: 'APP-' + row.id + '-submit', excerpt: 'Submitted from the campaign card.', why: row.budget.status === 'pending_approval' ? `Sent ${money} to Chris M. because it is over $150,000.` : `Submitted ${money}. It is inside $150,000, so policy approved it.`, force: true });
  }
  if (action === 'sign-sow' && row.sow && row.sow.signedBy) {
    touch(row, { field: 'sow', oldValue: 'draft', newValue: 'signed by ' + row.sow.signedBy, channel: 'App', actor: who, messageId: 'APP-' + row.id + '-sign', excerpt: who + ' signed the SOW in the app.', why: `Signed the SOW because ${who} signed it in the app.`, force: true });
  }
  if (action === 'confirm-upload' && row.setup && row.setup.mapping) {
    const rep = (row.setup.uploadPreview && row.setup.uploadPreview.report) || {};
    touch(row, { field: 'attendees', oldValue: '', newValue: (rep.ready || 0) + ' ready', channel: 'App', actor: who, messageId: 'APP-' + row.id + '-list', excerpt: 'Confirmed the attendee file in the app.', why: `Confirmed the attendee list. ${rep.ready || 0} ready, ${rep.duplicates || 0} duplicates removed, ${rep.consentHeld || 0} held for consent.`, force: true });
  }
}

function message(id) {
  ensure();
  return core.db.prepare('SELECT * FROM inbound_messages WHERE id=?').get(id) || INBOX.find(m => m.id === id) || null;
}
function inbox() { ensure(); return core.db.prepare('SELECT * FROM inbound_messages ORDER BY at').all(); }

module.exports = { touch, fromBrief, diff, noteAction, message, inbox, ensure, INBOX };
