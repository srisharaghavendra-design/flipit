'use strict';

// Home status. Later runs fill CRM, plan, insights, and the full brain.
const MODULES = [
  { id: 'data', name: 'Data core', replaces: 'Snowflake marts and Airtable trackers', status: 'built', href: '/platform/data' },
  { id: 'engage', name: 'Engage', replaces: 'Eloqua', status: 'built', href: '/platform/engage' },
  { id: 'crm', name: 'CRM bridge', replaces: 'Salesforce', status: 'next', href: null },
  { id: 'plan', name: 'Plan and spend', replaces: 'Command Center and Airtable', status: 'next', href: null },
  { id: 'insights', name: 'Insights', replaces: 'Power BI and Tableau', status: 'next', href: null },
  { id: 'brain', name: 'Brain API', replaces: 'The tag, the policy, and the why feed', status: 'next', href: '/platform/ask', note: 'The ask box already routes Data core and Engage.' }
];

const BASELINES = {
  data: {
    replaces: 'Snowflake marts and Airtable trackers',
    screens: 6,
    fields: 11,
    minutes: 20,
    askId: 'illinois-email',
    proof: '@mops who can I email in Illinois',
    source: 'Operator baseline for one consented-list pull: a warehouse worksheet plus an Airtable check. Not a stopwatch of a Northwind employee.'
  },
  engage: {
    replaces: 'Eloqua',
    screens: 9,
    fields: 16,
    minutes: 35,
    askId: 'send-chicago',
    proof: '@mops send the Chicago invite to CIOs in Illinois who opened last month',
    source: 'Operator baseline for building that segment, the email, and the send in Eloqua. Not a stopwatch of a Northwind employee.'
  }
};

module.exports = { MODULES, BASELINES };
