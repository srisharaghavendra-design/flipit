const COMPETITOR_DB = {
  "darwinbox": {
    fullName: "Darwinbox",
    sweetSpot: "1000+ employee enterprises in India, SEA, MENA",
    pricing: "Custom quote only. No public pricing. Estimated $20-25 PEPM. Pricing opacity is a consistent complaint.",
    implementationReality: "Darwinbox's own published framework states 4-5 months is typical. They claim 2-4 weeks for simple deployments but enterprise go-lives routinely hit 4-5 months.",
    weaknesses: [
      "Support is #1 complaint across Gartner, G2, Capterra — 'sluggish response', 'delayed response', 'poor customer support after signing'. Verified review: 'I had a highly disappointing experience due to multiple product errors and the sluggish response from the support team.'",
      "Mobile app consistently criticized — 'slow mobile UI', 'UI problems in mobile app', 'not satisfied with desktop version'. Attendance works but deeper functionality degrades on mobile.",
      "Built for 1000+ employee enterprises — average client ~2000 employees. Sub-500 companies find it complex and overkill. G2 review: 'After having a deal with our 150 employee org, Darwinbox suddenly started acting pricey and withdrew the deal citing change in policies. They apparently do not know how to handle business.'",
      "Performance degrades under load — 'when managing large volume of data or many employees use it simultaneously, performance starts lagging and the process is very slow'",
      "High admin burden post go-live — Darwinbox explicitly states the system needs to be owned by the customer. HR teams without dedicated HRIS admins consistently struggle.",
      "No free trial — prospects cannot test before committing, unlike Keka",
      "UI considered outdated — 'UI and UX could be more dynamic', 'feels basic', 'outdated compared to newer HCM software'"
    ],
    killShots: {
      features: "Darwinbox is architected for enterprises averaging 2000 employees. Their own implementation framework has a dedicated phase just to understand your processes — which is the longest stage. When their sales team showed you those features, was that a standard deployment or one that took 4-5 months to configure?",
      price: "Darwinbox does not publish pricing because deals are heavily negotiated. We have verified customer reviews where Darwinbox withdrew an agreed deal citing change in policies when the customer was not profitable enough. Is the price they quoted locked in writing through go-live?",
      support: "Darwinbox's most consistent negative review theme across Gartner, G2, and Capterra is support responsiveness after signing. Can they provide two customers who went live in the last 6 months to speak specifically about post-go-live support quality?",
      late: "You are late but that is actually leverage — Darwinbox's 4-5 month implementation means nothing has started yet. Shift the evaluation from features to go-live risk. Ask the customer: if Darwinbox's implementation takes 5 months instead of 3, what happens to payroll accuracy in the meantime?"
    }
  },
  "workday": {
    fullName: "Workday",
    sweetSpot: "5000+ employee global enterprises, US-headquartered multinationals",
    pricing: "Premium. $150-400 PEPM. Multi-year contracts. Implementation costs often equal license costs.",
    implementationReality: "12-18 months average. Requires certified Workday partners adding 30-50% to total cost. India compliance needs heavy customization.",
    weaknesses: [
      "Price is 3-5x more expensive than APAC alternatives for equivalent headcount",
      "12-18 month implementation standard — often 2+ years for large deployments",
      "US-centric — India payroll compliance (PF, ESI, TDS) requires certified partner customization",
      "Overkill for companies under 3000 employees — 80% of features unused",
      "Customizations break during bi-annual mandatory updates",
      "Support is partner-dependent — customers effectively pay twice"
    ],
    killShots: {
      price: "Workday total cost of ownership over 3 years — license, implementation partners, customization, training, annual increases — typically runs 4-6x what you would pay for a platform built for your market. What is the implementation budget on top of the license fee in their proposal?",
      features: "Workday is built for US Fortune 500. India payroll compliance requires certified Workday partners to configure and maintain. Who has Workday admin certification in your team, and what is the plan when the mandatory bi-annual update breaks custom configurations?"
    }
  },
  "sap-successfactors": {
    fullName: "SAP SuccessFactors",
    sweetSpot: "Large enterprises on SAP ERP. 10,000+ employees.",
    pricing: "Premium. $85-300 PEPM. Multi-year contracts. Add-ons separate.",
    implementationReality: "18-24 months in India. Projects routinely overrun 50-100%.",
    weaknesses: [
      "India payroll requires third-party integration or heavy customization",
      "Acquired in 2012 — module integration is inconsistent and shows its age",
      "Implementation projects in India routinely cost 2-3x initial estimates",
      "UI is outdated — high training investment required before adoption",
      "Extreme vendor lock-in — migrating off takes years"
    ],
    killShots: {
      features: "SAP SuccessFactors was acquired in 2012 and module integration still shows its age. India payroll compliance needs a third-party integration on top. Is that included in their proposal, and who maintains it when Indian labor laws change?",
      price: "SAP implementations in India routinely cost 2-3x the initial estimate. Ask for three Indian customers who went live in the last 18 months on payroll — specifically about actual versus budgeted implementation cost."
    }
  },
  "zoho-people": {
    fullName: "Zoho People",
    sweetSpot: "SMBs under 500 employees already on Zoho",
    pricing: "Low. $1-10 PEPM. Payroll is a separate product at additional cost.",
    implementationReality: "Quick for basic HR. Payroll needs separate Zoho Payroll product.",
    weaknesses: [
      "Payroll is Zoho Payroll — a completely separate product not included in base pricing",
      "Feature depth limited for companies over 500 employees",
      "One of 50+ Zoho products — HR depth is compromised by horizontal breadth",
      "Reporting needs Zoho Analytics as another add-on",
      "Data sync issues between Zoho People and Zoho Payroll are a recurring complaint"
    ],
    killShots: {
      price: "Zoho's entry price looks attractive but payroll is a separate product, analytics is separate. At 500+ employees the total cost is often comparable to a purpose-built platform with far more depth. Has their proposal shown the full cost including Zoho Payroll?",
      features: "Zoho People is one product in a 50+ product suite — HR depth is the trade-off. At your scale you will hit the ceiling on performance management and analytics within 12 months. What is your HR tech strategy when you outgrow it?"
    }
  },
  "greythr": {
    fullName: "GreytHR",
    sweetSpot: "Indian SMBs under 500 employees. Payroll-first buyers.",
    pricing: "Low. Transparent pricing starting around 3000 rupees per month for 25 employees.",
    implementationReality: "Fast — 2-3 weeks for core payroll setup.",
    weaknesses: [
      "Payroll-first product — HR management features are significantly limited",
      "No serious performance management, OKRs, or succession planning",
      "UI is dated — users consistently cite a legacy-feeling interface",
      "Companies migrate away consistently at 500-1000 employees",
      "Mobile experience is weak — primarily designed for desktop use"
    ],
    killShots: {
      features: "GreytHR is fundamentally a payroll automation tool with basic HR features bolted on. If the requirement is only statutory compliance, it is fair. But if you need performance management or workforce analytics, you will be replacing it within 18 months. What is the cost of a second implementation?",
      price: "GreytHR is priced for what it does — payroll and attendance. The total cost when you add the HR capabilities missing, either manually or through point solutions, often exceeds a modern platform that includes everything."
    }
  },
  "bamboohr": {
    fullName: "BambooHR",
    sweetSpot: "US-headquartered companies, 50-1000 employees",
    pricing: "Mid-tier. $6-12 PEPM. Payroll is US-only add-on.",
    implementationReality: "Fast — 4-6 weeks. But zero India payroll support.",
    weaknesses: [
      "Payroll is US-only — cannot process Indian statutory payroll (PF, ESI, TDS) at all",
      "Companies with India employees need a completely separate payroll solution",
      "Not designed for APAC compliance requirements",
      "Performance management module is basic",
      "Limited configurability for complex Indian org structures"
    ],
    killShots: {
      features: "BambooHR payroll is US-only — it literally cannot process Indian payroll. If you have India employees, you need a completely separate payroll vendor. Has their proposal accounted for that cost and the complexity of running two systems?",
      price: "Once you add the India payroll solution you will need separately, BambooHR total cost is often comparable to a platform that handles everything in one place — without the integration complexity."
    }
  },
  "rippling": {
    fullName: "Rippling",
    sweetSpot: "US-headquartered tech companies with global employees",
    pricing: "Modular. $8 per employee base but each module adds cost. Total grows quickly.",
    implementationReality: "Fast for US core. India payroll requires EOR or local entity.",
    weaknesses: [
      "India payroll requires EOR service — significantly more expensive than direct payroll",
      "US-centric product — APAC compliance is an afterthought",
      "Modular pricing means full product is far more expensive than base price suggests",
      "Support for non-US customers consistently rated lower",
      "Complex to administer for HR-only users due to IT integration complexity"
    ],
    killShots: {
      features: "Rippling India payroll requires either your own legal entity or their EOR service — which costs 2-3x standard payroll per employee. If you are growing your India team, their pricing model changes dramatically. How is India payroll handled in their proposal?",
      price: "Rippling base price is misleading — every module is priced separately. Companies using HR, payroll, benefits, and IT management land at $25-40 PEPM fully configured. What modules are in their proposal and what is the all-in per-employee cost?"
    }
  },
  "peoplestrong": {
    fullName: "PeopleStrong",
    sweetSpot: "Mid to large Indian enterprises, manufacturing, BFSI",
    pricing: "Custom quote. Mid-tier, competitive with Darwinbox.",
    implementationReality: "3-6 months for full deployment.",
    weaknesses: [
      "Product depth gaps versus Darwinbox in advanced talent management",
      "UI and UX lag behind newer platforms",
      "Mobile experience needs significant improvement",
      "Brand recognition outside India is limited",
      "Integration ecosystem is smaller than Darwinbox or Keka",
      "Less investment momentum — Darwinbox raised $140M recently"
    ],
    killShots: {
      features: "PeopleStrong talent management, employee experience, and analytics are behind both Darwinbox and Keka. If talent retention is a strategic priority, what is their specific committed roadmap and delivery timeline for those modules?",
      price: "PeopleStrong and Darwinbox are in the same price range. The question is product momentum — Darwinbox just raised $140M and is investing in AI and product. What is PeopleStrong recent funding and roadmap differentiation?"
    }
  }
};

function getCompetitorIntel(name) {
  const key = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (COMPETITOR_DB[key]) return COMPETITOR_DB[key];
  const plain = name.toLowerCase().replace(/\s+/g, '');
  for (const [k, v] of Object.entries(COMPETITOR_DB)) {
    if (k.replace(/-/g,'').includes(plain) || plain.includes(k.replace(/-/g,'')) ||
        v.fullName.toLowerCase().includes(name.toLowerCase())) return v;
  }
  return null;
}

function buildIntelPrompt(intel, reasons) {
  if (!intel) return '';
  const r = (reasons || '').toLowerCase();
  let t = '\nVERIFIED COMPETITOR INTELLIGENCE (from Gartner Peer Insights, G2, Capterra, TrustRadius — use SPECIFIC facts in every section):\n';
  t += 'Competitor: ' + intel.fullName + '\n';
  t += 'Sweet spot: ' + intel.sweetSpot + '\n';
  t += 'Pricing reality: ' + intel.pricing + '\n';
  t += 'Implementation reality: ' + intel.implementationReality + '\n';
  t += '\nReal weaknesses from verified customer reviews:\n';
  intel.weaknesses.forEach(function(w, i) { t += (i+1) + '. ' + w + '\n'; });
  if (r.includes('feature') && intel.killShots.features) t += '\nKill shot for feature objection: "' + intel.killShots.features + '"\n';
  if ((r.includes('price') || r.includes('discount')) && intel.killShots.price) t += '\nKill shot for price: "' + intel.killShots.price + '"\n';
  if (r.includes('late') && intel.killShots.late) t += '\nKill shot for late entry: "' + intel.killShots.late + '"\n';
  if (r.includes('support') && intel.killShots.support) t += '\nKill shot for support: "' + intel.killShots.support + '"\n';
  return t;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { product, competitor, stage, industry, reasons, context } = req.body;
  if (!product || !competitor || !stage || !reasons) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dbIntel = getCompetitorIntel(competitor);
  let intelText = dbIntel ? buildIntelPrompt(dbIntel, reasons) : '';

  try {
    const g2Slug = competitor.toLowerCase().replace(/\s+/g, '-');
    const scr = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.FIRECRAWL_API_KEY },
      body: JSON.stringify({ url: 'https://www.g2.com/products/' + g2Slug + '/reviews', formats: ['markdown'], onlyMainContent: true, waitFor: 2000 })
    });
    if (scr.ok) {
      const txt = await scr.text();
      const json = JSON.parse(txt);
      const md = (json && json.data && json.data.markdown) ? json.data.markdown : (json.markdown || '');
      if (md.length > 500) intelText += '\n\nLIVE G2 REVIEWS:\n' + md.slice(0, 1500);
    }
  } catch(e) {}

  const prompt = 'You are an elite B2B sales strategist. You have verified competitive intelligence. Use SPECIFIC facts — not generic advice.\n\nDEAL:\n- Product: ' + product + '\n- Competitor: ' + competitor + '\n- Stage: ' + stage + '\n- Industry: ' + (industry || 'B2B Technology') + '\n- Why losing: ' + reasons + '\n' + (context ? '- Context: ' + context + '\n' : '') + '\n' + (intelText || 'Use your knowledge of ' + competitor + ' for specific competitive intelligence.') + '\n\nRULES: Reference specific facts. Name exact actions. Use real evidence. Every word must be usable by an AE in 10 minutes.\n\nRespond ONLY with valid JSON:\n{\n  "dealAssessment": {\n    "winProbability": <0-100>,\n    "urgency": "High|Medium|Low",\n    "summary": "2-3 sentences referencing specific ' + competitor + ' reality vs their claims"\n  },\n  "competitorWeaknesses": [\n    "Specific weakness with evidence",\n    "Second specific weakness",\n    "Third specific weakness"\n  ],\n  "killShot": "Verbatim question using a SPECIFIC known ' + competitor + ' weakness",\n  "counterMoves": [\n    { "move": "Title max 5 words", "action": "Specific action with exact words and evidence", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" }\n  ],\n  "talkTrack": {\n    "opening": "Exact opening words referencing something specific about ' + competitor + '",\n    "keyMessages": [\n      "Message using real ' + competitor + ' weakness or customer complaint",\n      "Message reframing evaluation based on ' + competitor + ' known gaps",\n      "Message positioning ' + product + ' strength against ' + competitor + ' weakness"\n    ],\n    "objectionHandlers": [\n      { "objection": "Exact objection buyer will raise", "response": "Word-for-word counter using specific evidence" },\n      { "objection": "Second specific objection", "response": "Word-for-word counter with real data" }\n    ]\n  },\n  "emailTemplate": {\n    "subject": "Specific subject referencing real ' + competitor + ' issue",\n    "body": "Complete email under 200 words. References specific ' + competitor + ' weakness. Single clear next step. Ready to send."\n  }\n}';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] })
    });
    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) { return res.status(500).json({ error: 'AI service error — please try again' }); }
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = (data.content || []).map(function(b) { return b.text || ''; }).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch(e) { return res.status(500).json({ error: 'Parse error — please try again' }); }
    return res.status(200).json(parsed);
  } catch(err) {
    return res.status(500).json({ error: 'Request failed: ' + err.message });
  }
};
