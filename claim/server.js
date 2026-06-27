// Cursor Credit Claim System - zero-dependency Node.js server.
// Run with: node claim/server.js   (no npm install needed)
//
// Why a server at all: browser JS can read a CSV but can't write changes back
// to disk, and per-device storage would hand the same link to many people.
// This single process holds credits.csv as the one source of truth, so 152
// links go to 152 distinct guests with no double-assignment.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CREDITS_CSV = path.join(DATA_DIR, 'credits.csv');
const GUESTS_JSON = path.join(DATA_DIR, 'guests.json');
const INDEX_HTML = path.join(__dirname, 'public', 'index.html');

// --- Load the guest allow-list once at startup -----------------------------
const guestSet = new Set(
  JSON.parse(fs.readFileSync(GUESTS_JSON, 'utf8')).map((e) => e.trim().toLowerCase())
);
console.log(`Loaded ${guestSet.size} approved guest emails.`);

// --- Tiny CSV helpers (credits.csv is simple: url,email with no commas) -----
function readCredits() {
  const lines = fs.readFileSync(CREDITS_CSV, 'utf8').split('\n');
  const header = lines[0];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const comma = line.indexOf(',');
    rows.push({ url: line.slice(0, comma), email: line.slice(comma + 1).trim() });
  }
  return { header, rows };
}

function writeCredits(header, rows) {
  const body = rows.map((r) => `${r.url},${r.email}`).join('\n');
  fs.writeFileSync(CREDITS_CSV, `${header}\n${body}\n`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Core claim logic. Synchronous read->assign->write = race-safe on Node's
//     single thread (no await between read and write). ------------------------
function claim(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { code: 400, body: { error: 'invalid_email' } };
  if (!guestSet.has(email)) return { code: 403, body: { error: 'not_registered' } };

  const { header, rows } = readCredits();

  // Already claimed? Return the same link (idempotent — repeat scans are safe).
  const existing = rows.find((r) => r.email.toLowerCase() === email);
  if (existing) return { code: 200, body: { status: 'already_claimed', url: existing.url } };

  // Assign the first free link.
  const free = rows.find((r) => r.email === '');
  if (!free) return { code: 200, body: { status: 'out_of_credits' } };

  free.email = email;
  writeCredits(header, rows);
  return { code: 200, body: { status: 'assigned', url: free.url } };
}

function stats() {
  const { rows } = readCredits();
  const claimed = rows.filter((r) => r.email !== '').length;
  return { total: rows.length, claimed, remaining: rows.length - claimed };
}

// --- HTTP server -----------------------------------------------------------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(INDEX_HTML).pipe(res);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/stats') {
    sendJson(res, 200, stats());
    return;
  }

  if (req.method === 'POST' && req.url === '/api/claim') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) req.destroy(); // guard against oversized payloads
    });
    req.on('end', () => {
      let email;
      try {
        email = JSON.parse(body).email;
      } catch {
        return sendJson(res, 400, { error: 'invalid_request' });
      }
      try {
        const result = claim(email);
        sendJson(res, result.code, result.body);
      } catch (err) {
        console.error('claim error:', err);
        sendJson(res, 500, { error: 'server_error' });
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Claim server running at http://localhost:${PORT}`);
  const s = stats();
  console.log(`Credits: ${s.claimed} claimed, ${s.remaining} remaining of ${s.total}.`);
});
