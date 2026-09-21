// GET /api/vipps/status?ref=<reference>
// Called by betaling-fullfort.html after Vipps redirects the customer back,
// to confirm what actually happened (never trust the redirect alone — always
// check status server-side, since a customer can land on the return URL
// without having completed payment).

const { vippsFetch } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const reference = req.query && req.query.ref;
  if (!reference) {
    res.status(400).json({ error: 'Mangler referanse.' });
    return;
  }

  try {
    const payment = await vippsFetch(`/epayment/v1/payments/${encodeURIComponent(reference)}`);
    res.status(200).json({
      reference,
      state: payment.state, // CREATED | AUTHORIZED | ABORTED | EXPIRED | TERMINATED
      amount: payment.amount
    });
  } catch (err) {
    console.error('vipps/status error:', err);
    res.status(502).json({ error: 'Kunne ikke hente betalingsstatus.' });
  }
};
