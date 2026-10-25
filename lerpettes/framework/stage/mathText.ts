import { renderToString } from 'katex';
import 'katex/dist/katex.min.css';

/*
 * Labels on the stage's cards may carry inline math between dollar signs, as captions and
 * the article do: 'Damping Constant $k_d$'. The text around the math stays plain text.
 */

const MATH = /(?<![\\$])\$(?!\$)([^$\r\n]+?)(?<!\\)\$(?!\$)/g;
const rendered = new Map<string, string>();

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Whether the text has any math in it. */
export const hasMath = (text: string) => text.search(MATH) >= 0;

/** The text as HTML, each formula typeset. A formula that fails to typeset stays as written. */
export function mathHtml(text: string): string {
  let html = rendered.get(text);
  if (html === undefined) {
    let last = 0;
    html = '';
    for (const match of text.matchAll(MATH)) {
      html += escapeHtml(text.slice(last, match.index));
      try {
        html += renderToString(match[1], { throwOnError: true, strict: 'ignore', trust: false });
      } catch {
        html += escapeHtml(match[0]);
      }
      last = match.index + match[0].length;
    }
    html += escapeHtml(text.slice(last));
    rendered.set(text, html);
  }
  return html;
}

/** Put the text in the node, typesetting any math; plain text goes in as text. */
export function setMathText(node: HTMLElement, text: string) {
  if (hasMath(text)) node.innerHTML = mathHtml(text);
  else node.textContent = text;
}

/** The text without its dollar signs, for tooltips and screen readers. */
export const plainText = (text: string) => text.replace(MATH, '$1');
