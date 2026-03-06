import Timeline from '../components/Timeline';
import { AnimatedTimeline as TimelineIcon } from '../components/LottieIcons';

export default function TimelinePage() {
    return (
        <div>
            <div className="page-header">
                <h2>
                    <TimelineIcon size={24} />
                    Learning Timeline
                </h2>
            </div>
            <Timeline />
        </div>
    );
}
