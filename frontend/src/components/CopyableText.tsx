import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyableTextProps {
  value: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Wraps a piece of text (typically an RID/mono value) to make it click-to-copy,
 * with a brief checkmark confirmation instead of a jarring toast for
 * something this small and frequent.
 */
const CopyableText: React.FC<CopyableTextProps> = ({ value, className, style, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - fail silently,
      // not worth interrupting the user for a nice-to-have
    }
  };

  return (
    <span
      onClick={handleCopy}
      className={className}
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}
      title="Click to copy"
    >
      {children ?? value}
      <span style={{ display: 'inline-flex', opacity: 0.5, transition: 'opacity 0.15s' }}>
        {copied ? <Check size={12} color="var(--c-green, #34C759)" /> : <Copy size={11} />}
      </span>
    </span>
  );
};

export default CopyableText;
