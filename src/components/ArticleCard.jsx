import { ExternalLink, Trash2 } from 'lucide-react';

export default function ArticleCard({ article, onDelete }) {
    const timeAgo = (dateStr) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diff / 86400000);
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        return new Date(dateStr).toLocaleDateString();
    };

    const wordCount = article.word_count || 0;
    const readTime = Math.max(1, Math.ceil(wordCount / 250));

    return (
        <div className="card">
            <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                <span className="card-meta">{article.domain}</span>
                <span className="card-meta">{timeAgo(article.captured_at)}</span>
            </div>

            <h3 className="card-title">{article.title}</h3>

            <div className="card-meta">{readTime} min read • {wordCount.toLocaleString()} words</div>

            {article.summary && (
                <p className="card-summary">{article.summary}</p>
            )}

            {article.key_ideas && article.key_ideas.length > 0 && (
                <div className="card-tags">
                    {article.key_ideas.slice(0, 3).map((idea, i) => (
                        <span key={i} className="tag">{idea.length > 25 ? idea.slice(0, 25) + '...' : idea}</span>
                    ))}
                </div>
            )}

            <div className="flex gap-2" style={{ marginTop: 14 }}>
                <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={() => window.open(article.url, '_blank')}>
                    <ExternalLink size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Original
                </button>
                {onDelete && (
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 12px' }}
                        onClick={() => onDelete(article.id)}>
                        <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Remove
                    </button>
                )}
            </div>
        </div>
    );
}
