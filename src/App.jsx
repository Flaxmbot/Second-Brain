import React, { useState, useEffect } from 'react';
import { VisualGraphView } from './components/VisualGraphView';
import './App.css';

// Check if we're running in Electron
const isElectron = !!window.electronAPI;

function App() {
    const [view, setView] = useState('dashboard');
    const [apiToken, setApiToken] = useState('Loading...');
    const [copyStatus, setCopyStatus] = useState('Copy Token');
    const [ollamaStatus, setOllamaStatus] = useState({ available: false, models: [] });
    const [availableModels, setAvailableModels] = useState([]);
    const [settings, setSettings] = useState({
        ollamaModel: 'llama3.2',
        embeddingModel: 'nomic-embed-text',
        autoMemory: 'true'
    });
    const [saveStatus, setSaveStatus] = useState('');
    const [stats, setStats] = useState({ total_articles: 0, db_size_mb: 0 });

    useEffect(() => {
        async function init() {
            if (!isElectron) return;
            try {
                const token = await window.electronAPI.getApiToken();
                setApiToken(token);

                // Check for hash path
                if (window.location.hash === '#/settings') {
                    setView('settings');
                }

                // Initial status check
                const status = await window.electronAPI.api.getOllamaStatus(token);
                setOllamaStatus(status);

                // Load available models
                const models = await window.electronAPI.api.getOllamaModels(token);
                setAvailableModels(models || []);

                // Load settings
                const currentSettings = await window.electronAPI.api.getSettings(token);
                setSettings(currentSettings);

                // Load stats
                const currentStats = await window.electronAPI.api.getStats(token);
                setStats(currentStats);
            } catch (err) {
                console.error('Init error:', err);
                setApiToken('Error loading data');
            }
        }
        init();

        const handleHashChange = () => {
            if (window.location.hash === '#/settings') {
                setView('settings');
            } else {
                setView('dashboard');
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const handleCopy = async () => {
        if (!isElectron) return;
        try {
            await navigator.clipboard.writeText(apiToken);
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy Token'), 2000);
        } catch (err) {
            setCopyStatus('Error');
        }
    };

    const handleQuit = async () => {
        if (!isElectron) return;
        try {
            await window.electronAPI.quitApp();
        } catch (err) {
            console.error('Failed to quit:', err);
        }
    };

    const handleSaveSetting = async (key, value) => {
        if (!isElectron) return;
        try {
            setSaveStatus('Saving...');
            await window.electronAPI.api.setSetting(apiToken, key, value);
            setSettings(prev => ({ ...prev, [key === 'ollama_model' ? 'ollamaModel' : key === 'embedding_model' ? 'embeddingModel' : 'autoMemory']: value }));
            setSaveStatus('Settings saved!');
            setTimeout(() => setSaveStatus(''), 2000);
        } catch (err) {
            setSaveStatus('Error saving');
        }
    };

    if (!isElectron) {
        return (
            <div className="dashboard-container">
                <div className="icon">⚠️</div>
                <h1>Browser Not Supported</h1>
                <p style={{ color: '#888', marginTop: '16px' }}>
                    This dashboard must be viewed through the native Internet Memory desktop application.<br /><br />
                    Please check your system tray or Start Menu.
                </p>
            </div>
        );
    }

    if (view === 'settings') {
        const isModelAvailable = (modelName) => availableModels.some(m => m.name === modelName || m.name.split(':')[0] === modelName);

        return (
            <div className="dashboard-container">
                <div className="settings-section">
                    <div className="settings-header">
                        <h2>Settings</h2>
                        <button className="back-link" onClick={() => setView('dashboard')}>Back</button>
                    </div>

                    <div className={`alert ${ollamaStatus.available ? '' : 'offline'}`}>
                        {ollamaStatus.available
                            ? `Ollama is Online (${availableModels.length} models available)`
                            : '⚠️ Ollama is Offline. Please start Ollama to use AI features.'}
                    </div>

                    <div className="form-group">
                        <label>AI Model (Ollama)</label>
                        <select
                            value={settings.ollamaModel}
                            onChange={(e) => handleSaveSetting('ollama_model', e.target.value)}
                        >
                            {availableModels.length === 0 && <option value="">No models found</option>}
                            {availableModels.map(m => (
                                <option key={m.name} value={m.name}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Embedding Model</label>
                        <select
                            value={settings.embeddingModel}
                            onChange={(e) => handleSaveSetting('embedding_model', e.target.value)}
                        >
                            {availableModels.length === 0 && <option value="">No models found</option>}
                            {availableModels.map(m => (
                                <option key={m.name} value={m.name}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Auto-Capture Memories</label>
                        <select
                            value={settings.autoMemory}
                            onChange={(e) => handleSaveSetting('auto_memory', e.target.value)}
                        >
                            <option value="true">Enabled</option>
                            <option value="false">Disabled</option>
                        </select>
                    </div>

                    {saveStatus && <div className="save-status">{saveStatus}</div>}
                </div>
            </div>
        );
    }

    if (view === 'graph') {
        return <VisualGraphView apiToken={apiToken} onBack={() => setView('dashboard')} />;
    }

    return (
        <div className="dashboard-container">
            <div className="icon">🧠</div>
            <h1>Internet Memory</h1>

            <div className="stats-row" style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' }}>
                <div className="stat-item">
                    <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#00d4ff' }}>{stats.total_articles}</div>
                    <div className="stat-label" style={{ fontSize: '12px', color: '#888' }}>Memories</div>
                </div>
                <div className="stat-item">
                    <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#00d4ff' }}>{stats.db_size_mb}MB</div>
                    <div className="stat-label" style={{ fontSize: '12px', color: '#888' }}>DB Size</div>
                </div>
            </div>

            <div className="token-section">
                <h3>Your API Token</h3>
                <div className="token-display">
                    <code>{apiToken}</code>
                </div>
            </div>

            <div className="actions">
                <button className="primary-btn" onClick={() => setView('graph')}>
                    Explore Semantic Graph
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="secondary-btn" onClick={handleCopy}>
                        {copyStatus}
                    </button>
                    <button className="secondary-btn" onClick={() => setView('settings')}>
                        Settings
                    </button>
                    <button className="danger-btn" onClick={handleQuit}>
                        Quit Server
                    </button>
                </div>
            </div>

            <div className="footer">
                <div className="status">
                    <div className="dot" style={{ background: ollamaStatus.available ? '#00d4ff' : '#ff4444' }}></div>
                    {ollamaStatus.available ? 'AI System Ready' : 'AI Offline (Start Ollama)'}
                </div>
            </div>
        </div>
    );
}

export default App;
