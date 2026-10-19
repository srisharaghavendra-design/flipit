'use strict';

const data = require('./data');

const MODULE = {
  accounts: 'data', contacts: 'data', consent: 'data', campaigns: 'data', events: 'data',
  activities: 'data', sows: 'data', budgets: 'data',
  segments: 'engage', templates: 'engage', sends: 'engage', journeys: 'engage', journey_members: 'engage',
  crm_uploads: 'crm', crm_objects: 'crm', crm_queue: 'crm',
  plan_packets: 'plan', codes: 'plan', actuals: 'plan',
  ask_runs: 'brain'
};

function moduleOf(entity) {
  return MODULE[entity] || 'data';
}

async function feed({ q = '', limit = 40 } = {}) {
  const result = await data.log({ q, limit });
  const rows = result.rows.map(row => ({
    id: row.id,
    at: row.at,
    module: moduleOf(row.entity),
    entity: row.entity,
    actor: row.actor,
    channel: row.channel,
    source: row.source_message,
    why: row.why
  }));
  return { total: result.total, rows };
}

module.exports = { feed, moduleOf };
