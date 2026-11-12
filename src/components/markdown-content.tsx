import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMarkdownMath } from "@/lib/markdown-math";

/** Shared renderer for Markdown with accessible, non-HTML LaTeX output. */
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return <div className={["markdown-content", className].filter(Boolean).join(" ")}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMarkdownMath(content)}</ReactMarkdown></div>;
}

/** Compact Markdown/LaTeX for labels whose HTML content model only permits phrasing content. */
export function MarkdownInlineContent({ content, className }: { content: string; className?: string }) {
  return <span className={["markdown-content", className].filter(Boolean).join(" ")}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <span>{children}</span> }}>{normalizeMarkdownMath(content)}</ReactMarkdown></span>;
}
