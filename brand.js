'use strict';

// Text wordmark for the demo. BRAND_NAME is optional. The default is Northwind.
// The value is trimmed, capped, and stripped of characters that would break HTML or a deck.
function brandName() {
  const raw = String(process.env.BRAND_NAME == null ? '' : process.env.BRAND_NAME)
    .replace(/[\u0000-\u001f<>&"']/g, '')
    .trim()
    .slice(0, 40);
  return raw || 'Northwind';
}

function brandCompany() {
  const name = brandName();
  return /networks$/i.test(name) ? name : name + ' Networks';
}

function brandMark() {
  return brandName().toUpperCase();
}

function bookLine() {
  return 'Loaded the fictional ' + brandName() + ' book.';
}

module.exports = { brandName, brandCompany, brandMark, bookLine };
