// Background service worker — handles auto-capture, dedup, side panel

const API_BASE = 'http://127.0.0.1:11435';
const capturedUrls = new Set(); // In-memory dedup for this session

// Open side panel when toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Create context menu for highlighting
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'addHighlight',
        title: 'Add to Internet Memory',
        contexts: ['selection']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'addHighlight') {
        const text = info.selectionText;
        const url = tab.url;
        handleNewHighlight(url, text);
    }
});

async function handleNewHighlight(url, text) {
    let { apiToken = '', apiUrl = API_BASE } = await chrome.storage.local.get(['apiToken', 'apiUrl']);

    // Auto-fetch token if missing
    if (!apiToken) {
        try {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const data = await tokenResp.json();
                if (data.token) {
                    apiToken = data.token;
                    await chrome.storage.local.set({ apiToken });
                }
            }
        } catch (e) {
            console.warn('[Internet Memory] Failed to auto-fetch API token');
        }
    }

    try {
        // 1. Get reference to article ID
        const checkResp = await fetch(`${apiUrl}/api/check-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify({ url })
        });
        const checkData = await checkResp.json();

        let articleId;
        if (checkData.exists) {
            // Find ID (backend currently doesn't return ID in check-url, let's assume we need to fetch it)
            const artResp = await fetch(`${apiUrl}/api/articles?search=${encodeURIComponent(url)}`, {
                headers: { 'Authorization': `Bearer ${apiToken}` }
            });
            const artData = await artResp.json();
            articleId = artData.articles?.[0]?.id;
        }

        if (!articleId) {
            // If not captured yet, suggest capture or do it silently? 
            // For now, let's just notify that page needs capture
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Capture Page First',
                message: 'You need to capture this page before adding highlights.',
            });
            return;
        }

        // 2. Save Highlight
        await fetch(`${apiUrl}/api/highlights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify({ article_id: articleId, text })
        });

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Highlight Saved',
            message: 'Snippet added to your memory.',
            silent: true
        });

    } catch (e) {
        console.error('Highlight failed:', e);
    }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'autoCapture') {
        handleAutoCapture(msg.data);
    }
    if (msg.action === 'manualCapture') {
        handleManualCapture(msg.data, sendResponse);
        return true; // async
    }
    if (msg.action === 'apiRequest') {
        handleApiRequest(msg, sendResponse);
        return true; // async
    }
    if (msg.action === 'pingTimeSpent') {
        handlePingTimeSpent(msg.data);
    }
});

async function handlePingTimeSpent({ url, timeMs }) {
    try {
        let { captureEnabled = true, apiToken = '', apiUrl = API_BASE } = await chrome.storage.local.get(['captureEnabled', 'apiToken', 'apiUrl']);
        if (!captureEnabled || !apiToken) return;

        await fetch(`${apiUrl}/api/memory/time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify({ url, additionalTimeMs: timeMs })
        });
    } catch (e) {
        console.debug('[Internet Memory] Failed to ping time spent:', e);
    }
}

// Auto-capture: check dedup, forward to server
async function handleAutoCapture({ url, title, html }) {
    let { captureEnabled = true, apiToken = '', apiUrl = API_BASE } = await chrome.storage.local.get(['captureEnabled', 'apiToken', 'apiUrl']);
    if (!captureEnabled) return;

    // Skip if already captured this session
    if (capturedUrls.has(url)) return;

    // Auto-fetch token if missing
    if (!apiToken) {
        try {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const data = await tokenResp.json();
                if (data.token) {
                    apiToken = data.token;
                    await chrome.storage.local.set({ apiToken });
                }
            }
        } catch (e) {
            console.warn('[Internet Memory] Failed to auto-fetch API token');
        }
    }

    capturedUrls.add(url);

    try {
        // Check server-side dedup
        const checkResp = await fetch(`${apiUrl}/api/check-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify({ url })
        });
        const checkData = await checkResp.json();
        if (checkData.exists) return;

        // Capture
        const resp = await fetch(`${apiUrl}/api/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify({ url, title, content: html })
        });
        const result = await resp.json();
        console.log('[Internet Memory] Auto-captured:', title, result.status);

        if (result.status === 'captured') {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Memory Captured',
                message: title,
                silent: true
            });

            chrome.action.getBadgeText({}).then(text => {
                let count = parseInt(text || '0') + 1;
                chrome.action.setBadgeText({ text: count.toString() });
                chrome.action.setBadgeBackgroundColor({ color: '#00D4FF' });
            });

            // Broadcast success to sidepanels so they can refresh
            chrome.runtime.sendMessage({ action: 'captureSuccess' }).catch(() => { });
        }
    } catch (e) {
        // Server not running — silently fail
        console.debug('[Internet Memory] Server unavailable');
    }
}

// Manual capture from side panel
async function handleManualCapture(data, sendResponse) {
    try {
        let { apiToken = '', apiUrl = API_BASE } = await chrome.storage.local.get(['apiToken', 'apiUrl']);

        // Auto-fetch token if missing
        if (!apiToken) {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const tokData = await tokenResp.json();
                if (tokData.token) {
                    apiToken = tokData.token;
                    await chrome.storage.local.set({ apiToken });
                }
            }
        }

        const resp = await fetch(`${apiUrl}/api/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        sendResponse({ success: true, ...result });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

// Proxy API requests from side panel
async function handleApiRequest({ method, endpoint, body }, sendResponse) {
    try {
        let { apiToken = '', apiUrl = API_BASE } = await chrome.storage.local.get(['apiToken', 'apiUrl']);

        // Auto-fetch token if missing
        if (!apiToken) {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const tokData = await tokenResp.json();
                if (tokData.token) {
                    apiToken = tokData.token;
                    await chrome.storage.local.set({ apiToken });
                }
            }
        }

        const opts = {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
        };
        if (body) opts.body = JSON.stringify(body);

        const resp = await fetch(`${apiUrl}${endpoint}`, opts);
        const data = await resp.json();
        sendResponse({ success: true, data });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}
