"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  const processedContent = preprocessLaTeX(children);

  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {processedContent}
    </ReactMarkdown>
  );
}
