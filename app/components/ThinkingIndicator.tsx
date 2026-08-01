import { TextShimmer } from '@/components/ui/text-shimmer';

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
      <span className="reasoning-state-icon is-active" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle className="reasoning-state-ring" cx="12" cy="12" r="9" />
          <path className="reasoning-state-tick" d="M7.5 12.4 L10.8 15.6 L16.5 9.2" />
        </svg>
      </span>
      <TextShimmer as="span" className="ai-thinking-text" duration={1.35} spread={1.4}>
        {label}
      </TextShimmer>
    </div>
  );
}
