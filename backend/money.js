// Money as people type it, plus a fixed demo FX table for the $150,000 rule.
// Rates are not live. They are pinned so a threshold decision does not move between demos.
const FX = { USD: 1, EUR: 1.08, GBP: 1.27, SGD: 0.74, AUD: 0.66, INR: 0.012, JPY: 0.0067, CAD: 0.73, NZD: 0.6, CHF: 1.13 };
const SYMBOL = { USD: '$', EUR: '€', GBP: '£', INR: '₹', SGD: 'S$', AUD: 'A$', JPY: '¥', CAD: 'C$', NZD: 'NZ$', CHF: 'CHF ' };
const LIMIT_USD = 150000;
const WORD = { usd: 'USD', eur: 'EUR', gbp: 'GBP', sgd: 'SGD', aud: 'AUD', inr: 'INR', jpy: 'JPY', cad: 'CAD', nzd: 'NZD', chf: 'CHF', rs: 'INR', 'r': 'INR' };
function digits(raw) { return Number(String(raw).replace(/,/g, '')); }
function scale(n, unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'k') return n * 1e3;
  if (u === 'm') return n * 1e6;
  if (u === 'l' || u === 'lakh' || u === 'lac') return n * 1e5;
  if (u === 'cr' || u === 'crore' || u === 'crores') return n * 1e7;
  return n;
}
function codeOf(token) {
  const t = String(token || '').toLowerCase().replace(/\s/g, '');
  if (t === '$' || t === 'usd') return 'USD';
  if (t === '€' || t === 'eur') return 'EUR';
  if (t === '£' || t === 'gbp') return 'GBP';
  if (t === '₹' || t === 'inr' || t === 'rs' || t === 'rs.') return 'INR';
  if (t === 's$' || t === 'sgd') return 'SGD';
  if (t === 'a$' || t === 'aud') return 'AUD';
  if (t === '¥' || t === 'jpy') return 'JPY';
  return WORD[t] || null;
}
function parseAll(text) {
  const src = String(text || '');
  const out = [];
  const re = /(SGD|AUD|USD|EUR|GBP|INR|JPY|CAD|NZD|CHF|Rs\.?|S\$|A\$|₹|€|£|\$)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|lakh|lac|crores?|cr|l)?|(\d+(?:\.\d+)?)\s*(lakh|lac|crores?|cr)\b/gi;
  let m;
  while ((m = re.exec(src))) {
    if (m[4]) { out.push({ amount: Math.round(scale(+m[4], m[5])), currency: 'INR', raw: m[0] }); continue; }
    const cur = codeOf(m[1]);
    const n = scale(digits(m[2]), m[3]);
    if (!cur || !Number.isFinite(n) || n <= 0) continue;
    out.push({ amount: Math.round(n), currency: cur, raw: m[0] });
  }
  return out;
}
function parseMoney(text) { const all = parseAll(text); return all[0] || null; }
function toUSD(amount, currency) { const r = FX[currency || 'USD']; if (!r) return null; return Math.round((+amount || 0) * r); }
function overLimit(amount, currency) { const usd = toUSD(amount, currency); return usd != null && usd > LIMIT_USD; }
function format(amount, currency) {
  const code = currency || 'USD';
  const sym = SYMBOL[code] || (code + ' ');
  return sym + Math.round(+amount || 0).toLocaleString('en-US');
}
module.exports = { FX, SYMBOL, LIMIT_USD, parseAll, parseMoney, toUSD, overLimit, format };
