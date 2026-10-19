'use strict';

// Segment windows use a pinned demo day so "opened last month" stays true.
// Writes that happen while someone is clicking use the real clock.
const DEMO_DAY = '2026-10-19T15:00:00.000Z';

function demoDay() { return process.env.PLATFORM_CLOCK || DEMO_DAY; }
function now() { return new Date().toISOString(); }
function daysBeforeDemo(n) {
  return new Date(new Date(demoDay()).getTime() - n * 86400000).toISOString();
}

module.exports = { demoDay, now, daysBeforeDemo, DEMO_DAY };
