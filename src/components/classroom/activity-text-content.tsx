import { MarkdownContent } from "@/components/markdown-content";
import { classifyCodeContent } from "@/lib/classroom/code-content";
import styles from "./activity-interaction.module.css";

export function ActivityTextContent({ content, decodeEscapedNewlines = false, className }: {
  content: string;
  decodeEscapedNewlines?: boolean;
  className?: string;
}) {
  const classified = classifyCodeContent(content, { decodeEscapedNewlines });
  if (!classified.code) return <MarkdownContent content={classified.content} className={className} />;

  return <pre className={[styles.codeBlock, className].filter(Boolean).join(" ")} data-code-content data-language={classified.language}>
    <code>{classified.content}</code>
  </pre>;
}
