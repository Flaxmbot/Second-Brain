const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // App control
    getApiToken: () => ipcRenderer.invoke('getApiToken'),
    quitApp: () => ipcRenderer.invoke('quitApp'),
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),

    // Autostart
    setAutostart: (enabled) => ipcRenderer.invoke('setAutostart', enabled),
    getAutostart: () => ipcRenderer.invoke('getAutostart'),

    // Server API (direct calls to Express server)
    // These will be used by the React frontend
    api: {
        // Settings
        getSettings: async (token) => {
            const response = await fetch('http://127.0.0.1:11435/api/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        setSetting: async (token, key, value) => {
            const response = await fetch('http://127.0.0.1:11435/api/settings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key, value })
            });
            return response.json();
        },

        // Memories
        addMemory: async (token, data) => {
            const response = await fetch('http://127.0.0.1:11435/api/memory', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            return response.json();
        },

        getMemories: async (token, limit = 100, offset = 0) => {
            const response = await fetch(
                `http://127.0.0.1:11435/api/memories?limit=${limit}&offset=${offset}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            return response.json();
        },

        getMemory: async (token, id) => {
            const response = await fetch(`http://127.0.0.1:11435/api/memory/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        deleteMemory: async (token, id) => {
            const response = await fetch(`http://127.0.0.1:11435/api/memory/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        searchMemories: async (token, query) => {
            const response = await fetch(
                `http://127.0.0.1:11435/api/search?q=${encodeURIComponent(query)}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            return response.json();
        },

        // Graph
        addGraphNode: async (token, data) => {
            const response = await fetch('http://127.0.0.1:11435/api/graph/node', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            return response.json();
        },

        getGraphNodes: async (token, type = null) => {
            const url = type
                ? `http://127.0.0.1:11435/api/graph/nodes?type=${type}`
                : 'http://127.0.0.1:11435/api/graph/nodes';
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        addGraphEdge: async (token, data) => {
            const response = await fetch('http://127.0.0.1:11435/api/graph/edge', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            return response.json();
        },

        getGraphEdges: async (token, source = null, target = null) => {
            let url = 'http://127.0.0.1:11435/api/graph/edges?';
            if (source) url += `source=${source}&`;
            if (target) url += `target=${target}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        deleteGraphNode: async (token, nodeId) => {
            const response = await fetch(`http://127.0.0.1:11435/api/graph/node/${nodeId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        clearGraph: async (token) => {
            const response = await fetch('http://127.0.0.1:11435/api/graph', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        getStats: async (token) => {
            const response = await fetch('http://127.0.0.1:11435/api/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        // Ollama
        getOllamaStatus: async (token) => {
            const response = await fetch('http://127.0.0.1:11435/api/ollama/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        getOllamaModels: async (token) => {
            const response = await fetch('http://127.0.0.1:11435/api/ollama/models', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.json();
        },

        ask: async (token, question, context = []) => {
            const response = await fetch('http://127.0.0.1:11435/api/ask', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question, context })
            });
            return response.json();
        },

        chat: async (token, messages) => {
            const response = await fetch('http://127.0.0.1:11435/api/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messages })
            });
            return response.json();
        },

        embed: async (token, text, model = null) => {
            const response = await fetch('http://127.0.0.1:11435/api/embed', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text, model })
            });
            return response.json();
        }
    }
});

console.log('[Preload] Electron API exposed to renderer');
