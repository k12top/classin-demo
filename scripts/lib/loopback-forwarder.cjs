const net = require('node:net');

// Next listens on IPv4 loopback. Also accept localhost clients that choose ::1,
// without exposing the development server on a network interface.
async function startLoopbackForwarder(port, targetPort = port) {
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen: true }, client => {
    const upstream = net.connect({ host: '127.0.0.1', port: targetPort, allowHalfOpen: true });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    }
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => {
      // A normal EOF is already forwarded by pipe(). Do not discard response
      // bytes that are still queued for a slow client.
      if (!upstream.readableEnded) client.destroy();
    });
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '::1', port, ipv6Only: true }, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    port: server.address().port,
    close: () => new Promise(resolve => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

module.exports = { startLoopbackForwarder };
