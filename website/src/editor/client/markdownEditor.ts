/*
 * The Markdown box a chapter opens into: CodeMirror with Markdown highlighting, the
 * site's maths and code-box syntax a click away, and an image dropped or pasted onto it
 * saved beside mixtape.md and linked where it landed.
 */

import { EditorState, EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { h } from './dom';

// The site's ink and accents (global.css :root), so the source reads like the page.
const style = HighlightStyle.define([
  { tag: t.heading, color: '#20313f', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: '#2e6da4' },
  { tag: t.url, color: '#2e6da4', textDecoration: 'underline' },
  { tag: t.monospace, color: '#8a5a00' },
  { tag: t.comment, color: '#8a99a4', fontStyle: 'italic' },
  { tag: t.list, color: '#d17041' },
  { tag: t.quote, color: '#506270', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta], color: '#8a99a4' }
]);

export type MarkdownEditor = {
  view: EditorView;
  el: HTMLElement;
  value(): string;
  setValue(text: string): void;
  focus(): void;
  destroy(): void;
};

export type MarkdownEditorOptions = {
  value: string;
  onChange: (text: string) => void;
  /** Saves a dropped, pasted or picked image; returns the file name it was saved as. */
  onImage?: (file: File) => Promise<string>;
  placeholder?: string;
  /** Extra keys, like ⌘S, that should work while the box has focus. */
  keys?: Array<{ key: string; run: () => boolean }>;
  minimal?: boolean;
};

function wrap(view: EditorView, before: string, after = before, empty = '') {
  view.dispatch(view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to) || empty;
    const insert = `${before}${text}${after}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length)
    };
  }));
  view.focus();
  return true;
}

/** Puts a block on its own lines at the cursor. */
function block(view: EditorView, text: string, selectFrom: number, selectTo: number) {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const before = from === line.from ? (line.number > 1 && view.state.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
  const insert = `${before}${text}\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(from + before.length + selectFrom, from + before.length + selectTo)
  });
  view.focus();
  return true;
}

function insertImage(view: EditorView, name: string, at?: number) {
  const pos = at ?? view.state.selection.main.head;
  const alt = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  // A lone image with alt text becomes a figure with a caption, so it goes on its own line.
  const line = view.state.doc.lineAt(pos);
  const lead = line.text.trim() ? '\n\n' : '';
  const insert = `${lead}![${alt}](${name})\n`;
  view.dispatch({ changes: { from: line.text.trim() ? line.to : pos, insert }, selection: { anchor: (line.text.trim() ? line.to : pos) + lead.length + 2, head: (line.text.trim() ? line.to : pos) + lead.length + 2 + alt.length } });
  view.focus();
}

export function createMarkdownEditor(opts: MarkdownEditorOptions): MarkdownEditor {
  let view: EditorView;
  const upload = async (files: File[], at?: number) => {
    if (!opts.onImage) return;
    for (const file of files.filter((entry) => entry.type.startsWith('image/'))) {
      const name = await opts.onImage(file);
      if (name) insertImage(view, name, at);
    }
  };

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    markdown(),
    syntaxHighlighting(style),
    search({ top: true }),
    keymap.of([
      ...(opts.keys ?? []).map((entry) => ({ key: entry.key, run: entry.run, preventDefault: true })),
      { key: 'Mod-b', run: (v) => wrap(v, '**') },
      { key: 'Mod-i', run: (v) => wrap(v, '*') },
      { key: 'Mod-k', run: (v) => wrap(v, '[', '](https://)', 'link') },
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
      ...defaultKeymap
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onChange(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      drop(event, v) {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.some((file) => file.type.startsWith('image/')) || !opts.onImage) return false;
        event.preventDefault();
        const at = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined;
        void upload(files, at);
        return true;
      },
      paste(event) {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some((file) => file.type.startsWith('image/')) || !opts.onImage) return false;
        event.preventDefault();
        void upload(files);
        return true;
      }
    })
  ];
  if (opts.placeholder) extensions.push(placeholderExt(opts.placeholder));

  const host = h('div.ed-md__cm');
  view = new EditorView({ state: EditorState.create({ doc: opts.value, extensions }), parent: host });

  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true }) as HTMLInputElement;
  picker.addEventListener('change', () => {
    void upload([...(picker.files ?? [])]);
    picker.value = '';
  });

  const tool = (label: string, title: string, run: () => void, face?: 'b' | 'i') =>
    h(`button.ed-md__tool${face ? `.ed-md__tool--${face}` : ''}`, { type: 'button', title, 'aria-label': title, onmousedown: (event: Event) => event.preventDefault(), onclick: run }, label);

  const toolbar = opts.minimal
    ? null
    : h('div.ed-md__toolbar', { role: 'toolbar', 'aria-label': 'Formatting' },
        tool('B', 'Bold (⌘B)', () => wrap(view, '**'), 'b'),
        tool('I', 'Italic (⌘I)', () => wrap(view, '*'), 'i'),
        tool('link', 'Link (⌘K)', () => wrap(view, '[', '](https://)', 'link')),
        h('span.ed-md__sep'),
        tool('$x$', 'Inline maths', () => wrap(view, '$', '$', 'x')),
        tool('$$', 'Display maths', () => block(view, '$$\nx = y\n$$', 3, 8)),
        tool('list', 'Bulleted list', () => block(view, '- ', 2, 2)),
        h('span.ed-md__sep'),
        opts.onImage ? tool('image', 'Add an image (or drop / paste one into the text)', () => picker.click()) : null,
        tool('code box', 'A lerpit code box: files under code/<chapter>/', () => block(view, '```lerpit src/index.js\n```', 11, 23))
      );

  const el = h('div.ed-md', {}, toolbar, host, picker);
  return {
    view,
    el,
    value: () => view.state.doc.toString(),
    setValue(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
