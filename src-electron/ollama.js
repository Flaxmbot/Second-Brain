const OLLAMA_HOST = 'http://127.0.0.1:11434';

// Ollama API proxy functions
async function ollamaRequest(endpoint, body) {
    const url = `${OLLAMA_HOST}${endpoint}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[Ollama] Request error:', error.message);
        throw error;
    }
}

// Generate embeddings for a text
async function generateEmbedding(text, model = 'nomic-embed-text') {
    try {
        const response = await ollamaRequest('/api/embeddings', {
            model,
            prompt: text
        });

        return response.embedding;
    } catch (error) {
        console.error('[Ollama] Embedding generation error:', error.message);
        // Return null if embedding fails - app should handle gracefully
        return null;
    }
}

// Generate completion using Ollama
async function generateCompletion(prompt, model = 'llama3.2', options = {}) {
    const requestBody = {
        model,
        prompt,
        stream: false,
        ...options
    };

    try {
        const response = await ollamaRequest('/api/generate', requestBody);
        return response.response;
    } catch (error) {
        console.error('[Ollama] Completion generation error:', error.message);
        throw error;
    }
}

// Chat completion using Ollama
async function chatCompletion(messages, model = 'llama3.2', options = {}) {
    const requestBody = {
        model,
        messages,
        stream: false,
        ...options
    };

    try {
        const response = await ollamaRequest('/api/chat', requestBody);
        return response.message.content;
    } catch (error) {
        console.error('[Ollama] Chat completion error:', error.message);
        throw error;
    }
}

// Check if Ollama is running
async function checkOllamaStatus() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return {
                available: true,
                models: data.models || []
            };
        }

        console.error('[Ollama] Status check failed:', response.status, response.statusText);
        return { available: false, models: [], error: `Ollama status: ${response.status}` };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('[Ollama] Status check timed out');
            return { available: false, models: [], error: 'Timeout' };
        }
        console.error('[Ollama] Status check error:', error.message);
        return { available: false, models: [], error: error.message };
    }
}

// Get available models
async function getAvailableModels() {
    const status = await checkOllamaStatus();
    if (status && status.models) {
        // Filter out non-generative embedding models (e.g. nomic-embed-text)
        return status.models.filter(m => !m.name.includes('embed'));
    }
    return [];
}

// Proxy any Ollama request (for advanced usage)
async function proxyOllamaRequest(req, res) {
    const endpoint = req.params.endpoint || '';
    const url = `${OLLAMA_HOST}/api/${endpoint}`;

    try {
        const response = await fetch(url, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('[Ollama] Proxy error:', error.message);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    generateEmbedding,
    generateCompletion,
    chatCompletion,
    checkOllamaStatus,
    getAvailableModels,
    proxyOllamaRequest,
    OLLAMA_HOST
};
