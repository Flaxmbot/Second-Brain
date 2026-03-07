import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import ForceGraph2D from 'react-force-graph-2d';
import * as THREE from 'three';

const DEFAULT_API = 'http://127.0.0.1:11435';

export function VisualGraphView({ apiToken, onBack }) {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [is3D, setIs3D] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fgRef = useRef();

    useEffect(() => {
        async function fetchGraph() {
            try {
                // Fetch nodes and edges
                const headers = { 'Authorization': `Bearer ${apiToken}` };
                const nodesResp = await fetch(`${DEFAULT_API}/api/graph/nodes`, { headers });
                const edgesResp = await fetch(`${DEFAULT_API}/api/graph/edges`, { headers });

                if (!nodesResp.ok || !edgesResp.ok) {
                    throw new Error('Failed to fetch graph data');
                }

                const rawNodes = await nodesResp.json();
                const rawEdges = await edgesResp.json();

                // Format for react-force-graph
                const nodes = rawNodes.map(n => ({
                    id: n.id,
                    name: n.name,
                    type: n.type || 'unknown',
                    val: Math.min(Math.max((n.weight || 1) * 2, 2), 10), // Node size
                }));

                const links = rawEdges.map(e => ({
                    source: e.source,
                    target: e.target,
                    name: e.relation || 'related_to'
                }));

                setGraphData({ nodes, links });
            } catch (err) {
                console.error('Error fetching graph:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchGraph();
    }, [apiToken]);

    const handleNodeClick = useCallback(node => {
        if (is3D && fgRef.current) {
            // Aim at node from outside it
            const distance = 40;
            const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

            fgRef.current.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
                node, // lookAt ({ x, y, z })
                3000  // ms transition duration
            );
        }
    }, [is3D, fgRef]);

    // Color aesthetic lookup
    const getNodeColor = useCallback(node => {
        const types = {
            'concept': '#00D4FF',
            'person': '#A78BFA',
            'organization': '#F472B6',
            'location': '#34D399',
            'event': '#FBBF24',
            'unknown': '#9CA3AF'
        };
        return types[node.type] || types['unknown'];
    }, []);

    if (loading) return (
        <div className="dashboard-container" style={{ justifyContent: 'center' }}>
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Molding Semantic Graph...</p>
        </div>
    );

    if (error) return (
        <div className="dashboard-container" style={{ justifyContent: 'center' }}>
            <div className="icon">⚠️</div>
            <h2>Graph Error</h2>
            <p style={{ color: 'var(--danger)' }}>{error}</p>
            <button className="primary-btn" onClick={onBack} style={{ marginTop: '20px' }}>Back</button>
        </div>
    );

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'var(--bg)' }}>
            <div style={{
                position: 'absolute', top: '20px', left: '20px', zIndex: 10,
                display: 'flex', gap: '10px'
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                        backdropFilter: 'blur(10px)'
                    }}
                >
                    ← Back
                </button>
                <button
                    onClick={() => setIs3D(!is3D)}
                    style={{
                        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--accent)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                        backdropFilter: 'blur(10px)', fontWeight: 'bold'
                    }}
                >
                    {is3D ? '2D View' : '3D View'}
                </button>
            </div>

            <div style={{
                position: 'absolute', bottom: '20px', left: '20px', zIndex: 10,
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                padding: '12px', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px',
                backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
                <strong>Legend</strong>
                <span style={{ color: '#00D4FF' }}>● Concept</span>
                <span style={{ color: '#A78BFA' }}>● Person</span>
                <span style={{ color: '#F472B6' }}>● Organization</span>
                <span style={{ color: '#34D399' }}>● Location</span>
                <span style={{ color: '#FBBF24' }}>● Event</span>
            </div>

            {is3D ? (
                <ForceGraph3D
                    ref={fgRef}
                    graphData={graphData}
                    nodeLabel="name"
                    nodeColor={getNodeColor}
                    nodeRelSize={4}
                    linkColor={() => 'rgba(255,255,255,0.1)'}
                    linkWidth={1}
                    backgroundColor="#0a0c14"
                    onNodeClick={handleNodeClick}
                    enableNodeDrag={false}
                    nodeResolution={16}
                />
            ) : (
                <ForceGraph2D
                    graphData={graphData}
                    nodeLabel="name"
                    nodeColor={getNodeColor}
                    nodeRelSize={4}
                    linkColor={() => 'rgba(255,255,255,0.1)'}
                    linkWidth={1}
                    backgroundColor="#0a0c14"
                    onNodeClick={handleNodeClick}
                />
            )}
        </div>
    );
}
