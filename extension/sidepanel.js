const DEFAULT_API = 'http://localhost:11435';
let currentModel = '';
let isStreaming = false;

// ─── API Helper ──────────────────────────────────────────

async function getApiConfig() {
    const res = await chrome.storage.local.get(['apiUrl', 'apiToken']);
    return {
        apiUrl: res.apiUrl || DEFAULT_API,
        apiToken: res.apiToken || ''
    };
}

async function apiFetch(endpoint, options = {}) {
    const { apiUrl, apiToken } = await getApiConfig();
    const url = endpoint.startsWith('http') ? endpoint : `${apiUrl}${endpoint}`;

    const headers = {
        ...options.headers
    };

    if (!options.isStream) {
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

    // Fullscreen button
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') });
        });
    }

    initChat();
    loadModels();
    checkConnection();
    loadChatHistory();

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
});

function applyTheme(theme, accent) {
    const root = document.documentElement;

    // Set Accent
    root.style.setProperty('--accent', accent);
    // Rough glow/border derivatives
    root.style.setProperty('--accent-glow', `${accent}15`);
    root.style.setProperty('--accent-border', `${accent}30`);

    // Set Theme
    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = isDark ? 'dark' : 'light';
    }

    if (theme === 'light') {
        root.style.setProperty('--bg', '#ffffff');
        root.style.setProperty('--bg-secondary', '#f8fafc');
        root.style.setProperty('--bg-tertiary', '#f1f5f9');
        root.style.setProperty('--border', '#e2e8f0');
        root.style.setProperty('--text-primary', '#0f172a');
        root.style.setProperty('--text-secondary', '#334155');
        root.style.setProperty('--text-muted', '#64748b');
    } else {
        // Restore Default Dark
        root.style.setProperty('--bg', '#0f1117');
        root.style.setProperty('--bg-secondary', '#161923');
        root.style.setProperty('--bg-tertiary', '#1e2230');
        root.style.setProperty('--border', 'rgba(255,255,255,0.08)');
        root.style.setProperty('--text-primary', '#ffffff');
        root.style.setProperty('--text-secondary', '#cbd5e1');
        root.style.setProperty('--text-muted', '#94a3b8');
    }
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
        const data = await resp.json();
        if (statusEl) {
            statusEl.className = 'conn-status connected';
            statusEl.querySelector('span').textContent = data.ollama ? 'Connected · Ollama OK' : 'Connected · Ollama offline';
        }
        // Load memory count
        const statsResp = await apiFetch('/api/stats');
        const stats = await statsResp.json();
        if (countEl) countEl.textContent = `${stats.total_articles || 0} memories`;
    } catch {
        if (statusEl) {
            statusEl.className = 'conn-status disconnected';
            statusEl.querySelector('span').textContent = 'Server offline (Check Settings)';
        }
    }
}

// ─── Models ──────────────────────────────────────────────

async function loadModels() {
    try {
        const resp = await apiFetch('/api/models');
        const data = await resp.json();
        const select = document.getElementById('model-select');
        if (!select) return;
        select.innerHTML = '';
        const models = (data.models || []).filter(m => !m.name.includes('embed'));
        if (models.length === 0) {
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
    } catch {
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
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        const cc = document.getElementById('char-count');
        if (cc) cc.textContent = input.value.length > 0 ? input.value.length : '';
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function askSuggestion(btn) {
    const input = document.getElementById('chat-input');
    if (input) input.value = btn.textContent;
    sendMessage();
}

function searchWebFallback() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(searchUrl, '_blank');
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
            <div class="nav-item ${c.id === currentConversationId ? 'active' : ''}" style="justify-content: space-between; padding: 8px 14px;" onclick="loadConversation('${c.id}')">
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;">${escapeHtml(c.query)}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Failed to load chat history:", e);
    }
}

function startNewChat() {
    currentConversationId = null;
    currentConversationHistory = [];
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
                <button class="suggestion" onclick="askSuggestion(this)">What did I read about AI agents?</button>
                <button class="suggestion" onclick="askSuggestion(this)">Summarize my recent readings</button>
            </div>
        </div>
    `;
    loadChatHistory();
}

async function loadConversation(id) {
    if (isStreaming) return;
    try {
        const resp = await apiFetch(`/api/conversations/${id}/messages`);
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

    // Create AI wrapper early for streaming
    const container = document.getElementById('chat-messages');

    try {
        const reqBody = {
            query,
            model: currentModel || null,
            conversation_id: currentConversationId,
            history: currentConversationHistory
        };

        const resp = await apiFetch('/api/query/stream', {
            method: 'POST',
            body: JSON.stringify(reqBody),
            isStream: true
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText);
        }

        thinkingEl.remove();

        // Create AI message skeleton
        const div = document.createElement('div');
        div.className = 'message ai streaming';
        div.innerHTML = `
            <div class="avatar">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z" stroke="white" stroke-width="2"/></svg>
            </div>
            <div class="content markdown-body"></div>
            <div class="sources-container"></div>
        `;
        container.appendChild(div);

        const contentEl = div.querySelector('.content');
        const sourcesEl = div.querySelector('.sources-container');

        let fullText = '';
        let sources = [];

        // Update history immediately so subsequent fast queries work
        currentConversationHistory.push({ role: 'user', content: query });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (!dataStr) continue;

                    try {
                        const data = JSON.parse(dataStr);
                        if (data.token) {
                            fullText += data.token;
                            // Re-render markdown on each chunk
                            contentEl.innerHTML = renderMarkdown(fullText);
                            container.scrollTop = container.scrollHeight;
                        } else if (data.conversation_id) {
                            currentConversationId = data.conversation_id;
                        } else if (data.sources) {
                            sources = data.sources;
                            if (sources.length > 0) {
                                sourcesEl.innerHTML = `
                                    <div class="sources">
                                        <div class="sources-label">Sources from your reading</div>
                                        ${sources.map(s => `<a class="source-chip" href="${escapeHtml(s.url || '#')}" target="_blank" title="${escapeHtml(s.title || '')}">${escapeHtml(s.domain || s.title || 'Source')}</a>`).join('')}
                                    </div>
                                `;
                            }
                        } else if (data.full_answer) {
                            // Done event
                            fullText = data.full_answer;
                        } else if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (err) {
                        // ignore unparseable data line during stream split edge cases
                    }
                }
            }
        }

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
            header.innerHTML = `<span class="code-lang">${lang || 'code'}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button>`;
            pre.parentNode.insertBefore(header, pre);
        });

    } catch (e) {
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

    isStreaming = false;
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.disabled = !input.value.trim();
}

function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    container.appendChild(div);
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
        header.innerHTML = `<span class="code-lang">${lang || 'code'}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button>`;
        pre.parentNode.insertBefore(header, pre);
    });
}

function showThinking() {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message ai';
    div.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z" stroke="white" stroke-width="2"/></svg>
    </div>
    <div class="content">
      <div class="thinking">
        <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        <span class="thinking-label">Searching your memory...</span>
      </div>
    </div>
  `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
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
    processed = processed.replace(/\[(\d+)\]/g, (match, num) => {
        return `<a class="citation-link" href="#source-${num}" onclick="scrollToSource(${num}); return false;">${num}</a>`;
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
          <div class="timeline-item" onclick="window.open('${escapeHtml(a.url)}','_blank')">
            <div class="item-title">${escapeHtml(a.title)}</div>
            <div class="item-meta">${escapeHtml(a.domain)} · ${Math.max(1, Math.ceil(a.word_count / 250))} min read</div>
            ${a.summary ? `<div class="item-summary">${escapeHtml(a.summary)}</div>` : ''}
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
    <div class="article-item" onclick="openArticleDetail('${a.id}')">
      <div class="art-header">
        <span class="source-tag ${a.source_type || 'article'}">${a.source_type || 'article'}</span>
        ${a.category ? `<span class="category-tag">${escapeHtml(a.category)}</span>` : ''}
        <span class="art-domain">${escapeHtml(a.domain)}</span>
      </div>
      <div class="art-title">${escapeHtml(a.title)}</div>
      ${a.summary ? `<div class="art-summary">${escapeHtml(a.summary)}</div>` : ''}
      <div class="art-meta">${Math.max(1, Math.ceil(a.word_count / 250))} min · ${formatTimeAgo(a.captured_at)}</div>
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
                <button class="back-btn" onclick="switchView('library')">
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
                        Captured ${formatDate(article.captured_at)} · ${Math.max(1, Math.ceil(article.word_count / 250))} min read
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
                    <button class="suggestion" style="width: 100%;" onclick="window.open('${escapeHtml(article.url)}', '_blank')">Open Original Source</button>
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
            <div class="related-item" onclick="openArticleDetail('${r.id}')">
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
