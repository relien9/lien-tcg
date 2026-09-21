// Shared helpers for the Vipps ePayment API integration.
// Docs used: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/
//            https://developer.vippsmobilepay.com/docs/APIs/access-token-api/
//
// All of this runs server-side only. Never expose VIPPS_CLIENT_SECRET or the
// subscription key to the browser.

const VIPPS_ENV = process.env.VIPPS_ENV === 'production' ? 'production' : 'test';
const BASE_URL = VIPPS_ENV === 'production' ? 'https://api.vipps.no' : 'https://apitest.vipps.no';

const required = ['VIPPS_CLIENT_ID', 'VIPPS_CLIENT_SECRET', 'VIPPS_SUBSCRIPTION_KEY', 'VIPPS_MSN'];

function assertConfigured() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error('Missing Vipps environment variables: ' + missing.join(', '));
  }
}

// Access tokens are valid for ~1h (test) / ~24h (production). Cache in module
// scope so we don't fetch a new one on every request. This cache is per
// serverless instance — fine for this volume of traffic.
let cachedToken = null; // { access_token, expires_on (unix seconds) }

async function getAccessToken() {
  assertConfigured();

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires_on - 60 > now) {
    return cachedToken.access_token;
  }

  const res = await fetch(`${BASE_URL}/accesstoken/get`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: process.env.VIPPS_CLIENT_ID,
      client_secret: process.env.VIPPS_CLIENT_SECRET,
      'Ocp-Apim-Subscription-Key': process.env.VIPPS_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': process.env.VIPPS_MSN,
      'Vipps-System-Name': 'lien-tcg',
      'Vipps-System-Version': '1.0.0'
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vipps access token request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_on: Number(data.expires_on) || now + 3000
  };
  return cachedToken.access_token;
}

async function vippsFetch(path, { method = 'GET', body, idempotencyKey } = {}) {
  assertConfigured();
  const token = await getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': process.env.VIPPS_SUBSCRIPTION_KEY,
    'Merchant-Serial-Number': process.env.VIPPS_MSN,
    'Vipps-System-Name': 'lien-tcg',
    'Vipps-System-Version': '1.0.0'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }

  if (!res.ok) {
    const err = new Error(`Vipps API ${method} ${path} failed (${res.status})`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

module.exports = { BASE_URL, VIPPS_ENV, getAccessToken, vippsFetch };
