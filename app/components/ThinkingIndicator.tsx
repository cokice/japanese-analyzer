'use client';

import { useLanguage } from "../contexts/LanguageContext";
import { TextShimmer } from '@/components/ui/text-shimmer';

interface ThinkingIndicatorProps {
  className?: string;
  label?: string;
}

export default function ThinkingIndicator({
  className = '',
  label
}: ThinkingIndicatorProps) {
  const { t } = useLanguage();
  return (
    <div className={`ai-thinking-indicator ${className}`} role="status" aria-live="polite">
      <TextShimmer as="span" className="ai-thinking-text" duration={1.35} spread={1.4}>
        {label ?? t("思考中")}
      </TextShimmer>
    </div>
  );
}
