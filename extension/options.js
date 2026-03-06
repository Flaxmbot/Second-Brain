document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiUrl', 'apiToken', 'embedModel', 'autoCategorize', 'accentColor', 'rerankEnabled', 'theme'], (result) => {
        document.getElementById('api-url').value = result.apiUrl || 'http://localhost:11435';
        document.getElementById('api-token').value = result.apiToken || '';
        document.getElementById('embed-model').value = result.embedModel || 'nomic-embed-text';
        document.getElementById('auto-categorize').checked = result.autoCategorize !== false;
        document.getElementById('accent-color').value = result.accentColor || '#00D4FF';
        document.getElementById('rerank-enabled').checked = result.rerankEnabled === true;
        document.getElementById('theme-select').value = result.theme || 'system';

        // Initial load of storage stats
        loadStorageStats(result.apiUrl, result.apiToken);
    });
});

async function loadStorageStats(apiUrl, apiToken) {
    if (!apiUrl || !apiToken) return;
    try {
        const resp = await fetch(`${apiUrl}/api/storage/stats`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            document.getElementById('db-size-val').textContent = `${data.db_size_mb} MB`;
            document.getElementById('memories-count-val').textContent = data.total_articles;
        }
    } catch (e) { console.error('Failed to load storage stats', e); }
}

document.getElementById('save-btn').addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim() || 'http://localhost:11435';
    const apiToken = document.getElementById('api-token').value.trim();
    const embedModel = document.getElementById('embed-model').value.trim() || 'nomic-embed-text';
    const autoCategorize = document.getElementById('auto-categorize').checked;
    const rerankEnabled = document.getElementById('rerank-enabled').checked;
    const theme = document.getElementById('theme-select').value;
    const accentColor = document.getElementById('accent-color').value;

    const status = document.getElementById('status');
    status.textContent = 'Saving...';

    // 1. Save to local storage
    chrome.storage.local.set({ apiUrl, apiToken, embedModel, autoCategorize, rerankEnabled, accentColor, theme }, async () => {
        // 2. Sync to backend
        try {
            const resp = await fetch(`${apiUrl}/api/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiToken}`
                },
                body: JSON.stringify({
                    embed_model: embedModel,
                    auto_categorize: autoCategorize,
                    accent_color: accentColor,
                    theme: theme
                })
            });

            if (resp.ok) {
                status.textContent = 'Settings saved and synced to server.';
            } else {
                status.textContent = 'Saved locally, but server sync failed (check Token).';
            }
        } catch (e) {
            status.textContent = 'Saved locally. Server is offline.';
        }

        setTimeout(() => { status.textContent = ''; }, 3000);
    });
});

document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (!confirm('Are you absolutely sure? This will delete all your captured memories, highlights, and chat history. This cannot be undone.')) return;

    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;
    const status = document.getElementById('status');

    status.textContent = 'Clearing...';
    try {
        const resp = await fetch(`${apiUrl}/api/storage/clear`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (resp.ok) {
            status.textContent = 'History cleared successfully.';
            loadStorageStats(apiUrl, apiToken);
        } else {
            status.textContent = 'Failed to clear history.';
        }
    } catch (e) {
        status.textContent = 'Server is offline.';
    }
    setTimeout(() => status.textContent = '', 3000);
});

