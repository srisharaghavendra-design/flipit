'use strict';

const { current } = require('./db');
const { append } = require('./log');
const { now } = require('./clock');
const spend = require('./spend');

const FIELDS = [
  { key: 'our_pm', label: 'Our project manager' },
  { key: 'po_number', label: 'Purchase order' },
  { key: 'venue_contact', label: 'Day-of venue contact' }
];

function db() { return current(); }

async function sync(campaignId = 'CAMP-CHI', ctx = {}) {
  const packets = await spend.packets();
  const packet = packets.find(p => p.campaignId === campaignId) || null;
  const fields = (packet && packet.sow && packet.sow.fields) || {};
  const approved = !!(packet && packet.status === 'approved');
  const at = now();
  const rows = [];
  await db().tx(async (q) => {
    for (const field of FIELDS) {
      const value = String(fields[field.key] || '').trim();
      const status = approved && value ? 'approved' : value ? 'filled' : 'open';
      const id = campaignId + ':' + field.key;
      await q.run(`INSERT INTO command_checks(id, campaign_id, field_key, label, value, status, actor, updated_at)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, status = excluded.status, actor = excluded.actor, updated_at = excluded.updated_at`,
        [id, campaignId, field.key, field.label, value, status, ctx.actor || '', at]);
      rows.push({ id, field: field.key, label: field.label, value, status });
    }
    const open = rows.filter(r => r.status === 'open').map(r => r.label);
    const why = open.length
      ? 'Waiting on you: ' + open.join(', ') + '.'
      : (approved ? 'Chris approved the Chicago budget. The human-check fields are on the SOW.' : 'The human-check fields are saved and waiting for Chris.');
    await append(q, { entity: 'command_checks', entityId: campaignId, op: 'update', actor: ctx.actor || 'Plan', channel: ctx.channel || 'App', sourceMessage: ctx.sourceMessage || '', why, after: { rows } });
  });
  return { campaignId, packet: packet && { status: packet.status, amountUsd: packet.amountUsd, ban: packet.ban, campaignCode: packet.campaignCode }, checks: rows };
}

async function list(campaignId = 'CAMP-CHI') {
  return db().all('SELECT id, campaign_id, field_key, label, value, status, actor, updated_at FROM command_checks WHERE campaign_id = ? ORDER BY field_key', [campaignId]);
}

module.exports = { FIELDS, sync, list };
