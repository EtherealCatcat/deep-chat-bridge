import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text ?? "") as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [text]);

  return <div className={`prose-warm ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
