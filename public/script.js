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
        const url = urlInput.value.trim();
        if (url) {
            navigator.clipboard.writeText(url)
                .then(() => alert('URL copied to clipboard!'))
                .catch(err => console.error('Failed to copy URL: ', err));
        }
    });

    const clearAllButton = document.getElementById('clear-all-button');
    clearAllButton.addEventListener('click', () => {
        urlInput.value = '';
    });
});