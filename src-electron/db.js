const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

// Get the database file path
function getDbPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'internet_memory.db');
}

// Get the WASM file path
function getWasmPath() {
    // In production, check resources folder
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'sql-wasm.wasm');
    }
    // In development
    return path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
}

// Initialize the database
async function initDatabase() {
    const SQL = await initSqlJs({
        locateFile: file => getWasmPath()
    });

    const dbPath = getDbPath();
    console.log('[Database] Database path:', dbPath);

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
        console.log('[Database] Loaded existing database');
    } else {
        db = new SQL.Database();
        console.log('[Database] Created new database');
    }

    // Create tables
    createTables();

    // Database saves automatically using debounced saveDatabase()

    return db;
}

// Create database tables
function createTables() {
    db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      url TEXT,
      title TEXT,
      timestamp INTEGER NOT NULL,
      embedding BLOB,
      time_spent INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    // Ensure backwards compatibility for existing databases
    try {
        db.run('ALTER TABLE memories ADD COLUMN time_spent INTEGER DEFAULT 0');
    } catch (e) { }
    try {
        db.run('ALTER TABLE memories ADD COLUMN tags TEXT');
    } catch (e) { }
    try {
        db.run('ALTER TABLE memories ADD COLUMN summary TEXT');
    } catch (e) { }

    db.run(`
    CREATE TABLE IF NOT EXISTS semantic_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      node_type TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS semantic_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (source_id) REFERENCES semantic_nodes(node_id),
      FOREIGN KEY (target_id) REFERENCES semantic_nodes(node_id)
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources TEXT, -- JSON string
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )
  `);

    db.run(`
    CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp)
  `);

    db.run(`
    CREATE INDEX IF NOT EXISTS idx_semantic_nodes_node_id ON semantic_nodes(node_id)
  `);

    console.log('[Database] Tables created/verified');
}

// Save database to disk (debounced)
let saveTimeout = null;
function saveDatabase() {
    if (db) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(getDbPath(), buffer);
        }, 1000);
    }
}

// Close database
function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}

// Settings getters/setters
function getSetting(key) {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);

    if (stmt.step()) {
        const result = stmt.get()[0];
        stmt.free();
        return result;
    }

    stmt.free();
    return null;
}

function setSetting(key, value) {
    db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
    );
    saveDatabase();
}

// Memory operations
function addMemory(content, url = null, title = null, embedding = null, tags = null, summary = null) {
    const timestamp = Date.now();

    db.run(
        'INSERT INTO memories (content, url, title, timestamp, embedding, tags, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            content,
            url,
            title,
            timestamp,
            embedding ? Buffer.from(embedding) : null,
            tags,
            summary
        ]
    );

    const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveDatabase();

    return id;
}

function getMemories(limit = 100, offset = 0) {
    const results = db.exec(
        'SELECT id, content, url, title, timestamp, created_at, time_spent FROM memories ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [limit, offset]
    );

    if (results.length === 0) return [];

    return results[0].values.map(row => ({
        id: row[0],
        content: row[1],
        url: row[2],
        title: row[3],
        timestamp: row[4],
        created_at: row[5],
        time_spent: row[6] || 0
    }));
}

function getMemoryCount() {
    const results = db.exec('SELECT COUNT(*) FROM memories');
    if (results.length === 0) return 0;
    return results[0].values[0][0];
}

function getMemory(id) {
    const stmt = db.prepare(
        'SELECT id, content, url, title, timestamp, embedding, created_at, time_spent FROM memories WHERE id = ?'
    );
    stmt.bind([id]);

    if (stmt.step()) {
        const row = stmt.get();
        const result = {
            id: row[0],
            content: row[1],
            url: row[2],
            title: row[3],
            timestamp: row[4],
            embedding: row[5] ? Array.from(row[5]) : null,
            created_at: row[6],
            time_spent: row[7] || 0
        };
        stmt.free();
        return result;
    }

    stmt.free();
    return null;
}

function getMemoryByUrl(url) {
    const stmt = db.prepare('SELECT id FROM memories WHERE url = ? LIMIT 1');
    stmt.bind([url]);

    if (stmt.step()) {
        const row = stmt.get();
        stmt.free();
        return row[0];
    }

    stmt.free();
    return null;
}

function deleteMemory(id) {
    db.run('DELETE FROM memories WHERE id = ?', [id]);
    saveDatabase();
}

function addTimeSpent(url, additionalTimeMs) {
    if (!url || typeof additionalTimeMs !== 'number') return;
    const additionalSeconds = Math.floor(additionalTimeMs / 1000);
    if (additionalSeconds <= 0) return;

    db.run('UPDATE memories SET time_spent = COALESCE(time_spent, 0) + ? WHERE url = ?', [additionalSeconds, url]);
    saveDatabase();
}

function searchMemories(query, limit = 50) {
    const stopWords = new Set(['what', 'did', 'i', 'read', 'about', 'the', 'and', 'a', 'to', 'of', 'in', 'is', 'that', 'it', 'for', 'on', 'with', 'as', 'this', 'was', 'at', 'by', 'an', 'be', 'from', 'or', 'are', 'my', 'me']);
    const keywords = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    if (keywords.length === 0) {
        return getMemories(limit);
    }

    // Fetch recent memories to score (up to 2000 for speed)
    const results = db.exec('SELECT id, content, url, title, timestamp, created_at, time_spent FROM memories ORDER BY timestamp DESC LIMIT 2000');
    if (results.length === 0) return [];

    const memories = results[0].values.map(row => ({
        id: row[0],
        content: row[1] || '',
        url: row[2] || '',
        title: row[3] || '',
        timestamp: row[4],
        created_at: row[5],
        time_spent: row[6] || 0,
        score: 0
    }));

    for (const mem of memories) {
        let score = 0;
        const textToSearch = (mem.title + ' ' + mem.content + ' ' + mem.url).toLowerCase();

        for (const kw of keywords) {
            let kwCount = 0;
            let idx = textToSearch.indexOf(kw);
            while (idx !== -1) {
                kwCount++;
                idx = textToSearch.indexOf(kw, idx + kw.length);
            }
            if (kwCount > 0) {
                score += kwCount;
                if (mem.title.toLowerCase().includes(kw)) score += 5; // Title boost
            }
        }
        mem.score = score;
    }

    memories.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.timestamp - a.timestamp;
    });

    // Best effort semantic search fallback to recency
    return memories.slice(0, limit);
}

function getTimeline() {
    // Group by date - SQLite doesn't have a simple date(timestamp) if stored as ISO string
    // But memories.timestamp is integer now? Let's check.
    // In createTables, timestamp is INTEGER.
    const results = db.exec(`
        SELECT strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')) as date, 
               id, url, title, content, timestamp, time_spent
        FROM memories 
        ORDER BY timestamp DESC
    `);

    if (results.length === 0) return [];

    const timelineMap = new Map();
    results[0].values.forEach(row => {
        const date = row[0];
        if (!timelineMap.has(date)) {
            timelineMap.set(date, { date, articles: [] });
        }

        const content = row[4] || '';
        const domain = row[2] ? new URL(row[2]).hostname : 'local';

        timelineMap.get(date).articles.push({
            id: row[1],
            url: row[2],
            title: row[3],
            domain: domain,
            word_count: content.split(/\\s+/).length,
            time_spent: row[6] || 0,
            summary: content.substring(0, 150) + '...',
            timestamp: row[5]
        });
    });

    return Array.from(timelineMap.values());
}

function getHighlights(articleId) {
    const memory = getMemory(articleId);
    if (!memory) return [];

    // Extract highlights from content (hacked for now since we don't have a separate table)
    const highlights = [];
    const parts = memory.content.split('--- Highlight ---');
    if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
            highlights.push({ text: parts[i].trim() });
        }
    }
    return highlights;
}

function getRelatedMemories(articleId, limit = 5) {
    const memory = getMemory(articleId);
    if (!memory) return [];

    // Simple similar-ish articles (for now just random other articles)
    const results = db.exec(
        'SELECT id, url, title, content FROM memories WHERE id != ? LIMIT ?',
        [articleId, limit]
    );

    if (results.length === 0) return [];

    return results[0].values.map(row => ({
        id: row[0],
        url: row[1],
        title: row[2],
        domain: row[1] ? new URL(row[1]).hostname : 'local'
    }));
}

function getDatabaseSize() {
    try {
        const dbPath = getDbPath();
        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            return (stats.size / (1024 * 1024)).toFixed(2);
        }
    } catch (e) { }
    return "0.00";
}

function clearAllData() {
    db.run('DELETE FROM memories');
    db.run('DELETE FROM semantic_nodes');
    db.run('DELETE FROM semantic_edges');
    db.run('DELETE FROM settings');
    db.run('DELETE FROM conversations');
    db.run('DELETE FROM messages');
    saveDatabase();
}

// Chat Operations
function createConversation(id, query) {
    db.run('INSERT INTO conversations (id, query) VALUES (?, ?)', [id, query]);
    saveDatabase();
}

function addMessage(conversationId, role, content, sources = null) {
    db.run(
        'INSERT INTO messages (conversation_id, role, content, sources) VALUES (?, ?, ?, ?)',
        [conversationId, role, content, sources ? JSON.stringify(sources) : null]
    );
    saveDatabase();
}

function getConversations() {
    const results = db.exec('SELECT id, query, created_at FROM conversations ORDER BY created_at DESC');
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
        id: row[0],
        query: row[1],
        created_at: row[2]
    }));
}

function getConversationMessages(conversationId) {
    const results = db.exec(
        'SELECT role, content, sources FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId]
    );
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
        role: row[0],
        content: row[1],
        sources: row[2] ? JSON.parse(row[2]) : []
    }));
}

// Semantic graph operations
function addSemanticNode(nodeId, label, nodeType, metadata = null, embedding = null) {
    db.run(
        `INSERT OR REPLACE INTO semantic_nodes (node_id, label, node_type, metadata, embedding) 
     VALUES (?, ?, ?, ?, ?)`,
        [nodeId, label, nodeType, metadata ? JSON.stringify(metadata) : null, embedding ? Buffer.from(embedding) : null]
    );
    saveDatabase();
}

function getSemanticNodes(nodeType = null) {
    let query = 'SELECT node_id, label, node_type, metadata, created_at FROM semantic_nodes';
    let params = [];

    if (nodeType) {
        query += ' WHERE node_type = ?';
        params.push(nodeType);
    }

    const results = db.exec(query, params);

    if (results.length === 0) return [];

    return results[0].values.map(row => ({
        node_id: row[0],
        label: row[1],
        node_type: row[2],
        metadata: row[3] ? JSON.parse(row[3]) : null,
        created_at: row[4]
    }));
}

function addSemanticEdge(sourceId, targetId, edgeType, weight = 1.0) {
    db.run(
        `INSERT OR REPLACE INTO semantic_edges (source_id, target_id, edge_type, weight) 
     VALUES (?, ?, ?, ?)`,
        [sourceId, targetId, edgeType, weight]
    );
    saveDatabase();
}

function getSemanticEdges(sourceId = null, targetId = null) {
    let query = 'SELECT source_id, target_id, edge_type, weight, created_at FROM semantic_edges';
    let conditions = [];
    let params = [];

    if (sourceId) {
        conditions.push('source_id = ?');
        params.push(sourceId);
    }

    if (targetId) {
        conditions.push('target_id = ?');
        params.push(targetId);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    const results = db.exec(query, params);

    if (results.length === 0) return [];

    return results[0].values.map(row => ({
        source_id: row[0],
        target_id: row[1],
        edge_type: row[2],
        weight: row[3],
        created_at: row[4]
    }));
}

function deleteMemory(id) {
    db.run('DELETE FROM memories WHERE id = ?', [id]);
    saveDatabase();
}

function deleteConversation(id) {
    db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    db.run('DELETE FROM conversations WHERE id = ?', [id]);
    saveDatabase();
}

function deleteSemanticNode(nodeId) {
    db.run('DELETE FROM semantic_edges WHERE source_id = ? OR target_id = ?', [nodeId, nodeId]);
    db.run('DELETE FROM semantic_nodes WHERE node_id = ?', [nodeId]);
    saveDatabase();
}

function clearSemanticGraph() {
    db.run('DELETE FROM semantic_edges');
    db.run('DELETE FROM semantic_nodes');
    saveDatabase();
}

// Export functions
module.exports = {
    initDatabase,
    closeDatabase,
    saveDatabase,
    getSetting,
    setSetting,
    addMemory,
    getMemories,
    getMemory,
    getMemoryCount,
    getTimeline,
    getHighlights,
    getRelatedMemories,
    getDatabaseSize,
    clearAllData,
    createConversation,
    addMessage,
    getConversations,
    getConversationMessages,
    deleteMemory,
    searchMemories,
    addSemanticNode,
    getSemanticNodes,
    addSemanticEdge,
    getSemanticEdges,
    deleteSemanticNode,
    clearSemanticGraph,
    deleteConversation,
    getMemoryByUrl,
    addTimeSpent
};
