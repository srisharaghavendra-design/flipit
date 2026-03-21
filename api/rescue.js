// FlipIt Deal Rescue API - Self-contained with inline competitor database

const COMPETITOR_DB = {
  "darwinbox": {
    fullName: "Darwinbox",
    sweetSpot: "1000+ employee enterprises in India, SEA, MENA",
    pricing: "Custom quote only — no public pricing. Mid-to-premium tier. Estimated $20-25 PEPM. Pricing opacity is a consistent complaint — prospects report quotes changing late in the deal.",
    implementationReality: "Darwinbox's own published implementation framework states 4-5 months is typical, with the 'Elaboration' phase alone being the longest stage. They claim 2-4 weeks for simple deployments but complex enterprise go-lives routinely hit 4-5 months.",
    weaknesses: [
      "Support is the #1 recurring complaint — Gartner Peer Insights, G2, and Capterra all cite 'sluggish response from support team', 'delayed response', 'poor customer support after signing'. Verified review: 'I had a highly disappointing experience due to multiple product errors and the sluggish response from the support team.'",
      "Mobile app consistently criticized across platforms — 'slow mobile UI', 'UI problems in mobile application', 'not satisfied with desktop version', 'mobile app is lankier than PC version'. Attendance and leave work but deeper functionality degrades.",
      "Built for 1000+ employee enterprises — average client size is ~2000 employees. Sub-500 employee companies consistently find it complex and overkill. One G2 review: 'After having a deal with our 150 employee org, Darwinbox suddenly started acting pricey and withdrew the deal citing change in policies. They apparently don't know how to handle business.'",
      "Performance degrades under load — multiple reviews: 'when managing large volume of data or many employees use it at the same time, performance starts lagging and the process is very slow', 'website loads slowly'",
      "Deep configurability = high admin burden — Darwinbox explicitly states 'Darwinbox is a system that needs to be owned by the customer' — HR teams without dedicated HRIS admins struggle post go-live",
      "No free trial — prospect cannot test before committing, unlike Keka which offers trial access",
      "UI considered outdated — 'UI and UX could be more dynamic and modernized', 'feels basic', 'outdated compared to newer HCM software'"
    ],
    killShots: {
      features: "Darwinbox is architected for enterprises averaging 2000 employees — their own implementation framework has a dedicated phase just to understand your processes, which typically takes the longest. When they showed you those features, was that a standard deployment or one that took 4-5 months to configure for a company your size?",
      price: "Darwinbox doesn't publish pricing because deals are heavily negotiated. We've seen verified customer reviews where Darwinbox withdrew an agreed deal citing 'change in policies' when the customer wasn't profitable enough. Before you commit, I'd ask them: is this price locked in writing through go-live, and what happens if your headcount changes during implementation?",
      support: "Darwinbox's most consistent negative review theme across Gartner, G2, and Capterra is support responsiveness after you sign. Can they give you two customer references who went live in the last 6 months — specifically to ask about post-go-live support quality?",
      late: "You're late in this deal but that's actually an advantage — Darwinbox's 4-5 month implementation means nothing has started yet. Use this window to shift the evaluation from features to go-live risk. Ask the customer: if Darwinbox's implementation takes 5 months instead of 3, what happens to your payroll accuracy and HR operations in the meantime?"
    }
  },
  "workday": {
    fullName: "Workday",
    sweetSpot: "5000+ employee global enterprises, US-headquartered multinationals",
    pricing: "Premium. $150-400 PEPM for full suite. Multi-year contracts. Implementation costs often equal or exceed software costs.",
    implementationReality: "12-18 months average. Requires certified Workday partners — adds 30-50% to total cost. India payroll compliance requires heavy customization.",
    weaknesses: [
      "Price is 3-5x more expensive than APAC alternatives for equivalent headcount",
      "12-18 month implementation timeline standard — often 2+ years for large deployments",
      "US-centric design — India payroll compliance (PF, ESI, TDS) requires heavy customization and certified partner support",
      "Overkill for companies under 3000 employees — 80% of features go unused",
      "Customizations are expensive and break during bi-annual mandatory updates",
      "Support is partner-dependent — customers pay twice for implementation help",
      "No APAC statutory compliance out of the box"
    ],
    killShots: {
      price: "Workday's total cost of ownership over 3 years — including implementation partner fees, customization, training, and annual price increases — typically runs 4-6x what you'd pay for a platform built for your market. What's the implementation budget on top of the license fee in their proposal?",
      features: "Workday is built for US Fortune 500. For India payroll — PF, ESI, TDS, new labor codes — most Workday customers need certified partners to configure and maintain compliance. Who in your team has Workday admin certification, and what's your plan for the bi-annual mandatory updates that regularly break custom configurations?"
    }
  },
  "sap-successfactors": {
    fullName: "SAP SuccessFactors",
    sweetSpot: "Large enterprises already on SAP ERP. 10,000+ employees.",
    pricing: "Premium. $85-300 PEPM. Multi-year mandatory contracts. Add-ons priced separately.",
    implementationReality: "18-24 months average in India. Requires SAP-certified partners. Projects routinely overrun by 50-100%.",
    weaknesses: [
      "India payroll is a known weak point — requires third-party integration or heavy customization for Indian statutory compliance",
      "Legacy architecture — SuccessFactors was acquired in 2012, module integration is inconsistent",
      "Implementation projects in India routinely cost 2-3x initial estimates",
      "UI is outdated compared to modern platforms — high training investment required",
      "Vendor lock-in is extreme — migrating off SAP is a multi-year project",
      "Support goes through certified partners, not SAP directly"
    ],
    killShots: {
      features: "SAP SuccessFactors acquired their HR platform in 2012 and the integration between modules still shows its age. For India payroll compliance, most SAP customers need a third-party integration on top. Is that included in their proposal, and who maintains it when Indian labor laws change?",
      price: "SAP SuccessFactors implementations in India routinely cost 2-3x the original estimate. Before committing, ask for three Indian customer references who went live in the last 18 months on payroll — specifically about actual vs budgeted implementation cost."
    }
  },
  "zoho-people": {
    fullName: "Zoho People",
    sweetSpot: "SMBs under 500 employees already on Zoho suite",
    pricing: "Low cost. $1-10 PEPM. Payroll is a separate product (Zoho Payroll) with additional cost.",
    implementationReality: "Quick setup for basic HR. Payroll requires separate Zoho Payroll product.",
    weaknesses: [
      "Payroll is a completely separate product — Zoho Payroll is not included in Zoho People base pricing",
      "Feature depth is limited for companies over 500 employees",
      "Designed as one of 50+ Zoho products — HR depth is compromised by horizontal breadth",
      "Reporting requires Zoho Analytics as yet another add-on",
      "Integration between Zoho products can be inconsistent — data sync issues are a recurring complaint",
      "Mobile app functionality is limited"
    ],
    killShots: {
      price: "Zoho's entry price is attractive but the total cost surprises companies — payroll is a separate product, analytics requires Zoho Analytics, and at 500+ employees the per-employee cost is often comparable to a purpose-built platform with significantly more depth. Has their proposal shown you the full cost including Zoho Payroll?",
      features: "Zoho People is one of 50+ products in the Zoho suite — HR depth is the trade-off for horizontal breadth. At your scale, you'll hit the ceiling on performance management and analytics within 12 months. What's your HR tech strategy when you outgrow it?"
    }
  },
  "greythr": {
    fullName: "GreytHR",
    sweetSpot: "Indian SMBs under 500 employees. Payroll-first buyers.",
    pricing: "Low cost. Transparent pricing starting ~₹3000/month for 25 employees.",
    implementationReality: "Fast — 2-3 weeks for core payroll setup.",
    weaknesses: [
      "Payroll-first product — HR management features are significantly limited",
      "No serious performance management, OKRs, or succession planning",
      "UI is dated — users cite a legacy-feeling interface",
      "Companies consistently migrate away at 500-1000 employees",
      "Mobile experience is weak — primarily designed for desktop",
      "Analytics are basic with no advanced workforce reporting"
    ],
    killShots: {
      features: "GreytHR is fundamentally a payroll automation tool with basic HR features. If your requirement is only statutory compliance, it's fair. But if you need performance management, talent development, or any workforce analytics — you'll be replacing it within 18 months. What's the cost of a second implementation?",
      price: "GreytHR is priced for what it does — payroll and attendance. The total cost when you add what's missing, either manually or through point solutions, often exceeds a modern platform that includes it all."
    }
  },
  "bamboohr": {
    fullName: "BambooHR",
    sweetSpot: "US-headquartered companies, 50-1000 employees",
    pricing: "Mid-tier. $6-12 PEPM. Payroll is US-only add-on.",
    implementationReality: "Fast — 4-6 weeks. But no India payroll at all.",
    weaknesses: [
      "Payroll is US-only — cannot process Indian statutory payroll (PF, ESI, TDS)",
      "Companies with India employees need a completely separate payroll solution",
      "Not designed for APAC compliance requirements",
      "Performance management module is basic",
      "Limited configurability for complex Indian org structures"
    ],
    killShots: {
      features: "BambooHR's payroll is US-only — it literally cannot process Indian payroll. If you have India employees, you need a completely separate payroll vendor on top. Has their proposal accounted for that cost and the complexity of maintaining two systems?",
      price: "Once you add the India payroll solution you'll need separately, BambooHR's total cost is often comparable to a platform that handles everything in one place — without the integration complexity."
    }
  },
  "rippling": {
    fullName: "Rippling",
    sweetSpot: "US-headquartered tech companies with global employees",
    pricing: "Modular. $8/employee/month base — but each module adds cost. Total grows quickly.",
    implementationReality: "Fast for US core. India payroll requires EOR or local entity.",
    weaknesses: [
      "India payroll requires EOR service — significantly more expensive than direct payroll",
      "US-centric product — APAC compliance is an afterthought",
      "Modular pricing means the full product is significantly more expensive than the base price",
      "Support for non-US customers is consistently rated lower",
      "Complex to administer for HR-only users due to IT integration features"
    ],
    killShots: {
      features: "Rippling's India payroll requires either your own legal entity or their EOR service — which costs 2-3x standard payroll per employee. If you're planning to grow your India team, their pricing model changes dramatically. How is India payroll handled in their proposal?",
      price: "Rippling's base price is misleading — every module is priced separately. Companies using HR, payroll, benefits, and IT management often land at $25-40 PEPM fully configured. What modules are included in their proposal and what's the per-employee all-in cost?"
    }
  },
  "peoplestrong": {
    fullName: "PeopleStrong",
    sweetSpot: "Mid to large Indian enterprises, manufacturing, BFSI",
    pricing: "Custom quote. Mid-tier, competitive with Darwinbox.",
    implementationReality: "3-6 months for full deployment.",
    weaknesses: [
      "Product depth gaps vs Darwinbox in advanced talent management",
      "UI and UX lag behind newer platforms",
      "Mobile experience needs significant improvement",
      "Brand recognition outside India is limited",
      "Integration ecosystem is smaller than Darwinbox or Keka",
      "Less investment momentum — Darwinbox raised $140M recently vs PeopleStrong's position"
    ],
    killShots: {
      features: "PeopleStrong's talent management, employee experience, and analytics are behind both Darwinbox and Keka. If talent retention is a strategic priority, what is their specific roadmap and committed delivery timeline for those modules?",
      price: "PeopleStrong and Darwinbox are in the same price range. The question is product momentum — Darwinbox just raised $140M and is investing heavily in AI and product. What's PeopleStrong's recent funding and roadmap differentiation?"
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
  let t = `\nVERIFIED COMPETITOR INTELLIGENCE (sourced from Gartner Peer Insights, G2, Capterra, TrustRadius — use these SPECIFIC facts in every section):\n`;
  t += `Competitor: ${intel.fullName}\n`;
  t += `Sweet spot: ${intel.sweetSpot}\n`;
  t += `Pricing reality: ${intel.pricing}\n`;
  t += `Implementation reality: ${intel.implementationReality}\n`;
  t += `\nReal weaknesses from verified customer reviews:\n`;
  intel.weaknesses.forEach((w, i) => { t += `${i+1}. ${w}\n`; });
  if (r.includes('feature') && intel.killShots.features) t += `\nAngles for feature objection: "${intel.killShots.features}"\n`;
  if ((r.includes('price') || r.includes('discount')) && intel.killShots.price) t += `\nAngles for price objection: "${intel.killShots.price}"\n`;
  if (r.includes('late') && intel.killShots.late) t += `\nAngles for late entry: "${intel.killShots.late}"\n`;
  if (r.includes('support') && intel.killShots.support) t += `\nAngles for support: "${intel.killShots.support}"\n`;
  return t;
}

export default async function handler(req, res) {
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

  // Live scraping — best effort only, never blocks
  try {
    const g2Slug = competitor.toLowerCase().replace(/\s+/g, '-');
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ url: `https://www.g2.com/products/${g2Slug}/reviews`, formats: ['markdown'], onlyMainContent: true, waitFor: 2000 })
    });
    if (r.ok) {
      const txt = await r.text();
      const json = JSON.parse(txt);
      const md = json?.data?.markdown || json?.markdown || '';
      if (md.length > 500) intelText += `\n\nLIVE G2 REVIEWS (today):\n${md.slice(0, 1500)}`;
    }
  } catch { /* silent */ }

  const prompt = `You are an elite B2B sales strategist. You have verified competitive intelligence. Use SPECIFIC facts — not generic advice.

DEAL:
- Product: ${product}
- Competitor: ${competitor}
- Stage: ${stage}
- Industry: ${industry || 'B2B Technology'}
- Why losing: ${reasons}
${context ? `- Context: ${context}` : ''}

${intelText || `Use your knowledge of ${competitor} for specific competitive intelligence.`}

RULES: Reference specific facts from the intelligence. Name exact actions. Use real evidence. Every word must be usable by an AE in 10 minutes.

Respond ONLY with valid JSON:
{
  "dealAssessment": {
    "winProbability": <0-100>,
    "urgency": "High|Medium|Low",
    "summary": "2-3 sentences referencing specific ${competitor} reality vs their claims in this deal"
  },
  "competitorWeaknesses": [
    "Specific weakness with evidence source",
    "Second specific weakness",
    "Third specific weakness"
  ],
  "killShot": "One verbatim question/statement using a SPECIFIC known ${competitor} weakness — pricing opacity, implementation timeline, support gaps, size misfit, or mobile issues",
  "counterMoves": [
    { "move": "Title max 5 words", "action": "Specific action with exact words, who to contact, what evidence to use from the intelligence above", "timing": "Today|Within 48 hours|Before next meeting|This week" },
    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },
    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },
    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" }
  ],
  "talkTrack": {
    "opening": "Exact opening words referencing something specific about ${competitor}",
    "keyMessages": [
      "Message using real ${competitor} customer complaint or verified weakness",
      "Message reframing evaluation based on ${competitor} known gaps",
      "Message positioning ${product} strength against ${competitor} specific weakness"
    ],
    "objectionHandlers": [
      { "objection": "Exact objection buyer will raise about ${competitor}", "response": "Word-for-word counter using specific evidence — conversational, confident" },
      { "objection": "Second specific objection", "response": "Word-for-word counter with real data" }
    ]
  },
  "emailTemplate": {
    "subject": "Specific subject referencing real ${competitor} issue — not generic",
    "body": "Complete email under 200 words. References specific ${competitor} weakness. Single clear next step. Ready to send now."
  }
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] })
    });
    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch { return res.status(500).json({ error: 'AI service error — please try again' }); }
    if (data.error) return res.status(500).json({ error: data.error.message });
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { return res.status(500).json({ error: 'Parse error — please try again' }); }
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Request failed: ' + err.message });
  }
}
