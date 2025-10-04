const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url'); // Node.jsの標準モジュールURLをインポート

// Vercelの標準的なサーバーレス関数の形式
// module.exports = (request, response) => { ... }
module.exports = async (req, res) => {
    // Vercelでは、クエリパラメータは req.query にあります
    let { url } = req.query;

    if (!url) {
        res.status(400).send('URL is required');
        return;
    }

    // URLにプロトコルが含まれていない場合、http:// を追加
    if (!/^https?:\/\//i.test(url)) {
        url = 'http://' + url;
    }

    try {
        // iPadのUser-Agent
        const ipadUserAgent = 'Mozilla/5.0 (iPad; CPU OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1';

        const axiosResponse = await axios.get(url, {
            headers: {
                'User-Agent': ipadUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': new URL(url).origin // リファラーをオリジンに設定
            },
            responseType: 'text',
            maxRedirects: 5
        });

        // CheerioでHTMLをパース
        const $ = cheerio.load(axiosResponse.data);
        // リダイレクトを考慮した最終的なページのURLを取得
        const finalUrl = new URL(axiosResponse.request.res.responseUrl || url);
        const baseUrl = finalUrl.origin;

        // <base>タグを設定して相対パスを解決
        $('head').prepend(`<base href="${baseUrl}">`);

        // すべてのリンク(<a>タグ)をプロキシ経由に書き換える
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            // href属性があり、JavaScriptやアンカーリンクでない場合のみ処理
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                try {
                    // 相対パスを絶対パスに変換
                    const absoluteUrl = new URL(href, finalUrl.href).href;
                    // プロキシ用のURLに書き換え
                    $(elem).attr('href', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
                } catch (e) {
                    console.warn(`Skipping invalid URL in <a> tag: ${href}`);
                }
            }
        });

        // すべてのフォーム(<form>タグ)の送信先もプロキシ経由に書き換える
        $('form').each((i, elem) => {
            const action = $(elem).attr('action');
            if (action) {
                try {
                    // 相対パスを絶対パスに変換
                    const absoluteUrl = new URL(action, finalUrl.href).href;
                    // プロキシ用のURLに書き換え
                    $(elem).attr('action', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
                } catch (e) {
                    console.warn(`Skipping invalid URL in <form> action: ${action}`);
                }
            }
        });

        // 変更したHTMLを送信
        res.status(200).send($.html());
    } catch (error) {
        console.error('Error fetching the URL:', error.message);
        res.status(500).send(`Error fetching the URL: ${error.message}`);
    }
};