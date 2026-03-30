import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"' && !esc) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i+1)); } catch(e) { return null; }
      }
    }
  }
  return null;
}

function detectCategory(name) {
  const p = name.toLowerCase();
  if (p.includes('contact center') || p.includes('ccaas') || p.includes('cxone') ||
      p.includes('genesys') || p.includes('five9') || p.includes('amazon connect') ||
      p.includes('avaya') || p.includes('nice')) return 'contact_center';
  if (p.includes('room bar') || p.includes('board') || p.includes('desk') ||
      p.includes('codec') || p.includes('poly') || p.includes('neat') ||
      p.includes('logitech') || p.includes('yealink') || p.includes('zoom bar') ||
      p.includes('teams room')) return 'video_device';
  if (p.includes('revit') || p.includes('microstation') || p.includes('bim') ||
      p.includes('trimble') || p.includes('bexel') || p.includes('solidworks') ||
      p.includes('dassault')) return 'cad_bim';
  if (p.includes('insurance') || p.includes('cyber') || p.includes('chubb') ||
      p.includes('aig') || p.includes('coalition') || p.includes('boxx')) return 'insurance';
  return 'saas';
}

function getCategoryFeatures(category, p, c) {
  switch(category) {
    case 'contact_center': return [
      {"feature":"Omnichannel Channels","ours":"<"+p+" channels>","theirs":"<"+c+" channels>","advantage":"<winner>"},
      {"feature":"AI / Virtual Agent","ours":"<"+p+" AI>","theirs":"<"+c+" AI>","advantage":"<winner>"},
      {"feature":"Compliance","ours":"<"+p+" certs>","theirs":"<"+c+" certs>","advantage":"<winner>"},
      {"feature":"CRM Integrations","ours":"<"+p+" integrations>","theirs":"<"+c+" integrations>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost (source)>","theirs":"<"+c+" cost (source)>","advantage":"<winner>"}
    ];
    case 'video_device': return [
      {"feature":"Video Resolution","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Audio","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"AI Features","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Management","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost (source)>","theirs":"<"+c+" cost (source)>","advantage":"<winner>"}
    ];
    case 'cad_bim': return [
      {"feature":"BIM Capabilities","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Cloud Collaboration","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Interoperability","ours":"<"+p+" formats>","theirs":"<"+c+" formats>","advantage":"<winner>"},
      {"feature":"Licensing Model","ours":"<"+p+" model>","theirs":"<"+c+" model>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost (source)>","theirs":"<"+c+" cost (source)>","advantage":"<winner>"}
    ];
    case 'insurance': return [
      {"feature":"Coverage Limits","ours":"<"+p+" limits>","theirs":"<"+c+" limits>","advantage":"<winner>"},
      {"feature":"Incident Response","ours":"<"+p+" IR>","theirs":"<"+c+" IR>","advantage":"<winner>"},
      {"feature":"Risk Assessment","ours":"<"+p+" approach>","theirs":"<"+c+" approach>","advantage":"<winner>"},
      {"feature":"Claims Process","ours":"<"+p+" process>","theirs":"<"+c+" process>","advantage":"<winner>"},
      {"feature":"Premium Model","ours":"<"+p+" pricing>","theirs":"<"+c+" pricing>","advantage":"<winner>"}
    ];
    default: return [
      {"feature":"Core Functionality","ours":"<"+p+" capability>","theirs":"<"+c+" capability>","advantage":"<winner>"},
      {"feature":"AI / Automation","ours":"<"+p+" AI>","theirs":"<"+c+" AI>","advantage":"<winner>"},
      {"feature":"Integrations","ours":"<"+p+" integrations>","theirs":"<"+c+" integrations>","advantage":"<winner>"},
      {"feature":"Security & Compliance","ours":"<"+p+" certs>","theirs":"<"+c+" certs>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost (source)>","theirs":"<"+c+" cost (source)>","advantage":"<winner>"}
    ];
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { product, competitor, your_sku, comp_sku, stage, industry, context, flip_mode = false } = req.body;
  if (!product || !competitor) return res.status(400).json({ error: "Missing fields" });

  const isFlip = flip_mode === true || flip_mode === "true";
  const ps = your_sku || product;
  const cs = comp_sku || competitor;
  const p = isFlip ? cs : ps;
  const c = isFlip ? ps : cs;

  const category = detectCategory(p + ' ' + c);
  const featureRows = JSON.stringify(getCategoryFeatures(category, p, c));

  const sys = `You are a competitive intelligence analyst. Use web_search ONCE to find real current data on "${p} vs ${c}" before responding. Rules: every $ figure must cite its source e.g. (Source: Gartner 2024). If no verified source, prefix with "est." and add (unverified). Never invent customer names or analyst awards. Output ONLY raw JSON, no markdown.`;

  const prompt = `Search for competitive intelligence on ${p} vs ${c} (category: ${category.replace(/_/g,' ')}, industry: ${industry||'B2B'}, stage: ${stage||'Proposal'}${context ? ', context: '+context : ''}).

Use web_search for: "${p} vs ${c} ${category.replace(/_/g,' ')} review pricing 2025"

Then output ONLY this JSON:
{"executiveSummary":{"headline":"<one sentence why ${p}>","roiStatement":"<ROI with $ AND source citation or est. (unverified)>","riskOfInaction":"<risk of choosing ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":${featureRows}},"architectureBreakdown":{"processingModel":"<key differences>","apiDesign":"<key differences>","dataModel":"<key differences>","scalabilityModel":"<key differences>","securityArchitecture":"<key differences>","keyArchitecturalAdvantage":"<${p} advantage>"},"implementationAnalysis":{"deploymentTimeline":"<${p} X wks vs ${c} Y wks>","professionalServicesRequired":"<PS details + $ with source or est.>","hiddenCosts":["<${c} cost 1 with source or est.>","<${c} cost 2>","<${c} cost 3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"<${p} vs ${c} Year 1 with source or est.>","migrationRisk":"<key risks>"},"evidenceAndProof":{"customerWins":[{"company":"<real customer or Major [industry] firm>","result":"<outcome>","quote":"<real quote or empty string>"}],"analystRecognition":"<real recognition with year, or verify at gartner.com>","g2Rating":{"ours":"<G2 score>/5","theirs":"<G2 score>/5"},"recentNews":"<real 2024-2025 news>","sourcesUsed":["<source 1>","<source 2>"]}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: sys,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    });

    let text = '';
    for (const block of r.content) {
      if (block.type === 'text') text += block.text;
    }

    const parsed = extractJSON(text);
    if (!parsed) return res.status(500).json({ error: "Failed to parse response", raw: text.slice(0, 300) });
    res.json(parsed);
  } catch(err) {
    console.error('depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
        }
