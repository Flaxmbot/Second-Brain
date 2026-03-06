use rusqlite::{Connection, params};
use std::sync::Mutex;
use std::path::PathBuf;
use crate::models::*;

pub struct Database {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

impl Database {
    pub fn new(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("Cannot create data dir: {}", e))?;
        let db_path = data_dir.join("internet_memory.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Cannot open database: {}", e))?;

        // Enable WAL mode for better concurrent performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=10000;")
            .map_err(|e| format!("WAL mode failed: {}", e))?;

        let db = Self { conn: Mutex::new(conn), db_path: db_path.clone() };
        db.init_tables()?;
        Ok(db)
    }

    pub fn get_conn(&self) -> &Mutex<Connection> {
        &self.conn
    }

    pub fn get_db_size(&self) -> f64 {
        std::fs::metadata(&self.db_path).map(|m| m.len() as f64 / 1024.0 / 1024.0).unwrap_or(0.0)
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                author TEXT,
                domain TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT,
                key_ideas TEXT,
                captured_at TEXT NOT NULL,
                word_count INTEGER NOT NULL DEFAULT 0,
                source_type TEXT NOT NULL DEFAULT 'article',
                category TEXT,
                reading_time_seconds INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                article_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding BLOB,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                article_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS concept_relations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                relation_type TEXT NOT NULL DEFAULT 'related',
                FOREIGN KEY (source_id) REFERENCES concepts(id),
                FOREIGN KEY (target_id) REFERENCES concepts(id)
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                response TEXT NOT NULL,
                sources TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS highlights (
                id TEXT PRIMARY KEY,
                article_id TEXT NOT NULL,
                text TEXT NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_articles_captured_at ON articles(captured_at);
            CREATE INDEX IF NOT EXISTS idx_articles_domain ON articles(domain);
            CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
            CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
            CREATE INDEX IF NOT EXISTS idx_chunks_article_id ON chunks(article_id);

            -- Default settings
            INSERT OR IGNORE INTO settings (key, value) VALUES ('capture_enabled', 'true');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('embed_model', 'nomic-embed-text');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('accent_color', '#00D4FF');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_categorize', 'true');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('blocklist', '[]');
        ").map_err(|e| format!("Init tables failed: {}", e))?;
        
        // Generate an API token if one doesn't exist
        if self.get_setting("api_token").is_err() {
            let token = uuid::Uuid::new_v4().to_string();
            self.set_setting("api_token", &token).map_err(|e| format!("Failed to create token: {}", e))?;
        }
        
        Ok(())
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  ARTICLES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn insert_article(&self, article: &Article) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let key_ideas_json = article.key_ideas.as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());
        conn.execute(
            "INSERT OR REPLACE INTO articles (id, url, title, author, domain, content, summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![article.id, article.url, article.title, article.author, article.domain, article.content, article.summary, key_ideas_json, article.captured_at, article.word_count, article.source_type, article.category, article.reading_time_seconds],
        ).map_err(|e| format!("Insert article failed: {}", e))?;
        Ok(())
    }

    pub fn get_article(&self, id: &str) -> Result<Option<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, url, title, author, domain, content, summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles WHERE id = ?1")
            .map_err(|e| format!("Prepare failed: {}", e))?;
        let result = stmt.query_row(params![id], |row| {
            let key_ideas_str: Option<String> = row.get(7)?;
            Ok(Article {
                id: row.get(0)?, url: row.get(1)?, title: row.get(2)?,
                author: row.get(3)?, domain: row.get(4)?, content: row.get(5)?,
                summary: row.get(6)?,
                key_ideas: key_ideas_str.and_then(|s| serde_json::from_str(&s).ok()),
                captured_at: row.get(8)?, word_count: row.get(9)?, source_type: row.get(10)?,
                category: row.get(11)?, reading_time_seconds: row.get(12)?,
            })
        });
        match result {
            Ok(a) => Ok(Some(a)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Get article failed: {}", e)),
        }
    }

    pub fn update_article_reading_time(&self, id: &str, seconds: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute("UPDATE articles SET reading_time_seconds = ?1 WHERE id = ?2", params![seconds, id])
            .map_err(|e| format!("Update reading time: {}", e))?;
        Ok(())
    }


    pub fn get_articles(&self, page: i64, per_page: i64, source_type: Option<&str>) -> Result<Vec<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let offset = (page - 1) * per_page;
        let mut articles = Vec::new();
        if let Some(st) = source_type {
            let mut stmt = conn.prepare(
                "SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles WHERE source_type = ?1 ORDER BY captured_at DESC LIMIT ?2 OFFSET ?3"
            ).map_err(|e| format!("Prepare: {}", e))?;
            let rows = stmt.query_map(params![st, per_page, offset], Self::map_article_row)
                .map_err(|e| format!("Query: {}", e))?;
            for row in rows { if let Ok(a) = row { articles.push(a); } }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles ORDER BY captured_at DESC LIMIT ?1 OFFSET ?2"
            ).map_err(|e| format!("Prepare: {}", e))?;
            let rows = stmt.query_map(params![per_page, offset], Self::map_article_row)
                .map_err(|e| format!("Query: {}", e))?;
            for row in rows { if let Ok(a) = row { articles.push(a); } }
        }
        Ok(articles)
    }

    pub fn get_all_articles(&self) -> Result<Vec<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, url, title, author, domain, content, summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles ORDER BY captured_at DESC")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], Self::map_article_row)
            .map_err(|e| format!("Query: {}", e))?;
        let mut articles = Vec::new();
        for row in rows { if let Ok(a) = row { articles.push(a); } }
        Ok(articles)
    }

    pub fn get_articles_by_date(&self, date: &str) -> Result<Vec<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles WHERE captured_at LIKE ?1 ORDER BY captured_at DESC")
            .map_err(|e| format!("Prepare: {}", e))?;
        let pattern = format!("{}%", date);
        let rows = stmt.query_map(params![pattern], Self::map_article_row)
            .map_err(|e| format!("Query: {}", e))?;
        let mut articles = Vec::new();
        for row in rows { if let Ok(a) = row { articles.push(a); } }
        Ok(articles)
    }

    pub fn search_articles(&self, query: &str) -> Result<Vec<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let search_term = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds FROM articles WHERE title LIKE ?1 OR summary LIKE ?1 OR content LIKE ?1 ORDER BY captured_at DESC LIMIT 20"
        ).map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map(params![search_term], Self::map_article_row)
            .map_err(|e| format!("Query: {}", e))?;
        let mut articles = Vec::new();
        for row in rows { if let Ok(a) = row { articles.push(a); } }
        Ok(articles)
    }

    pub fn delete_article(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute("DELETE FROM chunks WHERE article_id = ?1", params![id]).ok();
        conn.execute("DELETE FROM highlights WHERE article_id = ?1", params![id]).ok();
        conn.execute("DELETE FROM articles WHERE id = ?1", params![id]).ok();
        Ok(())
    }

    pub fn update_article_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute("UPDATE articles SET summary = ?1 WHERE id = ?2", params![summary, id])
            .map_err(|e| format!("Update summary: {}", e))?;
        Ok(())
    }

    pub fn set_article_category(&self, id: &str, category: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute("UPDATE articles SET category = ?1 WHERE id = ?2", params![category, id])
            .map_err(|e| format!("Set category: {}", e))?;
        Ok(())
    }

    pub fn url_exists(&self, url: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM articles WHERE url = ?1", params![url], |r| r.get(0)).unwrap_or(0);
        Ok(count > 0)
    }

    pub fn get_related_articles(&self, article_id: &str) -> Result<Vec<Article>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut articles = Vec::new();
        let mut seen_ids: Vec<String> = vec![article_id.to_string()];
        
        // 1. Same Category (Strongest match)
        let mut stmt = conn.prepare(
            "SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds 
             FROM articles 
             WHERE category = (SELECT category FROM articles WHERE id = ?1) 
             AND id != ?1 
             ORDER BY captured_at DESC LIMIT 5"
        ).map_err(|e| format!("Prepare related (cat): {}", e))?;
        
        let rows = stmt.query_map(params![article_id], Self::map_article_row)
            .map_err(|e| format!("Query related (cat): {}", e))?;
        for row in rows {
            if let Ok(a) = row {
                seen_ids.push(a.id.clone());
                articles.push(a);
            }
        }

        if articles.len() < 5 {
            // 2. Same Domain (Fallback) — filter already-found IDs in Rust
            let limit = 10i64; // fetch extra, filter in Rust
            let mut stmt2 = conn.prepare(
                "SELECT id, url, title, author, domain, '', summary, key_ideas, captured_at, word_count, source_type, category, reading_time_seconds 
                 FROM articles 
                 WHERE domain = (SELECT domain FROM articles WHERE id = ?1) 
                 AND id != ?1 
                 ORDER BY captured_at DESC LIMIT ?2"
            ).map_err(|e| format!("Prepare related (domain): {}", e))?;
            
            let rows2 = stmt2.query_map(params![article_id, limit], Self::map_article_row)
                .map_err(|e| format!("Query related (domain): {}", e))?;
            for row in rows2 {
                if articles.len() >= 5 { break; }
                if let Ok(a) = row {
                    if !seen_ids.contains(&a.id) {
                        seen_ids.push(a.id.clone());
                        articles.push(a);
                    }
                }
            }
        }

        Ok(articles)
    }

    fn map_article_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Article> {
        let key_ideas_str: Option<String> = row.get(7)?;
        Ok(Article {
            id: row.get(0)?, url: row.get(1)?, title: row.get(2)?,
            author: row.get(3)?, domain: row.get(4)?, content: row.get(5)?,
            summary: row.get(6)?,
            key_ideas: key_ideas_str.and_then(|s| serde_json::from_str(&s).ok()),
            captured_at: row.get(8)?, word_count: row.get(9)?, source_type: row.get(10)?,
            category: row.get(11)?, reading_time_seconds: row.get(12)?,
        })
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CHUNKS & EMBEDDINGS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn insert_chunk(&self, chunk: &Chunk) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let embedding_bytes: Vec<u8> = chunk.embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
        conn.execute(
            "INSERT OR REPLACE INTO chunks (id, article_id, chunk_index, text, embedding) VALUES (?1,?2,?3,?4,?5)",
            params![chunk.id, chunk.article_id, chunk.chunk_index, chunk.text, embedding_bytes],
        ).map_err(|e| format!("Insert chunk: {}", e))?;
        Ok(())
    }

    pub fn search_similar(&self, query_embedding: &[f32], limit: usize) -> Result<Vec<(String, String, f64)>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT article_id, text, embedding FROM chunks WHERE embedding IS NOT NULL")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            let article_id: String = row.get(0)?;
            let text: String = row.get(1)?;
            let emb_bytes: Vec<u8> = row.get(2)?;
            Ok((article_id, text, emb_bytes))
        }).map_err(|e| format!("Query: {}", e))?;

        let mut results: Vec<(String, String, f64)> = Vec::new();
        for row in rows {
            if let Ok((aid, text, bytes)) = row {
                if bytes.len() >= 4 {
                    let embedding: Vec<f32> = bytes.chunks(4)
                        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                        .collect();
                    let score = cosine_similarity(query_embedding, &embedding);
                    results.push((aid, text, score));
                }
            }
        }
        results.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        Ok(results)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CONCEPTS & GRAPH
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn upsert_concept(&self, name: &str, description: Option<&str>) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO concepts (id, name, description, article_count) VALUES (?1, ?2, ?3, 1) ON CONFLICT(name) DO UPDATE SET article_count = article_count + 1",
            params![id, name, description],
        ).map_err(|e| format!("Upsert concept: {}", e))?;
        let cid: String = conn.query_row("SELECT id FROM concepts WHERE name = ?1", params![name], |r| r.get(0))
            .map_err(|e| format!("Get concept: {}", e))?;
        Ok(cid)
    }

    pub fn insert_relation(&self, source: &str, target: &str, rel_type: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT OR IGNORE INTO concept_relations (source_id, target_id, relation_type) VALUES (?1,?2,?3)",
            params![source, target, rel_type],
        ).map_err(|e| format!("Insert relation: {}", e))?;
        Ok(())
    }

    pub fn get_graph(&self) -> Result<GraphData, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut nodes_stmt = conn.prepare("SELECT id, name, article_count FROM concepts ORDER BY article_count DESC LIMIT 50")
            .map_err(|e| format!("Prepare: {}", e))?;
        let nodes: Vec<GraphNode> = nodes_stmt.query_map([], |row| {
            Ok(GraphNode { id: row.get(0)?, name: row.get(1)?, count: row.get(2)? })
        }).map_err(|e| format!("Query: {}", e))?.filter_map(|r| r.ok()).collect();

        let mut edges_stmt = conn.prepare("SELECT source_id, target_id, relation_type FROM concept_relations LIMIT 200")
            .map_err(|e| format!("Prepare: {}", e))?;
        let edges: Vec<GraphEdge> = edges_stmt.query_map([], |row| {
            Ok(GraphEdge { source: row.get(0)?, target: row.get(1)?, relation: row.get(2)? })
        }).map_err(|e| format!("Query: {}", e))?.filter_map(|r| r.ok()).collect();

        Ok(GraphData { nodes, edges })
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  CONVERSATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn save_conversation(&self, conv: &Conversation) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let sources_json = serde_json::to_string(&conv.sources).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO conversations (id, query, response, sources, created_at) VALUES (?1,?2,?3,?4,?5)",
            params![conv.id, conv.query, conv.response, sources_json, conv.created_at],
        ).map_err(|e| format!("Save conv: {}", e))?;
        Ok(())
    }

    pub fn list_conversations(&self) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, query, created_at FROM conversations ORDER BY created_at DESC LIMIT 50")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "query": row.get::<_, String>(1)?,
                "created_at": row.get::<_, String>(2)?,
            }))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut convs = Vec::new();
        for row in rows { if let Ok(c) = row { convs.push(c); } }
        Ok(convs)
    }

    pub fn get_conversation_messages(&self, conv_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT query, response, sources, created_at FROM conversations WHERE id = ?1 ORDER BY created_at ASC")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map(params![conv_id], |row| {
            Ok(serde_json::json!({
                "query": row.get::<_, String>(0)?,
                "response": row.get::<_, String>(1)?,
                "sources": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut msgs = Vec::new();
        for row in rows { if let Ok(m) = row { msgs.push(m); } }
        Ok(msgs)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  TIMELINE & STATS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn get_timeline(&self) -> Result<Vec<TimelineEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, url, title, domain, summary, captured_at, word_count FROM articles ORDER BY captured_at DESC LIMIT 100")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?, row.get::<_, String>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?, row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
            ))
        }).map_err(|e| format!("Query: {}", e))?;

        let mut day_map: std::collections::BTreeMap<String, Vec<TimelineArticle>> = std::collections::BTreeMap::new();
        for row in rows {
            if let Ok((id, url, title, domain, summary, captured_at, word_count)) = row {
                let date = captured_at.split('T').next().unwrap_or("unknown").to_string();
                day_map.entry(date).or_default().push(TimelineArticle { id, url, title, domain, summary, captured_at, word_count });
            }
        }

        let mut timeline: Vec<TimelineEntry> = day_map.into_iter()
            .map(|(date, articles)| TimelineEntry { date, articles })
            .collect();
        timeline.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(timeline)
    }

    pub fn get_stats(&self) -> Result<Stats, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let total_articles: i64 = conn.query_row("SELECT COUNT(*) FROM articles", [], |r| r.get(0)).unwrap_or(0);
        let total_chunks: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0)).unwrap_or(0);
        let total_concepts: i64 = conn.query_row("SELECT COUNT(*) FROM concepts", [], |r| r.get(0)).unwrap_or(0);
        let total_words: i64 = conn.query_row("SELECT COALESCE(SUM(word_count), 0) FROM articles", [], |r| r.get(0)).unwrap_or(0);
        let streak_days: i64 = conn.query_row("SELECT COUNT(DISTINCT date(captured_at)) FROM articles", [], |r| r.get(0)).unwrap_or(0);

        // Top topics
        let mut topics_stmt = conn.prepare("SELECT name, article_count FROM concepts ORDER BY article_count DESC LIMIT 10").ok();
        let recent_topics = if let Some(ref mut stmt) = topics_stmt {
            stmt.query_map([], |row| {
                Ok(TopicCount { name: row.get(0)?, count: row.get(1)? })
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default()
        } else { vec![] };

        // Top domains
        let mut domain_stmt = conn.prepare("SELECT domain, COUNT(*) as cnt FROM articles GROUP BY domain ORDER BY cnt DESC LIMIT 10").ok();
        let top_domains = if let Some(ref mut stmt) = domain_stmt {
            stmt.query_map([], |row| {
                Ok(serde_json::json!({ "domain": row.get::<_, String>(0)?, "count": row.get::<_, i64>(1)? }))
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default()
        } else { vec![] };

        // Heatmap (last 365 days)
        let mut heatmap_stmt = conn.prepare(
            "SELECT date(captured_at) as day, COUNT(*) as cnt FROM articles GROUP BY day ORDER BY day DESC LIMIT 365"
        ).ok();
        let heatmap = if let Some(ref mut stmt) = heatmap_stmt {
            stmt.query_map([], |row| {
                Ok(HeatmapEntry { date: row.get(0)?, count: row.get(1)? })
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default()
        } else { vec![] };

        // Category trends
        let mut category_stmt = conn.prepare(
            "SELECT COALESCE(category, 'Uncategorized') as cat, COUNT(*) as cnt FROM articles GROUP BY cat ORDER BY cnt DESC LIMIT 10"
        ).ok();
        let category_trends = if let Some(ref mut stmt) = category_stmt {
            stmt.query_map([], |row| {
                Ok(CategoryTrend { category: row.get(0)?, count: row.get(1)? })
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default()
        } else { vec![] };

        Ok(Stats { 
            total_articles, total_chunks, total_concepts, total_words, streak_days, 
            recent_topics, top_domains, heatmap, category_trends 
        })
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  HEATMAP & CATEGORIES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn get_heatmap(&self) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT date(captured_at) as day, COUNT(*) as cnt, SUM(word_count) as words FROM articles GROUP BY day ORDER BY day DESC LIMIT 365"
        ).map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "date": row.get::<_, String>(0)?,
                "count": row.get::<_, i64>(1)?,
                "words": row.get::<_, i64>(2)?,
            }))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut heatmap = Vec::new();
        for row in rows { if let Ok(h) = row { heatmap.push(h); } }
        Ok(heatmap)
    }

    pub fn get_categories(&self) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT COALESCE(category, 'Uncategorized') as cat, COUNT(*) as cnt FROM articles GROUP BY cat ORDER BY cnt DESC"
        ).map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "name": row.get::<_, String>(0)?,
                "count": row.get::<_, i64>(1)?,
            }))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut cats = Vec::new();
        for row in rows { if let Ok(c) = row { cats.push(c); } }
        Ok(cats)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  SETTINGS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn get_setting(&self, key: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .map_err(|e| format!("Get setting: {}", e))
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", params![key, value])
            .map_err(|e| format!("Set setting: {}", e))?;
        Ok(())
    }

    pub fn get_settings(&self) -> Result<serde_json::Value, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut map = serde_json::Map::new();
        for row in rows {
            if let Ok((k, v)) = row {
                map.insert(k, serde_json::Value::String(v));
            }
        }
        Ok(serde_json::Value::Object(map))
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  HIGHLIGHTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    pub fn save_highlight(&self, article_id: &str, text: &str, note: Option<&str>) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO highlights (id, article_id, text, note, created_at) VALUES (?1,?2,?3,?4,?5)",
            params![id, article_id, text, note, now],
        ).map_err(|e| format!("Save highlight: {}", e))?;
        Ok(id)
    }

    pub fn get_highlights(&self, article_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare("SELECT id, text, note, created_at FROM highlights WHERE article_id = ?1 ORDER BY created_at DESC")
            .map_err(|e| format!("Prepare: {}", e))?;
        let rows = stmt.query_map(params![article_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "text": row.get::<_, String>(1)?,
                "note": row.get::<_, Option<String>>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        }).map_err(|e| format!("Query: {}", e))?;
        let mut highlights = Vec::new();
        for row in rows { if let Ok(h) = row { highlights.push(h); } }
        Ok(highlights)
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COSINE SIMILARITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() { return 0.0; }
    let (mut dot, mut na, mut nb) = (0.0f64, 0.0f64, 0.0f64);
    for (x, y) in a.iter().zip(b.iter()) {
        let (xf, yf) = (*x as f64, *y as f64);
        dot += xf * yf;
        na += xf * xf;
        nb += yf * yf;
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 { 0.0 } else { dot / denom }
}

impl Default for Stats {
    fn default() -> Self {
        Self {
            total_articles: 0, total_chunks: 0, total_concepts: 0,
            total_words: 0, streak_days: 0,
            recent_topics: vec![], top_domains: vec![],
            heatmap: vec![], category_trends: vec![],
        }
    }
}
