'use strict';

// The Chicago badge export a marketer would attach. Junk above the header,
// odd column names, a duplicate, a missing consent, a bad email, and a formula.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'samples', 'chicago-attendees.xlsx');

const ROWS = [
  ['Chicago Security Roundtable — badge desk export', '', '', '', 'Printed 18 Mar 2026. Desk copy.'],
  ['Do not mail this sheet.'],
  [],
  ['Attendee', 'E-mail Address', 'Org', 'Job Title', 'Location (City, Country)', 'Mobile', 'Attended?', 'Consent', 'Badge #', 'Internal notes'],
  ['Nina Vale', 'nina.vale@badgenorth.example', 'Badge North', 'CIO', 'Chicago, United States', '+1 312 555 0142', 'Yes', 'yes', '1042', ''],
  ['Nina Vale', 'nina.vale@badgenorth.example', 'Badge North', 'CIO', 'Chicago, United States', '+1 312 555 0142', 'Yes', 'yes', '1042', 'duplicate scan'],
  ['Owen Hart', 'owen.hart@cedarfork.example', 'Cedar Fork', 'Network Manager', 'Chicago, United States', '+1 312 555 0198', 'Y', 'yes', '1104', ''],
  ['Ava Klein', 'ava.klein@lumenpeak.example', 'Lumen Peak', 'VP Security', 'Chicago', '+1 312 555 0110', 'attended', 'yes', '1108', ''],
  ['Samir Abbas', 'samir.abbas@quietlane.example', 'Quiet Lane', 'Procurement Manager', 'Toronto, Canada', '+1 416 555 0170', 'No', 'yes', '1202', ''],
  ['Jürgen Weiß', 'juergen.weiss@nordbahn.example', 'Nordbahn', 'Director', 'Berlin, Germany', '+49 30 555010', 'Yes', '', '1301', ''],
  ['Pat Invalid', 'not-an-email', 'Somewhere', 'CIO', 'Chicago, United States', '', 'Yes', 'yes', '1400', ''],
  ['Ada Formula', 'ada.formula@evil.example', 'Evil Co', 'CIO', 'Chicago, United States', '+1 312 555 0100', 'Yes', 'yes', '1500', '=HYPERLINK("http://evil.example","click")']
];

function buildBuffer() {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ROWS);
  XLSX.utils.book_append_sheet(wb, ws, 'Badge desk');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buffer() {
  if (fs.existsSync(FILE)) return fs.readFileSync(FILE);
  return buildBuffer();
}

module.exports = { FILE, ROWS, buildBuffer, buffer, filename: 'chicago-attendees.xlsx' };
