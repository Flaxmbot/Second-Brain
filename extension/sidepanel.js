const DEFAULT_API = 'http://127.0.0.1:11435';
let currentModel = '';
let isStreaming = false;
let currentStreamController = null;

// ─── API Helper ──────────────────────────────────────────

async function getApiConfig() {
    let res = await chrome.storage.local.get(['apiUrl', 'apiToken']);
    let apiUrl = res.apiUrl || DEFAULT_API;
    let apiToken = res.apiToken || '';

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
            console.warn('[Internet Memory] Failed to auto-fetch API token in sidepanel');
        }
    }

    return { apiUrl, apiToken };
}

async function apiFetch(endpoint, options = {}) {
    const { apiUrl, apiToken } = await getApiConfig();
    const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;

    const headers = {
        ...options.headers
    };

    const isPost = ['POST', 'PUT', 'DELETE'].includes(options.method?.toUpperCase() || 'GET');
    if (isPost) {
        headers['Content-Type'] = 'application/json';
    }

    if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
    }

    return fetch(url, { ...options, headers });
}

// ─── Init ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Tab-based nav (sidepanel)
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.tab));
    });

    // Sidebar nav (fullpage)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.tab));
    });

    // Clear badge count
    if (chrome && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
    }

    // Fullscreen button
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
        });
    }

    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        });
    }

    initChat();
    loadModels();
    checkConnection();
    loadChatHistory();

    // Proactive AI: Summarize current page on open
    setTimeout(triggerProactiveSummary, 1500);

    // Capture toggle logic
    const captureToggle = document.getElementById('capture-toggle-fs');
    if (captureToggle) {
        chrome.storage.local.get('captureEnabled').then(res => {
            captureToggle.checked = res.captureEnabled !== false; // default true
        });
        captureToggle.addEventListener('change', (e) => {
            chrome.storage.local.set({ captureEnabled: e.target.checked });
        });
    }

    // Onboarding
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
        chrome.storage.local.get(['onboardingDone', 'apiToken']).then(res => {
            // Show if onboarding not done OR API token is missing (disconnected)
            if (!res.onboardingDone || !res.apiToken) {
                modal.style.display = 'flex';
            }
        });
    }

    // Apply Theme & Accent
    chrome.storage.local.get(['theme', 'accentColor']).then(res => {
        applyTheme(res.theme || 'system', res.accentColor || '#00D4FF');
    });

    // Add static event listeners for buttons that lost 'onclick' attributes
    const webSearchBtn = document.getElementById('web-search-btn');
    if (webSearchBtn) {
        webSearchBtn.addEventListener('click', () => {
            webSearchBtn.classList.toggle('active');
        });
    }

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', stopGeneration);

    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    const onboardingSettingsBtn = document.getElementById('onboarding-settings-btn');
    if (onboardingSettingsBtn) onboardingSettingsBtn.addEventListener('click', () => window.open(chrome.runtime.getURL('options.html')));

    const onboardingCompleteBtn = document.getElementById('onboarding-complete-btn');
    if (onboardingCompleteBtn) onboardingCompleteBtn.addEventListener('click', completeOnboarding);

    // Event delegation for dynamic elements
    document.addEventListener('click', (e) => {
        // AI Suggestion chips
        if (e.target.classList.contains('suggestion')) {
            const query = e.target.textContent;
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = query;
                sendMessage();
                // Clear input after sending if it's from a suggestion click
                setTimeout(() => { chatInput.value = ''; }, 10);
            }
        }
    });
    if (onboardingCompleteBtn) onboardingCompleteBtn.addEventListener('click', completeOnboarding);

    // Global Event Delegation for dynamic elements
    document.addEventListener('click', (e) => {
        // Nav item conversation toggle
        const navItem = e.target.closest('.nav-item[data-conversation-id]');
        if (navItem) {
            loadConversation(navItem.dataset.conversationId);
            return;
        }

        // Suggestions
        const suggestionBtn = e.target.closest('.suggestion');
        if (suggestionBtn) {
            if (suggestionBtn.dataset.url) {
                window.open(suggestionBtn.dataset.url, '_blank');
            } else {
                askSuggestion(suggestionBtn);
            }
            return;
        }

        // Chat Delete
        const deleteChatBtn = e.target.closest('.delete-chat-btn');
        if (deleteChatBtn) {
            e.stopPropagation();
            const id = deleteChatBtn.dataset.id;
            if (confirm('Are you sure you want to delete this chat?')) {
                apiFetch(`/api/conversations/${id}`, { method: 'DELETE' })
                    .then(res => {
                        if (res.ok) {
                            if (currentConversationId === id) startNewChat();
                            loadChatHistory();
                        }
                    })
                    .catch(e => console.error("Failed to delete chat", e));
            }
            return;
        }

        // Memory Delete
        const deleteMemoryBtn = e.target.closest('.delete-memory-btn');
        if (deleteMemoryBtn) {
            e.stopPropagation();
            const id = deleteMemoryBtn.dataset.id;
            if (confirm('Are you sure you want to delete this memory?')) {
                apiFetch(`/api/memory/${id}`, { method: 'DELETE' })
                    .then(res => {
                        if (res.ok) {
                            loadTimeline();
                            loadLibrary();
                        }
                    })
                    .catch(e => console.error("Failed to delete memory", e));
            }
            return;
        }

        // Copy button
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            copyCode(copyBtn);
            return;
        }

        // Citation link
        const citationLink = e.target.closest('.citation-link');
        if (citationLink) {
            e.preventDefault();
            scrollToSource(parseInt(citationLink.dataset.num, 10));
            return;
        }

        // Timeline item
        const timelineItem = e.target.closest('.timeline-item');
        if (timelineItem && timelineItem.dataset.url) {
            window.open(timelineItem.dataset.url, '_blank');
            return;
        }

        // Article item
        const articleItem = e.target.closest('.article-item');
        if (articleItem && articleItem.dataset.id) {
            openArticleDetail(articleItem.dataset.id);
            return;
        }

        // Back button
        const backBtn = e.target.closest('.back-btn');
        if (backBtn && backBtn.dataset.view) {
            switchView(backBtn.dataset.view);
            return;
        }

        // Related item
        const relatedItem = e.target.closest('.related-item');
        if (relatedItem && relatedItem.dataset.id) {
            openArticleDetail(relatedItem.dataset.id);
            return;
        }
    });
});

function applyTheme(theme, accent) {
    const root = document.documentElement;

    // Set Accent
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-glow', `${accent}15`);
    root.style.setProperty('--accent-border', `${accent}30`);

    // Set Theme
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = isDark ? 'dark' : 'light';
    }

    document.body.setAttribute('data-theme', theme);
    // Also set on documentElement for global selectors if needed
    document.documentElement.setAttribute('data-theme', theme);
}

function completeOnboarding() {
    chrome.storage.local.set({ onboardingDone: true });
    const modal = document.getElementById('onboarding-modal');
    if (modal) modal.style.display = 'none';
}

function switchView(tabId) {
    if (!tabId) return;
    // Update tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tabId));
    // Show view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${tabId}`);
    if (view) view.classList.add('active');

    // Load data
    if (tabId === 'timeline') loadTimeline();
    if (tabId === 'library') loadLibrary();
    if (tabId === 'stats') loadStats();


    // Reset detail view when switching tabs
    const detailView = document.getElementById('view-article-detail');
    if (detailView) detailView.classList.remove('active');
}

function showEmptyState(container, title, message) {
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px 20px; text-align: center; color: var(--text-muted); animation: fadeIn 0.5s ease;">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px; opacity: 0.4; color: var(--accent);">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <h3 style="color: var(--text-primary); margin-bottom: 8px; font-size: 16px;">${title}</h3>
            <p style="font-size: 13px; max-width: 200px; line-height: 1.5;">${message}</p>
        </div>
    `;
}

// ─── Connection Check ────────────────────────────────────

async function checkConnection() {
    const statusEl = document.getElementById('connection-status');
    const countEl = document.getElementById('memory-count');
    try {
        const resp = await apiFetch('/api/status');

        if (resp.status === 401) {
            if (statusEl) {
                statusEl.className = 'conn-status disconnected';
                statusEl.querySelector('span').textContent = 'Unauthorized (Check Token)';
                statusEl.style.color = '#f44336';
            }
            return;
        }

        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

        const data = await resp.json();
        if (statusEl) {
            statusEl.className = 'conn-status connected';
            const isOllamaOk = data.ollama === true;
            statusEl.querySelector('span').textContent = isOllamaOk ? 'Connected · Ollama OK' : 'Connected · Ollama offline';
            statusEl.style.color = isOllamaOk ? 'var(--accent)' : '#ff9800';
        }

        // Load memory count
        const statsResp = await apiFetch('/api/stats');
        if (statsResp.ok) {
            const stats = await statsResp.json();
            if (countEl) countEl.textContent = `${stats.total_articles || 0} memories`;
        }
    } catch (e) {
        console.error('Connection check failed:', e);
        if (statusEl) {
            statusEl.className = 'conn-status disconnected';
            statusEl.querySelector('span').textContent = 'Server offline (Check Settings)';
            statusEl.style.color = '#f44336';
        }
    }
}

// ─── Models ──────────────────────────────────────────────

async function loadModels() {
    try {
        const resp = await apiFetch('/api/ollama/models');
        const select = document.getElementById('model-select');
        if (!select) return;

        if (resp.status === 401) {
            select.innerHTML = '<option value="">Unauthorized</option>';
            return;
        }

        if (!resp.ok) {
            select.innerHTML = '<option value="">Error Loading</option>';
            return;
        }

        const models = await resp.json();
        select.innerHTML = '';

        if (!Array.isArray(models) || models.length === 0) {
            select.innerHTML = '<option value="">No models</option>';
            return;
        }
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            select.appendChild(opt);
        });
        currentModel = select.value;
        select.addEventListener('change', () => { currentModel = select.value; });
    } catch (e) {
        console.error('Load models failed:', e);
        const select = document.getElementById('model-select');
        if (select) select.innerHTML = '<option value="">Offline</option>';
    }
}

// ─── Chat ────────────────────────────────────────────────

function initChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    if (!input || !sendBtn) return;

    input.addEventListener('input', () => {
        sendBtn.disabled = !input.value.trim() || isStreaming;

        // Auto-resize logic
        input.style.height = 'auto'; // Reset height to recalculate
        const minHeight = 40; // Base height
        const maxHeight = 160; // Max Expansion
        const newHeight = Math.max(minHeight, Math.min(input.scrollHeight, maxHeight));
        input.style.height = newHeight + 'px';

        // Scroll adjustment if max height reached
        if (input.scrollHeight > maxHeight) {
            input.style.overflowY = 'auto';
        } else {
            input.style.overflowY = 'hidden';
        }

        const cc = document.getElementById('char-count');
        if (cc) cc.textContent = input.value.length > 0 ? input.value.length : '';
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function askSuggestion(btn) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = btn.textContent;
        sendMessage();
        input.value = ''; // Ensure it's cleared
    }
}

function searchWebFallback() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(searchUrl, '_blank');
}

function stopGeneration() {
    if (currentStreamController) {
        currentStreamController.abort();
    }
}

let currentConversationId = null;
let currentConversationHistory = [];

async function loadChatHistory() {
    const list = document.getElementById('sidebar-history-list');
    if (!list) return; // Only exists on fullpage
    try {
        const resp = await apiFetch('/api/conversations');
        const data = await resp.json();
        const convs = data.conversations || [];

        if (convs.length === 0) {
            list.innerHTML = '<div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted);">No recent chats</div>';
            return;
        }

        list.innerHTML = convs.map(c => `
            <div class="nav-item ${c.id === currentConversationId ? 'active' : ''}" style="justify-content: space-between; padding: 8px 14px; position: relative;" data-conversation-id="${c.id}">
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${escapeHtml(c.query)}</div>
                <button class="delete-chat-btn" data-id="${c.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px; display:flex; align-items:center; opacity: 0.6; transition: opacity 0.2s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error("Failed to load chat history:", e);
    }
}

function startNewChat() {
    currentConversationId = null;
    currentConversationHistory = [];

    const suggestions = [
        "Summarize my recent readings",
        "What are my latest saves?",
        "Explain the core of my last research",
        "What did I learn about AI today?",
        "Give me a quick rundown of my history",
        "Find my recent GitHub PRs",
        "What was that recipe I looked at?",
        "Summarize my last 3 articles"
    ];
    const picked = suggestions.sort(() => 0.5 - Math.random()).slice(0, 3);

    document.getElementById('chat-messages').innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z"/>
                    <path d="M12 2v20"/>
                </svg>
            </div>
            <h2>What would you like to recall?</h2>
            <p>I search everything you've read online and give you answers with sources.</p>
            <div class="suggestion-chips">
                ${picked.map(s => `<button class="suggestion">${s}</button>`).join('')}
            </div>
        </div>
    `;
    loadChatHistory();
}

async function loadConversation(id) {
    if (isStreaming) return;
    try {
        const resp = await apiFetch(`/ api / conversations / ${id}/messages`);
        if (!resp.ok) throw new Error('Failed to load messages');
        const data = await resp.json();

        currentConversationId = id;
        currentConversationHistory = [];
        const container = document.getElementById('chat-messages');

        container.innerHTML = '';

        for (const msg of data.messages || []) {
            currentConversationHistory.push({ role: msg.role, content: msg.content });
            if (msg.role === 'user') {
                addUserMessage(msg.content);
            } else if (msg.role === 'assistant') {
                const sources = Array.isArray(msg.sources) ? msg.sources : [];
                // Since our db just returns source_ids array or JSON array via standard `/api/conversations/...`
                // we might not have full article info. Let's assume the API provides basic source info or just URLs.
                addAIMessage(msg.content, sources);
            }
        }

        loadChatHistory();
    } catch (e) {
        console.error("Load conversation error:", e);
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query || isStreaming) return;

    // Remove welcome
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    addUserMessage(query);
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('send-btn').disabled = true;
    const cc = document.getElementById('char-count');
    if (cc) cc.textContent = '';

    isStreaming = true;
    const thinkingEl = showThinking();

    const stopBtn = document.getElementById('stop-btn');
    const sendBtn = document.getElementById('send-btn');
    if (stopBtn) stopBtn.style.display = 'flex';
    if (sendBtn) sendBtn.style.display = 'none';

    currentStreamController = new AbortController();

    // Create AI wrapper early for streaming
    const container = document.getElementById('chat-messages');
    let div = null; // Declare early for catch block

    try {
        // Get semantic toggle state
        const toggle = document.getElementById('semantic-search-toggle');
        const useSemanticSearch = toggle ? toggle.checked : true;

        // Try getting current tab content
        const activePage = await new Promise((resolve) => {
            if (!chrome || !chrome.tabs) return resolve(null);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) return resolve(null);
                const tab = tabs[0];
                if (!tab.url || tab.url.startsWith('chrome') || tab.url.startsWith('about:')) return resolve(null);

                chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });
        });

        const reqBody = {
            query,
            model: currentModel || null,
            conversation_id: currentConversationId,
            history: currentConversationHistory,
            use_semantic_search: useSemanticSearch,
            active_page: activePage
        };

        const resp = await apiFetch('/api/query/stream', {
            method: 'POST',
            body: JSON.stringify(reqBody),
            signal: currentStreamController.signal
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => 'No error text');
            if (resp.status === 400 && errText.includes('context length')) {
                throw new Error("Query is too long or webpage is too giant for the AI context window.");
            }
            throw new Error(`Server Error (${resp.status}): ${errText}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        // Update history immediately so subsequent fast queries work
        currentConversationHistory.push({ role: 'user', content: query });

        // Remove thinking indicator, add streaming container
        if (thinkingEl && thinkingEl.parentNode) thinkingEl.remove();
        div = document.createElement('div');
        div.className = 'message ai streaming';
        div.innerHTML = `
            <div class="avatar"><svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z"/></svg></div>
            <div class="content flex-col" style="display:flex; flex-direction:column; gap:8px; width:100%;">
                <div class="markdown-body"></div>
                <!-- Stylish thinking indicator dot bounce -->
                <div class="thinking-dots-loader" style="display: flex; gap: 4px; padding: 4px 0; align-items: center; align-self: flex-start; margin-top: 4px; opacity: 0.8;">
                   <div style="width:5px; height:5px; border-radius:50%; background:var(--accent); animation: bounce 1.4s infinite ease-in-out both;"></div>
                   <div style="width:5px; height:5px; border-radius:50%; background:var(--accent); animation: bounce 1.4s infinite ease-in-out both; animation-delay: 0.16s;"></div>
                   <div style="width:5px; height:5px; border-radius:50%; background:var(--accent); animation: bounce 1.4s infinite ease-in-out both; animation-delay: 0.32s;"></div>
                </div>
                <div class="sources-container"></div>
            </div>
        `;
        container.appendChild(div);

        const contentEl = div.querySelector('.markdown-body');
        const sourcesEl = div.querySelector('.sources-container');
        const dotsLoader = div.querySelector('.thinking-dots-loader');

        let fullText = "";
        let sources = [];
        let buffer = '';

        // Throttled UI Render to prevent Markdown/MathJax layout thrashing 
        // which caused the previous "fked up" rendering issues.
        let renderPending = false;
        const flushRender = () => {
            if (fullText) contentEl.innerHTML = renderMarkdown(fullText);
            container.scrollTop = container.scrollHeight;
            renderPending = false;
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line in buffer

            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') continue;

                    try {
                        const data = JSON.parse(dataStr);
                        if (data.token) {
                            fullText += data.token;
                            if (!renderPending) {
                                renderPending = true;
                                requestAnimationFrame(flushRender); // buttery smooth rendering
                            }
                        } else if (data.conversation_id) {
                            currentConversationId = data.conversation_id;
                        } else if (data.sources) {
                            sources = data.sources;
                            if (sources.length > 0) {
                                sourcesEl.innerHTML = `
                                    <div class="sources" style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
                                        <div class="sources-label" style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:8px;">References</div>
                                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                          ${sources.map(s => `<a class="source-chip" href="${escapeHtml(s.url || '#')}" target="_blank" style="font-size:11px; padding:4px 10px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:4px; color:var(--text-secondary); text-decoration:none; display:inline-block; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--accent-border)'; this.style.color='var(--accent)';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-secondary)';">${escapeHtml(s.domain || s.title || 'Source')}</a>`).join('')}
                                        </div>
                                    </div>
                                `;
                            }
                        } else if (data.full_answer) {
                            fullText = data.full_answer;
                        } else if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (err) {
                        // ignore broken json chunks
                    }
                }
            }
        }

        // Final render flush
        flushRender();
        if (dotsLoader) dotsLoader.remove();
        div.classList.remove('streaming');
        currentConversationHistory.push({ role: 'assistant', content: fullText });

        loadChatHistory();

        // Code block headers
        div.querySelectorAll('pre').forEach(pre => {
            const code = pre.querySelector('code');
            const langMatch = code?.className?.match(/language-(\\w+)/);
            const lang = langMatch ? langMatch[1] : '';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `<span class="code-lang">${lang || 'code'}</span><button class="copy-btn">Copy</button>`;
            pre.parentNode.insertBefore(header, pre);
        });

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('[Internet Memory] Stream aborted by user');
            if (div && div.parentNode) div.classList.remove('streaming');
        } else {
            if (thinkingEl && thinkingEl.parentNode) thinkingEl.remove();
            if (div && div.parentNode) {
                div.classList.remove('streaming');
                div.classList.add('error');
                const content = div.querySelector('.content');
                if (content) {
                    let errorMsg = e.message;
                    if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
                        errorMsg = "Cannot connect to server. Is the Internet Memory app running?";
                    }
                    content.innerHTML = `<p style="color: var(--danger);"><strong>Error:</strong> ${errorMsg}</p>`;
                }
            } else {
                let errorMsg = e.message;
                if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
                    errorMsg = "Cannot connect to server. Is the Internet Memory app running?";
                }
                addAIMessage(`**Error:** Could not get a response.\n\n\`${errorMsg}\``, []);
            }
        }
    } finally {
        if (stopBtn) stopBtn.style.display = 'none';
        if (sendBtn) {
            sendBtn.style.display = 'flex';
            sendBtn.disabled = !input.value.trim();
        }
        isStreaming = false;
        currentStreamController = null;
    }
}

function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message user';

    div.innerHTML = `
        <div class="bubble">
            <div class="text-content">${escapeHtml(text)}</div>
            <button class="expand-btn"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        </div>
    `;
    container.appendChild(div);

    // JS to detect if text overflows 3 lines
    const contentDiv = div.querySelector('.text-content');
    const btn = div.querySelector('.expand-btn');

    setTimeout(() => {
        if (contentDiv.scrollHeight > contentDiv.clientHeight + 2) {
            btn.style.display = 'block';
            btn.onclick = () => {
                const isExpanded = contentDiv.classList.toggle('expanded');
                btn.classList.toggle('expanded-btn', isExpanded);
                container.scrollTop = container.scrollHeight;
            };
        }
    }, 50);

    container.scrollTop = container.scrollHeight;
}

function addAIMessage(markdown, sources) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message ai';

    let rendered = renderMarkdown(markdown);

    let sourcesHTML = '';
    if (sources.length > 0) {
        sourcesHTML = `
      <div class="sources">
        <div class="sources-label">Sources from your reading</div>
        ${sources.map(s => `<a class="source-chip" href="${escapeHtml(s.url || '#')}" target="_blank" title="${escapeHtml(s.title || '')}">${escapeHtml(s.domain || s.title || 'Source')}</a>`).join('')}
      </div>
    `;
    }

    div.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z" stroke="white" stroke-width="2"/></svg>
    </div>
    <div class="content">
      ${rendered}
      ${sourcesHTML}
    </div>
  `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // Code block headers
    div.querySelectorAll('pre').forEach(pre => {
        const code = pre.querySelector('code');
        const langMatch = code?.className?.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `<span class="code-lang">${lang || 'code'}</span><button class="copy-btn">Copy</button>`;
        pre.parentNode.insertBefore(header, pre);
    });
}

function showThinking() {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message ai streaming-indicator';
    div.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z" stroke="white" stroke-width="2"/></svg>
    </div>
    <div class="content">
      <div class="thinking" style="display: flex; align-items: center; gap: 12px;">
        <div class="loading-spinner"></div>
        <div class="thinking-steps" style="display: flex; flex-direction: column; gap: 4px;">
            <span class="thinking-label current-step" id="loading-step-1" style="font-size: 13px; font-weight: 500; color: var(--accent);">Analyzing intent...</span>
            <span class="thinking-label pending-step" id="loading-step-2" style="font-size: 11px; color: var(--text-muted); opacity: 0.6;">Retrieving memory context...</span>
            <span class="thinking-label pending-step" id="loading-step-3" style="font-size: 11px; color: var(--text-muted); opacity: 0.6;">Generating response...</span>
        </div>
      </div>
    </div>
  `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // Simulate stepping through stages for better UX feel during network latency
    setTimeout(() => {
        const step1 = document.getElementById('loading-step-1');
        const step2 = document.getElementById('loading-step-2');
        if (step1 && step2) {
            step1.style.fontSize = '11px'; step1.style.color = 'var(--text-muted)'; step1.style.fontWeight = 'normal'; step1.textContent = 'Intent analyzed ✓';
            step2.style.fontSize = '13px'; step2.style.color = 'var(--accent)'; step2.style.fontWeight = '500'; step2.style.opacity = '1';
        }
    }, 600);

    setTimeout(() => {
        const step2 = document.getElementById('loading-step-2');
        const step3 = document.getElementById('loading-step-3');
        if (step2 && step3) {
            step2.style.fontSize = '11px'; step2.style.color = 'var(--text-muted)'; step2.style.fontWeight = 'normal'; step2.textContent = 'Context retrieved ✓';
            step3.style.fontSize = '13px'; step3.style.color = 'var(--accent)'; step3.style.fontWeight = '500'; step3.style.opacity = '1';
        }
    }, 1800);

    return div;
}

// ─── Markdown + LaTeX Rendering ──────────────────────────

function renderMarkdown(text) {
    let processed = text;
    const blocks = [];

    // Block LaTeX: $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
        const id = `%%BLOCK_${blocks.length}%%`;
        blocks.push({ mode: 'display', latex: latex.trim() });
        return id;
    });

    // Inline LaTeX: $...$  (but not $$)
    processed = processed.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, latex) => {
        const id = `%%INLINE_${blocks.length}%%`;
        blocks.push({ mode: 'inline', latex: latex.trim() });
        return id;
    });

    // Render markdown
    let html;
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
        html = marked.parse(processed);
    } else {
        html = processed.replace(/\n/g, '<br>');
    }

    // Re-insert LaTeX
    blocks.forEach((b, i) => {
        const bId = `%%BLOCK_${i}%%`;
        const iId = `%%INLINE_${i}%%`;
        let rendered;
        if (typeof katex !== 'undefined') {
            try {
                rendered = katex.renderToString(b.latex, {
                    displayMode: b.mode === 'display',
                    throwOnError: false,
                });
            } catch (err) {
                console.error("KaTeX error:", err);
                rendered = `<code class="latex-fallback">${escapeHtml(b.latex)}</code>`;
            }
        } else {
            rendered = `<code class="latex-fallback">${escapeHtml(b.latex)}</code>`;
        }
        // Using split/join instead of replace to avoid issues with $ in the replacement string
        html = html.split(bId).join(rendered);
        html = html.split(iId).join(rendered);
    });

    // Citations: [1], [2]
    html = html.replace(/\[(\d+)\]/g, (match, num) => {
        return `<a class="citation-link" href="#source-${num}" data-num="${num}">[${num}]</a>`;
    });

    return html;
}

function scrollToSource(num) {
    const sources = document.querySelectorAll('.source-chip');
    if (sources[num - 1]) {
        sources[num - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
        sources[num - 1].style.outline = '2px solid var(--accent)';
        setTimeout(() => sources[num - 1].style.outline = 'none', 2000);
    }
}

// ─── Utilities ───────────────────────────────────────────

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function copyCode(btn) {
    const pre = btn.closest('.code-header').nextElementSibling;
    const code = pre?.querySelector('code') || pre;
    navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimeSpent(seconds) {
    if (!seconds) return '⏱️ Just now';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `⏱️ ${s}s`;
    return `⏱️ ${m}m ${s}s`;
}

// ─── Timeline ────────────────────────────────────────────

async function loadTimeline() {
    const container = document.getElementById('timeline-content');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading timeline...</span></div>';

    try {
        const resp = await apiFetch('/api/timeline');
        const data = await resp.json();
        const timeline = data.timeline || [];

        if (timeline.length === 0) {
            showEmptyState(container, "No activity yet", "Browse the web and your reading activity will appear here automatically.");
            return;
        }

        container.innerHTML = timeline.map(day => `
      <div class="timeline-group">
        <div class="timeline-date">${formatDate(day.date)}</div>
        ${day.articles.map(a => `
          <div class="timeline-item" data-url="${escapeHtml(a.url)}">
            <div class="item-title-row" style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
              <div class="item-title" style="flex:1;">${escapeHtml(a.title)}</div>
              <button class="delete-memory-btn" data-id="${a.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px; display:flex; align-items:center; opacity:0.6; transition:opacity 0.2s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
              </button>
            </div>
            <div class="item-meta">
              ${escapeHtml(a.domain)} · ${formatTimeSpent(a.time_spent)}
              ${a.tags ? `<span class="ai-tags-small"> · ${escapeHtml(a.tags)}</span>` : ''}
            </div>
            ${a.summary ? `<div class="item-summary"><span class="ai-sparkle">✨</span> ${escapeHtml(a.summary)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');
    } catch {
        container.innerHTML = '<div class="connection-error">Cannot connect to Internet Memory server. Is it running?</div>';
    }
}

// ─── Library ─────────────────────────────────────────────

async function loadLibrary() {
    const container = document.getElementById('library-content');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading library...</span></div>';

    try {
        const resp = await apiFetch('/api/articles');
        const data = await resp.json();
        const articles = data.articles || [];

        if (articles.length === 0) {
            showEmptyState(container, "Your library is empty", "Articles you visit will be automatically saved here.");
            return;
        }

        renderArticles(container, articles);
    } catch {
        container.innerHTML = '<div class="connection-error">Cannot connect to server.</div>';
    }
}

function renderArticles(container, articles) {
    // Check if fullpage (use grid) or sidepanel (use list)
    const isFullPage = !!document.querySelector('.app-layout');
    const wrapClass = isFullPage ? 'article-grid' : '';

    container.innerHTML = `<div class="${wrapClass}">
    ${articles.map(a => `
    <div class="article-item" data-id="${a.id}">
      <div class="art-header" style="justify-content: space-between;">
        <div style="display:flex; align-items:center; gap:6px; flex:1; overflow:hidden;">
            <span class="source-tag article">Memory</span>
            ${a.tags ? a.tags.split(',').slice(0, 2).map(t => `<span class="category-tag">${escapeHtml(t.trim())}</span>`).join('') : ''}
            <span class="art-domain">${escapeHtml(a.domain || (a.url ? new URL(a.url).hostname : 'local'))}</span>
        </div>
        <button class="delete-memory-btn" data-id="${a.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px; display:flex; align-items:center; opacity:0.5; transition:opacity 0.2s; flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
        </button>
      </div>
      <div class="art-title">${escapeHtml(a.title)}</div>
      ${a.summary ? `<div class="art-summary"><strong>Bottom Line:</strong> ${escapeHtml(a.summary)}</div>` : ''}
      <div class="art-meta">${formatTimeSpent(a.time_spent)} · ${formatTimeAgo(a.captured_at || a.timestamp)}</div>
    </div>
  `).join('')}
  </div>`;
}

async function openArticleDetail(id) {
    const libraryView = document.getElementById('view-library');
    const timelineView = document.getElementById('view-timeline');
    const detailView = document.getElementById('view-article-detail');

    if (!detailView) return;

    // Hide lists, show detail
    if (libraryView) libraryView.classList.remove('active');
    if (timelineView) timelineView.classList.remove('active');
    detailView.classList.add('active');
    detailView.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const resp = await apiFetch(`/api/articles/${id}`);
        const article = await resp.json();

        detailView.innerHTML = `
            <div class="article-detail active">
                <button class="back-btn" data-view="library">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back to Library
                </button>
                
                <div class="detail-header">
                    <div class="art-header" style="margin-bottom: 12px;">
                        <span class="source-tag ${article.source_type || 'article'}">${article.source_type || 'article'}</span>
                        ${article.category ? `<span class="category-tag">${escapeHtml(article.category)}</span>` : ''}
                        <span class="art-domain">${escapeHtml(article.domain)}</span>
                    </div>
                    <h2>${escapeHtml(article.title)}</h2>
                    <div class="detail-meta">
                        Captured ${formatDate(article.captured_at)} · ${formatTimeSpent(article.time_spent)} on page
                    </div>
                </div>

                ${article.summary ? `
                    <div class="detail-section">
                        <h3>Summary</h3>
                        <p style="font-size: 14px; line-height: 1.6; color: var(--text-secondary);">${escapeHtml(article.summary)}</p>
                    </div>
                ` : ''}

                <div class="detail-section" id="highlights-section">
                    <h3>Highlights</h3>
                    <div class="highlights-list"><div class="loading-mini">Loading...</div></div>
                </div>

                <div class="detail-section" id="related-section">
                    <h3>Related Memories</h3>
                    <div class="related-grid"><div class="loading-mini">Loading...</div></div>
                </div>

                <div style="margin-top: 20px;">
                    <button class="suggestion" style="width: 100%;" data-url="${escapeHtml(article.url)}">Open Original Source</button>
                </div>
            </div>
        `;

        loadHighlights(id);
        loadRelated(id);

    } catch (e) {
        detailView.innerHTML = `<div class="error">Failed to load article detail: ${e.message}</div>`;
    }
}

async function loadHighlights(articleId) {
    const container = document.querySelector('#highlights-section .highlights-list');
    if (!container) return;
    try {
        const resp = await apiFetch(`/api/highlights/${articleId}`);
        const data = await resp.json();
        const highlights = data.highlights || [];

        if (highlights.length === 0) {
            container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No snippets saved yet. Right-click any text on the page to save a highlight.</div>';
            return;
        }

        container.innerHTML = highlights.map(h => `
            <div class="highlight-item">
                "${escapeHtml(h.text)}"
                ${h.note ? `<div style="margin-top: 5px; font-weight: 600;">Note: ${escapeHtml(h.note)}</div>` : ''}
            </div>
        `).join('');
    } catch {
        container.innerHTML = 'Error loading highlights';
    }
}

async function loadRelated(articleId) {
    const container = document.querySelector('#related-section .related-grid');
    if (!container) return;
    try {
        const resp = await apiFetch(`/api/related/${articleId}`);
        const data = await resp.json();
        const related = data.related || [];

        if (related.length === 0) {
            container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No similar memories found yet.</div>';
            return;
        }

        container.innerHTML = related.map(r => `
            <div class="related-item" data-id="${r.id}">
                <div class="related-title">${escapeHtml(r.title)}</div>
                <div class="related-domain">${escapeHtml(r.domain)}</div>
            </div>
        `).join('');
    } catch {
        container.innerHTML = 'Error loading related articles';
    }
}

// Library search
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('library-search');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const q = searchInput.value.trim();
                if (q.length > 2) searchLibrary(q);
                else if (q.length === 0) loadLibrary();
            }, 400);
        });
    }
});

async function searchLibrary(query) {
    const container = document.getElementById('library-content');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const settings = await chrome.storage.local.get('rerankEnabled');
        const rerank = settings.rerankEnabled === true;
        const resp = await apiFetch(`/api/articles?search=${encodeURIComponent(query)}&rerank=${rerank}`);
        const data = await resp.json();
        renderArticles(container, data.articles || []);
    } catch {
        container.innerHTML = '<div class="connection-error">Search failed.</div>';
    }
}

// ─── Stats ───────────────────────────────────────────────

async function loadStats() {
    const container = document.getElementById('stats-content');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div><span>Loading stats...</span></div>';

    try {
        const resp = await apiFetch('/api/stats');
        const stats = await resp.json();

        let html = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-val">${stats.total_articles || 0}</div><div class="stat-lbl">Memories</div></div>
        <div class="stat-card"><div class="stat-val">${stats.total_concepts || 0}</div><div class="stat-lbl">Concepts</div></div>
        <div class="stat-card"><div class="stat-val">${stats.total_chunks || 0}</div><div class="stat-lbl">Chunks</div></div>
        <div class="stat-card"><div class="stat-val">${stats.streak_days || 0}</div><div class="stat-lbl">Active Days</div></div>
      </div>
    `;

        if (stats.recent_topics && stats.recent_topics.length > 0) {
            html += `<div class="topics-section"><h3>Top Topics</h3>${stats.recent_topics.map(t => `<span class="topic-tag">${escapeHtml(t.name)} (${t.count})</span>`).join('')}</div>`;
        }

        container.innerHTML = html;
        renderAnalytics(stats);
    } catch {
        container.innerHTML = '<div class="connection-error">Cannot connect to server.</div>';
    }
}

function renderAnalytics(stats) {
    const container = document.getElementById('stats-content');
    if (!container) return;

    // 1. Heatmap (GitHub style)
    let heatmapHtml = `
        <div class="analytics-card">
            <h3>Knowledge Heatmap</h3>
            <div class="heatmap-container" id="heatmap-grid"></div>
            <div class="heatmap-legend">
                <span>Less</span>
                <div class="legend-box level-0"></div>
                <div class="legend-box level-1"></div>
                <div class="legend-box level-2"></div>
                <div class="legend-box level-3"></div>
                <div class="legend-box level-4"></div>
                <span>More</span>
            </div>
        </div>
    `;

    // 2. Category Trends
    let trendsHtml = `
        <div class="analytics-card">
            <h3>Top Categories</h3>
            <div class="trends-list">
                ${(stats.category_trends || []).map(t => `
                    <div class="trend-item">
                        <span class="trend-name">${escapeHtml(t.category)}</span>
                        <div class="trend-bar-bg">
                            <div class="trend-bar-fill" style="width: ${Math.min(100, (t.count / (stats.total_articles || 1)) * 100)}%"></div>
                        </div>
                        <span class="trend-count">${t.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    container.innerHTML += heatmapHtml + trendsHtml;
    initHeatmap(stats.heatmap || []);
}

function initHeatmap(data) {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;

    // Create 52 weeks of 7 days (simplified)
    const now = new Date();
    const days = 364;
    const map = new Map(data.map(d => [d.date, d.count]));

    for (let i = days; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = map.get(dateStr) || 0;

        let level = 0;
        if (count > 0) level = 1;
        if (count > 2) level = 2;
        if (count > 5) level = 3;
        if (count > 10) level = 4;

        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${level}`;
        cell.title = `${dateStr}: ${count} captures`;
        grid.appendChild(cell);
    }
}

// ─── Knowledge Graph ──────────────────────────────────────

let graphInstance = null;

async function loadGraph() {
    const container = document.getElementById('3d-graph');
    if (!container) return;

    // Only init once if possible, or reset data
    if (!graphInstance) {
        // @ts-ignore
        graphInstance = ForceGraph3D()(container)
            .backgroundColor('#000000')
            .nodeLabel('label')
            .nodeAutoColorBy('group')
            .linkColor(() => 'rgba(255,255,255,0.1)')
            .linkDirectionalParticles(2)
            .linkDirectionalParticleSpeed(d => 0.005)
            .onNodeClick(node => {
                // Aim at node from outside
                const distance = 40;
                const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

                graphInstance.cameraPosition(
                    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
                    node, // lookAt ({x,y,z})
                    3000  // ms transition duration
                );
            });
    }

    try {
        const nodesResp = await apiFetch('/api/graph/nodes');
        const edgesResp = await apiFetch('/api/graph/edges');

        const nodesData = await nodesResp.json();
        const edgesData = await edgesResp.json();

        // Transform data for 3d-force-graph
        // Nodes: { id, label, group }
        // Links: { source, target }

        const gData = {
            nodes: nodesData.nodes.map(n => ({
                id: n.id,
                label: n.name || n.title || 'Concept',
                group: n.type === 'concept' ? 1 : 2
            })),
            links: edgesData.edges.map(e => ({
                source: e.source_id,
                target: e.target_id
            }))
        };

        graphInstance.graphData(gData);
    } catch (err) {
        console.error('Failed to load graph data:', err);
    }
}

async function triggerProactiveSummary() {
    // Only if we are in the chat view and no messages yet
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages || chatMessages.children.length > 1) return; // 1 child is usually welcome message

    try {
        const activePage = await new Promise((resolve) => {
            if (!chrome || !chrome.tabs) return resolve(null);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) return resolve(null);
                const tab = tabs[0];
                if (!tab.url || tab.url.startsWith('chrome')) return resolve(null);
                chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (resp) => {
                    resolve(resp || null);
                });
            });
        });

        if (activePage && activePage.text && activePage.text.length > 500) {
            // Add a special proactive chip
            const container = document.querySelector('.suggestion-chips');
            if (container) {
                const btn = document.createElement('button');
                btn.className = 'suggestion proactive';
                btn.style.borderColor = 'var(--accent)';
                btn.style.background = 'var(--accent-glow)';
                btn.innerHTML = `<span style="margin-right: 6px;">✨</span> Summarize this page for me`;
                btn.onclick = () => {
                    const input = document.getElementById('chat-input');
                    if (input) {
                        input.value = "Summarize this page for me in 3 bullet points.";
                        sendMessage();
                    }
                };
                container.prepend(btn);
            }
        }
    } catch (e) { }
}
