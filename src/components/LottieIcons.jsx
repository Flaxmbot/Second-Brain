import Lottie from 'lottie-react';

// ─── Inline Lottie Animations (lightweight, no external URLs) ───

// Brain / Neural Network animation
const brainData = {
    v: "5.7.1", fr: 30, ip: 0, op: 90, w: 100, h: 100,
    layers: [{
        ty: 4, nm: "brain", sr: 1, st: 0, op: 90, ip: 0,
        ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50] }, s: { a: 0, k: [100, 100] } },
        shapes: [
            { ty: "el", d: 1, s: { a: 1, k: [{ t: 0, s: [40, 40] }, { t: 45, s: [46, 46] }, { t: 90, s: [40, 40] }] }, p: { a: 0, k: [0, 0] } },
            { ty: "st", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 3 } },
            { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 0.15] }, o: { a: 0, k: 100 } },
            // Orbiting dots
            {
                ty: "el", d: 1, s: { a: 0, k: [6, 6] }, p: {
                    a: 1, k: [
                        { t: 0, s: [25, 0] }, { t: 30, s: [0, 25] }, { t: 60, s: [-25, 0] }, { t: 90, s: [25, 0] }
                    ]
                }
            },
            { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 1, k: [{ t: 0, s: [100] }, { t: 45, s: [40] }, { t: 90, s: [100] }] } },
        ]
    }]
};

// Pulsing circle (for loading/status)
const pulseData = {
    v: "5.7.1", fr: 30, ip: 0, op: 60, w: 100, h: 100,
    layers: [{
        ty: 4, nm: "pulse", sr: 1, st: 0, op: 60, ip: 0,
        ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50] }, s: { a: 0, k: [100, 100] } },
        shapes: [
            { ty: "el", d: 1, s: { a: 1, k: [{ t: 0, s: [30, 30] }, { t: 30, s: [50, 50] }, { t: 60, s: [30, 30] }] }, p: { a: 0, k: [0, 0] } },
            { ty: "st", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 1, k: [{ t: 0, s: [100] }, { t: 30, s: [0] }, { t: 60, s: [100] }] }, w: { a: 0, k: 2 } },
            { ty: "el", d: 1, s: { a: 0, k: [20, 20] }, p: { a: 0, k: [0, 0] } },
            { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 0, k: 100 } },
        ]
    }]
};

// Sparkle / magic animation
const sparkleData = {
    v: "5.7.1", fr: 30, ip: 0, op: 60, w: 100, h: 100,
    layers: [{
        ty: 4, nm: "sparkle", sr: 1, st: 0, op: 60, ip: 0,
        ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [360] }] }, p: { a: 0, k: [50, 50] }, s: { a: 0, k: [100, 100] } },
        shapes: [
            {
                ty: "sr", d: 1, sy: 1, pt: { a: 0, k: 4 }, p: { a: 0, k: [0, 0] },
                r: { a: 0, k: 0 },
                or: { a: 1, k: [{ t: 0, s: [20] }, { t: 30, s: [28] }, { t: 60, s: [20] }] },
                os: { a: 0, k: 0 }, ir: { a: 0, k: 10 }, is: { a: 0, k: 0 }
            },
            { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 0, k: 100 } },
        ]
    }]
};

// Thinking / chat dots animation
const thinkingData = {
    v: "5.7.1", fr: 30, ip: 0, op: 60, w: 120, h: 40,
    layers: [
        {
            ty: 4, nm: "d1", sr: 1, st: 0, op: 60, ip: 0,
            ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [25, 20] }, s: { a: 0, k: [100, 100] } },
            shapes: [
                { ty: "el", d: 1, s: { a: 0, k: [12, 12] }, p: { a: 1, k: [{ t: 0, s: [0, 0] }, { t: 15, s: [0, -8] }, { t: 30, s: [0, 0] }] } },
                { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 1, k: [{ t: 0, s: [40] }, { t: 15, s: [100] }, { t: 30, s: [40] }] } },
            ]
        },
        {
            ty: 4, nm: "d2", sr: 1, st: 8, op: 60, ip: 0,
            ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [60, 20] }, s: { a: 0, k: [100, 100] } },
            shapes: [
                { ty: "el", d: 1, s: { a: 0, k: [12, 12] }, p: { a: 1, k: [{ t: 8, s: [0, 0] }, { t: 23, s: [0, -8] }, { t: 38, s: [0, 0] }] } },
                { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 1, k: [{ t: 8, s: [40] }, { t: 23, s: [100] }, { t: 38, s: [40] }] } },
            ]
        },
        {
            ty: 4, nm: "d3", sr: 1, st: 16, op: 60, ip: 0,
            ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [95, 20] }, s: { a: 0, k: [100, 100] } },
            shapes: [
                { ty: "el", d: 1, s: { a: 0, k: [12, 12] }, p: { a: 1, k: [{ t: 16, s: [0, 0] }, { t: 31, s: [0, -8] }, { t: 46, s: [0, 0] }] } },
                { ty: "fl", c: { a: 0, k: [0, 0.83, 1, 1] }, o: { a: 1, k: [{ t: 16, s: [40] }, { t: 31, s: [100] }, { t: 46, s: [40] }] } },
            ]
        },
    ]
};

// ─── Icon Components ────────────────────────────────────

export function BrainIcon({ size = 32, loop = true }) {
    return <Lottie animationData={brainData} loop={loop} style={{ width: size, height: size }} />;
}

export function PulseIcon({ size = 24, loop = true }) {
    return <Lottie animationData={pulseData} loop={loop} style={{ width: size, height: size }} />;
}

export function SparkleIcon({ size = 24, loop = true }) {
    return <Lottie animationData={sparkleData} loop={loop} style={{ width: size, height: size }} />;
}

export function ThinkingDots({ width = 60, height = 20 }) {
    return <Lottie animationData={thinkingData} loop style={{ width, height }} />;
}

// ─── CSS-based animated icons (always smooth, no JSON deps) ──

export function AnimatedBrain({ size = 36 }) {
    return (
        <div className="animated-icon animated-brain" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 .74-.2 1.44-.57 2.04A4 4 0 0 1 18 12a4 4 0 0 1-2.56 3.74A4 4 0 0 1 12 22a4 4 0 0 1-3.44-6.26A4 4 0 0 1 6 12a4 4 0 0 1 2.57-3.96A4.01 4.01 0 0 1 8 6a4 4 0 0 1 4-4z" className="brain-path" />
                <path d="M12 2v20" className="brain-stem" />
                <circle cx="8" cy="8" r="1" className="brain-node brain-node-1" />
                <circle cx="16" cy="8" r="1" className="brain-node brain-node-2" />
                <circle cx="8" cy="16" r="1" className="brain-node brain-node-3" />
                <circle cx="16" cy="16" r="1" className="brain-node brain-node-4" />
            </svg>
        </div>
    );
}

export function AnimatedSearch({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" className="search-circle" />
                <path d="M21 21l-4.35-4.35" className="search-handle" />
            </svg>
        </div>
    );
}

export function AnimatedChat({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" className="chat-bubble" />
                <line x1="8" y1="9" x2="16" y2="9" className="chat-line chat-line-1" />
                <line x1="8" y1="13" x2="13" y2="13" className="chat-line chat-line-2" />
            </svg>
        </div>
    );
}

export function AnimatedTimeline({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" className="clock-face" />
                <polyline points="12 6 12 12 16 14" className="clock-hand" />
            </svg>
        </div>
    );
}

export function AnimatedGraph({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="2" className="graph-node graph-node-1" />
                <circle cx="18" cy="6" r="2" className="graph-node graph-node-2" />
                <circle cx="12" cy="18" r="2" className="graph-node graph-node-3" />
                <line x1="8" y1="6" x2="16" y2="6" className="graph-edge graph-edge-1" />
                <line x1="7" y1="8" x2="11" y2="16" className="graph-edge graph-edge-2" />
                <line x1="17" y1="8" x2="13" y2="16" className="graph-edge graph-edge-3" />
            </svg>
        </div>
    );
}

export function AnimatedBook({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" className="book-cover" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" className="book-body" />
                <line x1="8" y1="7" x2="16" y2="7" className="book-line book-line-1" />
                <line x1="8" y1="11" x2="14" y2="11" className="book-line book-line-2" />
            </svg>
        </div>
    );
}

export function AnimatedSettings({ size = 20 }) {
    return (
        <div className="animated-icon animated-settings" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" className="gear-center" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" className="gear-teeth" />
            </svg>
        </div>
    );
}

export function AnimatedDownload({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" className="download-arrow" />
                <line x1="12" y1="15" x2="12" y2="3" className="download-line" />
            </svg>
        </div>
    );
}

export function AnimatedCheck({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" className="check-circle" style={{ stroke: 'var(--success)' }} />
                <polyline points="8 12 11 15 16 9" className="check-mark" style={{ stroke: 'var(--success)' }} />
            </svg>
        </div>
    );
}

export function AnimatedWarning({ size = 20 }) {
    return (
        <div className="animated-icon animated-warning" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" style={{ stroke: 'var(--warning)' }} />
                <line x1="12" y1="9" x2="12" y2="13" style={{ stroke: 'var(--warning)' }} />
                <line x1="12" y1="17" x2="12.01" y2="17" style={{ stroke: 'var(--warning)' }} />
            </svg>
        </div>
    );
}

export function AnimatedError({ size = 20 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
        </div>
    );
}

export function AnimatedEmpty({ size = 64 }) {
    return (
        <div className="animated-icon animated-float" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', opacity: 0.5 }}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
        </div>
    );
}

export function AnimatedSend({ size = 16 }) {
    return (
        <div className="animated-icon" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
        </div>
    );
}
