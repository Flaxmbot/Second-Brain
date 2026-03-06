import KnowledgeGraph from '../components/KnowledgeGraph';
import { AnimatedGraph } from '../components/LottieIcons';

export default function GraphPage() {
    return (
        <div>
            <div className="page-header">
                <h2>
                    <AnimatedGraph size={24} />
                    Knowledge Graph
                </h2>
            </div>
            <KnowledgeGraph />
        </div>
    );
}
