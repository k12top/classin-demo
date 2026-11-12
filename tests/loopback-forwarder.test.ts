import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';

const { startLoopbackForwarder } = createRequire(import.meta.url)('../scripts/lib/loopback-forwarder.cjs');

async function listen(server: net.Server, host = '127.0.0.1', port = 0) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port, ipv6Only: host === '::1' }, resolve);
  });
  return (server.address() as net.AddressInfo).port;
}

test('IPv6 localhost forwards complete bytes to IPv4 loopback', async t => {
  const payload = Buffer.alloc(256 * 1024, 'x');
  const backend = net.createServer({ allowHalfOpen: true }, socket => socket.pipe(socket));
  const targetPort = await listen(backend);
  t.after(() => new Promise<void>(resolve => backend.close(() => resolve())));
  const forwarder = await startLoopbackForwarder(0, targetPort);
  t.after(() => forwarder.close());
  const result = await new Promise<Buffer>((resolve, reject) => {
    const socket = net.connect({ host: '::1', port: forwarder.port });
    const chunks: Buffer[] = [];
    socket.on('error', reject);
    socket.on('data', chunk => chunks.push(chunk));
    socket.on('end', () => resolve(Buffer.concat(chunks)));
    socket.once('connect', () => socket.end(payload));
  });
  assert.equal(result.length, payload.length);
  assert.ok(result.equals(payload));
});

test('stopping the forwarder closes active connections and releases its port', async t => {
  const backend = net.createServer();
  const targetPort = await listen(backend);
  t.after(() => new Promise<void>(resolve => backend.close(() => resolve())));
  const forwarder = await startLoopbackForwarder(0, targetPort);
  const socket = net.connect({ host: '::1', port: forwarder.port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
  await forwarder.close();
  await closed;
  const replacement = net.createServer();
  await listen(replacement, '::1', forwarder.port);
  await new Promise<void>(resolve => replacement.close(() => resolve()));
});

test('an unavailable IPv4 backend closes the IPv6 request', async () => {
  const reservation = net.createServer();
  const unusedPort = await listen(reservation);
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const forwarder = await startLoopbackForwarder(0, unusedPort);
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: '::1', port: forwarder.port });
      socket.setTimeout(2000, () => socket.destroy(Error('Request did not close')));
      socket.on('error', error => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error);
      });
      socket.on('close', () => resolve());
      socket.resume();
    });
  } finally {
    await forwarder.close();
  }
});

test('an occupied IPv6 port fails startup rather than forwarding to a different origin', async () => {
  const reservation = net.createServer();
  const port = await listen(reservation, '::1');
  try {
    await assert.rejects(startLoopbackForwarder(port), { code: 'EADDRINUSE' });
  } finally {
    await new Promise<void>(resolve => reservation.close(() => resolve()));
  }
});
