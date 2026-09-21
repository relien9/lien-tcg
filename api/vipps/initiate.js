// POST /api/vipps/initiate
// Called by the checkout form in index.html. Takes the cart + customer info,
// creates a payment with Vipps, and returns a redirectUrl the browser sends
// the customer to.
//
// Request body (JSON):
//   { customer: { name, email, phone, note }, items: [{id,name,price,qty}], total }
//
// Response (JSON):
//   { redirectUrl, reference }

const crypto = require('crypto');
const { vippsFetch } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { customer, items, total } = req.body || {};

    if (!customer || !customer.phone) {
      res.status(400).json({ error: 'Telefonnummer er påkrevd for Vipps-betaling.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Handlekurven er tom.' });
      return;
    }

    // Recompute the total server-side — never trust a price sent from the browser.
    const serverTotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.qty), 0);
    if (!Number.isFinite(serverTotal) || serverTotal <= 0) {
      res.status(400).json({ error: 'Ugyldig totalbeløp.' });
      return;
    }

    // Vipps wants amounts in øre (smallest currency unit).
    const amountValue = Math.round(serverTotal * 100);

    // Norwegian mobile numbers for Vipps: 8 digits, no country code, or with 47 prefix.
    const phoneDigits = String(customer.phone).replace(/\D/g, '');
    const phoneNumber = phoneDigits.startsWith('47') ? phoneDigits : `47${phoneDigits}`;

    const reference = `lien-tcg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    const returnUrl = `${origin}/betaling-fullfort.html?ref=${encodeURIComponent(reference)}`;

    const description = items
      .map((i) => `${i.qty}x ${i.name}`)
      .join(', ')
      .slice(0, 100); // Vipps caps paymentDescription length

    const payment = await vippsFetch('/epayment/v1/payments', {
      method: 'POST',
      idempotencyKey: reference,
      body: {
        amount: { currency: 'NOK', value: amountValue },
        paymentMethod: { type: 'WALLET' },
        customer: { phoneNumber },
        reference,
        returnUrl,
        userFlow: 'WEB_REDIRECT',
        paymentDescription: description || 'Bestilling hos LIEN TCG'
      }
    });

    // TODO: persist the order (reference, items, customer, status: 'INITIATED')
    // somewhere durable — a database, Airtable, Google Sheets, whatever you
    // have. Nothing is stored right now, so the callback below has nothing to
    // update. This file only creates the Vipps payment; see callback.js for
    // where order status updates would go once you have storage.

    res.status(200).json({ redirectUrl: payment.redirectUrl, reference });
  } catch (err) {
    console.error('vipps/initiate error:', err);
    res.status(502).json({ error: 'Kunne ikke starte Vipps-betaling.' });
  }
};
