const MEDIATOR_URL = 'http://localhost:11435';

let cachedToken = null;

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
    const connectionEl = document.getElementById('connectionStatus');

    // Wire up shortcuts
    document.getElementById('open-chat-btn').addEventListener('click', () => {
        chrome.action.setBadgeText({ text: '' });
        chrome.tabs.create({ url: chrome.runtime.getURL("fullpage.html") });
    });
    document.getElementById('open-library-btn').addEventListener('click', () => {
        chrome.action.setBadgeText({ text: '' });
        chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
    });
    document.getElementById('open-options-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('refresh-recents-btn').addEventListener('click', loadRecentMemories);

    try {
        // Try to get token from storage
        const storage = await chrome.storage.local.get(['apiUrl', 'apiToken']);
        const apiUrl = storage.apiUrl || MEDIATOR_URL;
        cachedToken = storage.apiToken;

        // Auto-fetch token if missing
        if (!cachedToken) {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const data = await tokenResp.json();
                if (data.token) {
                    cachedToken = data.token;
                    chrome.storage.local.set({ apiToken: cachedToken });
                }
            }
        }

        const res = await fetch(`${apiUrl}/api/status`, {
            headers: cachedToken ? { 'Authorization': `Bearer ${cachedToken}` } : {}
        });

        if (res.ok) {
            connectionEl.textContent = '✅ Connected';
            connectionEl.style.color = '#34d399';
            loadRecentMemories(); // Load memories if connected
        } else {
            connectionEl.textContent = '❌ Auth Failed';
            connectionEl.style.color = '#f87171';
            showRecentsError('Authentication failed');
        }
    } catch {
        connectionEl.textContent = '❌ Offline';
        connectionEl.style.color = '#f87171';
        showRecentsError('Desktop app offline');
    }
});

async function loadRecentMemories() {
    const listEl = document.getElementById('recent-list');

    // Show skeleton
    listEl.innerHTML = `
        <div class="recent-item skeleton"></div>
        <div class="recent-item skeleton"></div>
    `;

    try {
        const storage = await chrome.storage.local.get(['apiUrl']);
        const apiUrl = storage.apiUrl || MEDIATOR_URL;

        // Note: The backend does not have a /api/memories/recent endpoint yet.
        // We will call the general search endpoint with empty query for now or rely on a new one.
        // As a stop-gap, we fetch raw memories if the endpoint exists, or fallback gracefully.
        const res = await fetch(`${apiUrl}/api/search?q=&limit=3`, {
            headers: { 'Authorization': `Bearer ${cachedToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            const results = data.results || [];

            if (results.length === 0) {
                listEl.innerHTML = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:10px;">No memories captured yet.</div>';
                return;
            }

            listEl.innerHTML = '';
            results.forEach(mem => {
                const el = document.createElement('div');
                el.className = 'recent-item';

                // Truncate title
                const displayTitle = mem.title ? mem.title : mem.url;

                // Extract domain
                let domain = '';
                try {
                    domain = new URL(mem.url).hostname;
                } catch (e) { domain = 'Unknown'; }

                el.innerHTML = `
                    <div class="recent-title" title="${mem.title || mem.url}">${displayTitle}</div>
                    <div class="recent-domain">${domain}</div>
                `;

                // Quick open in chat
                el.addEventListener('click', () => {
                    chrome.tabs.create({ url: chrome.runtime.getURL(`fullpage.html?url=${encodeURIComponent(mem.url)}`) });
                });

                listEl.appendChild(el);
            });
        } else {
            showRecentsError('Failed to load');
        }
    } catch (e) {
        showRecentsError('Server offline');
    }
}

function showRecentsError(msg) {
    const listEl = document.getElementById('recent-list');
    listEl.innerHTML = `<div style="font-size:11px; color:var(--danger); text-align:center; padding:10px;">${msg}</div>`;
}

// Capture button
document.getElementById('captureBtn').addEventListener('click', async () => {
    const btn = document.getElementById('captureBtn');
    const result = document.getElementById('result');
    const status = document.getElementById('status');

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Capturing...';
    status.textContent = 'Extracting page content...';
    status.style.display = 'block';

    try {
        // Get content from active tab via content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

        status.textContent = 'Sending to Internet Memory...';

        // Forward to background script → mediator
        chrome.runtime.sendMessage(
            { action: 'sendToMemory', data: response },
            (res) => {
                if (res && res.success) {
                    result.style.display = 'block';
                    result.innerHTML = `
            <div class="success">
              ✅ Saved to memory!<br>
              <span class="meta">${res.result.word_count || 0} words captured</span>
            </div>
          `;
                    status.style.display = 'none';
                } else {
                    result.style.display = 'block';
                    result.innerHTML = `
            <div class="error">
              ❌ Failed: ${res?.error || 'Unknown error'}<br>
              <span class="meta">Make sure the Internet Memory app is running</span>
            </div>
          `;
                    status.style.display = 'none';
                }
                btn.disabled = false;
                btn.innerHTML = '<span class="btn-icon">📥</span> Save to Memory';
            }
        );
    } catch (err) {
        result.style.display = 'block';
        result.innerHTML = `<div class="error">❌ Error: ${err.message}</div>`;
        status.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">📥</span> Save to Memory';
    }
});
