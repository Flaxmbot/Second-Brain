// Content script — auto-captures page content on visit
// Runs on every page at document_idle

(function () {
    // Skip non-content pages
    const url = window.location.href;
    const skipPatterns = [
        /^chrome/,
        /^about:/,
        /^file:/,
        /^data:/,
        /localhost/,
        /127\.0\.0\.1/,
        /google\.com\/(search|maps|mail)/,
        /youtube\.com\/watch/,
        /facebook\.com/,
        /twitter\.com\/home/,
        /instagram\.com/,
        /reddit\.com\/?$/,
        /\.pdf$/i,
    ];

    if (skipPatterns.some(p => p.test(url))) return;

    // Wait a moment for dynamic content to load
    setTimeout(() => {
        // Extract page content
        const title = document.title;
        const html = document.documentElement.outerHTML;

        // Send to background worker
        chrome.runtime.sendMessage({
            action: 'autoCapture',
            data: { url, title, html }
        });
    }, 2000);

    // Also listen for manual capture requests from side panel
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'getPageContent') {
            sendResponse({
                url: window.location.href,
                title: document.title,
                html: document.documentElement.outerHTML
            });
        }
    });
})();
