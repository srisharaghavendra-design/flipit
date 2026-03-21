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
  },

  // ── CRM ──────────────────────────────────────────────────────────────────
  "salesforce": {
    fullName: "Salesforce",
    sweetSpot: "Mid to large enterprises. Complex sales processes. 1000+ employees. Strong in US market.",
    pricing: "Premium. $25-300 PEPM depending on edition. Enterprise and Unlimited editions $150-300 PEPM. AppExchange add-ons add significant cost. Implementation partner fees often equal first-year license cost.",
    implementationReality: "Average 17 days for simple deployments but complex enterprise implementations run 6-18 months with certified partners. Total cost of ownership is consistently underestimated.",
    weaknesses: [
      "Steep learning curve — requires dedicated Salesforce admin to manage. Companies without a certified admin see adoption rates collapse. G2 and Gartner reviews consistently cite complexity as #1 frustration.",
      "Pricing escalates rapidly — base price is misleading. Add Sales Cloud, Service Cloud, Marketing Cloud, Einstein AI, and required AppExchange apps and costs triple. Customers report 40-60% higher actual spend vs initial quote.",
      "Implementation requires certified partners — adds 30-50% to first-year cost. Gartner notes implementation costs often equal or exceed license fees.",
      "Overkill for companies under 200 employees — 80% of features go unused by SMBs paying enterprise prices.",
      "Customization creates tech debt — highly customized Salesforce orgs become unmaintainable. Upgrades break custom code. Companies get locked into expensive admin dependency.",
      "Support is tiered and expensive — standard support is community-only. Premier support costs extra. Response times for critical issues are slow without paid support tiers.",
      "Mobile app is consistently rated poorly — field sales teams report the mobile experience is significantly worse than the desktop version."
    ],
    killShots: {
      features: "Salesforce's power comes from customization — but every customization creates admin dependency and upgrade risk. Who in your team holds the Salesforce admin certification, and what is your plan when they leave? Companies consistently report their Salesforce org becomes unmaintainable within 18 months without dedicated admin support.",
      price: "Salesforce's base price is the beginning of the conversation, not the end. By the time you add the integrations you need, the Einstein AI tier, and the implementation partner fees, the real first-year cost is typically 2-3x the initial quote. Has their proposal shown total cost of ownership including implementation and first-year admin?",
      late: "You are competing against Salesforce's brand — not their product. Most companies that choose Salesforce do so because it is familiar, not because it is the best fit. Shift the evaluation to total cost of ownership and time-to-value. Salesforce's average implementation is 17 days for simple orgs — ask them what their timeline is for your specific complexity.",
      incumbent: "Migrating off Salesforce is notoriously painful — but companies do it every day when the cost-complexity ratio no longer makes sense. The question is not whether Salesforce works, it is whether it works for your size, your team, and your budget. What percentage of their Salesforce features does your prospect actually use today?"
    }
  },
  "hubspot": {
    fullName: "HubSpot",
    sweetSpot: "SMBs and mid-market companies 10-500 employees. Strong in marketing-led growth companies. Inbound-focused teams.",
    pricing: "Freemium entry but paid tiers escalate quickly. Professional: $500/month for Marketing Hub, $500/month for Sales Hub. Enterprise: $5000/month Marketing, $1200/month Sales. Contact-based pricing means costs scale unpredictably as database grows.",
    implementationReality: "Fast for basic setup — 1-2 weeks. But full marketing automation and CRM integration takes 4-8 weeks. Contact database growth can dramatically increase costs at renewal.",
    weaknesses: [
      "Contact-based pricing is a hidden trap — costs scale with your database size, not your team size. Companies that grow fast report 200-300% cost increases at renewal as contacts accumulate.",
      "Built as a marketing tool first, CRM second — sales teams with complex pipeline needs consistently find HubSpot's sales functionality shallow compared to Salesforce. Reddit users note: 'HubSpot for marketing, Salesforce for sales' as the standard split.",
      "Reporting and analytics are limited — multi-touch attribution, advanced forecasting, and custom analytics require higher tiers or separate tools. G2 reviews cite reporting as the #1 weakness.",
      "Limited customization for complex sales processes — companies with non-standard pipelines or complex deal structures find HubSpot's rigidity frustrating.",
      "Enterprise tier is expensive but still less capable than Salesforce Enterprise for complex operations — companies pay enterprise prices for mid-market functionality.",
      "Gartner 2024 Magic Quadrant cautioned on HubSpot's AI/ML strategy compared to Salesforce — AI features are less mature.",
      "Customer support quality declines at lower tiers — free and starter users report slow and unhelpful support responses."
    ],
    killShots: {
      features: "HubSpot was built as an inbound marketing platform that added CRM later. Salesforce built CRM first and added marketing after. If your team's primary need is outbound sales management with complex pipeline stages, you are buying the wrong product. Has their sales team actually mapped your pipeline requirements against HubSpot's deal stages, or just shown you the marketing automation features?",
      price: "HubSpot's contact-based pricing means your costs grow every time your database grows — regardless of whether you use those contacts. Companies that run any outbound or event marketing see costs double or triple within 12 months as contacts accumulate. What is their estimate of your contact database size at renewal?",
      late: "HubSpot's strength is inbound marketing automation. If your prospect needs a CRM that their outbound sales team will actually adopt and use daily, HubSpot's ease of use is a genuine advantage — but its sales depth is a genuine limitation. Ask them to show you the custom report that shows pipeline velocity by sales rep for the last 6 months."
    }
  },
  "pipedrive": {
    fullName: "Pipedrive",
    sweetSpot: "Small sales teams under 50 people. Pipeline-focused AEs. Simple B2B sales processes.",
    pricing: "Entry level. $14-99 PEPM depending on tier. Transparent pricing. Add-ons for LeadBooster, campaigns, and smart docs cost extra.",
    implementationReality: "Fast — 1-2 weeks. Minimal admin needed. But limited scalability beyond 100 users.",
    weaknesses: [
      "Built for pipeline visualization only — lacks marketing automation, customer service, and advanced reporting that growing companies need",
      "Limited customization — complex sales processes with multiple pipelines, custom objects, or non-standard workflows quickly hit limits",
      "Reporting is basic — no advanced analytics, attribution modeling, or forecasting without third-party tools",
      "No native marketing automation — requires integration with separate tools, creating data silos",
      "Companies consistently outgrow Pipedrive at 50-100 employees and migrate to HubSpot or Salesforce",
      "AI and automation features are significantly behind HubSpot and Salesforce",
      "Customer support is limited — primarily self-serve documentation"
    ],
    killShots: {
      features: "Pipedrive is an excellent pipeline visualization tool — but it is a pipeline tool, not a CRM platform. If your prospect needs marketing automation, customer success tracking, or any cross-functional workflow, Pipedrive will require 3-4 additional integrated tools to match what a modern CRM provides natively. What does their current tech stack look like beyond CRM?",
      price: "Pipedrive's low entry price is real — but the total stack cost when you add the marketing tool, the email tool, the analytics tool, and the integrations to connect them often exceeds a single platform like HubSpot. What tools would Pipedrive replace vs what tools would they still need separately?"
    }
  },

  // ── ITSM ─────────────────────────────────────────────────────────────────
  "servicenow": {
    fullName: "ServiceNow",
    sweetSpot: "Large enterprises 5000+ employees. Complex multi-department workflows. Fortune 500 IT departments.",
    pricing: "Premium and opaque. No public pricing. Estimated $100-300 PEPM for core ITSM. Enterprise licensing with annual true-ups. Implementation costs routinely equal first-year license. Total cost of ownership is consistently higher than initial quotes.",
    implementationReality: "6-18 months for enterprise deployments. Requires certified ServiceNow partners. Steep learning curve — needs dedicated platform admin. Complex customization creates ongoing maintenance burden.",
    weaknesses: [
      "Price is the #1 objection — consistently 5-10x more expensive than mid-market alternatives like Freshservice for equivalent basic ITSM functionality",
      "Steep learning curve — non-technical IT teams struggle with adoption. Gartner users cite the learning curve as the #1 frustration alongside cost.",
      "Implementation complexity — 6-18 months is typical for enterprise deployments. Requires certified implementation partners at significant additional cost.",
      "Overkill for companies under 2000 employees — 70-80% of ServiceNow features go unused by mid-market companies paying enterprise prices",
      "Customization creates admin dependency — highly customized instances require dedicated certified admins to maintain. Upgrades frequently break custom workflows.",
      "Licensing is opaque and negotiations are complex — customers report significant price variations and surprise true-up costs at renewal",
      "Customer support quality at lower tiers is limited — critical issue response requires premium support contracts"
    ],
    killShots: {
      price: "ServiceNow's licensing is deliberately opaque — every customer pays a different price depending on negotiation. The implementation cost on top of licensing typically equals or exceeds the first-year license fee. Has their proposal included a 3-year total cost of ownership including implementation partner, admin headcount, and annual increases?",
      features: "ServiceNow is the right platform for a 10,000 employee enterprise running HR, IT, security, and legal workflows on one platform. For a company your size, you would be paying for and maintaining a platform where 70-80% of the capabilities go unused. What is the specific list of features that ServiceNow has that the alternatives do not — and which of those do you actually need in year one?",
      late: "You are entering a ServiceNow evaluation late — but ServiceNow evaluations are long. 6-18 month implementations mean nothing is locked until the contract is signed. Use this window to introduce a total cost of ownership comparison. Freshservice at $19-99 PEPM with 2-4 week implementation vs ServiceNow at $100-300 PEPM with 6-18 month implementation — for the same core ITSM use case — is a conversation worth having."
    }
  },
  "freshservice": {
    fullName: "Freshservice",
    sweetSpot: "SMBs and mid-market 100-2000 employees. IT teams wanting fast deployment. Budget-conscious ITSM buyers.",
    pricing: "Transparent. Starter $19 PEPM, Growth $49 PEPM, Pro $95 PEPM. No hidden fees. Significantly cheaper than ServiceNow for equivalent headcount.",
    implementationReality: "Fast — 2-4 weeks for standard deployment. No certified partner required. Self-service setup with good documentation.",
    weaknesses: [
      "Limited scalability beyond 2000 employees — complex enterprise workflows and cross-department ESM hit limits that ServiceNow handles natively",
      "Reporting is limited without premium tiers — advanced analytics, custom dashboards, and executive reporting require Pro or Enterprise plan",
      "Customization depth is less than ServiceNow — companies with very complex or non-standard ITSM workflows find Freshservice rigid",
      "No native HR, legal, or security workflow modules — cross-functional ESM requires workarounds",
      "Customer support quality is inconsistent — multiple G2 reviews cite uneven support response times",
      "Integration challenges with legacy enterprise systems — ServiceNow's IntegrationHub is significantly more powerful",
      "Freddy AI features are less mature than ServiceNow's AI platform"
    ],
    killShots: {
      features: "Freshservice is excellent for core ITSM — incident, problem, change, and asset management. But if your prospect needs HR service delivery, security operations, or cross-department workflows beyond IT, Freshservice will hit its ceiling within 18 months. What are the top 3 non-IT workflows they need to automate in the next year?",
      price: "Freshservice's transparent pricing is genuinely its strength for budget-conscious buyers. But the question is not just what they pay today — it is what they pay when they outgrow Freshservice and need to migrate to ServiceNow. Migration costs are real. Is the cheaper entry price worth the potential migration cost in 2-3 years?",
      late: "Freshservice wins deals on speed and price — if you are late, you are competing on ServiceNow's weaknesses: price, complexity, and implementation timeline. Shift the evaluation back to total cost of ownership and ask: what does Freshservice cost vs ServiceNow over 3 years including implementation, admin headcount, and annual increases?"
    }
  },
  "jira-service-management": {
    fullName: "Jira Service Management",
    sweetSpot: "Engineering and DevOps teams. Companies already on Atlassian stack. Tech-forward IT teams.",
    pricing: "Competitive. Free for 3 agents. Standard $22 PEPM, Premium $47 PEPM. Cloud-first.",
    implementationReality: "Fast for Atlassian users — 1-3 weeks. Slower and more complex for non-Atlassian environments.",
    weaknesses: [
      "Built for developer/engineering teams — non-technical IT teams find the interface complex and intimidating",
      "Best value only if already on Atlassian stack — Jira, Confluence, Bitbucket integration is the core value prop. Standalone JSM is weak.",
      "ITSM depth is less than ServiceNow and even Freshservice for traditional IT service desk use cases",
      "Change management and CMDB capabilities are limited compared to dedicated ITSM platforms",
      "Not designed for non-IT workflows — HR, facilities, legal service management is an afterthought",
      "Reporting and analytics are basic without Atlassian Analytics add-on at additional cost"
    ],
    killShots: {
      features: "Jira Service Management is excellent for DevOps teams that live in the Atlassian ecosystem. For a traditional IT service desk supporting non-technical end users, the interface and workflow are designed for engineers, not for HR or finance teams raising support tickets. Has their IT team assessed adoption risk with non-technical users?",
      price: "JSM's price advantage disappears quickly once you add Confluence for knowledge base, Atlassian Analytics for reporting, and the add-ons needed for ITIL compliance. What is the total Atlassian stack cost they are comparing against, not just the JSM license?"
    }
  },

  // ── Marketing Automation ─────────────────────────────────────────────────
  "marketo": {
    fullName: "Marketo (Adobe Marketo Engage)",
    sweetSpot: "Large enterprises with dedicated marketing ops teams. B2B demand generation at scale. Companies with 1000+ employee marketing databases.",
    pricing: "Premium. No public pricing. Estimated $1500-$15000+/month depending on database size and features. Adobe acquisition has increased prices significantly.",
    implementationReality: "Complex. 3-6 months for full deployment. Requires certified Marketo specialists. Most companies need ongoing consultant support.",
    weaknesses: [
      "Complexity is legendary — Marketo requires dedicated marketing operations specialists to manage effectively. Non-technical marketers consistently struggle with adoption.",
      "Adobe acquisition has made pricing less transparent and increased costs — customers report significant price increases post-Adobe acquisition",
      "Implementation is slow and expensive — 3-6 months typical, often requiring certified Marketo consultants at $150-300/hour",
      "UI is outdated — Marketo's interface has not kept pace with modern marketing platforms. Users consistently rate it lower for ease of use than HubSpot",
      "Steep learning curve — the Marketo Certified Expert certification exists because the platform is genuinely complex to operate",
      "Support quality has declined post-Adobe acquisition — multiple enterprise reviews cite slower response times and less knowledgeable support",
      "Overkill for companies under 500 employees with basic nurture needs"
    ],
    killShots: {
      price: "Marketo is priced for enterprises with dedicated marketing ops teams who can actually use its full capability. For a company your size, you would be paying enterprise prices for 20% utilization. What is their current marketing ops headcount, and do they have Marketo-certified staff to manage it?",
      features: "Marketo is powerful for enterprise demand generation at scale. But its power comes from complexity — and that complexity requires dedicated specialists to unlock. HubSpot can do 80% of what Marketo does with 20% of the admin overhead. What specific Marketo feature is driving the evaluation that HubSpot cannot replicate?"
    }
  },
  "pardot": {
    fullName: "Salesforce Marketing Cloud Account Engagement (Pardot)",
    sweetSpot: "Companies already on Salesforce CRM. B2B marketing automation tightly integrated with Salesforce Sales Cloud.",
    pricing: "Growth $1250/month (up to 10K contacts), Plus $2500/month, Advanced $4000/month, Premium $15000/month. Requires Salesforce CRM license on top.",
    implementationReality: "Fast if already on Salesforce — 4-8 weeks. Painful if not — requires Salesforce CRM first. Value proposition collapses without Salesforce.",
    weaknesses: [
      "Only makes sense if already on Salesforce — the entire value proposition is tight CRM integration. Without Salesforce, it is an expensive and limited standalone product.",
      "Requires Salesforce CRM license on top of Pardot license — total cost is significantly higher than the Pardot price alone suggests",
      "UI is outdated and clunky — consistently rated lower for ease of use than HubSpot and Marketo",
      "Limited compared to HubSpot for inbound marketing — content management, social media, and SEO tools are weak",
      "Rebranding to Marketing Cloud Account Engagement has created product confusion — documentation and support are inconsistent across old and new naming",
      "Email sending limits and contact caps create unexpected overages at scale",
      "Support quality is tied to Salesforce support tiers — standard support is slow"
    ],
    killShots: {
      price: "Pardot's price assumes you are already paying for Salesforce CRM. If you add Salesforce CRM + Pardot + implementation, the total first-year cost is typically $40,000-$100,000+ for a mid-market company. HubSpot Marketing + Sales Hub covers both for a fraction of that cost. Has their proposal shown the total Salesforce ecosystem cost?",
      features: "Pardot is a strong B2B marketing automation tool — but only for Salesforce shops. If they are not already committed to Salesforce as their CRM, choosing Pardot locks them into Salesforce whether they want it or not. Is their CRM decision settled before they choose Pardot?"
    }
  },

  // ── Cloud Infrastructure ─────────────────────────────────────────────────
  "aws": {
    fullName: "Amazon Web Services (AWS)",
    sweetSpot: "Enterprises and tech companies requiring deep services breadth. Companies with existing AWS expertise. Startups through Fortune 500.",
    pricing: "Pay-as-you-go. Most comprehensive service catalog means costs are complex to predict and optimize. Average enterprise cloud bill exceeds estimates by 23% according to Gartner.",
    implementationReality: "Fastest to start but complex to optimize. FinOps practice required to manage costs at scale. Migration projects routinely take 12-24 months for enterprise workloads.",
    weaknesses: [
      "Cost complexity and overruns — AWS billing is notoriously complex. Companies consistently overspend due to misconfigured resources, forgotten instances, and data transfer costs. Average enterprise exceeds cloud budget by 23%.",
      "Steeper learning curve than Azure for Microsoft-centric enterprises — teams with Windows/.NET stack face higher retraining costs",
      "Enterprise support is expensive — Business support starts at 10% of monthly spend. Enterprise support starts at 3% with $15K minimum.",
      "Data egress costs are a hidden trap — moving data out of AWS is expensive and creates vendor lock-in",
      "Partner ecosystem for enterprise integration is less mature than Azure for Microsoft shops",
      "Compliance and sovereignty requirements in some regions favor Azure or Google's newer sovereign cloud offerings"
    ],
    killShots: {
      price: "AWS is genuinely the most capable cloud platform — but it is also the easiest to overspend on. The average enterprise exceeds their AWS budget by 23% according to Gartner. Has their proposal included a FinOps resource or cost optimization plan, and what is their estimate vs actual spend for the last 12 months if they are already on AWS?",
      features: "AWS has the deepest service catalog but that breadth requires the most expertise to leverage. For a Microsoft-centric enterprise, Azure's native integration with Active Directory, Office 365, and the .NET stack reduces migration complexity and ongoing operational overhead significantly. What percentage of their workloads are Microsoft-based?"
    }
  },
  "azure": {
    fullName: "Microsoft Azure",
    sweetSpot: "Microsoft-centric enterprises. Windows/.NET workloads. Companies with existing Microsoft EA agreements. Hybrid cloud environments.",
    pricing: "Competitive with AWS for most workloads. Microsoft EA agreements often include Azure credits. Hybrid benefits for Windows and SQL Server reduce costs significantly for Microsoft shops.",
    implementationReality: "Fastest migration path for Microsoft-centric enterprises. Azure Arc enables hybrid management. Existing Active Directory integration reduces identity work.",
    weaknesses: [
      "Service breadth and innovation pace is behind AWS — Azure consistently lags AWS in new service launches and cutting-edge AI/ML capabilities",
      "Azure outages have been more frequent and impactful than AWS — several high-profile global outages in 2023-2024 affected enterprise customers",
      "Less strong for non-Microsoft technology stacks — Linux, open source, and cloud-native companies find AWS or GCP more natural",
      "Azure portal UX is complex — multiple management interfaces create confusion for teams managing hybrid environments",
      "Support quality varies significantly by region — APAC enterprise support response times are slower than US/EU",
      "Documentation quality is inconsistent — Azure docs are frequently outdated or incomplete compared to AWS documentation"
    ],
    killShots: {
      features: "Azure's strength is Microsoft integration — Active Directory, Office 365, Teams, and the .NET ecosystem work together natively. But Azure's innovation pace on AI, ML, and cloud-native services consistently lags AWS. For workloads that are not Microsoft-native, AWS or GCP provide more mature tooling. What percentage of their target workloads are Microsoft-stack vs cloud-native?",
      price: "Azure's pricing advantage is real for Microsoft shops — Hybrid Benefit for Windows Server and SQL Server can reduce compute costs by 40-60%. But that advantage only applies to Microsoft workloads. What is the actual workload mix, and has the pricing comparison been done workload-by-workload rather than headline rate comparison?"
    }
  },
  "gcp": {
    fullName: "Google Cloud Platform (GCP)",
    sweetSpot: "Data analytics, ML/AI workloads, cloud-native applications. Companies using Google Workspace. Organizations prioritizing BigQuery and Vertex AI.",
    pricing: "Competitive. Sustained use discounts apply automatically. Committed use contracts provide 20-57% discounts. Generally competitive with AWS for compute.",
    implementationReality: "Fastest for data and ML workloads. Steeper learning curve for traditional enterprise IT teams. Partner ecosystem is smaller than AWS and Azure.",
    weaknesses: [
      "Smallest partner ecosystem — fewer certified implementation partners and ISV integrations than AWS or Azure, particularly outside North America",
      "Enterprise sales and support maturity is behind AWS and Azure — Google's consumer reputation creates enterprise trust concerns",
      "Product discontinuation history creates risk — Google has a well-documented track record of killing products. Enterprise IT teams cite this as a genuine risk factor.",
      "Market share significantly behind AWS and Azure — 11% vs AWS 31% and Azure 24% — fewer enterprises means less community knowledge and fewer reference customers",
      "Hybrid and multi-cloud story is less mature than Azure Arc — enterprises with on-premise requirements find GCP more limited",
      "Strong for data/ML but weaker for traditional enterprise workloads like SAP, Oracle, and legacy applications"
    ],
    killShots: {
      features: "GCP is genuinely world-class for data analytics and ML workloads — BigQuery and Vertex AI are legitimately the best in class. But Google's enterprise product discontinuation track record is a real risk that enterprise IT procurement teams consistently raise. How does their risk assessment account for Google's history of killing enterprise products?",
      price: "GCP's pricing is competitive and the sustained use discounts are a genuine advantage. But the smaller partner ecosystem means higher implementation costs and longer time-to-value for workloads outside of data and ML. What is the workload type — and has the implementation cost differential been factored into the total cost comparison?"
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

  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku } = req.body;
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

  const skuContext = (your_sku || comp_sku) ? '\n- Your specific product/SKU: ' + (your_sku || 'not specified') + '\n- Competitor specific product/SKU: ' + (comp_sku || 'not specified') : '';
  const prompt = 'You are an elite B2B sales strategist. You have verified competitive intelligence. Use SPECIFIC facts — not generic advice.\n\nDEAL:\n- Product: ' + product + '\n- Competitor: ' + competitor + '\n- Stage: ' + stage + '\n- Industry: ' + (industry || 'B2B Technology') + '\n- Why losing: ' + reasons + '\n' + (context ? '- Context: ' + context + '\n' : '') + skuContext + '\n' + (intelText || 'Use your knowledge of ' + competitor + ' for specific competitive intelligence.') + '\n\nRULES: Reference specific facts. Name exact actions. Use real evidence. Every word must be usable by an AE in 10 minutes.\n\nRespond ONLY with valid JSON:\n{\n  "dealAssessment": {\n    "winProbability": <0-100>,\n    "urgency": "High|Medium|Low",\n    "summary": "2-3 sentences referencing specific ' + competitor + ' reality vs their claims"\n  },\n  "competitorWeaknesses": [\n    "Specific weakness with evidence",\n    "Second specific weakness",\n    "Third specific weakness"\n  ],\n  "killShot": "Verbatim question using a SPECIFIC known ' + competitor + ' weakness",\n  "counterMoves": [\n    { "move": "Title max 5 words", "action": "Specific action with exact words and evidence", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" },\n    { "move": "Title max 5 words", "action": "Specific action", "timing": "Today|Within 48 hours|Before next meeting|This week" }\n  ],\n  "talkTrack": {\n    "opening": "Exact opening words referencing something specific about ' + competitor + '",\n    "keyMessages": [\n      "Message using real ' + competitor + ' weakness or customer complaint",\n      "Message reframing evaluation based on ' + competitor + ' known gaps",\n      "Message positioning ' + product + ' strength against ' + competitor + ' weakness"\n    ],\n    "objectionHandlers": [\n      { "objection": "Exact objection buyer will raise", "response": "Word-for-word counter using specific evidence" },\n      { "objection": "Second specific objection", "response": "Word-for-word counter with real data" }\n    ]\n  },\n  "emailTemplate": {\n    "subject": "Specific subject referencing real ' + competitor + ' issue",\n    "body": "Complete email under 200 words. References specific ' + competitor + ' weakness. Single clear next step. Ready to send."\n  }\n}';

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
