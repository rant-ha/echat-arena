"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
  language?: string;
}

export function CodeBlock({ className, children, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative rounded-lg overflow-hidden border border-border-faint bg-surface-primary">
      {/* Header with language label and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-faint">
        <span className="text-xs font-mono text-text-muted uppercase">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-positive" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
