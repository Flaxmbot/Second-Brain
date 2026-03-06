import { useState, useEffect } from 'react';
import { checkOllama, listModels } from '../services/api';
import { AnimatedBrain, AnimatedCheck, AnimatedWarning, AnimatedDownload, PulseIcon } from './LottieIcons';
import { ExternalLink, RefreshCw } from 'lucide-react';

export default function OllamaSetup() {
    const [status, setStatus] = useState('checking');
    const [models, setModels] = useState([]);

    const check = async () => {
        setStatus('checking');
        try {
            const running = await checkOllama();
            if (running) {
                const modelList = await listModels();
                setModels(modelList);
                setStatus(modelList.length > 0 ? 'ready' : 'no-models');
            } else {
                setStatus('not-running');
            }
        } catch {
            setStatus('not-running');
        }
    };

    useEffect(() => { check(); }, []);

    if (status === 'checking') {
        return (
            <div className="ollama-setup">
                <div className="setup-icon"><PulseIcon size={56} /></div>
                <h2>Checking Ollama...</h2>
                <div className="loading-spinner"><div className="spinner"></div></div>
            </div>
        );
    }

    if (status === 'ready') {
        return (
            <div className="ollama-setup">
                <div className="setup-icon"><AnimatedCheck size={56} /></div>
                <h2>Ollama Connected</h2>
                <p>{models.length} model{models.length !== 1 ? 's' : ''} available</p>
                <div className="card" style={{ textAlign: 'left', marginTop: 16 }}>
                    {models.map(m => (
                        <div key={m.name} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                            <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{m.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (status === 'no-models') {
        return (
            <div className="ollama-setup">
                <div className="setup-icon"><AnimatedDownload size={56} /></div>
                <h2>No Models Found</h2>
                <p>Ollama is running, but you need to pull a model. Open a terminal and run:</p>
                <div className="card" style={{ textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 12 }}>
                    <div style={{ marginBottom: 8, color: 'var(--accent)' }}>ollama pull llama3.2:3b</div>
                    <div style={{ marginBottom: 8, color: 'var(--accent)' }}>ollama pull nomic-embed-text</div>
                </div>
                <button className="retry-btn" onClick={check}>
                    <RefreshCw size={13} /> Check Again
                </button>
            </div>
        );
    }

    return (
        <div className="ollama-setup">
            <div className="setup-icon"><AnimatedWarning size={56} /></div>
            <h2>Ollama Not Detected</h2>
            <p>Internet Memory needs Ollama to generate embeddings and AI responses. Install Ollama to get started.</p>
            <a href="https://ollama.com/download" target="_blank" rel="noopener" className="setup-link">
                <ExternalLink size={15} />
                Download Ollama
            </a>
            <br />
            <button className="retry-btn" onClick={check}>
                <RefreshCw size={13} /> Check Again
            </button>
        </div>
    );
}
