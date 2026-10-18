/*
 * The little the editor needs from the DOM: an element builder, the API, the edit bar
 * and the side sheet. No framework, like the rest of the site's client code.
 */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

/** h('button.ed-btn', { onclick }, 'Save') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: `${K}${string}`, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name as K);
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key in el && typeof value !== 'string') (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

export class ApiFailure extends Error {
  constructor(public status: number, message: string, public detail: unknown) {
    super(message);
  }
}

const API = '/__lerpit/edit/api/';

export async function api<T = any>(method: string, route: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = `${API}${route}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const init: RequestInit = { method, headers: {} };
  if (body instanceof Blob) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiFailure(0, 'The dev server is not answering. Is `npm run dev` still running?', null);
  }
  const json = await response.json().catch(() => ({ error: `The dev server answered ${response.status}.` }));
  if (!response.ok) throw new ApiFailure(response.status, json.error ?? 'Something went wrong.', json.detail);
  return json as T;
}

/** Problem text uses backticks for code, as ContentProblems.astro renders it. */
export function problemHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}

/** A short-lived note above the edit bar. */
export function toast(text: string, kind: 'ok' | 'bad' | 'info' = 'info', ms = 3200) {
  document.querySelector('.ed-toast')?.remove();
  const el = h('div.ed-toast', { role: 'status', 'data-kind': kind, text });
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export type Bar = {
  el: HTMLElement;
  setDirty(count: number): void;
  setProblems(count: number): void;
  setBusy(busy: boolean): void;
  /** Swaps the bar's actions for a question, until one of the answers is picked. */
  ask(question: string, answers: Array<{ label: string; primary?: boolean; run: () => void }>): void;
};

/**
 * The edit bar, docked at the foot of the window. The page's byline, chapter headers and
 * stage are all pinned to the top edge, so the bar stays out of their way at the bottom.
 */
export function createBar(opts: {
  label: string;
  title: string;
  /** Left out on a page with nothing to save, like the library. */
  onSave?: () => void;
  onSettings?: () => void;
  settingsLabel?: string;
  onProblems?: () => void;
  onDone: () => void;
}): Bar {
  const dirty = h('span.ed-bar__dirty', { hidden: true });
  const problems = h('button.ed-bar__problems', { type: 'button', hidden: true, onclick: opts.onProblems ?? (() => {}), title: 'What the site finds wrong with this page' });
  const save = h('button.ed-btn.ed-btn--primary', { type: 'button', onclick: opts.onSave ?? (() => {}), title: 'Save to disk (⌘S)' }, 'Save') as HTMLButtonElement;
  const actions = h('div.ed-bar__actions', {},
    problems,
    opts.onSettings ? h('button.ed-btn', { type: 'button', onclick: opts.onSettings, title: 'Settings' }, opts.settingsLabel ?? '⚙ Settings') : null,
    opts.onSave ? save : null,
    h('button.ed-btn', { type: 'button', onclick: opts.onDone, title: 'Leave edit mode' }, 'Done')
  );
  const question = h('div.ed-bar__actions', { hidden: true });
  const el = h('div.ed-bar', { role: 'toolbar', 'aria-label': 'Local editor' },
    h('span.ed-bar__mode', { text: opts.label }),
    h('span.ed-bar__title', { text: opts.title }),
    dirty,
    actions,
    question
  );
  document.body.append(el);

  return {
    el,
    setDirty(count) {
      dirty.hidden = count === 0;
      dirty.textContent = `${count} unsaved`;
      save.toggleAttribute('data-dirty', count > 0);
    },
    setProblems(count) {
      problems.hidden = count === 0;
      problems.textContent = `! ${count}`;
      problems.setAttribute('aria-label', `${count} authoring ${count === 1 ? 'problem' : 'problems'}`);
    },
    setBusy(busy) {
      save.disabled = busy;
      save.textContent = busy ? 'Saving…' : 'Save';
    },
    ask(text, answers) {
      question.replaceChildren(
        h('span.ed-bar__question', { text }),
        ...answers.map((answer) => h(`button.ed-btn${answer.primary ? '.ed-btn--primary' : ''}`, {
          type: 'button',
          onclick: () => {
            question.hidden = true;
            actions.hidden = false;
            el.classList.remove('is-asking');
            answer.run();
          }
        }, answer.label))
      );
      actions.hidden = true;
      question.hidden = false;
      // The question takes the title's room until it is answered.
      el.classList.add('is-asking');
      (question.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  };
}

export type Sheet = { el: HTMLElement; body: HTMLElement; open(): void; close(): void; toggle(): void; isOpen(): boolean };

/** The side sheet that slides over the stage: settings, problems, raw text. */
export function createSheet(title: string): Sheet {
  const body = h('div.ed-sheet__body');
  const close = h('button.ed-sheet__close', { type: 'button', 'aria-label': 'Close settings', text: '✕' });
  const heading = h('p.eyebrow.ed-sheet__title', { text: title });
  const el = h('aside.ed-sheet', { 'aria-label': title, hidden: true }, h('div.ed-sheet__head', {}, heading, close), body);
  document.body.append(el);
  const sheet: Sheet = {
    el,
    body,
    open() {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('is-open'));
    },
    close() {
      el.classList.remove('is-open');
      el.hidden = true;
    },
    toggle() {
      if (sheet.isOpen()) sheet.close();
      else sheet.open();
    },
    isOpen: () => !el.hidden
  };
  close.addEventListener('click', sheet.close);
  return sheet;
}

/** A labelled field in a sheet. */
export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h('div.ed-field', {}, h('label.ed-field__label', { text: label }), control, hint ? h('p.ed-field__hint', { html: hint }) : null);
}

/** A row of mutually exclusive buttons, like the mockup's status switch. */
export function segmented<T extends string>(options: Array<{ value: T; label: string }>, value: T, onChange: (value: T) => void): HTMLElement {
  const el = h('div.ed-seg', { role: 'radiogroup' });
  const render = (current: T) => {
    el.replaceChildren(...options.map((option) => h('button.ed-seg__opt', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(option.value === current),
      onclick: () => {
        render(option.value);
        onChange(option.value);
      }
    }, option.label)));
  };
  render(value);
  return el;
}
