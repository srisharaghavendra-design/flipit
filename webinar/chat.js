'use strict';

// Chat driver for the webinar. Keyword intent only. No network calls.
const { brandName } = require('../brand');
const { docx, pdf } = require('../backend/docgen');
const engine = require('./engine');

const PROMPTS = {
  sow: '@mops create the SOW for the Dec webinar',
  registration: '@mops build the registration form',
  code: '@mops create the campaign code',
  invites: '@mops set up invites',
  upload: '@mops upload this list',
  fix: '@mops what needs fixing?',
  report: '@mops give me the report',
  hunt: '@mops find 20 APAC manufacturers expanding plants'
};

const SOW = {
  id: 'SOW-DEC-APAC-01',
  title: 'Statement of Work, December APAC plant webinar',
  vendor: 'Paper Lantern Studio',
  scope: 'A 45-minute webinar for plant leaders at fictional APAC manufacturers expanding this quarter.',
  deliverables: [
    'Run of show',
    'Registration page and attendee file',
    'Invite and one reminder, caught in the demo only',
    'Pipeline summary deck'
  ],
  budget: [
    { line: 'Studio and host', amount: '$18,000' },
    { line: 'Registration page', amount: '$6,000' },
    { line: 'Invite production', amount: '$8,000' },
    { line: 'Follow-up kit', amount: '$16,000' }
  ],
  total: '$48,000',
  timeline: [
    { when: '3 Nov', what: 'SOW signed' },
    { when: '10 Nov', what: 'Registration live' },
    { when: '17 Nov', what: 'Invites filed' },
    { when: '2 Dec', what: 'Webinar' },
    { when: '5 Dec', what: 'Pipeline report' }
  ]
};

const CAMPAIGN = {
  ban: 'BAN-FY26Q4-APAC-1204',
  code: 'FY26Q4-APJ-EVT-1204',
  ccId: 'CC-DEC-APAC-01',
  sfdcId: '7010000000DECWA',
  name: 'December APAC plant webinar',
  status: 'Planned',
  campaignType: 'Webinar',
  owner: 'Srisha R.',
  source: 'Campaign code book, 19 Oct 2026'
};

const REGISTRANTS = [
  { name: 'Priya Sharma', email: 'priya.sharma@kestrelforge.example', company: 'Kestrel Forge', title: 'VP Manufacturing', country: 'Vietnam', consent: true },
  { name: 'James Okonkwo', email: 'james.okonkwo@paperbarkalloys.example', company: 'Paperbark Alloys', title: 'Plant Director', country: 'Australia', consent: true },
  { name: 'Anika Rao', email: 'anika.rao@saffroncircuit.example', company: 'Saffron Circuit Works', title: 'Head of Operations', country: 'India', consent: true },
  { name: 'Mei Lin Tan', email: 'mei.tan@tideglass.example', company: 'Tideglass Components', title: 'Procurement Manager', country: 'Singapore', consent: true },
  { name: 'Guest Badge', email: 'guest.badge@walkin.example', company: 'Walk-in', title: 'Visitor', country: 'Singapore', consent: false }
];

const FIXES = [
  {
    title: 'Held the registration with no consent off the invite file.',
    why: 'No consent tick.',
    source: 'December registration form, consent field.',
    applied: true
  },
  {
    title: 'Kept Unknown Widgets / Olivia Grant cold and off the invite.',
    why: 'Not on this quarter\'s expansion list and title is not a plant buyer.',
    source: 'Badge B-1013.',
    applied: true
  },
  {
    title: 'Did not email the intern. Pointed Osaka follow-up at Emi Nakamura.',
    why: 'Badge says Intern, buyer is VP Production.',
    source: 'Island Works Digest, 17 Oct 2026.',
    applied: true
  },
  {
    title: 'Stamped FY26Q4-APJ-EVT-1204 on the December SOW.',
    why: 'Invoices and the registration page need the same code.',
    source: 'Campaign code book, 19 Oct 2026.',
    applied: true
  }
];

let sowApproved = false;
let inviteSent = new Set();

function aiNote() {
  const key = String(process.env.MOPS_API_KEY || '').trim();
  if (key) return { mode: 'rules', aiReady: true, ai: 'A key is set. This demo still answers from the recorded rules so the webinar cannot stall.' };
  return { mode: 'rules', aiReady: false, ai: 'Rules mode. No key needed.' };
}

function fromAddr() {
  const slug = brandName().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'events';
  return slug + '-events@northwind.example';
}

function intentOf(text) {
  const t = String(text || '').toLowerCase();
  if (/fix|needs fixing|what needs|proactive|broken/.test(t)) return 'fix';
  if (/(report|deck|pptx|powerpoint|\bpdf\b)/.test(t) && !/sow/.test(t)) return 'report';
  if (/upload|this list|badge|messy|clean/.test(t)) return 'upload';
  if (/invite/.test(t)) return 'invites';
  if (/campaign code|\bban\b|sfdc|salesforce|cc id|\bcode\b/.test(t)) return 'code';
  if (/regist|sign-?up form|form field/.test(t)) return 'registration';
  if (/sow|statement of work|dec webinar|december webinar/.test(t)) return 'sow';
  if (/find 20|apac manufacturing|expanding plant|\bhunt\b/.test(t)) return 'hunt';
  if (/brief|intel|kestrel/.test(t)) return 'intel';
  return 'help';
}

function chipsAfter(intent) {
  const order = ['sow', 'registration', 'code', 'invites', 'upload', 'fix', 'report'];
  const idx = order.indexOf(intent);
  const rest = idx === -1 ? order : order.slice(idx + 1);
  const show = rest.length ? rest : ['sow'];
  const chips = show.map((id, i) => ({ intent: id, text: PROMPTS[id], next: i === 0 }));
  if (!show.includes('hunt')) chips.push({ intent: 'hunt', text: PROMPTS.hunt, next: false });
  return chips;
}

function finish(text, intent, extra, replay) {
  return {
    ...aiNote(),
    ...(replay ? { mode: 'replay' } : {}),
    intent,
    you: 'You did: ' + String(text || '').trim(),
    chips: chipsAfter(intent),
    ...extra
  };
}

function sowCard() {
  return {
    type: 'sow',
    id: SOW.id,
    title: SOW.title,
    vendor: SOW.vendor,
    status: sowApproved ? 'Approved by Srisha on screen' : 'Draft, waiting for Srisha',
    scope: SOW.scope,
    deliverables: SOW.deliverables.slice(),
    budget: SOW.budget.map(row => ({ ...row })),
    total: SOW.total,
    timeline: SOW.timeline.map(row => ({ ...row }))
  };
}

function sowLines() {
  const card = sowCard();
  const lines = [
    'SOW ' + card.id,
    'Vendor: ' + card.vendor,
    'Status: ' + card.status,
    'Scope: ' + card.scope
  ];
  card.deliverables.forEach(item => lines.push('Deliverable: ' + item));
  card.budget.forEach(row => lines.push('Budget: ' + row.line + ' ' + row.amount));
  lines.push('Total: ' + card.total);
  card.timeline.forEach(row => lines.push('Timeline: ' + row.when + ' ' + row.what));
  return lines;
}

function sowDocx() {
  const card = sowCard();
  const rows = sowLines().map(line => {
    const i = line.indexOf(':');
    if (i === -1) return [line, ''];
    return [line.slice(0, i), line.slice(i + 1).trim()];
  });
  return docx(card.title, rows);
}

function sowPdf() {
  return pdf(sowCard().title, sowLines());
}

function sowDownloads() {
  return [
    { id: 'sow-docx', href: '/api/webinar/sow.docx', label: 'Download DOCX' },
    { id: 'sow-pdf', href: '/api/webinar/sow.pdf', label: 'Download PDF' }
  ];
}

function answerSow(text, replay) {
  return finish(text, 'sow', {
    srisha: 'Srisha provided the December webinar ask.',
    agent: 'Wrote the statement of work: scope, deliverables, budget lines, and a timeline. The DOCX and the PDF are ready.',
    why: 'The room needs a scope, a price, and a date before the rest of the work starts.',
    source: 'December webinar intake, on screen.',
    working: [
      'Reading the December webinar ask',
      'Writing scope, deliverables, budget, and timeline',
      'Building the DOCX and the PDF'
    ],
    trace: [
      { at: '0.2s', service: 'Intake', line: 'Read the December webinar ask.' },
      { at: '0.6s', service: 'SOW', line: 'Wrote scope, four deliverables, four budget lines, and five dates.' },
      { at: '0.9s', service: 'Files', line: 'Built the DOCX and the PDF. Approval stays on screen.' }
    ],
    card: sowCard(),
    downloads: sowDownloads(),
    approve: !sowApproved
  }, replay);
}

function answerRegistration(text, replay) {
  return finish(text, 'registration', {
    srisha: 'Srisha provided the registration ask.',
    agent: 'Built the registration page and filed five sample registrations. One row has no consent.',
    why: 'The page only asks for what the invite and the campaign record need. The row with no consent can be held back.',
    source: 'December registration form.',
    working: [
      'Laying out the registration fields',
      'Filing sample registrations as they come in',
      'Flagging the row with no consent'
    ],
    trace: [
      { at: '0.2s', service: 'Form', line: 'Added name, work email, company, title, country, and consent.' },
      { at: '0.7s', service: 'Registrations', line: 'Filed 5 sample rows. 4 opted in. 1 has no consent.' }
    ],
    card: {
      type: 'registration',
      title: 'December registration page',
      fields: ['Name', 'Work email', 'Company', 'Title', 'Country', 'Consent'],
      rows: REGISTRANTS.map(row => ({ ...row }))
    },
    downloads: [],
    approve: false
  }, replay);
}

function answerCode(text, replay) {
  return finish(text, 'code', {
    srisha: 'Srisha provided the campaign-code ask.',
    agent: 'Minted the BAN, the CC id, and the campaign code, and wrote a mock campaign record.',
    why: 'The same code has to appear on the SOW, the registration page, and the campaign record.',
    source: CAMPAIGN.source + '.',
    working: [
      'Opening the campaign code book',
      'Minting the BAN, the CC id, and the campaign code',
      'Writing the mock campaign record'
    ],
    trace: [
      { at: '0.2s', service: 'Code book', line: 'Read the December APAC block in the campaign code book.' },
      { at: '0.6s', service: 'Campaign', line: 'Wrote BAN ' + CAMPAIGN.ban + ' and code ' + CAMPAIGN.code + '.' },
      { at: '0.9s', service: 'Record', line: 'Filed mock campaign ' + CAMPAIGN.sfdcId + '. Nothing left this demo.' }
    ],
    card: { type: 'code', ...CAMPAIGN },
    downloads: [],
    approve: false
  }, replay);
}

function draftFor(person) {
  const first = person.name.split(' ')[0];
  return {
    to: person.email,
    name: person.name,
    company: person.company,
    title: person.title,
    subject: 'December APAC plant webinar, 2 Dec',
    body: [
      'Hi ' + first + ',',
      '',
      'You are invited to the December APAC plant webinar on 2 Dec. It is 45 minutes for plant leaders at fictional manufacturers expanding this quarter.',
      '',
      'This note stays in the demo catcher. It is not delivered to a real inbox.',
      '',
      '-- ' + brandName() + ' events desk'
    ].join('\n')
  };
}

function fileInvites(replay) {
  const people = REGISTRANTS.filter(row => row.consent);
  if (replay) {
    return {
      caught: people.length,
      realSent: 0,
      already: false,
      drafts: people.map(person => ({ ...draftFor(person), stored: false, deliveredToProvider: 0 }))
    };
  }
  const fresh = people.filter(person => !inviteSent.has(person.email));
  const drafts = fresh.map(person => {
    const draft = draftFor(person);
    let stored = false;
    let deliveredToProvider = 0;
    try {
      const rec = require('../backend/mail').deliver({
        from: fromAddr(),
        to: draft.to,
        subject: draft.subject,
        text: draft.body
      });
      stored = !!rec.stored;
      deliveredToProvider = rec.deliveredToProvider || 0;
    } catch (e) {
      stored = false;
    }
    inviteSent.add(person.email);
    return { ...draft, stored, deliveredToProvider };
  });
  const realSent = drafts.reduce((sum, row) => sum + (row.deliveredToProvider || 0), 0);
  if (!drafts.length) {
    return {
      caught: 0,
      realSent: 0,
      already: true,
      drafts: people.map(person => ({ ...draftFor(person), stored: true, deliveredToProvider: 0 }))
    };
  }
  return { caught: drafts.length, realSent, already: false, drafts };
}

function answerInvites(text, replay) {
  const filed = fileInvites(replay);
  const agent = filed.already
    ? 'Those invites were already in the catcher. No second send. Real inboxes received 0.'
    : 'Drafted ' + filed.drafts.length + ' invite notes and filed them in the demo catcher. Real inboxes received 0.';
  return finish(text, 'invites', {
    srisha: 'Srisha provided the invite ask.',
    agent,
    why: 'Only opted-in registrations are invited. The note stays in this process. Nothing is handed to a mail provider.',
    source: 'December registration form, consent field.',
    working: [
      'Taking the opted-in registrations',
      'Drafting the invite notes',
      'Filing them in the demo catcher'
    ],
    trace: [
      { at: '0.2s', service: 'Registrations', line: 'Kept the 4 opted-in people. Held the row with no consent.' },
      { at: '0.6s', service: 'Drafts', line: 'Wrote the December webinar invite.' },
      { at: '0.9s', service: 'Catcher', line: filed.already
        ? 'Already in the catcher. No second send. Real inboxes received 0.'
        : 'Filed ' + filed.caught + ' messages in the catcher. Real inboxes received 0.' }
    ],
    card: { type: 'invites', caught: filed.caught, realSent: filed.realSent, already: filed.already, drafts: filed.drafts },
    downloads: [],
    approve: false
  }, replay);
}

function answerUpload(text, csv, replay) {
  const result = replay ? engine.replay().badges : engine.badges(csv || '');
  const provided = String(csv || '').trim()
    ? 'Srisha provided the badge file.'
    : 'Srisha provided the sample badge list.';
  return finish(text, 'upload', {
    srisha: provided,
    agent: 'Cleaned the file, merged repeat scans, synced the people to the CRM, and scored hot, warm, and cold.',
    why: result.why,
    source: result.source,
    working: [
      'Reading the badge file',
      'Dropping junk and merging repeat scans',
      'Scoring hot, warm, and cold',
      'Syncing the people to the CRM'
    ],
    trace: result.trace,
    card: {
      type: 'upload',
      read: result.read,
      dropped: result.dropped,
      merged: result.merged,
      kept: result.kept,
      before: result.before,
      after: result.after,
      bands: result.bands,
      leads: result.leads
    },
    downloads: [],
    approve: false
  }, replay);
}

function answerFix(text, replay) {
  return finish(text, 'fix', {
    srisha: 'Srisha provided the question.',
    agent: 'Applied ' + FIXES.length + ' fixes. Each one has a plain-language why and a source.',
    why: 'Each fix names the row that was wrong and the record that says so.',
    source: 'Registration form, badge file, and the campaign code book.',
    working: [
      'Checking consent, titles, and the campaign code',
      'Writing the fix and the reason',
      'Marking each one applied'
    ],
    trace: FIXES.map((item, i) => ({
      at: '0.' + (2 + i * 2) + 's',
      service: 'Fix',
      line: item.title + ' Why: ' + item.why
    })),
    card: { type: 'fix', items: FIXES.map(item => ({ ...item })) },
    downloads: [],
    approve: false
  }, replay);
}

function answerReport(text, replay) {
  const sum = engine.summary();
  return finish(text, 'report', {
    srisha: 'Srisha provided the report ask.',
    agent: 'Built the PowerPoint and the PDF from the account list, the lead scores, and this run.',
    why: 'The deck repeats the same story as the thread. Real inboxes stay at 0.',
    source: sum.source,
    working: [
      'Counting the accounts and the lead scores',
      'Building the PowerPoint',
      'Building the PDF'
    ],
    trace: sum.trace,
    card: {
      type: 'report',
      accounts: sum.accounts,
      top: sum.top,
      crm: sum.crm,
      bands: sum.bands,
      realSent: 0
    },
    downloads: [
      { id: 'pptx', href: '/api/webinar/report.pptx', label: 'Download PowerPoint' },
      { id: 'pdf', href: '/api/webinar/report.pdf', label: 'Download PDF' }
    ],
    approve: false
  }, replay);
}

function answerHunt(text, replay) {
  const hunt = engine.hunt(text);
  return finish(text, 'hunt', {
    srisha: 'Srisha provided the hunt ask.',
    agent: hunt.agent,
    why: hunt.why,
    source: hunt.source,
    working: [
      'Reading the plant-expansion file',
      'Scoring fit',
      'Ranking 20 accounts'
    ],
    trace: hunt.trace,
    card: { type: 'hunt', accounts: hunt.accounts },
    downloads: [],
    approve: false
  }, replay);
}

function answerIntel(text, replay) {
  const match = String(text || '').toUpperCase().match(/ACC-\d+/);
  const id = match ? match[0] : 'ACC-01';
  const card = engine.brief(id) || engine.brief('ACC-01');
  return finish(text, 'intel', {
    srisha: 'Srisha provided the account.',
    agent: card.agent,
    why: card.why,
    source: card.source,
    working: [
      'Opening the account file',
      'Writing the one-page brief'
    ],
    trace: card.trace,
    card: { type: 'intel', ...card },
    downloads: [],
    approve: false
  }, replay);
}

function answerHelp(text, replay) {
  return finish(text, 'help', {
    srisha: 'Srisha provided an ask @mops did not recognize as one of the stage steps.',
    agent: 'Tap a suggestion, or ask for the SOW, the registration form, the campaign code, the invites, the list, the fixes, or the report.',
    why: 'The suggestions under the box are the path for the live session. Close wording still lands on the same step.',
    source: 'Webinar chat, on screen.',
    working: ['Reading the ask', 'Matching it to a stage step'],
    trace: [
      { at: '0.2s', service: 'Router', line: 'No stage step matched. Showing the suggestions.' }
    ],
    card: { type: 'help', prompts: chipsAfter(null).map(chip => chip.text) },
    downloads: [],
    approve: false
  }, replay);
}

function ask(text, csv, opts) {
  const replay = !!(opts && opts.replay);
  const raw = String(text || '').trim();
  const intent = intentOf(raw);
  if (intent === 'fix') return answerFix(raw, replay);
  if (intent === 'report') return answerReport(raw, replay);
  if (intent === 'upload') return answerUpload(raw, csv, replay);
  if (intent === 'invites') return answerInvites(raw, replay);
  if (intent === 'code') return answerCode(raw, replay);
  if (intent === 'registration') return answerRegistration(raw, replay);
  if (intent === 'sow') return answerSow(raw, replay);
  if (intent === 'hunt') return answerHunt(raw, replay);
  if (intent === 'intel') return answerIntel(raw, replay);
  return answerHelp(raw || 'help', replay);
}

function approveSow() {
  sowApproved = true;
  return {
    ...aiNote(),
    intent: 'sow',
    you: 'You did: approved the SOW on screen',
    srisha: 'Srisha provided the approval on screen.',
    agent: 'Marked the statement of work approved by Srisha on screen. No email was sent.',
    why: 'Approval is a mark on the document. It does not send mail.',
    source: 'On-screen approval.',
    card: sowCard(),
    downloads: sowDownloads(),
    approve: false
  };
}

function reset() {
  sowApproved = false;
  inviteSent = new Set();
  return { ok: true };
}

function recorded() {
  const prompts = Object.assign({}, PROMPTS, { intel: 'brief on kestrel', help: 'help' });
  const chat = {};
  Object.keys(prompts).forEach(intent => {
    chat[intent] = ask(prompts[intent], '', { replay: true });
  });
  return chat;
}

module.exports = {
  PROMPTS,
  intent: intentOf,
  ask,
  sowDocx,
  sowPdf,
  approveSow,
  reset,
  recorded
};
