const playwright = require('playwright-core');
const chromium = require('@sparticuz/chromium');
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
const rewriteHtml = (htmlString, finalUrl) => {
    const $ = cheerio.load(htmlString);

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
        $(elem).attr('action', '/api/proxy');
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

    // srcset属性も絶対パスに
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
    const method = req.method.toUpperCase();

    if (method === 'POST') {
        const { proxy_target_url, ...postData } = req.body || {};
        targetUrl = proxy_target_url;
        const postParams = new URLSearchParams(postData).toString();
        if (postParams) {
            targetUrl += `?${postParams}`;
        }
    } else {
        targetUrl = req.query.url;
    }

    if (!targetUrl) {
        return res.status(400).send('URL is required');
    }

    let browser = null;
    try {
        // Vercel環境でChromiumを起動
        browser = await playwright.chromium.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true, // chromium.headlessが文字列を返すことがあるため、booleanを直接指定
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        const html = await page.content();

        const finalUrl = new URL(page.url());
        const contentType = response.headers()['content-type'] || 'text/html';

        res.setHeader('Content-Type', contentType);

        if (contentType.includes('text/html')) {
            const rewrittenHtml = rewriteHtml(html, finalUrl);
            res.status(200).send(rewrittenHtml);
        } else {
            // HTML以外はそのまま返す (将来的には対応が必要)
            const buffer = await response.body();
            res.status(200).send(buffer);
        }

    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).send(`Error fetching the URL with Playwright: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
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