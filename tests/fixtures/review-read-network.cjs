// Local, read-only impairment of an existing lesson's activity GETs. Real
// cookies, authorization, requests and successful response bytes stay intact.
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { startLoopbackForwarder } = require('../../scripts/lib/loopback-forwarder.cjs');
const sessionId = process.env.CLASSIN_TEST_REVIEW_SESSION;
if (process.env.CLASSIN_TEST_CLASSROOM !== '1' || !/^[a-f0-9-]{36}$/.test(sessionId || '')) {
  throw Error('Requires the explicit local review verification workflow and lesson ID');
}
const output = path.resolve(__dirname, '../../outputs/workspace-final-audit');
const prefix = `/api/sessions/${sessionId}/classroom/activities`;
let mode = 'ready', stopping = false;
const events = [], sockets = new Set();
const record = event => { events.push({ at: new Date().toISOString(), ...event }); console.log(JSON.stringify(events.at(-1))); };
let forwarder;
const server = http.createServer((req, res) => {
  if (!req.url?.startsWith('/')) { res.writeHead(400).end(); return; }
  const pathname = req.url.split('?')[0];
  const scoped = req.method === 'GET' && (pathname === prefix || pathname.startsWith(prefix + '/'));
  if (scoped && mode !== 'ready') {
    record({ event: 'impaired-read', mode, overview: req.url.includes('overview='), version: req.url.includes('versionOnly=') });
    if (mode === 'drop') res.destroy();
    else res.writeHead(503, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const upstream = http.request({ host: '127.0.0.1', port: 3000, path: req.url, method: req.method,
    headers: { ...req.headers, 'x-forwarded-host': req.headers.host } }, reply => {
    // Successful responses are forwarded byte-for-byte, including authorization
    // errors. No response bodies, cookies or tokens are recorded.
    res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    if (scoped && req.url.includes('overview=')) record({ event: 'overview-response', status: reply.statusCode });
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  res.on('close', () => upstream.destroy()); req.pipe(upstream);
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/_next/')) { socket.destroy(); return; }
  const upstream = net.connect(3000, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.on('close', () => upstream.destroy());
});
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  try {
    const value = JSON.parse(line);
    if (!['ready', 'offline', 'drop'].includes(value.mode)) throw Error('Invalid mode');
    mode = value.mode; record({ event: 'mode', mode });
  } catch { record({ event: 'invalid-control' }); }
});
async function stop() {
  if (stopping) return; stopping = true;
  for (const socket of sockets) socket.destroy();
  input.close(); server.close(); await forwarder?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'native-review-proxy.json'), JSON.stringify(events, null, 2));
}
process.once('SIGINT', () => { void stop().then(() => process.exit(0)); });
process.once('SIGTERM', () => { void stop().then(() => process.exit(0)); });
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3185, '127.0.0.1', resolve); });
  forwarder = await startLoopbackForwarder(3185);
  record({ event: 'ready', port: 3185, sessionId });
})().catch(error => { console.error(error.message); void stop().then(() => { process.exitCode = 1; }); });
