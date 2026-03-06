use axum::{
    Router,
    routing::{get, post, delete},
    extract::{State, Query, Request},
    http::StatusCode,
    response::{Response, sse::{Event, Sse}},
    middleware::{self, Next},
    Json,
};
use tower_http::cors::CorsLayer;
use axum::http::{HeaderValue, Method};
use std::sync::Arc;
use serde::Deserialize;
use futures::stream::Stream;
use std::convert::Infallible;
use crate::models::*;
use crate::db::Database;
use crate::ollama::{OllamaClient, ChatMessage};

/// Shared state for the Axum HTTP server
pub struct ServerState {
    pub db: Arc<Database>,
    pub ollama: Arc<OllamaClient>,
}

/// Start the HTTP server
pub async fn start_extension_server(db: Arc<Database>, ollama: Arc<OllamaClient>, shutdown_rx: tokio::sync::oneshot::Receiver<()>) {
    let state = Arc::new(ServerState { db, ollama });

    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:1420".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:1420".parse::<HeaderValue>().unwrap(),
            "http://localhost:11435".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ]);

    let app = Router::new()
        // Health
        .route("/api/status", get(status_handler))
        // Ollama
        .route("/api/models", get(models_handler))
        // Capture
        .route("/api/capture", post(capture_handler))
        .route("/api/check-url", post(check_url_handler))
        // AI Query
        .route("/api/query", post(query_handler))
        .route("/api/query/stream", post(query_stream_handler))
        // Conversations
        .route("/api/conversations", get(list_conversations_handler))
        .route("/api/conversations", post(create_conversation_handler))
        .route("/api/conversations/:id/messages", get(get_messages_handler))
        // Data
        .route("/api/articles", get(articles_handler))
        .route("/api/articles/:id", get(get_article_handler))
        .route("/api/articles/:id", delete(delete_article_handler))
        .route("/api/timeline", get(timeline_handler))
        .route("/api/stats", get(stats_handler))
        .route("/api/graph", get(graph_handler))
        // Advanced
        .route("/api/heatmap", get(heatmap_handler))
        .route("/api/digest", get(digest_handler))
        .route("/api/search", get(search_handler))
        .route("/api/categories", get(categories_handler))
        .route("/api/related/:id", get(related_handler))
        // Highlights
        .route("/api/highlights/:id", get(get_highlights_handler))
        .route("/api/highlights", post(create_highlight_handler))
        // Settings
        .route("/api/settings", get(get_settings_handler))
        .route("/api/settings", post(update_settings_handler))
        .route("/api/settings/blocklist", post(update_blocklist_handler))
        // Import/Export
        .route("/api/export", get(export_handler))
        .route("/api/import", post(import_handler))
        // Storage
        .route("/api/storage/stats", get(storage_stats_handler))
        .route("/api/storage/clear", post(clear_history_handler))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:11435")
        .await
        .expect("Failed to bind extension server on port 11435");

    log::info!("Extension server running on http://127.0.0.1:11435");

    let server = axum::serve(listener, app);
    let graceful = server.with_graceful_shutdown(async move {
        let _ = shutdown_rx.await;
        log::info!("Shutting down extension server gracefully...");
    });
    
    graceful.await.ok();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HEALTH & MODELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn status_handler(State(state): State<Arc<ServerState>>) -> Json<serde_json::Value> {
    let ollama_ok = state.ollama.check_status().await;
    let stats = state.db.get_stats().unwrap_or_default();
    Json(serde_json::json!({
        "status": "ok",
        "service": "Internet Memory",
        "version": "0.1.0",
        "ollama": ollama_ok,
        "memories": stats.total_articles,
    }))
}

async fn models_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let models = state.ollama.list_models().await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e))?;
    Ok(Json(serde_json::json!({ "models": models })))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CAPTURE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn capture_handler(
    State(state): State<Arc<ServerState>>,
    Json(req): Json<CaptureRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let domain = url::Url::parse(&req.url)
        .map(|u| u.host_str().unwrap_or("unknown").to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let title = req.title.unwrap_or_else(|| "Untitled".to_string());
    let clean_text = extract_text_from_html(&req.content);
    let word_count = clean_text.split_whitespace().count() as i64;

    if word_count < 30 {
        return Ok(Json(serde_json::json!({
            "status": "skipped",
            "reason": "too_short",
            "word_count": word_count
        })));
    }

    // Detect source type from URL/content
    let source_type = detect_source_type(&req.url, &clean_text);
    
    // Auto-categorize
    let category = if state.db.get_setting("auto_categorize").unwrap_or_else(|_| "true".to_string()) == "true" {
        Some(auto_categorize_text(&clean_text))
    } else {
        None
    };

    let article_id = uuid::Uuid::new_v4().to_string();
    let captured_at = chrono::Utc::now().to_rfc3339();

    let article = Article {
        id: article_id.clone(),
        url: req.url.clone(),
        title: title.clone(),
        author: None,
        domain,
        content: clean_text.clone(),
        summary: None,
        key_ideas: None,
        captured_at,
        word_count,
        source_type,
        category,
        reading_time_seconds: (word_count / 200) * 60, // Rough estimate: 200 wpm
    };

    state.db.insert_article(&article)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    log::info!("Captured: {} ({} words)", title, word_count);

    // Background processing
    let s = state.clone();
    let aid = article_id.clone();
    let t = title.clone();
    let txt = clean_text;
    tokio::spawn(async move {
        process_article_background(s, aid, t, txt).await;
    });

    Ok(Json(serde_json::json!({
        "status": "captured",
        "id": article_id,
        "word_count": word_count
    })))
}

#[derive(Deserialize)]
struct CheckUrlBody { url: String }

async fn check_url_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<CheckUrlBody>,
) -> Json<serde_json::Value> {
    let exists = state.db.url_exists(&body.url).unwrap_or(false);
    Json(serde_json::json!({ "exists": exists }))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI QUERY (Non-Streaming)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Deserialize)]
struct QueryBody {
    query: String,
    model: Option<String>,
    conversation_id: Option<String>,
    history: Option<Vec<HistoryMessage>>,
}

#[derive(Deserialize)]
struct HistoryMessage {
    role: String,
    content: String,
}

async fn query_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<QueryBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let llm_model = resolve_model(&state, body.model.as_deref()).await?;

    // Semantic + keyword search
    let (context, source_ids) = build_context(&state, &body.query).await?;

    // Build chat messages with history
    let messages = build_chat_messages(&body.query, &context, body.history.as_deref());

    // Generate answer
    let answer = state.ollama.chat(&messages, &llm_model).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Generation failed: {}", e)))?;

    // Get sources
    let sources = get_source_articles(&state, &source_ids).await;

    // Save conversation
    let conv_id = body.conversation_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let conv = Conversation {
        id: conv_id.clone(),
        query: body.query.clone(),
        response: answer.clone(),
        sources: source_ids,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = state.db.save_conversation(&conv);

    Ok(Json(serde_json::json!({
        "answer": answer,
        "sources": sources,
        "model": llm_model,
        "conversation_id": conv_id
    })))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI QUERY (Streaming SSE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn query_stream_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<QueryBody>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, String)> {
    let llm_model = resolve_model(&state, body.model.as_deref()).await?;

    // Search context
    let (context, source_ids) = build_context(&state, &body.query).await?;

    // Build messages
    let messages = build_chat_messages(&body.query, &context, body.history.as_deref());

    // Start streaming from Ollama
    let mut rx = state.ollama.chat_stream(&messages, &llm_model).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Get sources for final event
    let sources = get_source_articles(&state, &source_ids).await;

    // Save conversation in background
    let db = state.db.clone();
    let query_text = body.query.clone();
    let conv_id = body.conversation_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let conv_id_clone = conv_id.clone();
    let source_ids_clone = source_ids.clone();

    let stream = async_stream::stream! {
        let mut full_answer = String::new();

        // Send conversation ID first
        yield Ok(Event::default()
            .event("start")
            .data(serde_json::json!({
                "conversation_id": conv_id,
                "model": llm_model
            }).to_string()));

        // Stream tokens
        while let Some(token_result) = rx.recv().await {
            match token_result {
                Ok(token) => {
                    full_answer.push_str(&token);
                    yield Ok(Event::default()
                        .event("token")
                        .data(serde_json::json!({ "token": token }).to_string()));
                }
                Err(e) => {
                    yield Ok(Event::default()
                        .event("error")
                        .data(serde_json::json!({ "error": e }).to_string()));
                    break;
                }
            }
        }

        // Send sources at the end
        yield Ok(Event::default()
            .event("sources")
            .data(serde_json::json!({ "sources": sources }).to_string()));

        // Done event
        yield Ok(Event::default()
            .event("done")
            .data(serde_json::json!({
                "full_answer": full_answer.clone()
            }).to_string()));

        // Save conversation
        let conv = Conversation {
            id: conv_id_clone,
            query: query_text,
            response: full_answer,
            sources: source_ids_clone,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = db.save_conversation(&conv);
    };

    Ok(Sse::new(stream))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONVERSATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn list_conversations_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let convs = state.db.list_conversations()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "conversations": convs })))
}

async fn create_conversation_handler(
    State(_state): State<Arc<ServerState>>,
) -> Json<serde_json::Value> {
    let id = uuid::Uuid::new_v4().to_string();
    Json(serde_json::json!({
        "id": id,
        "created_at": chrono::Utc::now().to_rfc3339()
    }))
}

async fn get_messages_handler(
    State(state): State<Arc<ServerState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let messages = state.db.get_conversation_messages(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "messages": messages })))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ARTICLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Deserialize)]
struct ArticleQuery {
    page: Option<i64>,
    source_type: Option<String>,
    search: Option<String>,
    category: Option<String>,
    rerank: Option<bool>,
}

async fn articles_handler(
    State(state): State<Arc<ServerState>>,
    Query(params): Query<ArticleQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if let Some(ref search) = params.search {
        let mut articles = state.db.search_articles(search)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
            
        if params.rerank.unwrap_or(false) && articles.len() > 1 {
            articles = rerank_results(&state, search, articles).await;
        }
        
        return Ok(Json(serde_json::json!({ "articles": articles })));
    }

    let articles = state.db.get_articles(
        params.page.unwrap_or(1), 20, params.source_type.as_deref(),
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "articles": articles })))
}

async fn get_article_handler(
    State(state): State<Arc<ServerState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let article = state.db.get_article(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "article": article })))
}

async fn delete_article_handler(
    State(state): State<Arc<ServerState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    state.db.delete_article(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "status": "deleted" })))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIMELINE, STATS, GRAPH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn timeline_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let timeline = state.db.get_timeline()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "timeline": timeline })))
}

async fn stats_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let stats = state.db.get_stats()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!(stats)))
}

async fn graph_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let graph = state.db.get_graph()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!(graph)))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ADVANCED: HEATMAP, DIGEST, SEARCH, CATEGORIES, RELATED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Handlers moved to bottom of file or replaced by specialized logic

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn get_settings_handler(
    State(state): State<Arc<ServerState>>,
) -> Json<serde_json::Value> {
    let settings = state.db.get_settings().unwrap_or_default();
    Json(settings)
}

#[derive(Deserialize)]
struct SettingsBody {
    capture_enabled: Option<bool>,
    embed_model: Option<String>,
    theme: Option<String>,
    accent_color: Option<String>,
    auto_categorize: Option<bool>,
}

async fn update_settings_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<SettingsBody>,
) -> Json<serde_json::Value> {
    if let Some(v) = body.capture_enabled { let _ = state.db.set_setting("capture_enabled", &v.to_string()); }
    if let Some(ref v) = body.embed_model { let _ = state.db.set_setting("embed_model", v); }
    if let Some(ref v) = body.theme { let _ = state.db.set_setting("theme", v); }
    if let Some(ref v) = body.accent_color { let _ = state.db.set_setting("accent_color", v); }
    if let Some(v) = body.auto_categorize { let _ = state.db.set_setting("auto_categorize", &v.to_string()); }
    Json(serde_json::json!({ "status": "updated" }))
}

#[derive(Deserialize)]
struct BlocklistBody {
    domains: Vec<String>,
}

async fn update_blocklist_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<BlocklistBody>,
) -> Json<serde_json::Value> {
    let _ = state.db.set_setting("blocklist", &serde_json::to_string(&body.domains).unwrap_or_default());
    Json(serde_json::json!({ "status": "updated" }))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  IMPORT / EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn export_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let articles = state.db.get_all_articles()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let conversations = state.db.list_conversations()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "articles": articles,
        "conversations": conversations,
    })))
}

#[derive(Deserialize)]
struct ImportBody {
    articles: Option<Vec<Article>>,
}

async fn import_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<ImportBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut imported = 0;
    if let Some(articles) = body.articles {
        for article in articles {
            if !state.db.url_exists(&article.url).unwrap_or(true) {
                let _ = state.db.insert_article(&article);
                imported += 1;
            }
        }
    }
    Ok(Json(serde_json::json!({ "imported": imported })))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn resolve_model(state: &Arc<ServerState>, model: Option<&str>) -> Result<String, (StatusCode, String)> {
    if let Some(m) = model {
        return Ok(m.to_string());
    }
    match state.ollama.list_models().await {
        Ok(models) => models.iter()
            .find(|m| !m.name.contains("embed"))
            .map(|m| m.name.clone())
            .ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, "No generation model found. Pull one with: ollama pull llama3.2:3b".to_string())),
        Err(e) => Err((StatusCode::SERVICE_UNAVAILABLE, format!("Ollama offline: {}", e))),
    }
}

async fn resolve_model_quiet(state: &Arc<ServerState>) -> Option<String> {
    state.ollama.list_models().await.ok()
        .and_then(|models| models.iter().find(|m| !m.name.contains("embed")).map(|m| m.name.clone()))
}

async fn rerank_results(state: &Arc<ServerState>, query: &str, articles: Vec<Article>) -> Vec<Article> {
    if articles.is_empty() { return articles; }
    
    let model = match resolve_model_quiet(state).await {
        Some(m) => m,
        None => return articles,
    };

    // Limit to top 15 for reranking to avoid context window issues
    let candidates = articles.iter().take(15).collect::<Vec<_>>();
    let titles: Vec<String> = candidates.iter().map(|a| format!("ID: {} | Title: {}", a.id, a.title)).collect();
    
    let prompt = format!(
        "Rank the following articles by relevance to the query: \"{}\"\n\
        Return ONLY the IDs (e.g. uuid-1, uuid-2) separated by commas, from most to least relevant.\n\n\
        Articles:\n{}",
        query, titles.join("\n")
    );

    if let Ok(response) = state.ollama.generate(&prompt, &model).await {
        let order: Vec<String> = response.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        
        let mut reranked = Vec::new();
        for id in order {
            // Try to find the article by ID (handling potential weird formatting from LLM)
            if let Some(article) = articles.iter().find(|a| id.contains(&a.id) || a.id.contains(&id)) {
                if !reranked.iter().any(|r: &Article| r.id == article.id) {
                    reranked.push(article.clone());
                }
            }
        }
        // Add remaining articles that weren't picked or were past the 15 limit
        for article in articles {
            if !reranked.iter().any(|r: &Article| r.id == article.id) {
                reranked.push(article);
            }
        }
        return reranked;
    }

    articles
}

async fn build_context(state: &Arc<ServerState>, query: &str) -> Result<(String, Vec<String>), (StatusCode, String)> {
    let embed_model = state.db.get_setting("embed_model").unwrap_or_else(|_| "nomic-embed-text".to_string());

    // Semantic search
    let query_embedding = state.ollama.embed(query, &embed_model).await.unwrap_or_default();
    let similar = if !query_embedding.is_empty() {
        state.db.search_similar(&query_embedding, 8)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?
    } else {
        vec![]
    };

    let mut context_parts: Vec<String> = Vec::new();
    let mut source_ids: Vec<String> = Vec::new();

    for (article_id, chunk_text, score) in &similar {
        if *score > 0.25 {
            if !source_ids.contains(article_id) {
                source_ids.push(article_id.clone());
            }
            let idx = source_ids.iter().position(|id| id == article_id).unwrap() + 1;
            context_parts.push(format!("[Source {}] {}", idx, chunk_text));
        }
    }

    // Keyword fallback
    let keyword = state.db.search_articles(query).unwrap_or_default();
    for article in &keyword {
        if !source_ids.contains(&article.id) && source_ids.len() < 8 {
            source_ids.push(article.id.clone());
            let idx = source_ids.len();
            let snippet: String = article.content.chars().take(500).collect();
            context_parts.push(format!("[Source {}] {}: {}", idx, article.title, snippet));
        }
    }

    let context = if context_parts.is_empty() {
        "No relevant content found in the user's reading history.".to_string()
    } else {
        context_parts.join("\n\n---\n\n")
    };

    Ok((context, source_ids))
}

fn build_chat_messages(query: &str, context: &str, history: Option<&[HistoryMessage]>) -> Vec<ChatMessage> {
    let mut messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: format!(
                "You are Internet Memory — a personal knowledge assistant that helps users recall and connect information from their reading history. \
                You have access to the following context from their saved articles.\n\n\
                IMPORTANT RULES:\n\
                1. Use **markdown** formatting: headers, bold, lists, code blocks\n\
                2. Use **LaTeX** notation ($$...$$) for any mathematical expressions\n\
                3. **CITE SOURCES** using [1], [2], etc. strictly based on the provided [Source X] labels in the context.\n\
                4. If the context doesn't contain relevant info, say so honestly\n\
                5. Be concise but thorough. Group related ideas.\n\
                6. Use bullet points for lists of items\n\n\
                Context from reading history:\n{}", context
            ),
        },
    ];

    // Add conversation history for multi-turn
    if let Some(hist) = history {
        for msg in hist {
            messages.push(ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: query.to_string(),
    });

    messages
}

async fn get_source_articles(state: &Arc<ServerState>, source_ids: &[String]) -> Vec<serde_json::Value> {
    let mut sources = Vec::new();
    for id in source_ids.iter().take(5) {
        if let Ok(Some(article)) = state.db.get_article(id) {
            sources.push(serde_json::json!({
                "id": article.id,
                "title": article.title,
                "url": article.url,
                "domain": article.domain,
                "summary": article.summary,
            }));
        }
    }
    sources
}

/// Background: embed, summarize, extract concepts, auto-categorize
async fn process_article_background(state: Arc<ServerState>, article_id: String, title: String, clean_text: String) {
    let embed_model = state.db.get_setting("embed_model").unwrap_or_else(|_| "nomic-embed-text".to_string());
    let chunks = chunk_text(&clean_text, 500, 50);

    for (i, ct) in chunks.iter().enumerate() {
        let embedding = state.ollama.embed(ct, &embed_model).await.unwrap_or_default();
        let chunk = Chunk {
            id: uuid::Uuid::new_v4().to_string(),
            article_id: article_id.clone(),
            chunk_index: i as i64,
            text: ct.clone(),
            embedding,
        };
        let _ = state.db.insert_chunk(&chunk);
    }

    let model = match resolve_model_quiet(&state).await {
        Some(m) => m,
        None => return,
    };

    // Summary
    let sum_prompt = format!(
        "Summarize this article in 2-3 concise sentences. Return ONLY the summary.\n\nTitle: {}\nContent: {}",
        title, &clean_text[..clean_text.len().min(3000)]
    );
    if let Ok(summary) = state.ollama.generate(&sum_prompt, &model).await {
        let _ = state.db.update_article_summary(&article_id, &summary);
    }

    // Concepts
    let concept_prompt = format!(
        "Extract 3-5 main topics from this article as a JSON array of strings. Return ONLY the JSON array.\n\nTitle: {}\nContent: {}",
        title, &clean_text[..clean_text.len().min(2000)]
    );
    if let Ok(concepts_str) = state.ollama.generate(&concept_prompt, &model).await {
        if let Ok(concepts) = serde_json::from_str::<Vec<String>>(concepts_str.trim()) {
            let mut cids = Vec::new();
            for name in &concepts {
                if let Ok(cid) = state.db.upsert_concept(name, None) {
                    cids.push(cid);
                }
            }
            for i in 0..cids.len() {
                for j in (i+1)..cids.len() {
                    let _ = state.db.insert_relation(&cids[i], &cids[j], "related");
                }
            }
        }
    }

    // Auto-categorize
    let auto_cat = state.db.get_setting("auto_categorize").unwrap_or_else(|_| "true".to_string());
    if auto_cat == "true" {
        let cat_prompt = format!(
            "Categorize this article into ONE category from this list: Technology, Science, Business, Health, Education, Entertainment, Politics, Sports, Design, Philosophy, Other. Return ONLY the category name.\n\nTitle: {}\nContent: {}",
            title, &clean_text[..clean_text.len().min(1000)]
        );
        if let Ok(category) = state.ollama.generate(&cat_prompt, &model).await {
            let cat = category.trim().to_string();
            let _ = state.db.set_article_category(&article_id, &cat);
        }
    }

    // Calculate reading time
    let word_count = clean_text.split_whitespace().count();
    let reading_time = (word_count as i64 / 200).max(1); // 200 words per minute average
    let _ = state.db.update_article_reading_time(&article_id, reading_time * 60);

    log::info!("Background processing complete for: {}", title);
}

fn extract_text_from_html(html: &str) -> String {
    use scraper::{Html, Selector};
    let document = Html::parse_document(html);
    let selectors = ["article", "main", "[role=\"main\"]", ".content", ".post-content", ".article-body", "body"];

    for sel_str in &selectors {
        if let Ok(selector) = Selector::parse(sel_str) {
            let texts: Vec<String> = document.select(&selector)
                .flat_map(|el| el.text())
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect();
            if !texts.is_empty() {
                let combined = texts.join(" ");
                if combined.len() > 100 {
                    return clean_whitespace(&combined);
                }
            }
        }
    }

    let all: Vec<String> = document.root_element().text()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    clean_whitespace(&all.join(" "))
}

fn clean_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<&str>>().join(" ")
}

/// Sentence-aware text chunking for better semantic coherence.
/// Splits on sentence boundaries when possible, falling back to word boundaries.
fn chunk_text(text: &str, target_words: usize, overlap_words: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() <= target_words { return vec![words.join(" ")]; }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < words.len() {
        let raw_end = (start + target_words).min(words.len());

        // Try to find a sentence boundary near the target end
        let end = if raw_end < words.len() {
            // Look backwards from raw_end for a sentence-ending word (ends with . ! ?)
            let search_start = if raw_end > 50 { raw_end - 50 } else { start };
            let mut best = raw_end;
            for i in (search_start..raw_end).rev() {
                let w = words[i];
                if w.ends_with('.') || w.ends_with('!') || w.ends_with('?') {
                    best = i + 1; // include the sentence-ending word
                    break;
                }
            }
            // Only use sentence boundary if it captures at least 60% of target
            if best > start && (best - start) >= target_words * 3 / 5 {
                best
            } else {
                raw_end
            }
        } else {
            raw_end
        };

        chunks.push(words[start..end].join(" "));
        if end >= words.len() { break; }

        // Overlap: go back overlap_words from the end
        start = if end > overlap_words { end - overlap_words } else { end };
    }
    chunks
}

/// Keyword-based quick categorization. Used as an instant fallback;
/// the LLM-based categorization in `process_article_background` upgrades it later.
fn auto_categorize_text(text: &str) -> String {
    let lower = text.to_lowercase();
    
    // Score-based: count matches per category, pick the highest
    let categories: &[(&str, &[&str])] = &[
        ("AI/ML", &["artificial intelligence", "machine learning", "deep learning", "neural network", "llm", "chatgpt", "transformer", "diffusion", "embedding"]),
        ("Development", &["programming", "rust", "javascript", "python", "typescript", "coding", "software", "api", "framework", "compiler", "git", "docker", "kubernetes"]),
        ("Science", &["science", "physics", "biology", "chemistry", "quantum", "genome", "climate", "space", "nasa", "research paper"]),
        ("Finance", &["finance", "stock market", "economy", "investing", "crypto", "bitcoin", "blockchain", "trading", "gdp"]),
        ("Health", &["health", "medical", "fitness", "nutrition", "mental health", "disease", "vaccine", "therapy", "diagnosis"]),
        ("Design", &["design", "typography", "ui/ux", "figma", "color palette", "layout", "illustration", "branding"]),
        ("Education", &["education", "learning", "tutorial", "course", "university", "lecture", "textbook", "curriculum"]),
        ("News", &["news", "politics", "government", "election", "legislation", "congress", "parliament"]),
        ("Entertainment", &["movie", "music", "game", "streaming", "netflix", "album", "concert", "esports"]),
        ("Philosophy", &["philosophy", "ethics", "consciousness", "existential", "epistemology", "moral"]),
    ];

    let mut best_cat = "General";
    let mut best_score = 0usize;

    for (cat, keywords) in categories {
        let score: usize = keywords.iter().filter(|kw| lower.contains(*kw)).count();
        if score > best_score {
            best_score = score;
            best_cat = cat;
        }
    }

    best_cat.to_string()
}

fn detect_source_type(url: &str, text: &str) -> String {
    let url_lower = url.to_lowercase();
    if url_lower.contains("youtube.com") || url_lower.contains("youtu.be") { return "video".to_string(); }
    if url_lower.ends_with(".pdf") || url_lower.contains("/pdf/") { return "pdf".to_string(); }
    if url_lower.contains("arxiv.org") { return "paper".to_string(); }
    if url_lower.contains("github.com") { return "code".to_string(); }
    if url_lower.contains("twitter.com") || url_lower.contains("x.com") { return "social".to_string(); }
    if url_lower.contains("stackoverflow.com") { return "qa".to_string(); }
    if url_lower.contains("reddit.com") { return "discussion".to_string(); }
    
    // Fallback to text detection for potential PDFs open in viewer but without .pdf in URL
    if text.starts_with("%PDF") { return "pdf".to_string(); }
    
    "article".to_string()
}

pub async fn auth_middleware(
    State(state): State<Arc<ServerState>>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if req.uri().path() == "/api/status" {
        return Ok(next.run(req).await);
    }
    
    let db_token = state.db.get_setting("api_token")
        .unwrap_or_else(|_| "unknown".to_string());

    if let Some(auth_header) = req.headers().get(axum::http::header::AUTHORIZATION) {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str == format!("Bearer {}", db_token) {
                return Ok(next.run(req).await);
            }
        }
    }

    log::warn!("Unauthorized API access attempt to {}", req.uri().path());
    Err(StatusCode::UNAUTHORIZED)
}

async fn heatmap_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let data = state.db.get_heatmap()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "heatmap": data })))
}

async fn categories_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let data = state.db.get_categories()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "categories": data })))
}

/// Daily reading digest — summarizes recent articles using LLM
async fn digest_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let articles = state.db.get_articles_by_date(&today)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    if articles.is_empty() {
        return Ok(Json(serde_json::json!({
            "date": today,
            "summary": "No articles captured today.",
            "article_count": 0,
            "topics": [],
        })));
    }

    // Build a brief overview
    let titles: Vec<String> = articles.iter().map(|a| {
        format!("- {} ({})", a.title, a.domain)
    }).collect();
    let article_count = articles.len();

    // Try to generate an AI summary
    let summary = if let Some(model) = resolve_model_quiet(&state).await {
        let prompt = format!(
            "Summarize today's reading in 3-4 sentences. Identify key themes.\n\nArticles read today:\n{}",
            titles.join("\n")
        );
        state.ollama.generate(&prompt, &model).await.unwrap_or_else(|_| {
            format!("You read {} articles today across various topics.", article_count)
        })
    } else {
        format!("You read {} articles today.", article_count)
    };

    // Extract unique categories
    let topics: Vec<String> = articles.iter()
        .filter_map(|a| a.category.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter().collect();

    Ok(Json(serde_json::json!({
        "date": today,
        "summary": summary,
        "article_count": article_count,
        "topics": topics,
        "articles": titles,
    })))
}

/// Full-text search endpoint — combines keyword search + semantic vector search
#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    semantic: Option<bool>,
}

async fn search_handler(
    State(state): State<Arc<ServerState>>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let query = params.q.unwrap_or_default();
    if query.trim().is_empty() {
        return Ok(Json(serde_json::json!({ "results": [], "query": "" })));
    }

    // Keyword search
    let mut results = state.db.search_articles(&query)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Semantic search (if enabled and Ollama available)
    if params.semantic.unwrap_or(true) {
        let embed_model = state.db.get_setting("embed_model")
            .unwrap_or_else(|_| "nomic-embed-text".to_string());
        if let Ok(embedding) = state.ollama.embed(&query, &embed_model).await {
            if !embedding.is_empty() {
                if let Ok(similar) = state.db.search_similar(&embedding, 10) {
                    for (article_id, _text, score) in similar {
                        if score > 0.3 && !results.iter().any(|a| a.id == article_id) {
                            if let Ok(Some(article)) = state.db.get_article(&article_id) {
                                results.push(article);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "results": results,
        "query": query,
        "count": results.len(),
    })))
}

async fn related_handler(
    State(state): State<Arc<ServerState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let related = state.db.get_related_articles(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "related": related })))
}

#[derive(Deserialize)]
struct HighlightBody {
    article_id: String,
    text: String,
    note: Option<String>,
}

async fn create_highlight_handler(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<HighlightBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let id = state.db.save_highlight(&body.article_id, &body.text, body.note.as_deref())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "status": "created", "id": id })))
}

async fn get_highlights_handler(
    State(state): State<Arc<ServerState>>,
    axum::extract::Path(article_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let highlights = state.db.get_highlights(&article_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(serde_json::json!({ "highlights": highlights })))
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STORAGE MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn storage_stats_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let stats = state.db.get_stats().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let size_mb = state.db.get_db_size();

    Ok(Json(serde_json::json!({
        "total_articles": stats.total_articles,
        "total_chunks": stats.total_chunks,
        "db_size_mb": format!("{:.2}", size_mb),
    })))
}

async fn clear_history_handler(
    State(state): State<Arc<ServerState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // This is a destructive action, typically would require more confirmation in UI
    // For now, we clear conversations and non-starred articles if we had stars, but let's just clear all.
    let conn = state.db.get_conn().lock().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    conn.execute_batch("
        DELETE FROM chunks;
        DELETE FROM highlights;
        DELETE FROM articles;
        DELETE FROM conversations;
        VACUUM;
    ").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "success", "message": "All history cleared and database optimized." })))
}
