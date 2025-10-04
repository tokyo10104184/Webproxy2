const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// URLを解決するためのヘルパー関数
// 相対パスを絶対パスに変換する
const resolveUrl = (path, base) => {
    // スキームを持つURL（http, https, data:など）やプロトコル相対URL(//)はそのまま返す
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('//')) {
        return path;
    }
    try {
        return new URL(path, base).href;
    } catch (e) {
        console.warn(`Could not resolve URL: ${path} with base: ${base}`);
        return path; // 解決に失敗した場合は元のパスを返す
    }
};

module.exports = async (req, res) => {
    let { url } = req.query;

    if (!url) {
        res.status(400).send('URL is required');
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }

    try {
        const ipadUserAgent = 'Mozilla/5.0 (iPad; CPU OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1';

        const axiosResponse = await axios.get(url, {
            headers: { 'User-Agent': ipadUserAgent },
            responseType: 'text',
            maxRedirects: 5,
        });

        const $ = cheerio.load(axiosResponse.data);
        const finalUrl = new URL(axiosResponse.request.res.responseUrl || url);

        // 問題の原因だった<base>タグは使用しない

        // ページ遷移のためのリンクをプロキシ経由に書き換える
        ['a', 'form'].forEach(tagName => {
            const attr = tagName === 'a' ? 'href' : 'action';
            $(tagName).each((i, elem) => {
                const originalUrl = $(elem).attr(attr);
                if (originalUrl && !originalUrl.startsWith('javascript:') && !originalUrl.startsWith('#')) {
                    const absoluteUrl = resolveUrl(originalUrl, finalUrl.href);
                    $(elem).attr(attr, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
                }
            });
        });

        // 画像、スクリプト、CSSなどのアセットのURLを絶対パスに書き換える
        ['img', 'script', 'link'].forEach(tagName => {
            const attr = (tagName === 'link') ? 'href' : 'src';
            $(tagName).each((i, elem) => {
                const originalUrl = $(elem).attr(attr);
                if (originalUrl) {
                    // プロトコル相対URL(//)を現在のページのプロトコルに合わせる
                    const resolved = originalUrl.startsWith('//') ? `${finalUrl.protocol}${originalUrl}` : resolveUrl(originalUrl, finalUrl.href);
                    $(elem).attr(attr, resolved);
                }
            });
        });

        // srcset属性（レスポンシブ画像）も絶対パスに書き換える
        $('source, img').each((i, elem) => {
            const srcset = $(elem).attr('srcset');
            if (srcset) {
                const newSrcset = srcset
                    .split(',')
                    .map(part => {
                        const [url, descriptor] = part.trim().split(/\s+/);
                        const absoluteUrl = url.startsWith('//') ? `${finalUrl.protocol}${url}` : resolveUrl(url, finalUrl.href);
                        return `${absoluteUrl} ${descriptor || ''}`.trim();
                    })
                    .join(', ');
                $(elem).attr('srcset', newSrcset);
            }
        });

        res.status(200).send($.html());
    } catch (error) {
        console.error('Error fetching the URL:', error.message);
        res.status(500).send(`Error fetching the URL: ${error.message}`);
    }
};