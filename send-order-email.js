// POST /api/send-order-email
// Sends an order confirmation e-mail to the customer (from post@lientcg.no),
// plus a copy to the shop's own inbox so you see incoming orders even before
// a proper order database exists.
//
// Uses Resend (https://resend.com) — a simple transactional e-mail API with
// a generous free tier. Calling their REST API directly via fetch, no extra
// npm dependency needed (Node >=18 has global fetch).
//
// Called from the checkout form in index.html at the same time as the Vipps
// payment is initiated (see README.md "Om e-postbekreftelse" for why, and for
// how to move this to fire only after a confirmed payment once you have order
// storage set up).
//
// Request body (JSON):
//   { customer: { firstName, lastName, email, phone, address: { street, postalCode, city }, note },
//     items: [{ id, name, price, qty }], total, reference }

const RESEND_API_URL = 'https://api.resend.com/emails';

function required(env) {
  const missing = ['RESEND_API_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error('Missing env vars: ' + missing.join(', '));
}

function fmtKr(n) {
  return Number(n).toLocaleString('nb-NO') + ' kr';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function orderRowsHtml(items) {
  return items.map((i) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;">${escapeHtml(i.qty)} × ${escapeHtml(i.name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;">${fmtKr(i.qty * i.price)}</td>
    </tr>`).join('');
}

function customerName(customer) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || '(uten navn)';
}

function addressLine(address) {
  if (!address) return '';
  const { street, postalCode, city } = address;
  return [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function customerEmailHtml(order) {
  return `
    <div style="font-family:Arial,sans-serif;color:#111;max-width:520px;">
      <h2 style="color:#8a742f;">Takk for din bestilling hos LIEN TCG!</h2>
      <p>Hei ${escapeHtml(order.customer.firstName || '')},</p>
      <p>Vi har mottatt bestillingen din. Her er en oppsummering:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${orderRowsHtml(order.items)}
        <tr><td style="padding:8px 10px;font-weight:bold;">Totalt</td><td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmtKr(order.total)}</td></tr>
      </table>
      <p><strong>Leveringsinfo</strong><br>
        ${escapeHtml(customerName(order.customer))}<br>
        ${escapeHtml(addressLine(order.customer.address))}<br>
        ${escapeHtml(order.customer.phone || '')}</p>
      ${order.customer.note ? `<p><strong>Merknad:</strong> ${escapeHtml(order.customer.note)}</p>` : ''}
      <p>Vi tar kontakt om noe er uklart. Har du spørsmål i mellomtiden, bare svar på denne e-posten.</p>
      <p style="color:#666;font-size:0.85em;">Referanse: ${escapeHtml(order.reference || '')}</p>
    </div>`;
}

function shopEmailHtml(order) {
  return `
    <div style="font-family:Arial,sans-serif;color:#111;max-width:520px;">
      <h2>Ny bestilling</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${orderRowsHtml(order.items)}
        <tr><td style="padding:8px 10px;font-weight:bold;">Totalt</td><td style="padding:8px 10px;text-align:right;font-weight:bold;">${fmtKr(order.total)}</td></tr>
      </table>
      <p><strong>Kunde</strong><br>
        ${escapeHtml(customerName(order.customer))}<br>
        ${escapeHtml(order.customer.email || '')}<br>
        ${escapeHtml(order.customer.phone || '')}<br>
        ${escapeHtml(addressLine(order.customer.address))}</p>
      ${order.customer.note ? `<p><strong>Merknad:</strong> ${escapeHtml(order.customer.note)}</p>` : ''}
      <p style="color:#666;font-size:0.85em;">Referanse: ${escapeHtml(order.reference || '')}</p>
    </div>`;
}

async function sendEmail({ apiKey, from, to, subject, html }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend request failed (${res.status}): ${body}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    required(process.env);

    const order = req.body || {};
    const { customer, items } = order;

    if (!customer || !customer.email) {
      res.status(400).json({ error: 'Kundens e-post mangler.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Handlekurven er tom.' });
      return;
    }

    const fromAddress = process.env.RESEND_FROM || 'LIEN TCG <post@lientcg.no>';
    const shopInbox = process.env.ORDER_NOTIFICATION_EMAIL || 'post@lientcg.no';

    const results = await Promise.allSettled([
      sendEmail({
        apiKey: process.env.RESEND_API_KEY,
        from: fromAddress,
        to: customer.email,
        subject: 'Bekreftelse på din bestilling hos LIEN TCG',
        html: customerEmailHtml(order)
      }),
      sendEmail({
        apiKey: process.env.RESEND_API_KEY,
        from: fromAddress,
        to: shopInbox,
        subject: `Ny bestilling — ${fmtKr(order.total)}`,
        html: shopEmailHtml(order)
      })
    ]);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      failed.forEach((r) => console.error('send-order-email error:', r.reason));
    }

    // Report success if at least the customer confirmation went out.
    if (results[0].status === 'fulfilled') {
      res.status(200).json({ ok: true, shopNotified: results[1].status === 'fulfilled' });
    } else {
      res.status(502).json({ error: 'Kunne ikke sende bekreftelses-e-post.' });
    }
  } catch (err) {
    console.error('send-order-email error:', err);
    res.status(500).json({ error: 'E-postoppsett mangler eller feilet.' });
  }
};
