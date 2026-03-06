// API service — works in both Tauri and browser
// In Tauri: uses invoke() IPC
// In browser: uses HTTP fallback to localhost:11435

const isTauri = () => {
  return window.__TAURI__ && window.__TAURI__.core;
};

const invoke = async (command, args = {}) => {
  if (isTauri()) {
    return window.__TAURI__.core.invoke(command, args);
  }
  // Browser fallback — not all commands available
  throw new Error('Running outside Tauri. Please open the Internet Memory desktop app.');
};

// ─── Ollama Commands ───────────────────────────────────

export async function checkOllama() {
  if (isTauri()) return invoke('check_ollama');
  // Direct Ollama API fallback
  try {
    const res = await fetch('http://localhost:11434');
    return res.ok;
  } catch { return false; }
}

export async function listModels() {
  if (isTauri()) return invoke('list_models');
  // Direct Ollama API fallback
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    return (data.models || []).map(m => ({ name: m.name, size: m.size }));
  } catch { return []; }
}

// ─── Capture Commands ──────────────────────────────────

export async function capturePage(url, title, content, model) {
  return invoke('capture_page', { url, title, content, model });
}

// ─── Query Commands ────────────────────────────────────

export async function queryMemory(query, model) {
  return invoke('query_memory', { query, model });
}

// ─── Data Commands ─────────────────────────────────────

export async function getArticles(page = 1, sourceFilter = null) {
  if (isTauri()) return invoke('get_articles', { page, sourceFilter });
  return []; // Empty in browser mode
}

export async function getArticle(id) {
  return invoke('get_article', { id });
}

export async function deleteArticle(id) {
  return invoke('delete_article', { id });
}

export async function getTimeline() {
  if (isTauri()) return invoke('get_timeline');
  return [];
}

export async function getGraph() {
  if (isTauri()) return invoke('get_graph');
  return { nodes: [], edges: [] };
}

export async function getStats() {
  if (isTauri()) return invoke('get_stats');
  return { total_articles: 0, total_concepts: 0, total_chunks: 0, recent_topics: [], streak_days: 0 };
}

export async function searchMemory(query) {
  if (isTauri()) return invoke('search_memory', { query });
  return [];
}
