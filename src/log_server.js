import http from 'http';

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const color = data.type === 'error' ? '\x1b[31m' : data.type === 'warn' ? '\x1b[33m' : '\x1b[37m';
        console.log(`${color}[Browser ${data.type.toUpperCase()}]\x1b[0m ${data.message}`);
      } catch (e) {
        console.log('[Log Server Error Parsing Body]', body);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3001, () => {
  console.log('Diagnostic log server listening on port 3001...');
});
