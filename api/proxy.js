const axios = require('axios');
const cheerio = require('cheerio');
const { URL, URLSearchParams } = require('url');

// URLを解決するためのヘルパー関数
const resolveUrl = (path, base) => {
    if (!path || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('//')) {
        return path;
    }
    try {
        return new URL(path, base).href;
    } catch (e) {
        console.warn(`Could not resolve URL: ${path} with base: ${base}`);
        return path;
    }
};

// HTMLを処理し、URLを書き換える関数
const rewriteHtml = (htmlBuffer, finalUrl) => {
    const $ = cheerio.load(htmlBuffer.toString('utf-8'));

    // ページ遷移のためのリンクをプロキシ経由に書き換える
    $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            const absoluteUrl = resolveUrl(href, finalUrl.href);
            $(elem).attr('href', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        }
    });

    // フォームの送信先をプロキシ経由に書き換える
    $('form').each((i, elem) => {
        const action = $(elem).attr('action') || '';
        const absoluteAction = resolveUrl(action, finalUrl.href);
        $(elem).attr('action', '/api/proxy'); // すべてのフォームはプロキシに送信
        $(elem).prepend(`<input type="hidden" name="proxy_target_url" value="${absoluteAction}">`);
    });

    // 画像、スクリプト、CSSなどのアセットのURLを絶対パスに書き換える
    ['img[src]', 'script[src]', 'link[href]', 'source[src]'].forEach(selector => {
        $(selector).each((i, elem) => {
            const attr = elem.attribs.src ? 'src' : 'href';
            const originalUrl = $(elem).attr(attr);
            if (originalUrl) {
                const absoluteUrl = resolveUrl(originalUrl, finalUrl.href);
                $(elem).attr(attr, absoluteUrl);
            }
        });
    });

    // srcset属性（レスポンシブ画像）も絶対パスに書き換える
    $('source, img').each((i, elem) => {
        const srcset = $(elem).attr('srcset');
        if (srcset) {
            const newSrcset = srcset.split(',').map(part => {
                const [url, descriptor] = part.trim().split(/\s+/);
                return `${resolveUrl(url, finalUrl.href)} ${descriptor || ''}`.trim();
            }).join(', ');
            $(elem).attr('srcset', newSrcset);
        }
    });

    return $.html();
};

// メインのリクエスト処理関数
const handleRequest = async (req, res) => {
    let targetUrl;
    let requestData;
    const method = req.method.toUpperCase();

    if (method === 'POST') {
        const { proxy_target_url, ...postData } = req.body || {};
        targetUrl = proxy_target_url;
        requestData = new URLSearchParams(postData).toString();
    } else { // GET
        const { proxy_target_url, ...getData } = req.query || {};
        if (proxy_target_url) {
            targetUrl = proxy_target_url;
            const searchParams = new URLSearchParams(getData);
            if (searchParams.toString()) {
                targetUrl += `?${searchParams.toString()}`;
            }
        } else {
            targetUrl = req.query.url;
        }
    }

    if (!targetUrl) {
        return res.status(400).send('URL is required');
    }

    // --- ヘッダー転送ロジック ---
    const forwardedHeaders = {
        'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (iPad; CPU OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1',
    };
    const headersToForward = [
        'accept',
        'accept-language',
        'accept-encoding',
        'x-forwarded-for',
        'cookie',
    ];
    headersToForward.forEach(headerName => {
        if (req.headers[headerName]) {
            forwardedHeaders[headerName] = req.headers[headerName];
        }
    });
    try {
        forwardedHeaders['referer'] = new URL(targetUrl).origin;
    } catch (e) {
        console.warn(`Could not set referer for invalid URL: ${targetUrl}`);
    }
    // --- ヘッダー転送ロジックここまで ---

    try {
        const axiosConfig = {
            method,
            url: targetUrl,
            headers: forwardedHeaders,
            data: requestData,
            responseType: 'arraybuffer',
            maxRedirects: 5,
            decompress: true,
        };
        if (method === 'POST') {
            axiosConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const axiosResponse = await axios(axiosConfig);
        const finalUrl = new URL(axiosResponse.request.res.responseUrl || targetUrl);
        const contentType = axiosResponse.headers['content-type'] || '';

        if (axiosResponse.headers['set-cookie']) {
            res.setHeader('Set-Cookie', axiosResponse.headers['set-cookie']);
        }
        res.setHeader('Content-Type', contentType);

        if (contentType.includes('text/html')) {
            const rewrittenHtml = rewriteHtml(axiosResponse.data, finalUrl);
            res.status(200).send(rewrittenHtml);
        } else {
            res.status(200).send(axiosResponse.data);
        }
    } catch (error) {
        console.error('Proxy Error:', error.response ? `Status: ${error.response.status}` : error.message);
        const statusCode = error.response ? error.response.status : 500;
        const statusText = error.response ? error.response.statusText : 'Internal Server Error';
        res.status(statusCode).send(`Error fetching the URL: ${statusText}`);
    }
};

// Vercelのサーバーレス関数のエントリーポイント
module.exports = (req, res) => {
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            req.body = Object.fromEntries(new URLSearchParams(body).entries());
            handleRequest(req, res);
        });
    } else {
        handleRequest(req, res);
    }
};