import { TextShimmer } from '@/components/ui/text-shimmer';
import AtomIcon from './AtomIcon';

interface ThinkingIndicatorProps {
  className?: string;
  label?: string;
}

export default function ThinkingIndicator({
  className = '',
  label = '正在分析…'
}: ThinkingIndicatorProps) {
  return (
    <div className={`ai-thinking-indicator ${className}`} role="status" aria-live="polite">
      <AtomIcon state="busy" size={15} className="reasoning-state-atom" />
      <TextShimmer as="span" className="ai-thinking-text" duration={1.35} spread={1.4}>
        {label}
      </TextShimmer>
    </div>
  );
}
