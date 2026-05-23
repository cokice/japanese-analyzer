interface ThinkingIndicatorProps {
  className?: string;
  label?: string;
}

export default function ThinkingIndicator({
  className = '',
  label = 'Thinking'
}: ThinkingIndicatorProps) {
  return (
    <div className={`ai-thinking-indicator ${className}`} role="status" aria-live="polite">
      <span className="ai-thinking-dots" aria-hidden="true">
        <span className="thinking-dot"></span>
        <span className="thinking-dot"></span>
        <span className="thinking-dot"></span>
      </span>
      <span className="ai-thinking-text" data-text={label}>{label}</span>
    </div>
  );
}
