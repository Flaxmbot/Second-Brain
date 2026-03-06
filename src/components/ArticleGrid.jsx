import { useState, useEffect } from 'react';
import { getArticles, deleteArticle, searchMemory } from '../services/api';
import ArticleCard from './ArticleCard';
import { AnimatedEmpty } from './LottieIcons';

export default function ArticleGrid() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            if (searchQuery.trim()) {
                const results = await searchMemory(searchQuery);
                setArticles(results);
            } else {
                const results = await getArticles(1, filter);
                setArticles(results);
            }
        } catch (e) {
            console.error('Failed to load articles:', e);
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, [filter]);

    const handleDelete = async (id) => {
        try {
            await deleteArticle(id);
            setArticles(prev => prev.filter(a => a.id !== id));
        } catch (e) {
            console.error('Delete failed:', e);
        }
    };

    const filters = [
        { label: 'All', value: null },
        { label: 'Articles', value: 'article' },
        { label: 'Videos', value: 'video' },
        { label: 'PDFs', value: 'pdf' },
    ];

    return (
        <div>
            <div className="filter-chips">
                {filters.map(f => (
                    <button
                        key={f.label}
                        className={`chip ${filter === f.value ? 'active' : ''}`}
                        onClick={() => setFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <span className="loading-text">Loading memories...</span>
                </div>
            ) : articles.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"><AnimatedEmpty size={56} /></div>
                    <h3>No memories yet</h3>
                    <p>Install the browser extension and start capturing knowledge from the web.</p>
                </div>
            ) : (
                <div className="article-grid">
                    {articles.map(article => (
                        <ArticleCard key={article.id} article={article} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}
