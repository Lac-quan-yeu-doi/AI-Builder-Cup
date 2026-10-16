import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PLAYWRIGHT_CORE_PORT ?? '3101', 10);

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200).end('ok');
    return;
  }
  if (request.url === '/api/v1/administration/me') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ visibleFeatures: null }));
    return;
  }
  response.writeHead(404).end('not found');
}).listen(port, '127.0.0.1');
