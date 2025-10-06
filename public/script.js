document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('proxy-form');
    const urlInput = document.getElementById('url-input');
    const contentFrame = document.getElementById('content-frame');

    // Base64URLエンコード関数 (RFC 4648)
    // Node.jsの`buffer.toString('base64url')`と互換性がある
    const b64encode = (str) => {
        // まず文字列をUTF-8バイトにエンコード
        const utf8Bytes = new TextEncoder().encode(str);
        // バイトをバイナリ文字列に変換
        const binaryString = String.fromCharCode.apply(null, utf8Bytes);
        // Base64エンコード
        const base64 = btoa(binaryString);
        // URL-safeになるように置換し、パディングを削除
        return base64
            .replace(/\+/g, '-') // + を - に
            .replace(/\//g, '_') // / を _ に
            .replace(/=/g, '');  // パディング = を削除
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        let url = urlInput.value.trim();
        if (!url) {
            return;
        }

        // ユーザーがプロトコルを省略した場合、https:// を補完する
        if (!/^(https?:\/\/)/i.test(url)) {
            url = 'https://' + url;
        }

        // URLをエンコードしてプロキシエンドポイントを設定
        const encodedUrl = b64encode(url);
        contentFrame.src = `/api/proxy/${encodedUrl}`;
    });
});