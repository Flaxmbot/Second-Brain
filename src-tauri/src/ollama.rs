use reqwest::Client;
use serde::{Deserialize, Serialize};
use futures::StreamExt;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<u64>,
    pub digest: Option<String>,
}

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "http://localhost:11434".to_string(),
        }
    }

    /// Check if Ollama is running
    pub async fn check_status(&self) -> bool {
        self.client.get(&self.base_url)
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
            .is_ok()
    }

    /// List available models
    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, String> {
        let resp = self.client.get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map_err(|e| format!("Ollama connection failed: {}", e))?;

        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("Invalid response: {}", e))?;

        let models = data["models"].as_array()
            .map(|arr| arr.iter().map(|m| OllamaModel {
                name: m["name"].as_str().unwrap_or("unknown").to_string(),
                size: m["size"].as_u64(),
                digest: m["digest"].as_str().map(|s| s.to_string()),
            }).collect())
            .unwrap_or_default();

        Ok(models)
    }

    /// Generate embeddings
    pub async fn embed(&self, text: &str, model: &str) -> Result<Vec<f32>, String> {
        let body = serde_json::json!({
            "model": model,
            "prompt": text,
        });

        let resp = self.client.post(format!("{}/api/embeddings", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Embed failed: {}", e))?;

        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("Invalid embed response: {}", e))?;

        let embedding = data["embedding"].as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect())
            .unwrap_or_default();

        Ok(embedding)
    }

    /// Generate text (non-streaming, full response)
    pub async fn generate(&self, prompt: &str, model: &str) -> Result<String, String> {
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
        });

        let resp = self.client.post(format!("{}/api/generate", self.base_url))
            .json(&body)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| format!("Generate failed: {}", e))?;

        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("Invalid generate response: {}", e))?;

        data["response"].as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No response field".to_string())
    }

    /// Generate text with streaming — returns a channel receiver that yields tokens
    pub async fn generate_stream(
        &self,
        prompt: &str,
        model: &str,
    ) -> Result<mpsc::Receiver<Result<String, String>>, String> {
        let (tx, rx) = mpsc::channel::<Result<String, String>>(64);

        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": true,
        });

        let resp = self.client.post(format!("{}/api/generate", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Stream failed: {}", e))?;

        let mut stream = resp.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        // Process complete JSON lines
                        while let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer = buffer[newline_pos + 1..].to_string();

                            if line.is_empty() { continue; }

                            match serde_json::from_str::<serde_json::Value>(&line) {
                                Ok(data) => {
                                    if let Some(token) = data["response"].as_str() {
                                        if !token.is_empty() {
                                            if tx.send(Ok(token.to_string())).await.is_err() {
                                                return; // Receiver dropped
                                            }
                                        }
                                    }
                                    // Check if done
                                    if data["done"].as_bool().unwrap_or(false) {
                                        return;
                                    }
                                }
                                Err(_) => {} // Skip malformed lines
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(format!("Stream error: {}", e))).await;
                        return;
                    }
                }
            }
        });

        Ok(rx)
    }

    /// Chat with conversation history (non-streaming)
    pub async fn chat(&self, messages: &[ChatMessage], model: &str) -> Result<String, String> {
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
        });

        let resp = self.client.post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| format!("Chat failed: {}", e))?;

        let data: serde_json::Value = resp.json().await
            .map_err(|e| format!("Invalid chat response: {}", e))?;

        data["message"]["content"].as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No response content".to_string())
    }

    /// Chat with streaming — uses Ollama /api/chat with stream
    pub async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<mpsc::Receiver<Result<String, String>>, String> {
        let (tx, rx) = mpsc::channel::<Result<String, String>>(64);

        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        let resp = self.client.post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Chat stream failed: {}", e))?;

        let mut stream = resp.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();
            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer = buffer[newline_pos + 1..].to_string();
                            if line.is_empty() { continue; }

                            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&line) {
                                if let Some(token) = data["message"]["content"].as_str() {
                                    if !token.is_empty() {
                                        if tx.send(Ok(token.to_string())).await.is_err() {
                                            return;
                                        }
                                    }
                                }
                                if data["done"].as_bool().unwrap_or(false) {
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(format!("Stream error: {}", e))).await;
                        return;
                    }
                }
            }
        });

        Ok(rx)
    }
}

/// Chat message format for Ollama /api/chat
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,    // "system", "user", "assistant"
    pub content: String,
}
