// POST /api/vipps/callback
// Webhook receiver for payment events (CREATED, AUTHORIZED, ABORTED, etc.).
// Register this URL once, after deploying, via the Webhooks API or the
// Vipps portal — see README.md. Vipps signs every webhook request; we verify
// that signature below before trusting the body.
//
// Docs: https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/request-authentication/

const crypto = require('crypto');

function sha256Base64(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

function verifySignature(req, rawBody, secret) {
  const xMsDate = req.headers['x-ms-date'];
  const xMsContentSha256 = req.headers['x-ms-content-sha256'];
  const authorization = req.headers['authorization'];
  const host = req.headers['host'];

  if (!xMsDate || !xMsContentSha256 || !authorization || !host) return false;

  // 1. Content integrity: hash of the raw body must match the header.
  const computedHash = sha256Base64(rawBody);
  if (computedHash !== xMsContentSha256) return false;

  // 2. Recompute the signature over method + path + signed headers.
  const pathAndQuery = req.url; // includes query string, matches what Vipps signed
  const stringToSign = ['POST', pathAndQuery, `${xMsDate};${host};${xMsContentSha256}`].join('\n');

  const signature = crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64');
  const expectedAuth = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`;

  // Constant-time compare.
  const a = Buffer.from(authorization);
  const b = Buffer.from(expectedAuth);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Vercel parses JSON bodies automatically by default, which would strip the
// raw bytes we need for signature verification. This config disables that
// so we can read + verify the raw body ourselves.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const rawBody = await readRawBody(req);
  const secret = process.env.VIPPS_WEBHOOK_SECRET;

  if (!secret) {
    console.error('VIPPS_WEBHOOK_SECRET not set — rejecting webhook (register the webhook first, see README).');
    res.status(500).end();
    return;
  }

  if (!verifySignature(req, rawBody, secret)) {
    console.warn('Vipps webhook signature verification failed.');
    res.status(401).end();
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    res.status(400).end();
    return;
  }

  // event: { reference, pspReference, name, amount, timestamp, success, ... }
  // TODO: look up the order by event.reference in your storage and update
  // its status (e.g. mark as paid when event.name === 'AUTHORIZED' and
  // event.success === true). Nothing is persisted yet — see the TODO in
  // initiate.js.
  console.log('Vipps webhook event:', event.name, event.reference, event.success);

  res.status(200).end();
};
