'use strict';

const { now } = require('./clock');

const INSERT = `INSERT INTO event_log(at, entity, entity_id, op, actor, channel, source_message, why, before_json, after_json)
  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function args(row, at) {
  return [
    row.at || at || now(),
    row.entity,
    String(row.entityId),
    row.op || 'insert',
    row.actor || 'system',
    row.channel || 'system',
    row.sourceMessage || '',
    row.why || '',
    row.before == null ? null : JSON.stringify(row.before),
    row.after == null ? null : JSON.stringify(row.after)
  ];
}

async function append(q, row) {
  await q.run(INSERT, args(row));
}

function pack(row, at) { return args(row, at); }

module.exports = { append, pack, INSERT };
