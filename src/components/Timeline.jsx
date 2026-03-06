import { useState, useEffect } from 'react';
import { getTimeline } from '../services/api';
import { AnimatedTimeline as TimelineIcon, AnimatedEmpty } from '../components/LottieIcons';

export default function Timeline() {
    const [timelineData, setTimelineData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getTimeline()
            .then(data => { setTimelineData(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div className="loading-spinner">
                <div className="spinner"></div>
                <span className="loading-text">Loading timeline...</span>
            </div>
        );
    }

    if (timelineData.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-icon"><AnimatedEmpty size={56} /></div>
                <h3>No timeline yet</h3>
                <p>Capture some articles and your learning journey will appear here.</p>
            </div>
        );
    }

    return (
        <div className="timeline">
            {timelineData.map((day, i) => (
                <div key={i}>
                    <div className="timeline-date">{formatDate(day.date)}</div>
                    {day.articles.map((article, j) => (
                        <div key={j} className="timeline-entry">
                            <div className="entry-time">{formatTime(article.captured_at)}</div>
                            <div className="entry-title">{article.title}</div>
                            <div className="entry-meta">
                                {article.domain} · {Math.max(1, Math.ceil(article.word_count / 250))} min read
                                {article.source_type !== 'article' && ` · ${article.source_type}`}
                            </div>
                            {article.summary && (
                                <div className="entry-takeaway">{article.summary}</div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
