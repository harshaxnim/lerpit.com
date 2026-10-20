import { renderToString } from 'katex';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mathHtml(value: string): string {
  return value.replace(
    /(?<![\\$])(\$\$|\$)(?!\$)([\s\S]+?)(?<!\\)\1(?!\$)|[&<>]/g,
    (match, delimiter, math) => {
      if (delimiter !== undefined) {
        const displayMode = delimiter === '$$';
        if (!displayMode && /[\r\n]/.test(math)) return escapeHtml(match);
        try {
          return renderToString(math, { displayMode, trust: false, strict: 'error' });
        } catch {
          // An unfinished formula while authoring must not interrupt the player.
          return escapeHtml(match);
        }
      }
      return escapeHtml(match);
    }
  );
}

/** Plain text, backtick code, and dollar-delimited math share one caption. */
export function captionHtml(value: string): string {
  // Separate code first so math delimiters cannot reach inside or across it.
  return value.split(/((?<!`)`[^`\r\n]+`(?!`))/g)
    .map((part, index) => index % 2 === 1
      ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
      : mathHtml(part))
    .join('');
}
