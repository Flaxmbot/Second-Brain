use serde::{Deserialize, Serialize};

/// Article stored in memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Article {
    pub id: String,
    pub url: String,
    pub title: String,
    pub author: Option<String>,
    pub domain: String,
    pub content: String,
    pub summary: Option<String>,
    pub key_ideas: Option<Vec<String>>,
    pub captured_at: String,
    pub word_count: i64,
    pub source_type: String,
    pub category: Option<String>,
    pub reading_time_seconds: i64,
}

/// A chunk of article text with its embedding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub article_id: String,
    pub chunk_index: i64,
    pub text: String,
    pub embedding: Vec<f32>,
}

/// Concept node in the knowledge graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Concept {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub article_count: i64,
}

/// Edge between concepts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConceptRelation {
    pub source: String,
    pub target: String,
    pub relation_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
}

/// Knowledge graph data for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Capture request from extension
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureRequest {
    pub url: String,
    pub title: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineArticle {
    pub id: String,
    pub url: String,
    pub title: String,
    pub domain: String,
    pub summary: Option<String>,
    pub captured_at: String,
    pub word_count: i64,
}

/// Timeline entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEntry {
    pub date: String,
    pub articles: Vec<TimelineArticle>,
}

/// Dashboard stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub total_articles: i64,
    pub total_concepts: i64,
    pub total_chunks: i64,
    pub total_words: i64,
    pub streak_days: i64,
    pub recent_topics: Vec<TopicCount>,
    pub top_domains: Vec<serde_json::Value>,
    pub heatmap: Vec<HeatmapEntry>,
    pub category_trends: Vec<CategoryTrend>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapEntry {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryTrend {
    pub category: String,
    pub count: i64,
}

/// Conversation history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub query: String,
    pub response: String,
    pub sources: Vec<String>,
    pub created_at: String,
}
