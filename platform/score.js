'use strict';

// Fit stays under the MQL line on its own. Behaviour (opens, clicks,
// registrations) is what crosses it, so a send can be shown moving the number.
const MQL_THRESHOLD = 70;

function fitOf(title, employees, tier) {
  let t = 8;
  if (/^(CIO|CISO|CTO|CMO)$/.test(title || '')) t = 25;
  else if (/^VP\b/.test(title || '') || /Vice President/.test(title || '')) t = 18;
  else if (/Director/.test(title || '')) t = 12;
  const size = (employees || 0) >= 1000 ? 15 : 8;
  const named = tier === 1 ? 10 : 0;
  return t + size + named;
}

function behaviorOf(kinds) {
  let b = 0;
  for (const k of kinds) {
    if (k === 'open') b += 8;
    else if (k === 'click') b += 20;
    else if (k === 'registration') b += 25;
    else if (k === 'attendance') b += 15;
  }
  return Math.min(50, b);
}

function stageOf(score) { return score >= MQL_THRESHOLD ? 'mql' : 'lead'; }

module.exports = { MQL_THRESHOLD, fitOf, behaviorOf, stageOf };
