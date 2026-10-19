'use strict';

// Home status. The full policy engine in the brain is the remaining module.
const MODULES = [
  { id: 'data', name: 'Data core', replaces: 'Snowflake marts and Airtable trackers', status: 'built', href: '/platform/data' },
  { id: 'engage', name: 'Engage', replaces: 'Eloqua', status: 'built', href: '/platform/engage' },
  { id: 'crm', name: 'CRM bridge', replaces: 'Salesforce', status: 'built', href: '/platform/crm' },
  { id: 'plan', name: 'Plan and spend', replaces: 'Command Center and Airtable', status: 'built', href: '/platform/spend' },
  { id: 'insights', name: 'Insights', replaces: 'Power BI and Tableau', status: 'built', href: '/platform/insights' },
  { id: 'brain', name: 'Brain API', replaces: 'The tag, the policy, and the why feed', status: 'built', href: '/platform/brain' }
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
  },
  crm: {
    replaces: 'Salesforce',
    screens: 8,
    fields: 14,
    minutes: 25,
    askId: 'upload-chicago',
    proof: '@mops upload this attendee file to SFDC for the Chicago roundtable',
    source: 'Operator baseline for mapping a messy badge export, assigning AE and SDR owners, and loading campaign members. Not a stopwatch of a Northwind employee.'
  },
  plan: {
    replaces: 'Command Center and Airtable',
    screens: 7,
    fields: 18,
    minutes: 40,
    askId: 'budget-chicago',
    proof: '@mops new budget: Chicago security roundtable, $180K',
    source: 'Operator baseline for a budget request, the $150K approval, a BAN, a campaign code, and a SOW draft. Not a stopwatch of a Northwind employee.'
  },
  insights: {
    replaces: 'Power BI and Tableau',
    screens: 5,
    fields: 9,
    minutes: 30,
    askId: 'weekly-americas',
    proof: '@mops weekly report for Americas',
    source: 'Operator baseline for a weekly regional deck and a slide export. Not a stopwatch of a Northwind employee.'
  },
  brain: {
    replaces: 'The tag, the policy, and the why feed',
    screens: 11,
    fields: 22,
    minutes: 45,
    askId: 'chicago-changes',
    proof: '@mops what changed on the Chicago roundtable',
    source: 'Operator baseline for reading policy, approval, and the why across the old tools. Not a stopwatch of a Northwind employee.'
  }
};

module.exports = { MODULES, BASELINES };
