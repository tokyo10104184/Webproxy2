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
        contentFrame.src = `/proxy?url=${encodeURIComponent(url)}`;
    });
});