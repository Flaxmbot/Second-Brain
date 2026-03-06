import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getGraph } from '../services/api';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { AnimatedGraph as GraphIcon, AnimatedEmpty, AnimatedBook } from './LottieIcons';

export default function KnowledgeGraph() {
    const svgRef = useRef(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getGraph()
            .then(data => { setGraphData(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!svgRef.current || graphData.nodes.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;

        const g = svg.append('g');

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.2, 4])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom);

        // Build node and link data
        const nodes = graphData.nodes.map(n => ({
            id: n.name,
            name: n.name,
            count: n.article_count,
            description: n.description,
        }));

        const nodeNames = new Set(nodes.map(n => n.id));
        const links = graphData.edges
            .filter(e => nodeNames.has(e.source) && nodeNames.has(e.target))
            .map(e => ({
                source: e.source,
                target: e.target,
                type: e.relation_type,
            }));

        // Force simulation
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.count) * 8 + 20));

        // Glow filter
        const defs = svg.append('defs');
        const filter = defs.append('filter').attr('id', 'glow');
        filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Draw links
        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', 'rgba(0, 212, 255, 0.2)')
            .attr('stroke-width', 1);

        // Draw nodes
        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));

        node.append('circle')
            .attr('r', d => Math.sqrt(d.count) * 6 + 8)
            .attr('fill', 'rgba(0, 212, 255, 0.15)')
            .attr('stroke', '#00D4FF')
            .attr('stroke-width', 1.5)
            .attr('filter', 'url(#glow)');

        node.append('text')
            .text(d => d.name)
            .attr('text-anchor', 'middle')
            .attr('dy', d => Math.sqrt(d.count) * 6 + 22)
            .attr('fill', '#9ca3af')
            .attr('font-size', '11px')
            .attr('font-family', 'Inter, sans-serif');

        // Click handler
        node.on('click', (event, d) => {
            setSelectedNode(d);
        });

        // Hover effects
        node.on('mouseover', function () {
            d3.select(this).select('circle')
                .attr('fill', 'rgba(0, 212, 255, 0.3)')
                .attr('stroke-width', 2.5);
        })
            .on('mouseout', function () {
                d3.select(this).select('circle')
                    .attr('fill', 'rgba(0, 212, 255, 0.15)')
                    .attr('stroke-width', 1.5);
            });

        // Tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        return () => simulation.stop();
    }, [graphData]);

    if (loading) {
        return <div className="loading-spinner"><div className="spinner"></div><span className="loading-text">Loading graph...</span></div>;
    }

    if (graphData.nodes.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-icon"><AnimatedEmpty size={56} /></div>
                <h3>No knowledge graph yet</h3>
                <p>As you capture articles, concepts and their connections will appear here.</p>
            </div>
        );
    }

    return (
        <div className="graph-container">
            <svg ref={svgRef} />

            <div className="graph-controls">
                <button title="Zoom In"><ZoomIn size={14} /></button>
                <button title="Zoom Out"><ZoomOut size={14} /></button>
                <button title="Reset"><Maximize2 size={14} /></button>
            </div>

            {selectedNode && (
                <div className="node-detail">
                    <h3>{selectedNode.name}</h3>
                    <div className="detail-stat"><AnimatedBook size={16} /> {selectedNode.count} related memories</div>
                    {selectedNode.description && (
                        <div className="detail-stat" style={{ marginTop: 8 }}>{selectedNode.description}</div>
                    )}
                    <button
                        className="btn"
                        style={{ marginTop: 12, width: '100%' }}
                        onClick={() => setSelectedNode(null)}
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
}
