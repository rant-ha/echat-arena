"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { MermaidBlock } from "./MermaidBlock";
import { CodeBlock } from "./CodeBlock";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  children: string;
}

// 预处理：将 GPT 风格的 LaTeX 分隔符转换为 remark-math 支持的格式
function preprocessLaTeX(content: string): string {
  // 将 \[...\] 转换为 $$...$$ (块级公式)
  // 将 \(...\) 转换为 $...$ (行内公式)
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");
}

// 自定义组件渲染
const components: Components = {
  // 代码块：支持 mermaid 图表和语法高亮
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const isInline = !className;

    // Mermaid 图表
    if (language === "mermaid") {
      return <MermaidBlock chart={String(children).trimEnd()} />;
    }

    // 行内代码
    if (isInline) {
      return (
        <code
          className="bg-surface-elevated px-1.5 py-0.5 rounded text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    // 代码块（带语法高亮）
    return (
      <CodeBlock className={className} language={language}>
        {children}
      </CodeBlock>
    );
  },
  // 代码块容器（移除默认 pre 样式）
  pre({ children }) {
    return <>{children}</>;
  },
  // 表格样式
  table({ children }) {
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-border-faint">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-border-faint bg-surface-secondary px-4 py-2 text-left text-sm font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border border-border-faint px-4 py-2 text-sm">
        {children}
      </td>
    );
  },
  // 任务列表复选框
  input({ type, checked, ...props }) {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 h-4 w-4 rounded border-border-strong accent-interactive-accent"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  const processedContent = preprocessLaTeX(children);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      components={components}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
