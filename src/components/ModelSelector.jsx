import { useState, useEffect } from 'react';
import { listModels } from '../services/api';

export default function ModelSelector({ value, onChange }) {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchModels = async () => {
        setLoading(true);
        setError(false);
        try {
            const result = await listModels();
            setModels(result);
            if (result.length > 0 && !value) {
                onChange(result[0].name);
            }
        } catch (e) {
            setError(true);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchModels();
        // Re-check every 30 seconds
        const interval = setInterval(fetchModels, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="model-selector">
                <select disabled>
                    <option>Loading models...</option>
                </select>
            </div>
        );
    }

    if (error || models.length === 0) {
        return (
            <div className="model-selector">
                <select disabled style={{ borderColor: 'var(--warning)' }}>
                    <option>⚠️ No models available</option>
                </select>
            </div>
        );
    }

    return (
        <div className="model-selector">
            <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
                {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                ))}
            </select>
        </div>
    );
}
