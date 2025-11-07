document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('proxy-form');
    const urlInput = document.getElementById('url-input');
    const contentFrame = document.getElementById('content-frame');

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const url = urlInput.value.trim();
        if (!url) {
            return;
        }

        // バックエンドのプロキシエンドポイントにリクエストを送信
        // URLをクエリパラメータとして渡す
        contentFrame.src = `/api/proxy?url=${encodeURIComponent(url)}`;
    });

    const copyUrlButton = document.getElementById('copy-url-button');
    copyUrlButton.addEventListener('click', () => {
        const frameSrc = contentFrame.src;
        if (frameSrc && frameSrc !== 'about:blank') {
            try {
                // The src is in the format: /api/proxy?url=ENCODED_URL
                // We need to construct a full URL to parse it correctly.
                const fullUrl = new URL(frameSrc, window.location.origin);
                const targetUrl = fullUrl.searchParams.get('url');

                if (targetUrl) {
                    // The URL is encoded, so we decode it before copying.
                    const decodedUrl = decodeURIComponent(targetUrl);
                    navigator.clipboard.writeText(decodedUrl)
                        .then(() => alert('URL copied to clipboard!'))
                        .catch(err => console.error('Failed to copy URL: ', err));
                }
            } catch (e) {
                console.error('Could not parse iframe URL:', e);
            }
        }
    });

    const clearAllButton = document.getElementById('clear-all-button');
    clearAllButton.addEventListener('click', () => {
        urlInput.value = '';
    });
});