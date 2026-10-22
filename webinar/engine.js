'use strict';

// Offline lead-generation story for a live webinar.
// Rules mode is deterministic. A model key never triggers a network call.
const fs = require('fs');
const path = require('path');
const { brandName } = require('../brand');
const { demoDay } = require('../platform/clock');

const ASK = 'Find 20 APAC manufacturing companies expanding plants this quarter';
const SAMPLE_PATH = path.join(__dirname, 'sample-badges.csv');
const REPLAY_PATH = path.join(__dirname, 'replay.json');
const SLOTS = [
  'Tue 20 Oct 2026, 09:30 SGT',
  'Wed 21 Oct 2026, 14:00 SGT',
  'Thu 22 Oct 2026, 11:00 SGT'
];
const SENIOR = /\b(vp|vice president|director|head|chief|cfo|general manager|operations manager|procurement manager|plant manager)\b/i;

const ACCOUNTS = [
  { id: 'ACC-01', rank: 1, name: 'Kestrel Forge', country: 'Vietnam', city: 'Hai Phong', sector: 'Precision metal forming', fit: 96, employees: 2400, domain: 'kestrelforge.example', signal: 'Broke ground on a second stamping hall in Hai Phong this quarter.', source: 'APAC Plant Gazette, 12 Oct 2026', priority: 'Connect the new hall to the press line without a second network.', angle: 'One plant network for the new hall and the line they already run.', points: ['First steel in Hai Phong is planned for December.', 'The current press line still sits on a separate vendor network.', 'Priya Sharma holds the expansion budget.'], committee: [{ name: 'Priya Sharma', title: 'VP Manufacturing', role: 'Economic buyer' }, { name: 'Bao Nguyen', title: 'Plant Manager, Hai Phong', role: 'Champion' }, { name: 'Linh Tran', title: 'IT Operations', role: 'Technical evaluator' }] },
  { id: 'ACC-02', rank: 2, name: 'Paperbark Alloys', country: 'Australia', city: 'Wollongong', sector: 'Plate mill', fit: 94, employees: 1800, domain: 'paperbarkalloys.example', signal: 'Approved a plate-mill expansion in Wollongong this quarter.', source: 'Coral Sea Factory File, 3 Oct 2026', priority: 'Put the new mill on the same maintenance data as the old one.', angle: 'Reliability data from day one on the new mill.', points: ['The board signed the mill extension in October.', 'Stoppages on the old mill are still tracked in a spreadsheet.', 'James Okonkwo owns the plant budget.'], committee: [{ name: 'James Okonkwo', title: 'Plant Director', role: 'Economic buyer' }, { name: 'Ella Broome', title: 'Reliability Lead', role: 'Champion' }, { name: 'Tom Nguyen', title: 'OT Engineer', role: 'Technical evaluator' }] },
  { id: 'ACC-03', rank: 3, name: 'Saffron Circuit Works', country: 'India', city: 'Pune', sector: 'Electronics assembly', fit: 92, employees: 3100, domain: 'saffroncircuit.example', signal: 'Adding a third SMT line in Pune this quarter.', source: 'Peninsula Manufacturing Weekly, 8 Oct 2026', priority: 'Bring the new SMT line up without a quality blind spot.', angle: 'Line data the quality team can read on day one.', points: ['The third line is scheduled for November.', 'The first two lines do not share a defect feed.', 'Anika Rao is hiring the line crew now.'], committee: [{ name: 'Anika Rao', title: 'Head of Operations', role: 'Economic buyer' }, { name: 'Rohan Iyer', title: 'SMT Manager', role: 'Champion' }, { name: 'Kavya Nair', title: 'Process Engineering', role: 'Technical evaluator' }] },
  { id: 'ACC-04', rank: 4, name: 'Tideglass Components', country: 'Singapore', city: 'Tuas', sector: 'Precision components', fit: 90, employees: 960, domain: 'tideglass.example', signal: 'Fitting out a clean assembly cell in Tuas this quarter.', source: 'Strait Plant Monitor, 1 Oct 2026', priority: 'Qualify the new cell before the year-end customer audit.', angle: 'A clean-cell record the auditor can follow.', points: ['The Tuas cell is in fit-out now.', 'Procurement is still choosing the line vendor.', 'Mei Lin Tan signs the supplier list.'], committee: [{ name: 'Mei Lin Tan', title: 'Procurement Manager', role: 'Economic buyer' }, { name: 'Farid Rahman', title: 'Plant Lead, Tuas', role: 'Champion' }, { name: 'Grace Lim', title: 'Quality Systems', role: 'Technical evaluator' }] },
  { id: 'ACC-05', rank: 5, name: 'Redcedar Robotics', country: 'Japan', city: 'Nagoya', sector: 'Robot cells', fit: 88, employees: 1500, domain: 'redcedarrobotics.example', signal: 'Expanding the Nagoya robot-cell hall this quarter.', source: 'Island Works Digest, 6 Oct 2026', priority: 'Keep the new cells on the same controls standard.', angle: 'One controls standard across the new hall.', points: ['Four new cells are on the Nagoya plan.', 'Each older cell still has its own vendor login.', 'Kenji Sato sets the engineering standard.'], committee: [{ name: 'Kenji Sato', title: 'Director of Engineering', role: 'Economic buyer' }, { name: 'Yuki Arai', title: 'Cell Lead', role: 'Champion' }, { name: 'Hana Mori', title: 'Controls Engineer', role: 'Technical evaluator' }] },
  { id: 'ACC-06', rank: 6, name: 'Monsoon Bearing Co.', country: 'Thailand', city: 'Rayong', sector: 'Bearings', fit: 86, employees: 2200, domain: 'monsoonbearing.example', signal: 'Pouring a second bearing hall in Rayong this quarter.', source: 'Monsoon Trade Desk, 9 Oct 2026', priority: 'Staff and monitor the new hall before the pour is finished.', angle: 'Name the economic buyer, not only the badge that was scanned.', points: ['The Rayong pour started in October.', 'Maintenance scanned in at the booth. The budget sits with the VP.', 'Niran Chaiyaporn holds the hall budget.'], committee: [{ name: 'Niran Chaiyaporn', title: 'VP Operations', role: 'Economic buyer' }, { name: 'Malee Srisuk', title: 'Plant Manager, Rayong', role: 'Champion' }, { name: 'Somchai Wattana', title: 'Maintenance Lead', role: 'User' }] },
  { id: 'ACC-07', rank: 7, name: 'Amberline Castings', country: 'Indonesia', city: 'Cikarang', sector: 'Die casting', fit: 84, employees: 1700, domain: 'amberline.example', signal: 'Adding a die-cast cell in Cikarang this quarter.', source: 'Archipelago Build Notes, 4 Oct 2026', priority: 'See scrap on the new cell in the first week.', angle: 'Scrap visibility before the cell is signed off.', points: ['The new cell arrives in November.', 'Scrap from the old cell is counted by hand.', 'Agus Pratama approves the cell.'], committee: [{ name: 'Agus Pratama', title: 'Operations Director', role: 'Economic buyer' }, { name: 'Sari Widodo', title: 'Foundry Manager', role: 'Champion' }, { name: 'Dewi Hartono', title: 'Process Engineer', role: 'User' }] },
  { id: 'ACC-08', rank: 8, name: 'Lanternmill Precision', country: 'Malaysia', city: 'Penang', sector: 'Precision machining', fit: 82, employees: 1300, domain: 'lanternmill.example', signal: 'Extending the Penang precision line this quarter.', source: 'Peninsula Manufacturing Weekly, 11 Oct 2026', priority: 'Keep the extension on the same job traveler as the current line.', angle: 'One traveler from the old line onto the extension.', points: ['The Penang extension is funded.', 'The first badge scan was missing a title. The second scan named the operations manager.', 'Daniel Teoh owns the plant budget.'], committee: [{ name: 'Daniel Teoh', title: 'VP Plants', role: 'Economic buyer' }, { name: 'Lila Chen', title: 'Operations Manager', role: 'Champion' }, { name: 'Aisha Karim', title: 'Controls', role: 'Technical evaluator' }] },
  { id: 'ACC-09', rank: 9, name: 'Harborline Steel', country: 'South Korea', city: 'Ulsan', sector: 'Steel', fit: 80, employees: 4100, domain: 'harborlinesteel.example', signal: 'Relining and extending the Ulsan plate line this quarter.', source: 'Harbour Works Ledger, 2 Oct 2026', priority: 'Track the reline spend against the plate-line plan.', angle: 'A capital-project view the CFO will actually open.', points: ['The Ulsan reline is a capital project this quarter.', 'Noah Park has to see cost and downtime together.', 'The mill superintendent runs the outage.'], committee: [{ name: 'Noah Park', title: 'CFO', role: 'Economic buyer' }, { name: 'Minseo Park', title: 'Mill Superintendent', role: 'Champion' }, { name: 'Joon Lee', title: 'Automation', role: 'Technical evaluator' }] },
  { id: 'ACC-10', rank: 10, name: 'Driftwood Motors', country: 'Philippines', city: 'Laguna', sector: 'Vehicle assembly', fit: 78, employees: 2800, domain: 'driftwoodmotors.example', signal: 'Adding a body-shop bay in Laguna this quarter.', source: 'Archipelago Build Notes, 7 Oct 2026', priority: 'Open the new bay with a named owner and a working email.', angle: 'Use the second badge scan, which carried the email the first one missed.', points: ['The Laguna bay is on the quarter plan.', 'The first scan had a VP title and no email.', 'Arun Desai owns plant expansion.'], committee: [{ name: 'Arun Desai', title: 'VP Plants', role: 'Economic buyer' }, { name: 'Luz Santos', title: 'Body Shop Manager', role: 'Champion' }, { name: 'Paolo Cruz', title: 'Facilities', role: 'Technical evaluator' }] },
  { id: 'ACC-11', rank: 11, name: 'Copperlane Foundry', country: 'Taiwan', city: 'Taichung', sector: 'Foundry', fit: 76, employees: 990, domain: 'copperlane.example', signal: 'Commissioning a second melt shop in Taichung this quarter.', source: 'Island Works Digest, 5 Oct 2026', priority: 'Watch energy and downtime on the new melt shop.', angle: 'Melt-shop energy and downtime on one page.', points: ['The second shop is in commissioning.', 'The first shop reports downtime at the end of the shift.', 'Chen Wei-lun signs the commissioning plan.'], committee: [{ name: 'Chen Wei-lun', title: 'Plant Director', role: 'Economic buyer' }, { name: 'Hsu Mei', title: 'Melt Shop Lead', role: 'Champion' }, { name: 'Lin Kuo', title: 'Maintenance Systems', role: 'Technical evaluator' }] },
  { id: 'ACC-12', rank: 12, name: 'Silkroad Sensors', country: 'China', city: 'Suzhou', sector: 'Industrial sensors', fit: 74, employees: 2600, domain: 'silkroadsensors.example', signal: 'Building a sensor-module hall in Suzhou this quarter.', source: 'Bay Industrial Note, 10 Oct 2026', priority: 'Know who buys, because the badge was an analyst.', angle: 'Ask for Zhou Liang. The scanned analyst is not the buyer.', points: ['The Suzhou hall is under construction.', 'The booth scan was a supply-chain analyst.', 'Zhou Liang holds the manufacturing budget.'], committee: [{ name: 'Zhou Liang', title: 'VP Manufacturing', role: 'Economic buyer' }, { name: 'Yan Fei', title: 'Suzhou Plant Manager', role: 'Champion' }, { name: 'Wei Zhang', title: 'Supply Chain Analyst', role: 'User' }] },
  { id: 'ACC-13', rank: 13, name: 'Orchard Press Metals', country: 'New Zealand', city: 'Hamilton', sector: 'Metal press', fit: 72, employees: 640, domain: 'orchardpress.example', signal: 'Adding a press in Hamilton this quarter.', source: 'Coral Sea Factory File, 13 Oct 2026', priority: 'Have the new press on the same schedule board as the old one.', angle: 'One schedule board for both presses.', points: ['The Hamilton press was ordered in October.', 'Scheduling is still a wall chart.', 'Hannah Cole runs the plant.'], committee: [{ name: 'Hannah Cole', title: 'General Manager', role: 'Economic buyer' }, { name: 'Peter Rangi', title: 'Press Lead', role: 'Champion' }, { name: 'Aroha Bennett', title: 'Quality', role: 'Technical evaluator' }] },
  { id: 'ACC-14', rank: 14, name: 'Nightjar Hydraulics', country: 'Vietnam', city: 'Binh Duong', sector: 'Hydraulics', fit: 70, employees: 1100, domain: 'nightjar.example', signal: 'Expanding the Binh Duong assembly shed this quarter.', source: 'Mekong Industry Brief, 14 Oct 2026', priority: 'Test the new benches before the first customer shipment.', angle: 'Test results from the new benches, not a separate logbook.', points: ['The shed extension is underway.', 'Test results still live in a paper log.', 'Trang Pham owns operations.'], committee: [{ name: 'Trang Pham', title: 'Operations Director', role: 'Economic buyer' }, { name: 'Minh Le', title: 'Assembly Manager', role: 'Champion' }, { name: 'Khoa Dang', title: 'Test Engineering', role: 'Technical evaluator' }] },
  { id: 'ACC-15', rank: 15, name: 'Glasskettle Packaging', country: 'India', city: 'Sri City', sector: 'Packaging', fit: 68, employees: 2000, domain: 'glasskettle.example', signal: 'Installing a second glass line in Sri City this quarter.', source: 'Peninsula Manufacturing Weekly, 15 Oct 2026', priority: 'Hold yield on the new line to the same standard as line one.', angle: 'Yield on the new line beside line one.', points: ['Line two is being installed now.', 'Yield on line one is the standard they will be judged on.', 'Meera Iyer is the plant head.'], committee: [{ name: 'Meera Iyer', title: 'Plant Head', role: 'Economic buyer' }, { name: 'Arvind Shah', title: 'Line Manager', role: 'Champion' }, { name: 'Neha Kapoor', title: 'Packaging Engineering', role: 'Technical evaluator' }] },
  { id: 'ACC-16', rank: 16, name: 'Bluegum Extrusions', country: 'Australia', city: 'Geelong', sector: 'Extrusion', fit: 66, employees: 870, domain: 'bluegum.example', signal: 'Adding an extrusion press in Geelong this quarter.', source: 'Coral Sea Factory File, 16 Oct 2026', priority: 'Start the new press with a maintenance plan, not a blank book.', angle: 'A maintenance plan that exists before the press is hot.', points: ['The Geelong press arrives this quarter.', 'Tomas Reed is the general manager and was at the booth.', 'The maintenance planner needs the plan before startup.'], committee: [{ name: 'Tomas Reed', title: 'General Manager', role: 'Economic buyer' }, { name: 'Nina Walsh', title: 'Extrusion Lead', role: 'Champion' }, { name: 'Owen Clarke', title: 'Maintenance Planner', role: 'Technical evaluator' }] },
  { id: 'ACC-17', rank: 17, name: 'Pearlshift Automation', country: 'Japan', city: 'Osaka', sector: 'Factory automation', fit: 64, employees: 1400, domain: 'pearlshift.example', signal: 'Fitting a new assembly cell in Osaka this quarter.', source: 'Island Works Digest, 17 Oct 2026', priority: 'Do not chase the intern who scanned the badge.', angle: 'Ask Emi Nakamura. The badge was an intern.', points: ['The Osaka cell is in fit-out.', 'The scanned badge says Intern.', 'Emi Nakamura owns production.'], committee: [{ name: 'Emi Nakamura', title: 'VP Production', role: 'Economic buyer' }, { name: 'Ken Okada', title: 'Osaka Cell Manager', role: 'Champion' }, { name: 'Hana Ito', title: 'Intern', role: 'User' }] },
  { id: 'ACC-18', rank: 18, name: 'Riverstone Ceramics', country: 'Thailand', city: 'Lamphun', sector: 'Industrial ceramics', fit: 62, employees: 760, domain: 'riverstone.example', signal: 'Adding a kiln hall in Lamphun this quarter.', source: 'Monsoon Trade Desk, 18 Oct 2026', priority: 'Watch kiln energy from the first firing.', angle: 'Kiln energy on the first firing, not after the month closes.', points: ['The new hall fires this quarter.', 'Energy is reviewed monthly today.', 'Pimchanok Saetang runs the plant.'], committee: [{ name: 'Pimchanok Saetang', title: 'Plant Director', role: 'Economic buyer' }, { name: 'Krit Wong', title: 'Kiln Manager', role: 'Champion' }, { name: 'Anong Boon', title: 'Process Quality', role: 'Technical evaluator' }] },
  { id: 'ACC-19', rank: 19, name: 'Marigold Wire', country: 'Indonesia', city: 'Batam', sector: 'Wire drawing', fit: 60, employees: 1250, domain: 'marigoldwire.example', signal: 'Extending the Batam drawing mill this quarter.', source: 'Archipelago Build Notes, 18 Oct 2026', priority: 'Treat the buyer as a door opener, not the budget owner.', angle: 'Thank Siti Aminah, then ask Budi Santoso.', points: ['The Batam mill extension is funded.', 'The booth badge was a buyer.', 'Budi Santoso holds the supply budget.'], committee: [{ name: 'Budi Santoso', title: 'VP Supply', role: 'Economic buyer' }, { name: 'Raka Putra', title: 'Drawing Mill Manager', role: 'Champion' }, { name: 'Siti Aminah', title: 'Buyer', role: 'User' }] },
  { id: 'ACC-20', rank: 20, name: 'Cinderpath Tools', country: 'Malaysia', city: 'Johor', sector: 'Cutting tools', fit: 58, employees: 540, domain: 'cinderpath.example', signal: 'Opening a second toolroom in Johor this quarter.', source: 'Strait Plant Monitor, 19 Oct 2026', priority: 'Share the tool library with the new room on opening day.', angle: 'One tool library for both rooms.', points: ['The Johor room opens this quarter.', 'The current library is a local spreadsheet.', 'Farah Ismail owns operations.'], committee: [{ name: 'Farah Ismail', title: 'Operations Director', role: 'Economic buyer' }, { name: 'Gopal Menon', title: 'Toolroom Manager', role: 'Champion' }, { name: 'Nurul Huda', title: 'Planning', role: 'Technical evaluator' }] }
];

let crm = [];
let sentKeys = new Set();
let caught = [];
let replayCache = null;

function demoLabel() {
  const d = new Date(demoDay());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

function aiNote() {
  const key = String(process.env.MOPS_API_KEY || '').trim();
  if (key) return { mode: 'rules', aiReady: true, ai: 'A key is set. This demo still answers from the recorded rules so the webinar cannot stall.' };
  return { mode: 'rules', aiReady: false, ai: 'Rules mode. No key needed.' };
}

function keyOf(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function accountByCompany(raw) {
  const key = keyOf(raw);
  if (!key) return null;
  return ACCOUNTS.find(a => keyOf(a.name) === key) || null;
}

function tidyTitle(s) {
  if (!s || !String(s).trim()) return '';
  let t = String(s).trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  t = t.replace(/\b(Of|The|And)\b/g, m => m.toLowerCase());
  t = t.replace(/\bVp\b/g, 'VP').replace(/\bCfo\b/g, 'CFO');
  return t;
}

function tidyName(s) {
  return String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

function validEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(email || '').trim());
}

function parseCsv(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(s => s.trim());
  return rows.map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] == null ? '' : String(r[i]); });
    return obj;
  });
}

function pick(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const want = name.toLowerCase().replace(/\s+/g, '');
    const hit = keys.find(k => k.toLowerCase().replace(/\s+/g, '') === want);
    if (hit) return String(row[hit] || '');
  }
  return '';
}

function junkKind(rec) {
  const name = rec.name.trim().toLowerCase();
  const email = rec.email.trim().toLowerCase();
  const company = rec.company.trim().toLowerCase();
  const badge = rec.badge.trim().toLowerCase();
  const title = rec.title.trim().toLowerCase();
  if (!name && !email && !company && !title && !badge) return 'Blank row';
  if (/^test\b/.test(name) || email === 'test@test.com' || company === 'test company' || badge === 'badge') return 'Test scan';
  if (/printer/.test(name)) return 'Badge printer';
  if (/walk-in/.test(name) || badge === 'walk') return 'Walk-in';
  if (!name || company === '???' || badge === 'junk-row' || (email && !validEmail(email))) return 'Bad email';
  return null;
}

function publicAccount(a) {
  return {
    id: a.id,
    rank: a.rank,
    name: a.name,
    country: a.country,
    city: a.city,
    sector: a.sector,
    fit: a.fit,
    employees: a.employees,
    signal: a.signal,
    source: a.source,
    why: 'Fit ' + a.fit + ' because ' + a.signal + ' ' + a.sector + ' is manufacturing, and the notice is dated this quarter.'
  };
}

function hunt(ask) {
  const text = String(ask || '').trim() || ASK;
  const accounts = ACCOUNTS.map(publicAccount);
  return {
    ...aiNote(),
    ask: text,
    matchedAsk: ASK,
    you: 'You asked: ' + text,
    agent: 'Ranked 20 fictional APAC manufacturers with a plant expansion dated this quarter.',
    why: 'A company is on the list only when the notice names a plant, the date is this quarter, and the sector is manufacturing. The fit score is that rank. Kestrel Forge is first because the Hai Phong hall is already breaking ground and the buyer is named.',
    source: 'APAC plant-expansion file, ' + demoLabel() + '.',
    trace: [
      { at: '0.2s', service: 'Account file', line: 'Read 20 plant-expansion notices filed this quarter.' },
      { at: '0.5s', service: 'Fit', line: 'Scored each notice for a named plant, a date this quarter, and a manufacturing sector.' },
      { at: '0.8s', service: 'Ranker', line: 'Ranked 20 accounts. Highest fit is 96, Kestrel Forge. Lowest fit is 58, Cinderpath Tools.' }
    ],
    accounts
  };
}

function brief(id) {
  const a = ACCOUNTS.find(x => x.id === id);
  if (!a) return null;
  const buyer = a.committee.find(c => c.role === 'Economic buyer') || a.committee[0];
  const champ = a.committee.find(c => c.role === 'Champion') || a.committee[1];
  const tech = a.committee.find(c => c.role === 'Technical evaluator') || a.committee[2];
  return {
    ...publicAccount(a),
    domain: a.domain,
    priorities: [a.priority, a.points[0], a.points[1]],
    committee: a.committee,
    angle: a.angle,
    talkingPoints: a.points,
    you: 'You opened ' + a.name + '.',
    agent: 'Wrote a one-page brief: priorities, the buying committee, a recommended angle, and talking points.',
    why: 'The angle follows the plant notice, because that is the budget already open this quarter. ' + buyer.name + ' is the economic buyer.',
    source: a.source,
    decisions: [
      { decision: 'Priorities', why: a.priority, source: a.source },
      { decision: 'Buying committee', why: buyer.name + ' (' + buyer.title + ') owns the money. ' + champ.name + ' runs the plant. ' + tech.name + ' judges the technical fit.', source: 'Buying-committee file for ' + a.name },
      { decision: 'Recommended angle', why: a.angle, source: a.source },
      { decision: 'Talking points', why: 'Each point cites the notice, the buyer, or the plant date.', source: a.source }
    ],
    trace: [
      { at: '0.2s', service: 'Account file', line: 'Opened the ' + a.name + ' plant notice.' },
      { at: '0.4s', service: 'Committee file', line: 'Read 3 buying-committee roles.' },
      { at: '0.6s', service: 'Brief', line: 'Wrote the one-page brief.' }
    ]
  };
}

function scoreLead(person) {
  const account = person.account;
  const senior = SENIOR.test(person.title || '');
  const email = validEmail(person.email);
  const badge = person.badge || 'the booth scan';
  if (account && senior && email) {
    return {
      band: 'hot',
      reason: 'Hot: ' + person.title + ' at ' + account.name + ', and the plant notice says the site is expanding this quarter.',
      source: 'Badge ' + badge + ' and ' + account.source
    };
  }
  if (account && email) {
    return {
      band: 'warm',
      reason: 'Warm: ' + account.name + ' is expanding, and ' + (person.title || 'this badge') + ' is not the economic buyer.',
      source: 'Badge ' + badge + ' and ' + account.source
    };
  }
  if (account && senior) {
    return {
      band: 'warm',
      reason: 'Warm: the title is senior, and the badge has no email, so this stays a call task.',
      source: 'Badge ' + badge + ' and ' + account.source
    };
  }
  return {
    band: 'cold',
    reason: 'Cold: ' + (person.company || 'This company') + ' is not on this quarter\'s expansion list, and ' + (person.title || 'the title') + ' is not a plant buyer.',
    source: 'Badge ' + badge
  };
}

function analyze(csvText) {
  const rows = parseCsv(csvText);
  const junk = [];
  const people = [];
  rows.forEach(row => {
    const rec = {
      name: pick(row, ['Full Name', 'Name']),
      email: pick(row, ['EMAIL', 'Email']),
      company: pick(row, ['company', 'Company']),
      title: pick(row, ['Job Title', 'Title']),
      country: pick(row, ['Country']),
      badge: pick(row, ['Badge ID', 'Badge']),
      phone: pick(row, ['Phone'])
    };
    const kind = junkKind(rec);
    if (kind) { junk.push(kind); return; }
    const email = validEmail(rec.email) ? rec.email.trim().toLowerCase() : '';
    const account = accountByCompany(rec.company);
    const person = {
      name: tidyName(rec.name),
      nameKey: keyOf(rec.name),
      email,
      company: account ? account.name : tidyName(rec.company),
      companyKey: keyOf(account ? account.name : rec.company),
      title: tidyTitle(rec.title),
      country: account ? account.country : tidyName(rec.country),
      badge: rec.badge.trim(),
      account,
      rawScans: 1
    };
    const match = people.find(p => (email && p.email === email) || (person.nameKey && person.companyKey && p.nameKey === person.nameKey && p.companyKey === person.companyKey));
    if (!match) { people.push(person); return; }
    match.rawScans += 1;
    if (!match.email && email) match.email = email;
    if ((person.title || '').length > (match.title || '').length) match.title = person.title;
    if (!match.badge) match.badge = person.badge;
    if (!match.account && account) {
      match.account = account;
      match.company = account.name;
      match.country = account.country;
    }
  });
  const leads = people.map(p => {
    const scored = scoreLead(p);
    return {
      name: p.name,
      email: p.email,
      company: p.company,
      title: p.title,
      country: p.country,
      badge: p.badge,
      accountId: p.account ? p.account.id : null,
      fit: p.account ? p.account.fit : 0,
      signal: p.account ? p.account.signal : '',
      notice: p.account ? p.account.source : '',
      band: scored.band,
      reason: scored.reason,
      source: scored.source,
      scans: p.rawScans
    };
  });
  const order = { hot: 0, warm: 1, cold: 2 };
  leads.sort((a, b) => order[a.band] - order[b.band] || b.fit - a.fit || a.name.localeCompare(b.name));
  const dropped = junk.length;
  const merged = people.reduce((s, p) => s + (p.rawScans - 1), 0);
  const bands = { hot: 0, warm: 0, cold: 0 };
  leads.forEach(l => { bands[l.band] += 1; });
  const junkSummary = ['Blank row', 'Test scan', 'Badge printer', 'Walk-in', 'Bad email']
    .map(kind => ({ kind, n: junk.filter(k => k === kind).length }))
    .filter(x => x.n);
  return { read: rows.length, dropped, merged, leads, bands, junkSummary };
}

function upsert(leads) {
  const before = crm.length;
  for (const lead of leads) {
    const key = lead.email || (keyOf(lead.name) + '|' + keyOf(lead.company));
    const hit = crm.find(c => (c.email && c.email === lead.email) || c.key === key);
    const row = { ...lead, key };
    if (hit) Object.assign(hit, row);
    else crm.push(row);
  }
  return { before, after: crm.length };
}

function sampleText() {
  return fs.readFileSync(SAMPLE_PATH, 'utf8');
}

function badges(csvText, opts) {
  const write = !opts || opts.write !== false;
  const usedSample = !String(csvText || '').trim();
  const text = usedSample ? sampleText() : String(csvText);
  const result = analyze(text);
  const counts = write ? upsert(result.leads) : { before: 0, after: result.leads.length };
  const matched = result.leads.filter(l => l.accountId).length;
  const unmatched = result.leads.length - matched;
  return {
    ...aiNote(),
    usedSample,
    you: usedSample ? 'You used the sample badge scan.' : 'You dropped a badge-scan file.',
    agent: 'Cleaned the file, merged repeat scans, enriched the companies, scored hot, warm, and cold, and synced the people to the built-in CRM.',
    why: 'A row is junk when it is blank, a test scan, a printer, a walk-in, or an unreadable email. Repeat scans of the same person collapse to one row. Hot means a senior title, a real email, and a company on the expansion list.',
    source: usedSample ? 'Sample badge file shipped with the demo, plus the APAC plant-expansion file.' : 'The file you dropped, plus the APAC plant-expansion file.',
    read: result.read,
    dropped: result.dropped,
    merged: result.merged,
    kept: result.leads.length,
    matched,
    unmatched,
    before: counts.before,
    after: counts.after,
    bands: result.bands,
    junkSummary: result.junkSummary,
    leads: result.leads,
    trace: [
      { at: '0.2s', service: 'Badge file', line: 'Read ' + result.read + ' rows from the badge scan.' },
      { at: '0.4s', service: 'Cleaner', line: 'Dropped ' + result.dropped + ' junk rows (' + result.junkSummary.map(j => j.n + ' ' + j.kind.toLowerCase()).join(', ') + ').' },
      { at: '0.7s', service: 'Dedupe', line: 'Merged ' + result.merged + ' repeat scans into the same people.' },
      { at: '0.9s', service: 'Enrichment', line: 'Matched ' + matched + ' people to an expanding plant. ' + unmatched + ' ' + (unmatched === 1 ? 'company was' : 'companies were') + ' not on the list.' },
      { at: '1.1s', service: 'Scoring', line: 'Scored ' + result.bands.hot + ' hot, ' + result.bands.warm + ' warm, ' + result.bands.cold + ' cold. Each score has a reason.' },
      { at: '1.3s', service: 'CRM', line: 'Synced ' + result.leads.length + ' people to the built-in CRM. Before ' + counts.before + '. After ' + counts.after + '.' }
    ]
  };
}

function fromAddr() {
  const slug = brandName().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'events';
  return slug + '-events@northwind.example';
}

function buildDrafts(leads) {
  const hot = (leads || []).filter(l => l.band === 'hot');
  return hot.map((lead, i) => {
    const first = lead.name.split(' ')[0];
    const slot = SLOTS[i % SLOTS.length];
    const body = [
      'Hi ' + first + ',',
      '',
      lead.company + ' ' + (lead.signal ? lead.signal.charAt(0).toLowerCase() + lead.signal.slice(1) : 'is expanding a plant this quarter.') + ' That notice is in ' + (lead.notice || 'the plant file') + '.',
      '',
      'You are ' + (lead.title || 'on the buying side') + ', so the useful conversation is the plant they are already funding.',
      '',
      'I held ' + slot + '. Reply if that time works.',
      '',
      '-- ' + brandName() + ' events desk',
      'This note stays in the demo catcher. It is not delivered to a real inbox.'
    ].join('\n');
    return {
      to: lead.email,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      subject: lead.company + ' plant build - 20 minutes',
      slot,
      body,
      why: lead.reason,
      source: lead.source
    };
  });
}

function currentLeads() {
  if (crm.length) return crm.map(row => ({ ...row }));
  return analyze(sampleText()).leads;
}

function followup(opts) {
  const write = !opts || opts.write !== false;
  if (write && !crm.length) upsert(analyze(sampleText()).leads);
  const leads = write ? crm.map(row => ({ ...row })) : analyze(sampleText()).leads;
  const drafts = buildDrafts(leads);
  const warm = leads.filter(l => l.band === 'warm').length;
  const cold = leads.filter(l => l.band === 'cold').length;
  return {
    ...aiNote(),
    you: 'You asked for follow-up on the hot leads.',
    agent: 'Drafted ' + drafts.length + ' notes and proposed a meeting slot on each. Warm (' + warm + ') and cold (' + cold + ') stay off this send.',
    why: 'Only a hot lead gets a note: senior title, a real email, and a company that is expanding a plant this quarter. The slot rotates across three Singapore-time openings so the notes are not identical.',
    source: 'Badge scores plus the APAC plant-expansion file.',
    slots: SLOTS,
    drafts,
    trace: [
      { at: '0.3s', service: 'Drafts', line: 'Wrote ' + drafts.length + ' notes for the hot leads. Warm and cold stayed off the send.' },
      { at: '0.6s', service: 'Calendar', line: 'Proposed 3 Singapore-time slots and rotated them across the ' + drafts.length + ' notes.' }
    ]
  };
}

function catchOne(draft) {
  let stored = false;
  let id = null;
  let deliveredToProvider = 0;
  try {
    const rec = require('../backend/mail').deliver({
      from: fromAddr(),
      to: draft.to,
      subject: draft.subject,
      text: draft.body
    });
    stored = !!rec.stored;
    id = rec.id;
    deliveredToProvider = rec.deliveredToProvider || 0;
  } catch (e) {
    stored = false;
  }
  caught.push({ to: draft.to, subject: draft.subject, stored, id, deliveredToProvider });
  return { to: draft.to, subject: draft.subject, stored, id, deliveredToProvider };
}

function approve(opts) {
  const replayOnly = opts && opts.replay;
  const pack = followup(replayOnly ? { write: false } : undefined);
  if (replayOnly) {
    return {
      ...aiNote(),
      mode: 'replay',
      you: 'You approved ' + pack.drafts.length + ' drafts on screen.',
      agent: 'The recorded run stores ' + pack.drafts.length + ' messages in the in-process catcher. Real inboxes receive 0.',
      why: 'Approval is the only send. Warm and cold leads are not in the batch. The catcher is inside this process.',
      source: 'On-screen approval, ' + demoLabel() + '.',
      caught: pack.drafts.length,
      realSent: 0,
      deliveredToProvider: 0,
      messages: pack.drafts.map(d => ({ to: d.to, subject: d.subject, stored: false, deliveredToProvider: 0 })),
      trace: [
        { at: '0.2s', service: 'Approver', line: 'You approved the ' + pack.drafts.length + ' hot-lead notes on screen.' },
        { at: '0.5s', service: 'Catcher', line: 'Recorded ' + pack.drafts.length + ' messages for the in-process catcher. Real inboxes received 0.' }
      ]
    };
  }
  const fresh = pack.drafts.filter(d => d.to && !sentKeys.has(d.to));
  const messages = fresh.map(draft => {
    const rec = catchOne(draft);
    sentKeys.add(draft.to);
    return rec;
  });
  const realSent = messages.reduce((s, m) => s + (m.deliveredToProvider || 0), 0);
  return {
    ...aiNote(),
    you: 'You approved ' + pack.drafts.length + ' drafts on screen.',
    agent: messages.length
      ? 'Stored ' + messages.length + ' messages in the in-process catcher. Real inboxes received 0.'
      : 'Those drafts were already in the catcher. No second send.',
    why: 'Approval is the only send. Warm and cold leads are not in the batch. Nothing is handed to a mail provider.',
    source: 'On-screen approval, ' + demoLabel() + '.',
    caught: messages.length,
    already: messages.length === 0,
    realSent,
    deliveredToProvider: realSent,
    messages,
    trace: [
      { at: '0.2s', service: 'Approver', line: 'You approved the ' + pack.drafts.length + ' hot-lead notes on screen.' },
      { at: '0.5s', service: 'Catcher', line: messages.length
        ? 'Stored ' + messages.length + ' messages in the in-process catcher. Real inboxes received 0.'
        : 'Already in the catcher. No second send. Real inboxes received 0.' }
    ]
  };
}

function summary() {
  const leads = currentLeads();
  const bands = { hot: 0, warm: 0, cold: 0 };
  leads.forEach(l => { if (bands[l.band] != null) bands[l.band] += 1; });
  return {
    ...aiNote(),
    when: demoLabel(),
    brand: brandName(),
    accounts: ACCOUNTS.length,
    top: ACCOUNTS[0].name,
    topFit: ACCOUNTS[0].fit,
    crm: crm.length,
    bands,
    approved: sentKeys.size,
    caught: caught.length,
    realSent: 0,
    you: 'You asked for the pipeline summary.',
    agent: 'Built a PowerPoint and a PDF from the 20 accounts, the badge scores, and the approved notes.',
    why: 'The deck repeats the same counts as the screen: 20 accounts, the hot-warm-cold split, and zero messages to real inboxes.',
    source: 'This webinar run, ' + demoLabel() + '.',
    trace: [
      { at: '0.3s', service: 'Report', line: 'Counted ' + ACCOUNTS.length + ' accounts and ' + leads.length + ' CRM people.' },
      { at: '0.6s', service: 'Report', line: 'Wrote the PowerPoint and the PDF. Real inboxes stay at 0.' }
    ]
  };
}

function storySlides() {
  const sum = summary();
  const top = ACCOUNTS.slice(0, 8).map(a => a.rank + '. ' + a.name + ' (' + a.country + ') fit ' + a.fit);
  const leads = currentLeads().filter(l => l.band === 'hot').slice(0, 9);
  const drafts = buildDrafts(leads);
  return [
    { kind: 'title', title: 'APAC plant-expansion pipeline', sub: brandName() + ' lead generation · ' + sum.when + ' · fictional companies' },
    { kind: 'list', title: '20 accounts, ranked', items: top },
    { kind: 'pair', title: 'Badge scan, after cleanup', left: sum.bands.hot + ' hot', right: sum.bands.warm + ' warm', note: sum.bands.cold + ' cold · CRM ' + (sum.crm || leads.length) + ' people · real inboxes 0' },
    { kind: 'list', title: 'Approved notes', items: drafts.length ? drafts.map(d => d.name + ' · ' + d.slot) : ['No hot leads approved yet.'] }
  ];
}

function escPdf(s) {
  return String(s || '').replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, ' ');
}

function pdf() {
  const slides = storySlides();
  const pages = slides.map(s => {
    const cmds = ['0.96 0.965 0.953 rg', '0 0 612 792 re f', '0.06 0.43 0.34 rg', '0 0 10 792 re f', 'BT', '/F1 11 Tf', '0.45 0.47 0.5 rg', '36 760 Td', '(' + escPdf(brandName().toUpperCase()) + ') Tj'];
    if (s.kind === 'title') {
      cmds.push('/F1 22 Tf', '0 0 0 rg', '1 0 0 1 36 520 Tm', '(' + escPdf(s.title).slice(0, 70) + ') Tj', '/F1 12 Tf', '0.45 0.47 0.5 rg', '1 0 0 1 36 490 Tm', '(' + escPdf(s.sub).slice(0, 90) + ') Tj');
    } else {
      cmds.push('/F1 18 Tf', '0 0 0 rg', '1 0 0 1 36 720 Tm', '(' + escPdf(s.title).slice(0, 60) + ') Tj');
      if (s.kind === 'pair') {
        cmds.push('BT', '/F1 22 Tf', '0 0 0 rg', '1 0 0 1 36 560 Tm', '(' + escPdf(s.left).slice(0, 28) + ') Tj', '1 0 0 1 300 560 Tm', '(' + escPdf(s.right).slice(0, 28) + ') Tj', '/F1 12 Tf', '0.45 0.47 0.5 rg', '1 0 0 1 36 500 Tm', '(' + escPdf(s.note).slice(0, 90) + ') Tj');
      } else {
        cmds.push('BT', '/F1 13 Tf', '0 0 0 rg');
        (s.items || []).slice(0, 12).forEach((t, i) => { cmds.push('1 0 0 1 36 ' + (660 - i * 28) + ' Tm', '(' + escPdf(t).slice(0, 80) + ') Tj'); });
      }
    }
    cmds.push('ET');
    return cmds.join('\n');
  });
  const objs = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'];
  const kids = pages.map((_, i) => (3 + i * 2) + ' 0 R').join(' ');
  objs.push('2 0 obj << /Type /Pages /Count ' + pages.length + ' /Kids [' + kids + '] >> endobj\n');
  pages.forEach((stream, i) => {
    const pageObj = 3 + i * 2;
    const content = pageObj + 1;
    objs.push(pageObj + ' 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + content + ' 0 R /Resources << /Font << /F1 ' + (3 + pages.length * 2) + ' 0 R >> >> >> endobj\n');
    objs.push(content + ' 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream\nendobj\n');
  });
  objs.push((3 + pages.length * 2) + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n');
  let out = '%PDF-1.4\n';
  const pos = [0];
  for (const o of objs) { pos.push(Buffer.byteLength(out)); out += o; }
  const xref = pos.length - 1;
  const start = Buffer.byteLength(out);
  out += 'xref\n0 ' + (xref + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= xref; i++) out += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer << /Size ' + (xref + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF';
  return Buffer.from(out);
}

async function pptx() {
  const PptxGenJS = require('pptxgenjs');
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pres.layout = 'WIDE';
  pres.author = brandName() + ' webinar';
  pres.title = 'APAC plant-expansion pipeline';
  const slides = storySlides();
  const sum = summary();
  for (const s of slides) {
    const slide = pres.addSlide();
    slide.background = { color: 'F7F6F3' };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: '0F6E56' } });
    slide.addText(brandName().toUpperCase(), { x: 0.55, y: 0.28, w: 6, h: 0.28, fontFace: 'Calibri', fontSize: 12, color: '8E939C', margin: 0 });
    if (s.kind === 'title') {
      slide.addText(s.title, { x: 0.55, y: 2.3, w: 12, h: 1.4, fontFace: 'Calibri', fontSize: 36, color: '1A1C1F', margin: 0 });
      slide.addText(s.sub, { x: 0.55, y: 4.0, w: 11, h: 0.4, fontFace: 'Calibri', fontSize: 16, color: '8E939C', margin: 0 });
      continue;
    }
    slide.addText(s.title, { x: 0.55, y: 0.7, w: 12, h: 0.5, fontFace: 'Calibri', fontSize: 28, color: '1A1C1F', margin: 0 });
    if (s.kind === 'pair') {
      slide.addText(s.left, { x: 0.55, y: 2.2, w: 5.5, h: 1, fontFace: 'Calibri', fontSize: 32, color: '1A1C1F', margin: 0 });
      slide.addText(s.right, { x: 6.6, y: 2.2, w: 5.5, h: 1, fontFace: 'Calibri', fontSize: 32, color: '1A1C1F', margin: 0 });
      slide.addText(s.note || '', { x: 0.55, y: 3.6, w: 11, h: 0.4, fontFace: 'Calibri', fontSize: 16, color: '8E939C', margin: 0 });
      slide.addChart(pres.ChartType.bar, [{ name: 'Leads', labels: ['Hot', 'Warm', 'Cold'], values: [sum.bands.hot, sum.bands.warm, sum.bands.cold] }], {
        x: 0.55, y: 4.2, w: 8, h: 2.6, barGrouping: 'clustered', showValue: true, chartColors: ['0F6E56'], showLegend: false
      });
    } else {
      slide.addText((s.items || []).map(t => '-  ' + t).join('\n'), { x: 0.55, y: 1.5, w: 12, h: 5.2, fontFace: 'Calibri', fontSize: 20, color: '1A1C1F', margin: 0 });
    }
  }
  return pres.write({ outputType: 'nodebuffer' });
}

function replay() {
  if (replayCache) return replayCache;
  const huntResult = hunt(ASK);
  const briefs = {};
  ACCOUNTS.forEach(a => { briefs[a.id] = brief(a.id); });
  const badgeResult = badges('', { write: false });
  const follow = followup({ write: false });
  const approved = approve({ replay: true });
  replayCache = {
    ...aiNote(),
    mode: 'replay',
    ask: ASK,
    hunt: huntResult,
    briefs,
    badges: badgeResult,
    followup: follow,
    approve: approved,
    summary: {
      accounts: 20,
      read: badgeResult.read,
      dropped: badgeResult.dropped,
      merged: badgeResult.merged,
      kept: badgeResult.kept,
      before: badgeResult.before,
      after: badgeResult.after,
      bands: badgeResult.bands,
      drafts: follow.drafts.length,
      realSent: 0
    }
  };
  return replayCache;
}

function reset() {
  crm = [];
  sentKeys = new Set();
  caught = [];
  return { ok: true, contacts: 0, caught: 0 };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > 2_000_000) { reject(Object.assign(new Error('Request is too large'), { status: 413 })); return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

function sendJson(res, obj, code) {
  res.writeHead(code || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function safeReplay() {
  try { return replay(); }
  catch (e) {
    try { return JSON.parse(fs.readFileSync(REPLAY_PATH, 'utf8')); }
    catch (e2) { return { mode: 'replay', error: 'Replay is unavailable.' }; }
  }
}

function withChat(pack) {
  try {
    const chat = require('./chat');
    if (pack && typeof pack === 'object' && !pack.error) pack.chat = chat.recorded();
  } catch (e) {}
  return pack;
}

async function http(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (req.method === 'GET' && (p === '/api/webinar/sample.csv' || p === '/webinar/sample-badges.csv')) {
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'inline; filename="sample-badges.csv"', 'cache-control': 'no-store' });
      res.end(sampleText());
      return;
    }
    if (req.method === 'GET' && p === '/api/webinar/replay') return sendJson(res, withChat(safeReplay()));
    if (req.method === 'GET' && p === '/api/webinar/summary') return sendJson(res, summary());
    if (req.method === 'GET' && p === '/api/webinar/sow.docx') {
      const buf = require('./chat').sowDocx();
      res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': 'attachment; filename="december-apac-sow.docx"', 'cache-control': 'no-store' });
      res.end(buf);
      return;
    }
    if (req.method === 'GET' && p === '/api/webinar/sow.pdf') {
      const buf = require('./chat').sowPdf();
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="december-apac-sow.pdf"', 'cache-control': 'no-store' });
      res.end(buf);
      return;
    }
    if (req.method === 'GET' && p === '/api/webinar/report.pdf') {
      const buf = pdf();
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="apac-plant-pipeline.pdf"', 'cache-control': 'no-store' });
      res.end(buf);
      return;
    }
    if (req.method === 'GET' && p === '/api/webinar/report.pptx') {
      const buf = await pptx();
      res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': 'attachment; filename="apac-plant-pipeline.pptx"', 'cache-control': 'no-store' });
      res.end(buf);
      return;
    }
    const account = p.match(/^\/api\/webinar\/account\/(ACC-\d+)$/);
    if (req.method === 'GET' && account) {
      const card = brief(account[1]);
      if (!card) return sendJson(res, { error: 'No account with that id.' }, 404);
      return sendJson(res, { ...aiNote(), ...card });
    }
    if (req.method === 'POST' && p === '/api/webinar/reset') {
      try { require('./chat').reset(); } catch (e) {}
      return sendJson(res, reset());
    }
    if (req.method !== 'POST') return sendJson(res, { error: 'Not found.' }, 404);
    const raw = await readBody(req);
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch (e) { body = { csv: raw }; } }
    const useReplay = body.replay === true;
    if (p === '/api/webinar/hunt') {
      if (useReplay) return sendJson(res, safeReplay().hunt);
      return sendJson(res, hunt(body.ask));
    }
    if (p === '/api/webinar/badges') {
      if (useReplay) return sendJson(res, safeReplay().badges);
      return sendJson(res, badges(body.csv));
    }
    if (p === '/api/webinar/followup') {
      if (useReplay) return sendJson(res, safeReplay().followup);
      return sendJson(res, followup());
    }
    if (p === '/api/webinar/approve') {
      if (useReplay) return sendJson(res, safeReplay().approve);
      return sendJson(res, approve());
    }
    if (p === '/api/webinar/ask') {
      const chat = require('./chat');
      return sendJson(res, chat.ask(body.text, body.csv, { replay: useReplay }));
    }
    if (p === '/api/webinar/sow/approve') return sendJson(res, require('./chat').approveSow());
    return sendJson(res, { error: 'Not found.' }, 404);
  } catch (e) {
    console.error('webinar', e && e.message || e);
    const pack = withChat(safeReplay());
    if (!res.headersSent) sendJson(res, { fallback: true, mode: 'replay', error: 'Live step failed. Showing the recorded run.', replay: pack });
  }
}

module.exports = {
  ASK, ACCOUNTS, SAMPLE_PATH, REPLAY_PATH, SLOTS,
  hunt, brief, analyze, badges, followup, approve, summary, pdf, pptx, replay, reset, http, sampleText
};
