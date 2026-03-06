import { useState, useEffect } from 'react';
import { checkOllama, listModels } from '../services/api';
import OllamaSetup from '../components/OllamaSetup';
import { AnimatedSettings, AnimatedCheck, AnimatedError, PulseIcon } from '../components/LottieIcons';

export default function SettingsPage() {
    const [ollamaStatus, setOllamaStatus] = useState('checking');
    const [models, setModels] = useState([]);

    useEffect(() => {
        const check = async () => {
            try {
                const running = await checkOllama();
                if (running) {
                    const modelList = await listModels();
                    setModels(modelList);
                    setOllamaStatus('connected');
                } else {
                    setOllamaStatus('disconnected');
                }
            } catch {
                setOllamaStatus('disconnected');
            }
        };
        check();
    }, []);

    return (
        <div>
            <div className="page-header">
                <h2>
                    <AnimatedSettings size={24} />
                    Settings
                </h2>
            </div>

            {/* Ollama Connection */}
            <div className="settings-section">
                <h3>Ollama Connection</h3>
                <div className="setting-row">
                    <div>
                        <div className="setting-label">Status</div>
                        <div className="setting-desc">Connection to local Ollama instance</div>
                    </div>
                    {ollamaStatus === 'checking' ? (
                        <span className="status-badge" style={{ color: 'var(--text-muted)' }}>
                            <PulseIcon size={14} /> Checking...
                        </span>
                    ) : ollamaStatus === 'connected' ? (
                        <span className="status-badge connected">
                            <AnimatedCheck size={14} /> Connected
                        </span>
                    ) : (
                        <span className="status-badge disconnected">
                            <AnimatedError size={14} /> Disconnected
                        </span>
                    )}
                </div>
                <div className="setting-row">
                    <div>
                        <div className="setting-label">Endpoint</div>
                        <div className="setting-desc">Ollama API address</div>
                    </div>
                    <span className="font-mono text-muted" style={{ fontSize: 12.5 }}>
                        http://localhost:11434
                    </span>
                </div>
                <div className="setting-row">
                    <div>
                        <div className="setting-label">Available Models</div>
                        <div className="setting-desc">Models detected from Ollama</div>
                    </div>
                    <span className="text-sm text-accent" style={{ fontWeight: 600 }}>{models.length} model{models.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {/* Models */}
            {models.length > 0 && (
                <div className="settings-section">
                    <h3>Installed Models</h3>
                    {models.map(m => (
                        <div key={m.name} className="setting-row">
                            <div>
                                <div className="setting-label" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{m.name}</div>
                                <div className="setting-desc">
                                    {m.size ? `${(m.size / 1e9).toFixed(1)} GB` : 'Size unknown'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Extension Info */}
            <div className="settings-section">
                <h3>Browser Extension</h3>
                <div className="setting-row">
                    <div>
                        <div className="setting-label">Extension Server</div>
                        <div className="setting-desc">HTTP server for Chrome extension communication</div>
                    </div>
                    <span className="font-mono text-muted" style={{ fontSize: 12.5 }}>
                        http://localhost:11435
                    </span>
                </div>
            </div>

            {/* Setup Wizard */}
            {ollamaStatus === 'disconnected' && <OllamaSetup />}
        </div>
    );
}
