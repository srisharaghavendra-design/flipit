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
  },
  "coalition": {
    fullName: "Coalition",
    sweetSpot: "US-based SMBs and mid-market. Strong in tech companies. 160,000+ customers.",
    pricing: "Competitive. Uses proprietary risk scoring to price — tech companies with good security posture get lower rates. No public pricing.",
    implementationReality: "Fast quote and bind process. Strong broker portal. But US-market focused — Canadian market presence is growing but less mature than their US operation.",
    weaknesses: [
      "US-centric — Canadian market is a secondary focus. Canadian brokers report less local support and slower response times compared to their US counterparts.",
      "Pure insurance play with cybersecurity tools bolted on — lacks the dedicated vCISO and breach response depth that BOXX includes as standard",
      "At $5B valuation they are an enterprise-scale company — SMBs report feeling like a small account with limited personalization",
      "Coalition's security scanning can flag issues at renewal and increase premiums significantly — customers report surprise premium jumps of 30-50% after a scan",
      "Claims process can be slow — several broker reviews note Coalition's claims handling lacks the 24/7 immediacy of dedicated cyber incident response providers",
      "No Virtual CISO service included — security guidance requires separate engagement",
      "Coverage gaps in Tech E&O compared to dedicated tech insurance providers"
    ],
    killShots: {
      features: "Coalition's cybersecurity tools are built to help them underwrite risk more accurately — not primarily to help you prevent incidents. When their security scanner finds an issue at renewal, your premium goes up. BOXX's vCISO and prevention tools are built to actually reduce your risk. Has Coalition shown you what happens to your premium if their scanner finds a vulnerability at renewal?",
      price: "Coalition uses continuous security scanning and that data directly feeds their renewal pricing. Customers report 30-50% premium increases when scans flag issues. With BOXX, the prevention tools are designed to fix those issues before they affect your coverage — not just report them to underwriters.",
      late: "Coalition is strong in the US but their Canadian operation is significantly smaller. Local broker support, claims response, and regulatory expertise in Canada are where BOXX has a genuine home-market advantage. Who handles Coalition claims in Canada at 2am on a Saturday?"
    }
  },
  "at-bay": {
    fullName: "At-Bay",
    sweetSpot: "Tech companies and digitally-mature SMBs. Strong in US market.",
    pricing: "Risk-based pricing using continuous monitoring. Generally competitive for low-risk tech companies but higher for traditional businesses.",
    implementationReality: "Fast for tech-savvy buyers. Less smooth for traditional SMBs unfamiliar with security assessments.",
    weaknesses: [
      "Primarily US-focused — Canadian market presence is limited with less local regulatory expertise and broker support",
      "Complex onboarding for non-tech businesses — security assessment requirements can slow down quoting for traditional SMBs",
      "No Virtual CISO service — security guidance is not included, only monitoring and insurance",
      "Continuous monitoring can feel invasive to SMBs — some customers report feeling surveilled rather than protected",
      "Claims handling for Canadian regulatory requirements (PIPEDA, provincial privacy laws) is less experienced than Canadian-native providers",
      "Product suite is narrower than BOXX — no home/personal cyber coverage for executives",
      "Less broker-friendly than Coalition or BOXX — broker portal functionality is more limited"
    ],
    killShots: {
      features: "At-Bay gives you monitoring that tells you when you have a problem. BOXX gives you a Virtual CISO who helps you fix it before it becomes a claim. For a Canadian SMB without internal IT security staff, which do you actually need — more alerts or someone to call?",
      price: "At-Bay's continuous monitoring feeds their underwriting model. If their monitoring finds an issue, your renewal conversation changes. BOXX's model is built to help you remediate issues — your vCISO is incentivised to reduce your risk, not just document it for underwriting purposes.",
      late: "At-Bay is a US company learning the Canadian market. BOXX is built in Canada, backed by Zurich since July 2025, with Lloyd's underwriting and dedicated Canadian regulatory expertise. For a Canadian business dealing with PIPEDA compliance and provincial privacy laws, that local depth matters when you have an incident."
    }
  },
  "cowbell": {
    fullName: "Cowbell",
    sweetSpot: "US SMEs. AI-driven automated underwriting. Fast quote process.",
    pricing: "Competitive for SMEs. AI underwriting keeps pricing tight. But US-focused pricing models.",
    implementationReality: "Very fast — automated underwriting means quotes in minutes. But limited human support post-bind.",
    weaknesses: [
      "US-only product — Cowbell does not operate in Canada. If your prospect is a Canadian business, Cowbell is not a valid alternative.",
      "Fully automated underwriting — no human underwriter relationship, which some brokers and clients find limiting for complex or unusual risks",
      "No prevention services included — pure insurance product with limited security tooling",
      "No Virtual CISO, no dedicated incident response team — just coverage",
      "Limited broker support for complex claims — automated model breaks down when human judgment is needed",
      "No personal/home cyber coverage — business only",
      "Less coverage depth for tech E&O compared to specialists"
    ],
    killShots: {
      features: "Cowbell is a US-only product. If your prospect is a Canadian business, this is not actually a competitor — Cowbell does not write Canadian risks. Is their team aware of that?",
      price: "Cowbell's speed comes from full automation — AI underwrites, AI prices, AI manages. That is great for simple risks. But when you have a claim at 2am, you are dealing with an automated system. BOXX's Hackbusters gives you 24/7 human incident response included in the policy — not as an add-on."
    }
  },
  "hiscox": {
    fullName: "Hiscox",
    sweetSpot: "SMBs and professional services. Traditional insurer with cyber product. Global brand.",
    pricing: "Mid to premium tier. Traditional insurance pricing model. Cyber is one of many products.",
    implementationReality: "Standard insurance process. Slower than insurtechs. Broker-dependent distribution.",
    weaknesses: [
      "Traditional insurer with cyber bolted on — no active prevention tools, no Virtual CISO, no continuous monitoring included",
      "Hiscox cyber is an insurance product, not a cyber protection product — it pays after an incident, it does not help prevent one",
      "Claims process is traditional insurance pace — not the 24/7 immediate response that cyber incidents require",
      "No breach response team included — you need to find your own IR firm when an incident happens, then claim back",
      "Underwriting is less sophisticated than cyber specialists — pricing does not reflect actual cyber risk posture",
      "No broker portal with instant quote-and-bind capability compared to insurtechs",
      "Coverage language is more traditional — less specific to modern cyber threats like ransomware, BEC, and supply chain attacks"
    ],
    killShots: {
      features: "Hiscox is a great insurance company that has added a cyber product. BOXX is a cyber protection company that includes insurance. When your client has a ransomware attack at 11pm, Hiscox gives them a policy number to call on Monday. BOXX gives them Hackbusters — a 24/7 breach response team that picks up immediately. What does their prospect actually need at 11pm on a Friday?",
      price: "Hiscox pricing is based on traditional insurance risk models. BOXX pricing reflects actual cyber risk posture because they are measuring and improving it continuously. Long term, a client that improves their security posture with BOXX's tools should see better renewal pricing than one sitting static with Hiscox.",
      late: "Hiscox has brand recognition. BOXX has Zurich backing since July 2025, Lloyd's underwriting, and a purpose-built cyber protection model. For a broker recommending cyber coverage, which story is better — a big name with a generic cyber add-on, or a specialist with Zurich's balance sheet behind it?"
    }
  },
  "beazley": {
    fullName: "Beazley",
    sweetSpot: "Mid to large enterprises. Complex risk profiles. Global specialty insurer.",
    pricing: "Premium. Specialist pricing for complex cyber risks. Not competitive for SMBs.",
    implementationReality: "Complex underwriting process. Not designed for fast SMB quote-and-bind.",
    weaknesses: [
      "Designed for enterprises with complex risk profiles — SMBs are not their target market and it shows in pricing and process",
      "No active prevention tools or Virtual CISO — pure specialty insurance product",
      "High minimum premiums make it uncompetitive for small businesses",
      "Underwriting process is complex and slow for SMB accounts",
      "Broker-heavy distribution model — less direct access for smaller clients",
      "No tech-integrated risk management — traditional underwriting only",
      "Breach response requires separate vendor engagement — not included as standard"
    ],
    killShots: {
      features: "Beazley is an excellent product for a $50M+ revenue company with a complex risk profile. For an SMB, you are paying enterprise premiums for enterprise underwriting complexity. BOXX is built specifically for SMBs — the pricing, the process, the Virtual CISO, the Hackbusters response — everything is sized for your client's actual situation.",
      price: "Beazley's minimum premiums typically start where BOXX's comprehensive SMB coverage ends. Unless your client has a genuinely complex risk profile that requires specialty underwriting, they would be overpaying for coverage they cannot fully use."
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
