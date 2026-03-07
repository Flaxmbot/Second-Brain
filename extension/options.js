document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['apiUrl', 'apiToken', 'ollamaModel', 'embedModel', 'autoCategorize', 'accentColor', 'rerankEnabled', 'theme'], async (result) => {
        const apiUrl = result.apiUrl || 'http://127.0.0.1:11435';
        const apiToken = result.apiToken || '';

        document.getElementById('api-url').value = apiUrl;
        document.getElementById('api-token').value = apiToken;
        document.getElementById('auto-categorize').checked = result.autoCategorize !== false;
        document.getElementById('accent-color').value = result.accentColor || '#00D4FF';
        document.getElementById('rerank-enabled').checked = result.rerankEnabled === true;
        document.getElementById('theme-select').value = result.theme || 'system';

        // Check if token needs to be pulled natively
        if (!apiToken) {
            try {
                const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
                if (tokenResp.ok) {
                    const data = await tokenResp.json();
                    if (data.token) {
                        document.getElementById('api-token').value = data.token;
                        chrome.storage.local.set({ apiToken: data.token });
                    }
                }
            } catch (e) {
                console.warn('Could not auto-fetch token', e);
            }
        }

        // Load models dynamicly
        await loadModels(apiUrl, document.getElementById('api-token').value || apiToken, result.ollamaModel, result.embedModel);

        // Initial load of storage stats
        loadStorageStats(apiUrl, document.getElementById('api-token').value || apiToken);

        // Initial load of storage stats
        loadStorageStats(apiUrl, apiToken);
    });
});

async function loadModels(apiUrl, apiToken, currentOllama, currentEmbed) {
    if (!apiUrl || !apiToken) return;

    const ollamaSel = document.getElementById('ollama-model');
    const embedSel = document.getElementById('embed-model');

    try {
        const resp = await fetch(`${apiUrl}/api/ollama/models`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });

        if (resp.status === 401) {
            ollamaSel.innerHTML = '<option value="">Unauthorized (Check Token)</option>';
            embedSel.innerHTML = '<option value="">Unauthorized (Check Token)</option>';
            return;
        }

        if (resp.ok) {
            const models = await resp.json();

            ollamaSel.innerHTML = '';
            embedSel.innerHTML = '';

            if (models.length === 0) {
                ollamaSel.innerHTML = '<option value="">No models installed</option>';
                embedSel.innerHTML = '<option value="">No models installed</option>';
            } else {
                models.forEach(m => {
                    const opt1 = document.createElement('option');
                    opt1.value = m.name;
                    opt1.textContent = m.name;
                    opt1.selected = m.name === currentOllama;
                    ollamaSel.appendChild(opt1);

                    const opt2 = document.createElement('option');
                    opt2.value = m.name;
                    opt2.textContent = m.name;
                    opt2.selected = m.name === currentEmbed;
                    embedSel.appendChild(opt2);
                });
            }
        } else {
            ollamaSel.innerHTML = `<option value="">Error ${resp.status}</option>`;
            embedSel.innerHTML = `<option value="">Error ${resp.status}</option>`;
        }
    } catch (e) {
        console.error('Failed to load models:', e);
        ollamaSel.innerHTML = '<option value="">Server/Ollama Offline</option>';
        embedSel.innerHTML = '<option value="">Server/Ollama Offline</option>';
    }
}

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
    const apiUrl = document.getElementById('api-url').value.trim() || 'http://127.0.0.1:11435';
    const apiToken = document.getElementById('api-token').value.trim();
    const ollamaModel = document.getElementById('ollama-model').value;
    const embedModel = document.getElementById('embed-model').value;
    const autoCategorize = document.getElementById('auto-categorize').checked;
    const rerankEnabled = document.getElementById('rerank-enabled').checked;
    const theme = document.getElementById('theme-select').value;
    const accentColor = document.getElementById('accent-color').value;

    const status = document.getElementById('status');
    status.className = 'status-msg show loading';
    status.textContent = 'Saving settings...';

    // 1. Save to local storage
    chrome.storage.local.set({ apiUrl, apiToken, ollamaModel, embedModel, autoCategorize, rerankEnabled, accentColor, theme }, async () => {
        // 2. Sync to backend
        try {
            const settingsToSave = {
                ollama_model: ollamaModel,
                embed_model: embedModel,
                auto_categorize: autoCategorize,
                accent_color: accentColor,
                theme: theme
            };

            let allSuccess = true;
            for (const [key, value] of Object.entries(settingsToSave)) {
                const resp = await fetch(`${apiUrl}/api/settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiToken}`
                    },
                    body: JSON.stringify({ key, value })
                });
                if (!resp.ok) allSuccess = false;
            }

            if (allSuccess) {
                status.className = 'status-msg show success';
                status.textContent = 'Settings saved securely!';
            } else {
                status.className = 'status-msg show error';
                status.textContent = 'Saved locally, backend sync failed.';
            }
        } catch (e) {
            status.className = 'status-msg show warning';
            status.textContent = 'Saved locally. Server offline.';
        }

        setTimeout(() => { status.className = 'status-msg'; }, 3000);
    });
});

document.getElementById('test-conn-btn').addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.trim() || 'http://127.0.0.1:11435';
    let apiToken = document.getElementById('api-token').value.trim();
    const btn = document.getElementById('test-conn-btn');

    btn.textContent = 'Testing...';
    btn.style.opacity = '0.7';

    try {
        if (!apiToken) {
            const tokenResp = await fetch(`${apiUrl}/api/auth/token`);
            if (tokenResp.ok) {
                const data = await tokenResp.json();
                if (data.token) {
                    apiToken = data.token;
                    document.getElementById('api-token').value = apiToken;
                }
            }
        }

        const resp = await fetch(`${apiUrl}/api/status`, {
            headers: apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}
        });

        if (resp.ok) {
            btn.textContent = 'Connected ✓';
            btn.style.color = '#34d399';
            btn.style.borderColor = '#34d399';
        } else {
            btn.textContent = 'Auth Failed';
            btn.style.color = '#f87171';
            btn.style.borderColor = '#f87171';
        }
    } catch (e) {
        btn.textContent = 'Offline';
        btn.style.color = '#f87171';
        btn.style.borderColor = '#f87171';
    }

    setTimeout(() => {
        btn.textContent = 'Test Connection';
        btn.style.color = '';
        btn.style.borderColor = '';
        btn.style.opacity = '1';
    }, 3000);
});

document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (!confirm('Are you absolutely sure? This will delete all your captured memories, highlights, and chat history. This cannot be undone.')) return;

    const apiUrl = document.getElementById('api-url').value;
    const apiToken = document.getElementById('api-token').value;
    const status = document.getElementById('status');

    status.className = 'status-msg show loading';
    status.textContent = 'Clearing...';
    try {
        const resp = await fetch(`${apiUrl}/api/storage/clear`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (resp.ok) {
            status.className = 'status-msg show success';
            status.textContent = 'History erased.';
            loadStorageStats(apiUrl, apiToken);
        } else {
            status.className = 'status-msg show error';
            status.textContent = 'Action failed.';
        }
    } catch (e) {
        status.className = 'status-msg show error';
        status.textContent = 'Server is offline.';
    }
    setTimeout(() => status.className = 'status-msg', 3000);
});

