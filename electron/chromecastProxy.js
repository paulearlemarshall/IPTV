const http = require('http');
const url = require('url');
const axios = require('axios');

/**
 * Creates a direct HTTP proxy server to handle headers/UA for Chromecast
 */
function createProxyServer(port) {
    const proxyServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        console.log(`[HTTP Request] Direct Proxy: ${req.method} ${req.url}`);

        if (parsedUrl.pathname !== '/stream' || !parsedUrl.query.url) {
            res.statusCode = 404;
            return res.end();
        }

        const streamUrl = parsedUrl.query.url;
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        if (req.headers.range) headers['Range'] = req.headers.range;

        try {
            const response = await axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                headers: headers,
                timeout: 30000,
                maxRedirects: 5
            });

            res.statusCode = response.status;
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
            if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
            
            response.data.pipe(res);
            req.on('close', () => { if (response.data.destroy) response.data.destroy(); });
        } catch (e) {
            console.error("[HTTP Error] Proxy error:", e.message);
            res.statusCode = 500;
            res.end();
        }
    });

    proxyServer.listen(port, '0.0.0.0', () => {
        console.log(`[Init] Direct proxy listening on port ${port}`);
    });

    return proxyServer;
}

module.exports = { createProxyServer };
