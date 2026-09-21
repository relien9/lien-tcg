// POST /api/send-contact-email
// Sends a message from the "Kontakt oss" form on the site to the shop's
// inbox (post@lientcg.no), with Reply-To set to the visitor's own e-mail
// address — so you can just hit "reply" in your inbox to answer them
// directly, no need to copy their address anywhere.
//
// Uses Resend (https://resend.com) — same setup as api/send-order-email.js.
// Requires the RESEND_API_KEY environment variable (see .env.example and
// README.md "Om e-postbekreftelse").
//
// Request body (JSON): { name, email, message }

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Not a full RFC 5322 validator — just enough to catch obvious junk before
// we spend an e-post send on it.
function looksLikeEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || ''));
}

async function sendEmail({ apiKey, from, to, replyTo, subject, html }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject, html })
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
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Missing env var: RESEND_API_KEY');
    }

    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Navn, e-post og melding er påkrevd.' });
      return;
    }
    if (!looksLikeEmail(email)) {
      res.status(400).json({ error: 'Ugyldig e-postadresse.' });
      return;
    }

    const fromAddress = process.env.RESEND_FROM || 'LIEN TCG <post@lientcg.no>';
    const shopInbox = process.env.ORDER_NOTIFICATION_EMAIL || 'post@lientcg.no';

    const html = `
      <div style="font-family:Arial,sans-serif;color:#111;max-width:520px;">
        <h2 style="color:#8a742f;">Ny melding fra kontaktskjemaet på lientcg.no</h2>
        <p><strong>Navn:</strong> ${escapeHtml(name)}<br>
           <strong>E-post:</strong> ${escapeHtml(email)}</p>
        <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
        <p style="color:#666;font-size:0.85em;">Svar direkte på denne e-posten for å svare ${escapeHtml(name)} — Reply-To er satt til deres adresse.</p>
      </div>`;

    await sendEmail({
      apiKey: process.env.RESEND_API_KEY,
      from: fromAddress,
      to: shopInbox,
      replyTo: email,
      subject: `Ny melding fra ${name} via lientcg.no`,
      html
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-contact-email error:', err);
    res.status(502).json({ error: 'Kunne ikke sende meldingen. Prøv igjen senere.' });
  }
};
