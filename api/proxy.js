const express = require('express');
const proxy = require('express-http-proxy');
const cors = require('cors');
const { URL } = require('url');

const app = express();

app.use(cors());

const PROXY_ROOT = '/api/proxy';

// Base64エンコード/デコード
const b64encode = (str) => Buffer.from(str).toString('base64url');
const b64decode = (str) => Buffer.from(str, 'base64url').toString('utf-8');

// URLをプロキシURLに変換する
const toProxyUrl = (url, base) => {
    try {
        const absoluteUrl = new URL(url, base).href;
        return `${PROXY_ROOT}/${b64encode(absoluteUrl)}`;
    } catch {
        return url; // 無効なURLはそのまま
    }
};

// Vercelは`/api/proxy`へのリクエストをこの関数にルーティングし、
// Expressアプリはパスの残りの部分（例：`/ENCODED_URL`）を受け取ります。
app.use('/:url', proxy(
    (req) => {
        const targetUrl = b64decode(req.params.url);
        if (!targetUrl) {
            throw new Error('Invalid URL');
        }
        console.log(`Proxying to: ${targetUrl}`);
        return targetUrl;
    },
    {
        proxyReqPathResolver: (req) => {
            const targetUrl = new URL(b64decode(req.params.url));
            const path = targetUrl.pathname + targetUrl.search;
            console.log(`Requesting path: ${path}`);
            return path;
        },
        userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
            const newHeaders = { ...headers };
            const targetUrl = new URL(b64decode(userReq.params.url));
            const targetOrigin = targetUrl.origin;

            // リダイレクト先のURLを書き換える
            if (newHeaders['location']) {
                newHeaders['location'] = toProxyUrl(newHeaders['location'], targetOrigin);
            }

            // Cookieのドメインとパスを書き換える
            if (newHeaders['set-cookie']) {
                newHeaders['set-cookie'] = newHeaders['set-cookie'].map(cookie => {
                    return cookie
                        .replace(/domain=[^;]+;?/i, '') // 元のドメインを削除
                        .replace(/path=[^;]+;?/i, `path=/;`); // パスをルートに設定
                });
            }

            // セキュリティ関連のヘッダーを削除
            delete newHeaders['content-security-policy'];
            delete newHeaders['content-security-policy-report-only'];
            delete newHeaders['strict-transport-security'];
            delete newHeaders['x-frame-options'];
            delete newHeaders['x-xss-protection'];

            return newHeaders;
        },
        userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
            if (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
                let html = proxyResData.toString('utf-8');
                const targetUrl = new URL(b64decode(userReq.params.url));
                const targetOrigin = targetUrl.origin;

                // URLを再帰的に置換する正規表現
                const urlRegex = /(href|src|action|srcset|url\()(["']?)([^"'\s>)]+)\2/g;

                html = html.replace(urlRegex, (match, attr, quote, url) => {
                    if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) {
                        return match;
                    }
                    const proxiedUrl = toProxyUrl(url, targetOrigin);
                    return `${attr}=${quote}${proxiedUrl}${quote}`;
                });

                // HTMLに<base>タグを挿入して相対パスを解決
                html = html.replace('<head>', `<head><base href="${targetOrigin}">`);

                return html;
            }
            return proxyResData;
        },
        proxyErrorHandler: (err, res, next) => {
            console.error('Proxy Error:', err);
            res.status(500).send('Proxy error occurred.');
        }
    }
));

// VercelがExpressアプリを処理できるようにエクスポート
module.exports = app;