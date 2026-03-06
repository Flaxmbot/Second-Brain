import { useState, useRef, useEffect } from 'react';
import { queryMemory } from '../services/api';
import ModelSelector from './ModelSelector';
import { AnimatedBrain, AnimatedSend, AnimatedEmpty, ThinkingDots } from './LottieIcons';

export default function ChatInterface() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [model, setModel] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const result = await queryMemory(input, model || null);
            const assistantMsg = {
                role: 'assistant',
                content: result.answer,
                sources: result.sources || [],
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (e) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${e}. Make sure Ollama is running with a model available.`,
                sources: [],
            }]);
        }

        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-container">
            <div className="page-header">
                <h2>
                    <AnimatedBrain size={28} />
                    AI Memory Assistant
                </h2>
                <ModelSelector value={model} onChange={setModel} />
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <AnimatedEmpty size={56} />
                        </div>
                        <h3>Ask about your memories</h3>
                        <p>Try: "What did I read about AI agents?" or "Summarize everything about Rust concurrency"</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.role}`}>
                        {msg.role === 'assistant' ? (
                            <div className="message-bubble">
                                <div className="avatar">
                                    <AnimatedBrain size={18} />
                                </div>
                                <div className="message-content">
                                    {msg.content.split('\n').map((line, j) => (
                                        <p key={j}>{line}</p>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="message-content">
                                {msg.content.split('\n').map((line, j) => (
                                    <p key={j}>{line}</p>
                                ))}
                            </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                            <div className="message-sources">
                                {msg.sources.map((src, j) => (
                                    <div key={j} className="source-card" onClick={() => window.open(src.url, '_blank')}>
                                        <div className="source-title">{src.title}</div>
                                        <div className="source-domain">{src.domain}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {loading && (
                    <div className="message assistant">
                        <div className="message-bubble">
                            <div className="avatar">
                                <AnimatedBrain size={18} />
                            </div>
                            <div className="thinking-indicator">
                                <ThinkingDots width={48} height={20} />
                                <span className="thinking-label">Searching your memory...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
                <input
                    type="text"
                    placeholder="Ask about your memories..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                />
                <button onClick={handleSend} disabled={loading || !input.trim()}>
                    <AnimatedSend size={15} />
                    Ask
                </button>
            </div>
        </div>
    );
}
