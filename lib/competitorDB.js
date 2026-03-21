// FlipIt Competitor Intelligence Database
// Built from: G2, Gartner Peer Insights, Capterra, TrustRadius, SaaSworthy
// Last updated: March 2025

export const COMPETITOR_DB = {

  "darwinbox": {
    fullName: "Darwinbox",
    sweetSpot: "1000+ employee enterprises in India, SEA, MENA",
    pricing: "Custom quote only. Mid-to-premium tier. $20-25 PEPM estimated. No public pricing — creates friction in competitive deals.",
    implementationReality: "Their own documentation states 4-5 months average. They claim 2-4 weeks for simple deployments but complex enterprise go-lives routinely hit 4-5 months. The 'Elaboration' phase alone — just understanding your processes — is the longest phase.",
    realWeaknesses: [
      "Support quality is the #1 recurring complaint — multiple Gartner, G2, and Capterra reviews cite 'sluggish response from support team', 'delayed response', 'poor customer support'. One verified review: 'I had a highly disappointing experience due to multiple product errors and the sluggish response from the support team.'",
      "Mobile app consistently criticized — 'slow mobile UI', 'UI problems in mobile application', 'desktop version is not satisfactory', 'mobile app is lankier than PC version'. Attendance and leave work but deeper functionality breaks down.",
      "Built for enterprises with 1000+ employees — average client size is ~2000 employees. Companies under 500 employees consistently find it complex and overkill. One G2 review: 'After having a deal with our 150 employee org, Darwinbox suddenly started acting pricey and withdrew the deal citing change in policies.'",
      "Performance degrades under load — 'when managing large volume of data or many employees use it at the same time, performance starts lagging', 'website loads slowly', multiple reports of slow loading.",
      "UI considered outdated — 'UI and UX could be more dynamic and modernized', 'feels basic', 'outdated compared to newer HCM software'",
      "Deep configurability = high admin burden — they explicitly say 'Darwinbox is a system that needs to be owned by the customer' — HR teams without dedicated HRIS admins struggle post go-live.",
      "No free trial — prospect cannot test before buying, unlike Keka",
      "Pricing not transparent — custom quotes only creates distrust and slows evaluation"
    ],
    killShots: {
      features: "Darwinbox is built for 2000+ employee enterprises — their average client is twice your size. When their sales team showed you those features, were they showing you a standard deployment or a heavily customized one that took 4-5 months to build?",
      price: "Darwinbox doesn't publish pricing for a reason — their deals are heavily negotiated and inconsistent. We've seen them withdraw deals citing 'change in policies' when they decide a customer isn't profitable enough. How confident are you in the price they've quoted staying fixed through implementation?",
      support: "Darwinbox's most consistent negative review theme across Gartner, G2, and Capterra is support responsiveness after you sign. Before you commit, ask them: what is your guaranteed SLA for support tickets, and can you speak to two customers who went live in the last 6 months about their support experience?",
      late: "You're at [stage] and they already have 4-5 months ahead of you on relationship. The fastest way to reset this deal is to change what's being evaluated — stop competing on features and start competing on go-live risk. Ask the customer: 'If the Darwinbox implementation takes 5 months instead of 3, what happens to your payroll processing in the meantime?'"
    },
    bestUsedAgainst: ["keka", "greythr", "zoho-people", "peoplestrong"],
    notRecommendedAgainst: ["workday", "sap-successfactors", "oracle-hcm"]
  },

  "workday": {
    fullName: "Workday",
    sweetSpot: "5000+ employee global enterprises, US-headquartered companies",
    pricing: "Premium. $150-400 PEPM for full suite. Multi-year contracts standard. Implementation costs often equal or exceed software costs.",
    implementationReality: "12-18 months average for mid-enterprise. Complex implementations routinely run 2+ years. Requires certified Workday partners — adds 30-50% to total cost.",
    realWeaknesses: [
      "Price is the #1 objection — consistently 3-5x more expensive than APAC alternatives for the same headcount",
      "Implementation complexity and timeline — 12-18 months is standard, often 2+ years for large deployments. Requires certified implementation partners at significant additional cost.",
      "Overkill for companies under 3000 employees — 80% of features go unused by mid-market companies paying for them",
      "US-centric design — India payroll compliance, statutory filings (PF, ESI, TDS), local labor laws require heavy customization and ongoing maintenance",
      "Rigid system — customizations are expensive and often break during updates. 'It's Workday or the highway' — configuration flexibility is limited without developer support.",
      "Support model is partner-dependent — Workday pushes most support through certified implementation partners, not directly. Customers often pay twice.",
      "Upgrade cycles are disruptive — bi-annual mandatory updates regularly break custom configurations",
      "No APAC-specific features out of the box — statutory compliance for India, Singapore, Australia requires additional modules or customization"
    ],
    killShots: {
      price: "Workday's total cost of ownership over 3 years — including implementation partner fees, customization, training, and annual increases — typically runs 4-6x what you'd pay for an equivalent platform built for your market. What's your budget for implementation on top of the license fee?",
      features: "Workday is built for US Fortune 500 companies. Their India payroll compliance requires certified Workday partners to configure and maintain. Who in your team has Workday admin certification, and what's your plan when the mandatory bi-annual update breaks your custom workflows?",
      late: "Being in a late-stage Workday evaluation actually gives you leverage — Workday's implementation timelines mean nothing happens fast. Use this window to introduce a total cost of ownership comparison. Workday customers routinely discover the real cost is 40% higher than the initial quote once implementation is factored in."
    },
    bestUsedAgainst: ["keka", "darwinbox", "peoplestrong", "greythr"],
    notRecommendedAgainst: []
  },

  "sap-successfactors": {
    fullName: "SAP SuccessFactors",
    sweetSpot: "Large enterprises already on SAP ERP. 10,000+ employees.",
    pricing: "Premium. $85-300 PEPM depending on modules. Multi-year mandatory contracts. Add-ons priced separately.",
    implementationReality: "18-24 months average. Requires SAP-certified implementation partners. Projects routinely overrun by 50-100%. Indian market has limited certified partner availability causing delays.",
    realWeaknesses: [
      "Complexity is legendary — SAP's own user conferences feature sessions on 'how to survive your SuccessFactors implementation'. The learning curve is steep for HR teams.",
      "Legacy architecture — built on acquired technology (SuccessFactors was acquired by SAP in 2012), integration between modules is inconsistent",
      "Indian payroll is a known weak point — SAP HR used to own Indian payroll but SuccessFactors requires third-party integration or heavy customization for India compliance",
      "UI is outdated — users consistently rate the interface as unintuitive compared to newer platforms. Requires training investment before adoption.",
      "Vendor lock-in is extreme — migrating off SAP SuccessFactors once live is a multi-year project due to deep data dependencies",
      "Support is through partners, not SAP directly — response times are slow and inconsistent",
      "Cost overruns are common — implementation projects routinely cost 2-3x initial estimates due to complexity and customization requirements"
    ],
    killShots: {
      features: "SAP SuccessFactors acquired their HR platform in 2012 and the module integration still shows its age — their payroll and core HR are architected by different teams. For India-specific compliance, most SAP customers need a third-party payroll integration on top. Are they including that in their proposal?",
      price: "SAP SuccessFactors implementations in India routinely cost 2-3x the original estimate. Before you commit, ask them for three Indian customer references who went live in the last 18 months — specifically on payroll — and ask about actual vs. budgeted implementation cost."
    },
    bestUsedAgainst: ["keka", "darwinbox", "peoplestrong"],
    notRecommendedAgainst: []
  },

  "zoho-people": {
    fullName: "Zoho People",
    sweetSpot: "SMBs under 500 employees already on Zoho suite. Price-sensitive buyers.",
    pricing: "Low cost. $1-10 PEPM. Part of Zoho One bundle. Attractive entry price but feature gaps emerge at scale.",
    implementationReality: "Quick to set up for basic HR. 2-4 weeks for simple deployments. But payroll requires Zoho Payroll as a separate product — not included in base pricing.",
    realWeaknesses: [
      "Feature depth is limited for companies over 500 employees — performance management, advanced analytics, and talent management are basic compared to dedicated HR platforms",
      "Payroll is a separate product (Zoho Payroll) with additional cost — prospect may not realize the total cost",
      "Customer support quality varies significantly — Zoho's support is inconsistent across products",
      "Reporting and analytics are basic — custom reports require Zoho Analytics as yet another add-on",
      "Designed as a horizontal product, not an HR specialist — depth in any area is compromised by breadth across 50+ Zoho products",
      "Integration between Zoho products can be inconsistent — data sync issues between Zoho People and Zoho Payroll are a recurring complaint",
      "Mobile app functionality is limited compared to enterprise HR platforms"
    ],
    killShots: {
      price: "Zoho's entry pricing is attractive but the total cost surprises companies — payroll is a separate product, analytics is separate, and the per-employee cost at 500+ employees is often comparable to a purpose-built HR platform with significantly more depth. Have they shown you the full cost including Zoho Payroll?",
      features: "Zoho People is built as one product in a 50+ product suite — it's designed for breadth, not HR depth. At your scale, you'll hit the ceiling on performance management, succession planning, and analytics within 12 months. What happens to your HR tech strategy when you outgrow it?"
    },
    bestUsedAgainst: ["keka", "greythr"],
    notRecommendedAgainst: ["workday", "sap-successfactors"]
  },

  "greythr": {
    fullName: "GreytHR",
    sweetSpot: "Indian SMBs under 500 employees. Strong payroll-first buyers.",
    pricing: "Low cost. Transparent pricing starting from ~₹3000/month for 25 employees. Strong value for payroll-focused companies.",
    implementationReality: "Fast — typically 2-3 weeks for core setup. Payroll go-live in 4-6 weeks.",
    realWeaknesses: [
      "Payroll-first product — HR management features like performance management, talent acquisition, and engagement are significantly limited",
      "UI is dated — users frequently cite the interface as feeling legacy compared to modern HR platforms",
      "Talent management is essentially absent — no serious performance management, OKRs, or succession planning",
      "Limited scalability — companies that outgrow 500-1000 employees consistently migrate away from GreytHR",
      "Mobile experience is weak — primarily designed for desktop use",
      "Analytics and reporting are basic — no advanced workforce analytics",
      "Integration ecosystem is limited compared to more modern platforms"
    ],
    killShots: {
      features: "GreytHR is fundamentally a payroll automation tool with basic HR features bolted on. If your requirement is only statutory compliance and payroll, it's a fair choice. But if you need performance management, talent development, or any people analytics beyond headcount reports — you'll be shopping again in 18 months.",
      price: "GreytHR's price is genuinely attractive, but it's priced for what it does — payroll and attendance. The total cost of ownership when you add the HR features you're missing — either by building them manually or buying point solutions — often exceeds a modern platform that includes them."
    },
    bestUsedAgainst: ["keka", "darwinbox"],
    notRecommendedAgainst: []
  },

  "bamboohr": {
    fullName: "BambooHR",
    sweetSpot: "US-headquartered companies, 50-1000 employees. Strong in tech companies.",
    pricing: "Mid-tier. $6-12 PEPM. Transparent pricing. Payroll is US-only add-on.",
    implementationReality: "Fast — typically 4-6 weeks. Strong self-serve implementation resources.",
    realWeaknesses: [
      "US-centric — payroll is US-only. Indian statutory compliance (PF, ESI, TDS) is not supported natively",
      "No India payroll whatsoever — companies with India employees need a separate payroll solution",
      "Limited configurability for complex Indian org structures — hierarchies and workflows are simpler than enterprise needs",
      "Reporting is basic — custom analytics require workarounds",
      "Performance management module is basic — limited support for OKRs, 360 feedback, or continuous performance",
      "Not designed for APAC compliance requirements — Singapore, Australia, Indonesia labor laws require workarounds"
    ],
    killShots: {
      features: "BambooHR's payroll is US-only — it literally cannot process Indian payroll. If you have any India employees, you need a completely separate payroll vendor. Has their proposal accounted for that cost and complexity?",
      price: "BambooHR is priced for US companies with US payroll. Once you add the India payroll solution you'll need separately, the total cost is often comparable to a platform that handles everything in one place."
    },
    bestUsedAgainst: ["keka", "darwinbox"],
    notRecommendedAgainst: []
  },

  "rippling": {
    fullName: "Rippling",
    sweetSpot: "US-headquartered tech companies with global employees. Strong IT + HR convergence play.",
    pricing: "Modular pricing. $8/employee/month base. Add-ons for each module. Total cost grows quickly with modules.",
    implementationReality: "Fast for US core. Global payroll setup takes 4-8 weeks per country. India payroll requires EOR or local entity.",
    realWeaknesses: [
      "India payroll is EOR-only — Rippling cannot process direct India payroll unless the company has a legal entity, and their India EOR costs significantly more",
      "US-centric product philosophy — APAC compliance features are an afterthought",
      "Modular pricing means the full product is significantly more expensive than the base price suggests",
      "Support quality for non-US customers is consistently rated lower than US customers",
      "Complex to administer — IT integration features add complexity for HR-only users"
    ],
    killShots: {
      features: "Rippling's India payroll requires either your own legal entity or their EOR service — which costs 2-3x standard payroll. If you're planning to expand your India team, their pricing model changes dramatically. Has their proposal specified how India payroll is handled?",
      price: "Rippling's base price is misleading — every module is priced separately. A company using HR, payroll, benefits, and IT management often ends up at $25-40 PEPM once fully configured. What modules are in their proposal?"
    },
    bestUsedAgainst: ["keka", "darwinbox", "greythr"],
    notRecommendedAgainst: []
  },

  "peoplestrong": {
    fullName: "PeopleStrong",
    sweetSpot: "Mid to large Indian enterprises. Strong in manufacturing, BFSI, and conglomerates.",
    pricing: "Custom quote. Mid-tier pricing. Competitive with Darwinbox for large Indian enterprises.",
    implementationReality: "3-6 months for full deployment. Similar complexity profile to Darwinbox.",
    realWeaknesses: [
      "Product depth has gaps compared to Darwinbox in advanced talent management",
      "UI and UX lag behind newer platforms — users cite an older-feeling interface",
      "Mobile experience needs improvement — core functions work but advanced features are limited on mobile",
      "Outside India and limited APAC markets, support and local compliance coverage is weak",
      "Less market credibility internationally — brand recognition outside India is low",
      "Integration ecosystem is smaller than Darwinbox or Keka"
    ],
    killShots: {
      features: "PeopleStrong is built for large Indian conglomerates with complex hierarchies — which is a strength if that's you. But their talent management, employee experience, and analytics are behind both Darwinbox and Keka. If talent retention is a strategic priority, what's their roadmap for those modules?",
      price: "PeopleStrong and Darwinbox are in the same price range for Indian enterprises. The question is which product has better momentum — Darwinbox just raised $140M and is investing heavily in product. What's PeopleStrong's recent funding and roadmap look like?"
    },
    bestUsedAgainst: ["keka", "darwinbox", "greythr"],
    notRecommendedAgainst: []
  }
};

// Helper: find competitor intel by name (fuzzy match)
export function getCompetitorIntel(competitorName) {
  const key = competitorName.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // direct match
  if (COMPETITOR_DB[key]) return COMPETITOR_DB[key];

  // fuzzy match
  const partialKey = competitorName.toLowerCase().replace(/\s+/g, '');
  for (const [dbKey, data] of Object.entries(COMPETITOR_DB)) {
    if (dbKey.replace(/-/g, '').includes(partialKey) ||
        partialKey.includes(dbKey.replace(/-/g, '')) ||
        data.fullName.toLowerCase().includes(competitorName.toLowerCase())) {
      return data;
    }
  }
  return null;
}

// Format intel for prompt injection
export function formatIntelForPrompt(intel, reasons) {
  if (!intel) return '';

  const reasonList = (reasons || '').toLowerCase();
  let formatted = `\nVERIFIED COMPETITOR INTELLIGENCE (from G2, Gartner, Capterra reviews — use these SPECIFIC facts):\n`;
  formatted += `\nCompetitor: ${intel.fullName}\n`;
  formatted += `Sweet spot: ${intel.sweetSpot}\n`;
  formatted += `Pricing reality: ${intel.pricing}\n`;
  formatted += `Implementation reality: ${intel.implementationReality}\n`;
  formatted += `\nReal weaknesses from customer reviews:\n`;
  intel.realWeaknesses.forEach((w, i) => {
    formatted += `${i+1}. ${w}\n`;
  });

  // Add relevant kill shots based on reasons
  if (reasonList.includes('feature') && intel.killShots.features) {
    formatted += `\nKill shot angle for feature objection: "${intel.killShots.features}"\n`;
  }
  if ((reasonList.includes('price') || reasonList.includes('discount')) && intel.killShots.price) {
    formatted += `\nKill shot angle for price objection: "${intel.killShots.price}"\n`;
  }
  if (reasonList.includes('late') && intel.killShots.late) {
    formatted += `\nKill shot angle for late entry: "${intel.killShots.late}"\n`;
  }
  if (reasonList.includes('support') && intel.killShots.support) {
    formatted += `\nKill shot angle for support: "${intel.killShots.support}"\n`;
  }

  return formatted;
}
