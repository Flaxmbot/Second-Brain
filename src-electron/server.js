const express = require('express');
const cors = require('cors');
const {
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
    searchMemories,
    addSemanticNode,
    getSemanticNodes,
    addSemanticEdge,
    getSemanticEdges,
    clearSemanticGraph,
    createConversation,
    addMessage,
    getConversations,
    getConversationMessages,
    deleteMemory,
    deleteConversation,
    getMemoryByUrl,
    addTimeSpent
} = require('./db.js');
const {
    generateEmbedding,
    generateCompletion,
    chatCompletion,
    checkOllamaStatus,
    getAvailableModels
} = require('./ollama.js');

let apiToken = null;
const PORT = 11435;

const app = express();

// Middleware
app.use(cors({
    origin: '*', // Allow extension origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || token !== apiToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// Health check (no auth required)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Status (no auth required for basic check)
app.get('/api/status', async (req, res) => {
    try {
        const ollamaStatus = await checkOllamaStatus();
        res.json({
            status: 'ok',
            ollama: ollamaStatus.available,
            models: ollamaStatus.models.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extension auto-auth endpoints (no auth required)
app.get('/api/auth/token', (req, res) => {
    // Only return token to explicitly allowed local extension contexts 
    // Usually blocked by CORS in a real world, but our CORS configuration allows extensions
    res.json({ token: apiToken });
});

// Apply authentication to all OTHER /api routes
app.use('/api', authenticate);

// Settings endpoints
app.get('/api/settings', async (req, res) => {
    try {
        const settings = {
            ollamaModel: getSetting('ollama_model') || 'llama3.2',
            embeddingModel: getSetting('embedding_model') || 'nomic-embed-text',
            autoMemory: getSetting('auto_memory') || 'true',
            maxMemories: getSetting('max_memories') || '1000'
        };
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) {
            return res.status(400).json({ error: 'Key is required' });
        }

        setSetting(key, value);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Status and Stats
app.get('/api/stats', async (req, res) => {
    try {
        const count = getMemoryCount();
        const memories = getMemories(1, 0); // Get latest for timestamp
        res.json({
            total_articles: count,
            last_activity: memories.length > 0 ? memories[0].timestamp : null,
            db_size_mb: getDatabaseSize()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/timeline', async (req, res) => {
    try {
        const timeline = getTimeline();
        res.json({ timeline });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/highlights/:id', async (req, res) => {
    try {
        const highlights = getHighlights(parseInt(req.params.id));
        res.json({ highlights });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/related/:id', async (req, res) => {
    try {
        const related = getRelatedMemories(parseInt(req.params.id));
        res.json({ related });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/storage/stats', async (req, res) => {
    try {
        res.json({
            total_articles: getMemoryCount(),
            db_size_mb: getDatabaseSize()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/storage/clear', async (req, res) => {
    try {
        clearAllData();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Chrome Extension Compatibility Endpoints
// These endpoints match what the Chrome extension expects

// Check if URL already exists in memories
app.post('/api/check-url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const memoryId = getMemoryByUrl(url);
        res.json({ exists: !!memoryId, memory: memoryId ? { id: memoryId } : null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get/search articles (memories)
app.get('/api/articles', async (req, res) => {
    try {
        const search = req.query.search;
        let memories;

        if (search) {
            memories = searchMemories(search, 100);
        } else {
            memories = getMemories(100, 0);
        }

        // Convert to article format
        const articles = memories.map(m => ({
            id: m.id,
            url: m.url,
            title: m.title,
            content: m.content,
            timestamp: m.timestamp,
            created_at: m.created_at
        }));

        res.json({ articles, total: articles.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get a single article
app.get('/api/articles/:id', async (req, res) => {
    try {
        const memory = getMemory(req.params.id);
        if (!memory) return res.status(404).json({ error: 'Not found' });

        res.json({
            id: memory.id,
            title: memory.title || memory.url,
            url: memory.url,
            domain: memory.url ? new URL(memory.url).hostname : 'local',
            source_type: 'article',
            content: memory.content,
            word_count: memory.content ? memory.content.split(/\s+/).length : 0,
            time_spent: memory.time_spent || 0,
            captured_at: memory.timestamp,
            summary: memory.content ? memory.content.substring(0, 500) + '...' : ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Capture a page (add memory)
app.post('/api/capture', async (req, res) => {
    try {
        const { url, title, content } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Check if already captured using exact URL
        const existingId = getMemoryByUrl(url);
        if (existingId) {
            return res.json({ status: 'already_exists', id: existingId });
        }

        // Create memory content from title and content
        const memoryContent = title ? `${title}\n\n${content || ''}` : (content || '');

        const id = addMemory(memoryContent, url, title);

        // Asynchronously generate tags and summary in the background
        (async () => {
            try {
                let model = getSetting('ollama_model') || 'llama3.2';
                if (model.includes('embed')) model = 'llama3.2';

                const prompt = `You are a helpful assistant that categorizes web pages. 
                Task: Provide a 1-sentence summary ("Bottom Line") and 3-5 keywords ("Tags") for the following content.
                Format: Respond ONLY with a JSON object: {"summary": "...", "tags": ["tag1", "tag2"]}
                Content:
                Title: ${title}
                Snippet: ${content ? content.substring(0, 2000) : ''}`;

                const aiResp = await chatCompletion([{ role: 'user', content: prompt }], model);
                const result = JSON.parse(aiResp.substring(aiResp.indexOf('{'), aiResp.lastIndexOf('}') + 1));

                if (result.summary || result.tags) {
                    // Update the memory with AI insights
                    // Note: delete/add is how this db.js handles "updates" to keep things simple
                    const tagsStr = Array.isArray(result.tags) ? result.tags.join(', ') : '';
                    deleteMemory(id);
                    addMemory(memoryContent, url, title, null, tagsStr, result.summary);
                }
            } catch (e) {
                console.error('[AI Auto-Tag] Failed:', e.message);
            }
        })();

        res.json({ status: 'captured', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update time spent on a page
app.post('/api/memory/time', async (req, res) => {
    try {
        const { url, additionalTimeMs } = req.body;
        if (!url || typeof additionalTimeMs !== 'number') {
            return res.status(400).json({ error: 'url and additionalTimeMs are required' });
        }

        addTimeSpent(url, additionalTimeMs);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save highlight to existing memory
app.post('/api/highlights', async (req, res) => {
    try {
        const { article_id, text, url } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        // If article_id provided, append to existing memory
        if (article_id) {
            const memory = getMemory(article_id);
            if (memory) {
                const updatedContent = memory.content + '\n\n--- Highlight ---\n' + text;
                // Delete old and create new (since sql.js doesn't support UPDATE well)
                deleteMemory(article_id);
                addMemory(updatedContent, memory.url, memory.title);
                return res.json({ success: true });
            }
        }

        // If no article_id but url provided, find or create
        if (url) {
            const existing = searchMemories(url, 1);
            if (existing.length > 0) {
                const memory = getMemory(existing[0].id);
                const updatedContent = memory.content + '\n\n--- Highlight ---\n' + text;
                deleteMemory(memory.id);
                addMemory(updatedContent, memory.url, memory.title);
                return res.json({ success: true });
            }
        }

        // Just save as new memory
        const id = addMemory(text, url, 'Highlight');
        res.json({ success: true, id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Memory endpoints
app.post('/api/memory', async (req, res) => {
    try {
        const { content, url, title, generateEmbedding: genEmbed } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        let embedding = null;
        if (genEmbed) {
            const embedModel = getSetting('embedding_model') || 'nomic-embed-text';
            embedding = await generateEmbedding(content, embedModel);
        }

        const id = addMemory(content, url, title, embedding);

        // Background Auto-tagging if not provided
        if (!req.body.tags) {
            (async () => {
                try {
                    let model = getSetting('ollama_model') || 'llama3.2';
                    if (model.includes('embed')) model = 'llama3.2';
                    const prompt = `Analyze this text and return a JSON object with a 1-sentence "summary" and a list of "tags":\n\n${content.substring(0, 1000)}`;
                    const aiResp = await chatCompletion([{ role: 'user', content: prompt }], model);
                    const result = JSON.parse(aiResp.substring(aiResp.indexOf('{'), aiResp.lastIndexOf('}') + 1));
                    const tagsStr = Array.isArray(result.tags) ? result.tags.join(', ') : '';
                    deleteMemory(id);
                    addMemory(content, url, title, embedding, tagsStr, result.summary);
                } catch (e) { }
            })();
        }

        res.json({ id, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/memories', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const memories = getMemories(limit, offset);
        res.json(memories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/memory/:id', async (req, res) => {
    try {
        const memory = getMemory(parseInt(req.params.id));

        if (!memory) {
            return res.status(404).json({ error: 'Memory not found' });
        }

        res.json(memory);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/memory/:id', async (req, res) => {
    try {
        deleteMemory(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const memories = searchMemories(query);
        res.json(memories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Semantic graph endpoints
app.post('/api/graph/node', async (req, res) => {
    try {
        const { nodeId, label, type, metadata, generateEmbedding: genEmbed } = req.body;

        if (!nodeId || !label || !type) {
            return res.status(400).json({ error: 'nodeId, label, and type are required' });
        }

        let embedding = null;
        if (genEmbed) {
            const embedModel = getSetting('embedding_model') || 'nomic-embed-text';
            embedding = await generateEmbedding(label, embedModel);
        }

        addSemanticNode(nodeId, label, type, metadata, embedding);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/graph/nodes', async (req, res) => {
    try {
        const type = req.query.type || null;
        const nodes = getSemanticNodes(type);
        res.json(nodes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/graph/edge', async (req, res) => {
    try {
        const { sourceId, targetId, type, weight } = req.body;

        if (!sourceId || !targetId || !type) {
            return res.status(400).json({ error: 'sourceId, targetId, and type are required' });
        }

        addSemanticEdge(sourceId, targetId, type, weight || 1.0);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/graph/edges', async (req, res) => {
    try {
        const sourceId = req.query.source || null;
        const targetId = req.query.target || null;
        const edges = getSemanticEdges(sourceId, targetId);
        res.json(edges);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/graph/node/:nodeId', async (req, res) => {
    try {
        deleteSemanticNode(req.params.nodeId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/graph', async (req, res) => {
    try {
        clearSemanticGraph();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ollama endpoints
app.get('/api/ollama/status', async (req, res) => {
    try {
        const status = await checkOllamaStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/ollama/models', async (req, res) => {
    try {
        const models = await getAvailableModels();
        res.json(models);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ask', async (req, res) => {
    try {
        const { question, context } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        let model = getSetting('ollama_model') || 'llama3.2';
        if (model.includes('embed')) model = 'llama3.2';

        // Build prompt with context if provided
        let prompt = question;
        if (context && context.length > 0) {
            const contextText = context.map(m => m.content).join('\n\n');
            prompt = `Context:\n${contextText}\n\nQuestion: ${question}\n\nAnswer:`;
        }

        const answer = await generateCompletion(prompt, model);
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        let model = getSetting('ollama_model') || 'llama3.2';
        if (model.includes('embed')) model = 'llama3.2';
        const response = await chatCompletion(messages, model);
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Chat and Query Endpoints
app.get('/api/conversations', async (req, res) => {
    try {
        const conversations = getConversations();
        res.json({ conversations });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/graph/nodes', async (req, res) => {
    try {
        const nodes = getSemanticNodes();
        const formattedNodes = nodes.map(n => ({
            id: n.node_id,
            name: n.label,
            type: n.node_type,
            metadata: n.metadata
        }));
        res.json(formattedNodes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/graph/edges', async (req, res) => {
    try {
        const edges = getSemanticEdges();
        const formattedEdges = edges.map(e => ({
            source: e.source_id,
            target: e.target_id,
            relation: e.edge_type,
            weight: e.weight
        }));
        res.json(formattedEdges);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
        const messages = getConversationMessages(req.params.id);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/conversations/:id', async (req, res) => {
    try {
        deleteConversation(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/memory/:id', async (req, res) => {
    try {
        deleteMemory(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/memories/:id', async (req, res) => {
    try {
        deleteMemory(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/query/stream', async (req, res) => {
    let { query, model, conversation_id, history, use_semantic_search } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    // Safety cap on massive pasted queries
    if (query.length > 4000) {
        query = query.substring(0, 4000) + '... (truncated for limits)';
    }

    let currentModel = model || getSetting('ollama_model') || 'llama3.2';
    if (currentModel.includes('embed')) currentModel = 'llama3.2';
    const convId = conversation_id || Date.now().toString();
    const useSemantic = use_semantic_search !== false; // Default to true if not provided

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // If new conversation, create it
        if (!conversation_id) {
            createConversation(convId, query);
        }

        // Save user message
        addMessage(convId, 'user', query);

        let context = '';
        let sources = [];

        if (req.body.active_page && req.body.active_page.text) {
            // Truncate massively to save context size. Around 5000 chars is plenty context.
            const snippet = req.body.active_page.text.substring(0, 5000);
            context += `CURRENT TAB CONTENT:\nTitle: ${req.body.active_page.title}\nURL: ${req.body.active_page.url}\nPage Text (Snippet):\n${snippet}\n\n---\n\n`;
            sources.push({
                id: 'active',
                url: req.body.active_page.url,
                title: 'Current Tab: ' + req.body.active_page.title,
                domain: req.body.active_page.url ? new URL(req.body.active_page.url).hostname : 'local'
            });
        }

        if (useSemantic) {
            // Find relevant memories for context
            const memories = searchMemories(query, 10); // get more memories for better context
            if (memories && memories.length > 0) {
                context += memories.map(m => `Date Captured: ${new Date(m.timestamp).toLocaleString()}\\nTitle: ${m.title || 'Unknown'}\\nSource: ${m.url || 'local'}\\nContent: ${m.content ? m.content.substring(0, 2000) + '... (truncated)' : ''}`).join('\\n\\n---\\n\\n');
                sources = sources.concat(memories.map(m => ({
                    id: m.id,
                    url: m.url,
                    title: m.title,
                    domain: m.url ? new URL(m.url).hostname : 'local'
                })));
            }
        }

        if (sources.length > 0) {
            res.write(`data: ${JSON.stringify({ conversation_id: convId, sources })}\\n\\n`);
        } else {
            res.write(`data: ${JSON.stringify({ conversation_id: convId, sources: [] })}\\n\\n`);
        }

        let historyContext = '';
        if (history && history.length > 0) {
            // Take the last 6 messages max to avoid blowing up context, excluding the current query implicitly
            const recentHistory = history.slice(-6);
            historyContext = "\\n\\nRecent Conversation History:\\n" + recentHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join("\\n");
        }

        let prompt = `You are a helpful assistant with access to the user's internet memory and current browser tab. Use the provided Context and Recent Conversation History to answer their question. If the user asks to summarize, check the CURRENT TAB CONTENT first. If they ask about recent readings, check the memory Date Captured.\\n\\nContext:\\n${context}${historyContext}\\n\\nUser Question: ${query}\\n\\nAssistant:`;

        // We need a streaming version of chatCompletion or generateCompletion
        // For now, let's implement a simple stream proxy to Ollama
        const ollamaUrl = 'http://127.0.0.1:11434/api/generate';
        const response = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel,
                prompt: prompt,
                stream: true
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => 'No error text');
            throw new Error(`Ollama connection failed (${response.status}): ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullAnswer = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // The last element is a partial line (or empty string if ends with \n)
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.response) {
                        fullAnswer += data.response;
                        res.write(`data: ${JSON.stringify({ token: data.response })}\n\n`);
                    }
                } catch (e) {
                    console.error("Failed to parse JSON line from Ollama:", line);
                }
            }
        }

        // flush buffer if any
        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer);
                if (data.response) {
                    fullAnswer += data.response;
                    res.write(`data: ${JSON.stringify({ token: data.response })}\n\n`);
                }
            } catch (e) { }
        }

        // Save assistant message
        addMessage(convId, 'assistant', fullAnswer, sources);

        res.write(`data: ${JSON.stringify({ full_answer: fullAnswer })}\n\n`);
        res.end();

    } catch (error) {
        console.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.post('/api/embed', async (req, res) => {
    try {
        const { text, model } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const embedModel = model || getSetting('embedding_model') || 'nomic-embed-text';
        const embedding = await generateEmbedding(text, embedModel);

        if (!embedding) {
            return res.status(500).json({ error: 'Failed to generate embedding' });
        }

        res.json({ embedding });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
function startServer(token) {
    apiToken = token;

    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[Server] Express server running on 127.0.0.1:${PORT}`);
        console.log(`[Server] API token: ${apiToken.substring(0, 8)}...`);
    });
}

module.exports = { startServer };
