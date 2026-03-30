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
    case 'contact_center':
      return [
        {"feature":"Omnichannel Channels","ours":"<"+p+" channels supported>","theirs":"<"+c+" channels supported>","advantage":"<winner>"},
        {"feature":"AI / Virtual Agent","ours":"<"+p+" AI capability>","theirs":"<"+c+" AI capability>","advantage":"<winner>"},
        {"feature":"Compliance (HIPAA/PCI/SOC2)","ours":"<"+p+" certifications>","theirs":"<"+c+" certifications>","advantage":"<winner>"},
        {"feature":"CRM Integrations","ours":"<"+p+" integrations>","theirs":"<"+c+" integrations>","advantage":"<winner>"},
        {"feature":"3yr TCO","ours":"<"+p+" cost with source>","theirs":"<"+c+" cost with source>","advantage":"<winner>"}
      ];
    case 'video_device':
      return [
        {"feature":"Video Resolution","ours":"<"+p+" exact spec>","theirs":"<"+c+" exact spec>","advantage":"<winner>"},
        {"feature":"Audio","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
        {"feature":"AI Features","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
        {"feature":"Management","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
        {"feature":"3yr TCO","ours":"<"+p+" cost with source>","theirs":"<"+c+" cost with source>","advantage":"<winner>"}
      ];
    case 'cad_bim':
      return [
        {"feature":"BIM Capabilities","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
        {"feature":"Cloud Collaboration","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
        {"feature":"Interoperability","ours":"<"+p+" formats>","theirs":"<"+c+" formats>","advantage":"<winner>"},
        {"feature":"Licensing Model","ours":"<"+p+" model>","theirs":"<"+c+" model>","advantage":"<winner>"},
        {"feature":"3yr TCO","ours":"<"+p+" cost with source>","theirs":"<"+c+" cost with source>","advantage":"<winner>"}
      ];
    case 'insurance':
      return [
        {"feature":"Coverage Limits","ours":"<"+p+" limits>","theirs":"<"+c+" limits>","advantage":"<winner>"},
        {"feature":"Incident Response","ours":"<"+p+" IR details>","theirs":"<"+c+" IR details>","advantage":"<winner>"},
        {"feature":"Risk Assessment","ours":"<"+p+" approach>","theirs":"<"+c+" approach>","advantage":"<winner>"},
        {"feature":"Claims Process","ours":"<"+p+" process>","theirs":"<"+c+" process>","advantage":"<winner>"},
        {"feature":"Premium Model","ours":"<"+p+" pricing>","theirs":"<"+c+" pricing>","advantage":"<winner>"}
      ];
    default:
      return [
        {"feature":"Core Functionality","ours":"<"+p+" capability>","theirs":"<"+c+" capability>","advantage":"<winner>"},
        {"feature":"AI / Automation","ours":"<"+p+" AI features>","theirs":"<"+c+" AI features>","advantage":"<winner>"},
        {"feature":"Integrations","ours":"<"+p+" integrations>","theirs":"<"+c+" integrations>","advantage":"<winner>"},
        {"feature":"Security & Compliance","ours":"<"+p+" certifications>","theirs":"<"+c+" certifications>","advantage":"<winner>"},
        {"feature":"3yr TCO","ours":"<"+p+" cost with source>","theirs":"<"+c+" cost with source>","advantage":"<winner>"}
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

  const sys = `You are a competitive intelligence analyst. You MUST use the web_search tool to find real sourced data before responding.
RULES:
- Search for analyst reports, G2 reviews, vendor pricing, and news for both ${p} and ${c}
- Every ROI figure, TCO number, or pricing claim MUST cite its source e.g. (Source: Forrester 2024)
- If no verified source found for a number, prefix with "est." and add (unverified)
- Never invent customer names, analyst quotes, or awards
- Output ONLY raw JSON after research. No markdown, no preamble.`;

  const prompt = `Research and generate deep competitive intelligence for ${p} vs ${c}.
Category: ${category.replace(/_/g,' ')} | Stage: ${stage||"Proposal"} | Industry: ${industry||"B2B"}${context ? ` | Context: ${context}` : ""}

Use web_search for:
1. "${p} vs ${c} review analyst G2 2024 2025"
2. "${p} pricing TCO 2024 2025"
3. "${c} weaknesses problems customer reviews 2025"

Then output ONLY this JSON:
{"executiveSummary":{"headline":"<one sentence why ${p}>","roiStatement":"<specific ROI with $ AND source citation>","riskOfInaction":"<risk of choosing ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":${featureRows}},"architectureBreakdown":{"processingModel":"<key differences>","apiDesign":"<key differences>","dataModel":"<key differences>","scalabilityModel":"<key differences>","securityArchitecture":"<key differences>","keyArchitecturalAdvantage":"<${p} advantage>"},"implementationAnalysis":{"deploymentTimeline":"<${p} X wks vs ${c} Y wks>","professionalServicesRequired":"<PS details + $ with source>","hiddenCosts":["<${c} hidden cost 1 with source>","<${c} hidden cost 2 with source>","<${c} hidden cost 3 with source>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"<${p} vs ${c} Year 1 with source>","migrationRisk":"<key risks>"},"evidenceAndProof":{"customerWins":[{"company":"<real customer or 'Major [industry] firm'>","result":"<measurable outcome>","quote":"<real testimonial or empty string if unverified>"}],"analystRecognition":"<real Gartner/Forrester recognition with year or verify at gartner.com>","g2Rating":{"ours":"<score from G2>/5","theirs":"<score from G2>/5"},"recentNews":"<real 2024-2025 news from search>","sourcesUsed":["<url or publication 1>","<url or publication 2>"]}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20251022",
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
    if (!parsed) return res.status(500).json({ error: "Failed to parse response", raw: text.slice(0,200) });
    res.json(parsed);
  } catch(err) {
    console.error('depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
          }
