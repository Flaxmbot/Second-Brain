import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { getStats } from '../services/api';
import ArticleGrid from '../components/ArticleGrid';
import { AnimatedBook, AnimatedGraph, PulseIcon, SparkleIcon } from '../components/LottieIcons';

export default function DashboardPage() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        getStats().then(setStats).catch(() => { });
    }, []);

    return (
        <div>
            <div className="page-header">
                <h2>Dashboard</h2>
            </div>

            {/* Stats */}
            {stats && (
                <div className="stats-panel">
                    <div className="stat-card">
                        <div className="stat-icon"><AnimatedBook size={24} /></div>
                        <div className="stat-value">{stats.total_articles}</div>
                        <div className="stat-label">Memories</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><AnimatedGraph size={24} /></div>
                        <div className="stat-value">{stats.total_concepts}</div>
                        <div className="stat-label">Concepts</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><PulseIcon size={24} /></div>
                        <div className="stat-value">{stats.total_chunks}</div>
                        <div className="stat-label">Chunks</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><SparkleIcon size={24} /></div>
                        <div className="stat-value">{stats.streak_days}</div>
                        <div className="stat-label">Active Days</div>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="search-bar">
                <Search className="search-icon" />
                <input
                    type="text"
                    placeholder="Search your memory..."
                />
            </div>

            {/* Top Topics */}
            {stats && stats.recent_topics.length > 0 && (
                <div className="filter-chips" style={{ marginBottom: 20 }}>
                    <span className="text-sm text-muted" style={{ padding: '6px 0' }}>Top topics:</span>
                    {stats.recent_topics.slice(0, 6).map(t => (
                        <span key={t.name} className="tag">{t.name} ({t.count})</span>
                    ))}
                </div>
            )}

            {/* Article Grid */}
            <ArticleGrid />
        </div>
    );
}
