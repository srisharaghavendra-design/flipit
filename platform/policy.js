'use strict';

const { LIMIT_USD } = require('../backend/money');

// Deterministic rules. The ask router calls these. It does not call a model.
const RULES = [
  {
    id: 'approval',
    name: 'Approval',
    text: 'Over $150,000 is Waiting on Chris. He approves it from Plan and spend, or with @mops approve Chicago while signed in as Chris M. The BAN and the campaign code are minted then. $150,000 and under is approved by this rule.'
  },
  {
    id: 'consent',
    name: 'Consent',
    text: 'Only an opted-in contact is mailed. Germany and the other strict countries need an explicit yes. Unknown consent is held.'
  },
  {
    id: 'owners',
    name: 'Owners',
    text: 'A tier-1 named account goes to the territory AE. An executive title goes to the AE. Every other contact goes to the SDR. An unknown country is held.'
  },
  {
    id: 'scoring',
    name: 'Scoring',
    text: 'Fit plus behaviour. An MQL starts at 70. An open stays a lead. A click crosses the line. A simulated send is about 45% open and about 12% click.'
  },
  {
    id: 'codes',
    name: 'Naming',
    text: 'Campaign codes stay FY{quarter}-{region}-{channel}-{id}. BAN ids follow the cost center. A second mint returns the same ids.'
  }
];

function budget(usd) {
  const over = Number(usd) > LIMIT_USD;
  if (over) {
    return {
      status: 'pending',
      label: 'Waiting on Chris',
      approver: 'Chris M.',
      mint: false,
      auto: false,
      threshold: LIMIT_USD
    };
  }
  return {
    status: 'approved',
    label: 'Approved',
    approver: null,
    mint: true,
    auto: true,
    threshold: LIMIT_USD
  };
}

function isApprover(actor, role) {
  return role === 'approver' || actor === 'Chris M.';
}

function explain(usd) {
  const decision = budget(usd);
  if (decision.mint) return `$${Math.round(usd).toLocaleString('en-US')} is at or under $150,000, so the policy approves it and the code can be minted.`;
  return `$${Math.round(usd).toLocaleString('en-US')} is over $150,000. Waiting on Chris. The BAN and the campaign code are minted when he approves.`;
}

module.exports = { RULES, LIMIT_USD, budget, isApprover, explain };
