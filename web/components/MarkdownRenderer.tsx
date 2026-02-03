"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { MermaidBlock } from "./MermaidBlock";
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

// 自定义代码块渲染：支持 mermaid 图表
const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";

    if (language === "mermaid") {
      return <MermaidBlock chart={String(children).trimEnd()} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  const processedContent = preprocessLaTeX(children);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={components}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
