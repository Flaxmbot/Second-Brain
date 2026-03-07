const MEDIATOR_URL = 'http://127.0.0.1:11435';
let cachedToken = null;
let allMemories = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Shortcuts
    document.getElementById('refresh-btn').addEventListener('click', loadMemories);

    const searchInput = document.getElementById('library-search');
    searchInput.addEventListener('input', () => {
        renderMemories(searchInput.value, document.getElementById('sort-select').value);
    });

    const sortSelect = document.getElementById('sort-select');
    sortSelect.addEventListener('change', () => {
        renderMemories(searchInput.value, sortSelect.value);
    });

    // Clear badge count
    if (chrome && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
    }

    await loadMemories();

    // Auto-refresh when background captures new memory
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'captureSuccess') {
            loadMemories();
        }
    });
});

async function getApiConfig() {
    if (cachedToken) return { apiUrl: MEDIATOR_URL, apiToken: cachedToken };

    let res = await chrome.storage.local.get(['apiUrl', 'apiToken']);
    let apiUrl = res.apiUrl || MEDIATOR_URL;
    cachedToken = res.apiToken || '';

    if (!cachedToken) {
        try {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const data = await tokenResp.json();
                if (data.token) {
                    cachedToken = data.token;
                    await chrome.storage.local.set({ apiToken: cachedToken });
                }
            }
        } catch (e) {
            console.warn('[Library] Failed to auto-fetch token');
        }
    }
    return { apiUrl, apiToken: cachedToken };
}

async function loadMemories() {
    const grid = document.getElementById('library-grid');
    grid.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <span>Loading your knowledge base...</span>
        </div>
    `;

    try {
        const { apiUrl, apiToken } = await getApiConfig();

        // Use search with empty query to act as a 'get all' if /api/memories doesn't exist
        const limit = 100; // max reasonable for a single page grid
        const res = await fetch(`${apiUrl}/api/search?q=&limit=${limit}`, {
            headers: apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}
        });

        if (!res.ok) throw new Error('Failed to load');

        const data = await res.json();
        allMemories = data.results || [];

        renderMemories(
            document.getElementById('library-search').value,
            document.getElementById('sort-select').value
        );

    } catch (err) {
        console.error("Library load error:", err);
        grid.innerHTML = `
            <div class="loading-state" style="color: var(--danger)">
                <span style="font-size: 24px; margin-bottom: 8px;">⚠️</span>
                <span>Failed to connect to Internet Memory app.</span>
                <span style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Ensure the desktop application is running.</span>
            </div>
        `;
    }
}

function renderMemories(searchQuery = '', sortOrder = 'recent') {
    const grid = document.getElementById('library-grid');

    let filtered = [...allMemories];

    // Filter
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
            (m.title && m.title.toLowerCase().includes(q)) ||
            (m.url && m.url.toLowerCase().includes(q)) ||
            (m.summary && m.summary.toLowerCase().includes(q))
        );
    }

    // Sort (assuming IDs or dates can infer creation order. For now, mock sorting by array index if no timestamp)
    // If backend returns a timestamp, we'd use that. Fallback to reversing array for 'recent'.
    if (sortOrder === 'recent') {
        filtered.reverse(); // Assuming API returns oldest first, or just mock it.
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="loading-state">
                <span style="font-size: 24px; margin-bottom: 8px;">📚</span>
                <span>No memories found.</span>
                <span style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Save pages using the extension to fill your library.</span>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';

    filtered.forEach(mem => {
        // Extract domain
        let domain = 'Unknown';
        try { domain = new URL(mem.url).hostname; } catch (e) { }

        const displayTitle = mem.title ? mem.title : mem.url;
        const displaySummary = mem.summary ? mem.summary : (mem.content ? mem.content.substring(0, 150) + '...' : 'No content available.');

        const card = document.createElement('div');
        card.className = 'memory-card';

        const timeSpent = mem.time_spent || 0;
        const formatTimeSpent = (secs) => {
            if (!secs) return '⏱️ Just now';
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            if (m === 0) return `⏱️ ${s}s`;
            return `⏱️ ${m}m ${s}s`;
        };

        card.innerHTML = `
            <div class="card-header">
                <a href="${mem.url}" target="_blank" class="card-title" title="${mem.title || mem.url}">${displayTitle}</a>
            </div>
            <div class="card-domain">
                <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" class="card-favicon" onerror="this.style.display='none'">
                ${domain}
            </div>
            <div class="card-summary">${displaySummary}</div>
            <div class="card-footer">
                <div class="card-date">${formatTimeSpent(timeSpent)} on page</div>
                <div class="card-actions">
                    <button class="action-btn" title="Chat about this" onclick="window.open('fullpage.html?url=${encodeURIComponent(mem.url)}', '_blank')">💬</button>
                    <button class="action-btn delete" title="Delete memory" onclick="deleteMemoryCard(${mem.id})">🗑️</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function deleteMemoryCard(id) {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    try {
        const { apiUrl, apiToken } = await getApiConfig();
        const res = await fetch(`${apiUrl}/api/memories/${id}`, {
            method: 'DELETE',
            headers: apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}
        });
        if (res.ok) {
            allMemories = allMemories.filter(m => m.id !== id);
            renderMemories(
                document.getElementById('library-search').value,
                document.getElementById('sort-select').value
            );
        }
    } catch (err) {
        console.error("Failed to delete memory:", err);
    }
}
