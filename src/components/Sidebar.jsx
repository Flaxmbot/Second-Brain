import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getStats } from '../services/api';
import {
    AnimatedBrain,
    AnimatedSearch,
    AnimatedChat,
    AnimatedTimeline,
    AnimatedGraph,
    AnimatedBook,
    AnimatedSettings,
} from './LottieIcons';

const navItems = [
    { to: '/', icon: AnimatedSearch, label: 'Dashboard' },
    { to: '/chat', icon: AnimatedChat, label: 'AI Chat' },
    { to: '/timeline', icon: AnimatedTimeline, label: 'Timeline' },
    { to: '/graph', icon: AnimatedGraph, label: 'Knowledge Graph' },
    { to: '/library', icon: AnimatedBook, label: 'Library' },
    { to: '/settings', icon: AnimatedSettings, label: 'Settings' },
];

export default function Sidebar() {
    const [memoryCount, setMemoryCount] = useState(0);

    useEffect(() => {
        getStats()
            .then(stats => setMemoryCount(stats.total_articles))
            .catch(() => { });
    }, []);

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">
                    <AnimatedBrain size={22} />
                </div>
                <h1>Internet Memory</h1>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        end={to === '/'}
                    >
                        <Icon size={18} />
                        {label}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <span className="memory-count">{memoryCount.toLocaleString()}</span> memories captured
            </div>
        </aside>
    );
}
