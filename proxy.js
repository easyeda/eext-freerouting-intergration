const http = require('http');

const FR_PORT = 37864;
const PROXY_PORT = 37863;
const PROFILE_ID = '00000000-0000-0000-0000-ea51eda00001';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
        const data = body.length ? Buffer.concat(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: FR_PORT,
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                host: '127.0.0.1:' + FR_PORT,
                'Authorization': 'Bearer ' + PROFILE_ID,
                'Freerouting-Profile-ID': PROFILE_ID,
                'Freerouting-Environment-Host': 'EasyEDA/1.0',
            },
        };

        const proxy = http.request(options, proxyRes => {
            res.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res);
        });

        proxy.on('error', err => {
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'FreeRouting not reachable: ' + err.message }));
        });

        if (data) proxy.write(data);
        proxy.end();
    });
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log('Proxy running on http://127.0.0.1:' + PROXY_PORT + ' -> FreeRouting :' + FR_PORT);
});
