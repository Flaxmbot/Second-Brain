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
                html: document.documentElement.outerHTML,
                text: document.body ? document.body.innerText : ''
            });
        }
    });

    // --- Reading Time Tracking ---
    let timeSpentMs = 0;
    let lastVisibleTime = Date.now();
    let isTracking = document.visibilityState === 'visible';

    function updateTimeSpent() {
        if (isTracking) {
            const now = Date.now();
            timeSpentMs += (now - lastVisibleTime);
            lastVisibleTime = now;
        }
    }

    function syncTimeSpent() {
        updateTimeSpent();
        if (timeSpentMs > 0) {
            chrome.runtime.sendMessage({
                action: 'pingTimeSpent',
                data: { url: window.location.href, timeMs: timeSpentMs }
            });
            timeSpentMs = 0; // reset after sending
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            isTracking = true;
            lastVisibleTime = Date.now();
        } else {
            syncTimeSpent();
            isTracking = false;
        }
    });

    window.addEventListener('beforeunload', () => {
        syncTimeSpent();
    });

    // Periodically sync every 30 seconds to be safe
    setInterval(() => {
        if (isTracking) {
            syncTimeSpent();
        }
    }, 30000);

})();
