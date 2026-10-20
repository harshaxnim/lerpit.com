/*
 * Edit mode on a lesson page.
 *
 * The page stays the page: the stage keeps running and every chapter box keeps its
 * place. Opening a chapter puts its heading fields, panel chips and Markdown in the box,
 * and its prose below them is re-rendered by the site's own pipeline as you type, so the
 * preview is what the page will be. Settings (control.toml, the byline, the raw text)
 * live in a sheet that slides over the stage.
 *
 * The document is held as the pieces mixtapeDoc.ts cuts it into. Untouched pieces are
 * written back byte for byte; only what was edited is re-written.
 */

import { PANEL_LABELS, PANEL_NAMES } from '@lerpit/framework/panels/registry';
import type { LerpetteProblem } from '@lerpit/framework/types';
import { DRAFT, parseCollectionControl, parseControl, PUBLISHED, UNLISTED, type LerpetteStatus } from '../../lib/control';
import { autoStyleFor, cardPickers, setCollectionKey } from './cards';
import { resolvePanels } from '../../lib/headingSpec';
import {
  freshId, joinDocument, panelOps, readByline, readHeading, splitDocument, tidyBody, writeByline, writeHeading,
  type HeadingFields
} from '../lib/mixtapeDoc';
import { renameTableKey, setKey, setTableKey, TomlEditError } from '../lib/tomlEdit';
import { api, ApiFailure, createBar, createSheet, debounce, field, h, problemHtml, segmented, toast, type Bar } from './dom';
import { createMarkdownEditor, type MarkdownEditor } from './markdownEditor';
import { clearResume, holdReloads, markOn, readResume, stashResume } from './resume';

type FileState = { text: string; hash: string } | null;

type LessonData = {
  collection: { slug: string; title: string };
  slug: string;
  href: string;
  mixtape: FileState;
  control: FileState;
  codeFolders: string[];
  images: string[];
  parsed: null | { title: string; problems: LerpetteProblem[]; introPanels: string[]; steps: Array<{ id: string; title: string }> };
};

type Entry = {
  uid: number;
  kind: 'title' | 'chapter';
  origHeading: string;
  origBody: string;
  heading: string;
  body: string;
  fields: HeadingFields;
  /** The id the chapter had on disk: its code folder's name until a save renames it. */
  origId: string | null;
  isNew: boolean;
  deleted: boolean;
  wasLast: boolean;
  box: HTMLElement;
  prose: HTMLElement;
  origHtml: string;
  panel?: HTMLElement;
  editor?: MarkdownEditor;
};

const CHAPTER_ID = /^[A-Za-z0-9][A-Za-z0-9-_]*$/;
const TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const STATUS_TEXT: Record<LerpetteStatus, string> = {
  [PUBLISHED]: 'Listed and routed: on the shelves, in its collection, everywhere.',
  [UNLISTED]: 'Routed, so a shared link works; absent from every listing.',
  [DRAFT]: 'Local only. A production build has no page for it.'
};

export async function startLesson(player: HTMLElement, c: string, l: string) {
  const [data, collectionData, tree] = await Promise.all([
    api<LessonData>('GET', 'lerpette', undefined, { c, l }),
    // The collection's own settings (its cards), editable from here too.
    api<{ title: string; control: FileState }>('GET', 'collection', undefined, { c }),
    api<{ collections: Array<{ slug: string; title: string }> }>('GET', 'tree')
  ]);
  const collectionControl = { file: collectionData.control, text: collectionData.control?.text ?? '' };
  const collectionDirty = () => collectionControl.text !== (collectionControl.file?.text ?? '');
  if (!data.mixtape) {
    toast(`${c}/${l} has no mixtape.md to edit.`, 'bad');
    return;
  }

  let mixtape = data.mixtape;
  let control = data.control;
  let controlText = control?.text ?? '';
  let rawMixtape: string | null = null;
  let problems = data.parsed?.problems ?? [];
  let busy = false;
  let reloading = false;
  const codeRenames: Array<{ from: string; to: string }> = [];

  const parts = splitDocument(mixtape.text);
  let head = parts.head;
  const origHead = parts.head;
  const sectionBoxes = [
    player.querySelector<HTMLElement>('.lerpette-intro'),
    ...player.querySelectorAll<HTMLElement>('.lerpette-step')
  ].filter((box): box is HTMLElement => !!box);

  // The page and the file must agree on the chapters, or edits would land in the wrong box.
  const chapterCount = parts.sections.filter((section) => section.kind === 'chapter').length;
  const structured = parts.sections[0]?.kind === 'title'
    && parts.sections.filter((section) => section.kind === 'title').length === 1
    && chapterCount === sectionBoxes.length - 1;

  let uid = 0;
  const entries: Entry[] = structured
    ? parts.sections.map((section, index) => {
        const box = sectionBoxes[index];
        const prose = box.querySelector<HTMLElement>(':scope > .prose-block') ?? box.appendChild(h('div.prose-block'));
        const fields = readHeading(section.heading);
        return {
          uid: uid++,
          kind: section.kind,
          origHeading: section.heading,
          origBody: section.body,
          heading: section.heading,
          body: section.body,
          fields,
          origId: section.kind === 'chapter' ? fields.id : null,
          isNew: false,
          deleted: false,
          wasLast: index === parts.sections.length - 1,
          box,
          prose,
          origHtml: prose.innerHTML
        };
      })
    : [];
  const origOrder = entries.map((entry) => entry.uid);

  document.body.classList.add('ed-on');
  const sheet = createSheet('Lerpette settings');
  const bar: Bar = createBar({
    label: 'Editing',
    title: data.parsed?.title ?? l,
    onSave: () => void save(),
    onSettings: () => {
      renderSettings();
      sheet.toggle();
    },
    onProblems: () => {
      renderSettings();
      sheet.open();
      sheet.body.querySelector('.ed-problems')?.scrollIntoView({ block: 'start' });
    },
    onDone: () => done()
  });
  bar.setProblems(problems.length);

  if (!structured) {
    toast('This document\'s headings do not line up with the page, so it opens as text in Settings.', 'info', 6000);
    renderSettings();
    sheet.open();
  }

  // ------------------------------------------------------------ model

  const live = () => entries.filter((entry) => !entry.deleted);
  const titleEntry = () => entries.find((entry) => entry.kind === 'title');
  const titlePanels = () => (titleEntry() ? resolvePanels([], titleEntry()!.fields.ops) : data.parsed?.introPanels ?? []);
  // Adding or deleting a chapter is counted on its own; this is only the old ones moving.
  const orderChanged = () => live().filter((entry) => !entry.isNew).map((entry) => entry.uid).join()
    !== origOrder.filter((id) => live().some((entry) => entry.uid === id)).join();
  const entryDirty = (entry: Entry) => entry.isNew ? !entry.deleted : entry.deleted || entry.heading !== entry.origHeading || entry.body !== entry.origBody;

  function dirtyCount(): number {
    const collection = collectionDirty() ? 1 : 0;
    if (rawMixtape !== null) return 1 + (controlText !== (control?.text ?? '') ? 1 : 0) + collection;
    return entries.filter(entryDirty).length
      + (orderChanged() ? 1 : 0)
      + (head !== origHead ? 1 : 0)
      + (controlText !== (control?.text ?? '') ? 1 : 0)
      + collection;
  }

  function buildMixtape(): string {
    if (rawMixtape !== null) return rawMixtape;
    const kept = live();
    return joinDocument({
      head,
      sections: kept.map((entry, index) => {
        const isLast = index === kept.length - 1;
        const touched = entry.isNew || entry.body !== entry.origBody || isLast !== entry.wasLast;
        return { kind: entry.kind, heading: entry.heading, body: touched ? tidyBody(entry.body, isLast) : entry.body };
      })
    });
  }

  const backupKey = `lerpit-editor:draft:${c}/${l}`;
  const backup = debounce(() => {
    try {
      if (dirtyCount() === 0) localStorage.removeItem(backupKey);
      else localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), baseHash: mixtape.hash, mixtape: buildMixtape(), control: controlText }));
    } catch {
      // Private windows: no backup, and nothing else breaks.
    }
  }, 400);

  function changed() {
    bar.setDirty(dirtyCount());
    backup();
  }

  // ------------------------------------------------------------ chapter boxes

  const render = debounce(async (entry: Entry) => {
    try {
      const reply = await api<{ html: string; problems: LerpetteProblem[] }>('POST', 'render', {
        c, l, chapter: entry.fields.id, markdown: entry.body
      });
      entry.prose.innerHTML = reply.html;
      const list = entry.panel?.querySelector('.ed-chapter__problems');
      if (list) {
        list.replaceChildren(...reply.problems.map((problem) => h('li', { html: problemHtml(problem.message) })));
        (list as HTMLElement).hidden = reply.problems.length === 0;
      }
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  }, 220);

  function setHeading(entry: Entry, fields: HeadingFields) {
    entry.fields = fields;
    const written = writeHeading(fields);
    // A heading whose fields did not change keeps the author's spacing.
    entry.heading = written === writeHeading(readHeading(entry.origHeading)) ? entry.origHeading : written;
    const title = entry.box.querySelector<HTMLElement>(':scope > .lerpette-head h2');
    if (title) title.textContent = fields.title;
    if (entry.kind === 'title') bar.el.querySelector('.ed-bar__title')!.textContent = fields.title;
    entry.box.classList.toggle('ed-dirty', entryDirty(entry));
    changed();
  }

  function panelChips(entry: Entry): HTMLElement {
    const row = h('div.ed-panels', { role: 'group', 'aria-label': 'Panels' });
    const draw = () => {
      const inherited = entry.kind === 'title' ? [] : titlePanels();
      const wanted = resolvePanels(inherited, entry.fields.ops);
      row.replaceChildren(
        h('span.ed-panels__label', { text: entry.kind === 'title' ? 'Panels · every chapter' : 'Panels' }),
        ...PANEL_NAMES.map((name) => {
          const on = wanted.includes(name);
          const fromTitle = on && inherited.includes(name) && entry.kind === 'chapter';
          return h('button.ed-chip', {
            type: 'button',
            'aria-pressed': String(on),
            title: `${PANEL_LABELS[name] ?? name}${fromTitle ? ', inherited from the title' : ''}`,
            onclick: () => {
              const next = on ? wanted.filter((entryName) => entryName !== name) : [...wanted, name];
              setHeading(entry, { ...entry.fields, explicit: true, ops: panelOps(inherited, next) });
              draw();
              // The title's panels are every chapter's inheritance.
              if (entry.kind === 'title') entries.forEach((other) => other.panel?.querySelector<HTMLElement & { redraw?: () => void }>('.ed-panels')?.redraw?.());
            }
          // The name as a heading writes it, so the chips teach the syntax.
          }, `${name}${fromTitle ? ' ·' : ''}`);
        }),
        ...(inherited.length && entry.kind === 'chapter' ? [h('span.ed-panels__hint', { text: '· = from the title' })] : [])
      );
    };
    (row as HTMLElement & { redraw?: () => void }).redraw = draw;
    draw();
    return row;
  }

  function takenIds(except: Entry) {
    return live().filter((entry) => entry !== except && entry.kind === 'chapter').map((entry) => entry.fields.id);
  }

  function openChapter(entry: Entry, focus = true) {
    if (rawMixtape !== null) {
      toast('mixtape.md is being edited as text in Settings; save or drop that first.', 'info');
      return;
    }
    if (entry.panel) {
      if (focus) entry.editor?.focus();
      return;
    }
    entry.box.classList.add('ed-open');
    const headEl = entry.box.querySelector<HTMLElement>(':scope > .lerpette-head')!;

    const titleInput = h('input.ed-input.ed-input--title', { value: entry.fields.title, 'aria-label': 'Title', spellcheck: true }) as HTMLInputElement;
    const idInput = h('input.ed-input.ed-input--id', { value: entry.fields.id, 'aria-label': 'Chapter id', spellcheck: false, size: 10 }) as HTMLInputElement;
    const idNote = h('p.ed-chapter__note', { hidden: true });
    // A chapter added here has no code folder or links yet, so its id follows its title
    // until the author types one.
    let idTouched = !entry.isNew;
    titleInput.addEventListener('input', () => {
      setHeading(entry, { ...entry.fields, title: titleInput.value });
      if (!idTouched && titleInput.value.trim()) {
        idInput.value = freshId(titleInput.value, takenIds(entry));
        renameChapter(entry, idInput, idNote);
      }
    });
    idInput.addEventListener('input', () => (idTouched = true));
    idInput.addEventListener('change', () => renameChapter(entry, idInput, idNote));

    const tools = entry.kind === 'chapter'
      ? h('span.ed-head__tools', {},
          h('button.ed-icon', { type: 'button', title: 'Move up', 'aria-label': 'Move chapter up', onclick: () => move(entry, -1) }, '↑'),
          h('button.ed-icon', { type: 'button', title: 'Move down', 'aria-label': 'Move chapter down', onclick: () => move(entry, 1) }, '↓'),
          h('button.ed-icon', { type: 'button', title: 'Delete chapter', 'aria-label': 'Delete chapter', onclick: () => remove(entry), html: TRASH }))
      : null;
    const fields = h('div.ed-head', {},
      titleInput,
      entry.kind === 'chapter' ? h('span.ed-head__id', {}, h('span', { text: '{#' }), idInput, h('span', { text: '}' })) : null,
      tools,
      h('button.ed-icon', { type: 'button', title: 'Close (Esc)', 'aria-label': 'Close the editor', onclick: () => closeChapter(entry) }, '✕')
    );
    headEl.append(fields);

    const editor = createMarkdownEditor({
      value: entry.body.replace(/^\n/, ''),
      placeholder: 'Write the chapter. Maths with $…$, a code box with the {} button.',
      onChange: (text) => {
        entry.body = `\n${text}`;
        entry.box.classList.toggle('ed-dirty', entryDirty(entry));
        changed();
        render(entry);
      },
      onImage: (file) => uploadImage(file),
      keys: [
        { key: 'Mod-s', run: () => (void save(), true) },
        { key: 'Escape', run: () => (closeChapter(entry), true) }
      ]
    });
    entry.editor = editor;

    entry.panel = h('div.ed-chapter', {},
      panelChips(entry),
      idNote,
      editor.el,
      h('ul.ed-chapter__problems', { hidden: true }),
      h('p.ed-chapter__preview-label', { text: 'Preview · as the page renders it' })
    );
    headEl.after(entry.panel);
    if (focus) editor.focus();
  }

  function closeChapter(entry: Entry) {
    if (!entry.panel) return;
    entry.editor?.destroy();
    entry.panel.remove();
    entry.box.querySelector(':scope > .lerpette-head .ed-head')?.remove();
    entry.panel = undefined;
    entry.editor = undefined;
    entry.box.classList.remove('ed-open');
  }

  function renameChapter(entry: Entry, input: HTMLInputElement, note: HTMLElement) {
    const to = input.value.trim();
    const from = entry.fields.id;
    if (to === from) return;
    if (!CHAPTER_ID.test(to)) {
      toast('A chapter id is letters, digits, - and _, starting with a letter or digit.', 'bad');
      input.value = from;
      return;
    }
    if (takenIds(entry).includes(to)) {
      toast(`Another chapter is already called ${to}.`, 'bad');
      input.value = from;
      return;
    }
    // The captions and idle text are keyed by id, so they move with it now.
    try {
      let next = controlText;
      for (const table of ['caption', 'idle_status']) next = renameTableKey(next, table, from, to);
      controlText = next;
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
    setHeading(entry, { ...entry.fields, id: to, explicit: true });
    const original = entry.origId;
    const folder = original && data.codeFolders.includes(original);
    note.hidden = !folder;
    if (folder) note.innerHTML = to === original ? '' : `On save, <code>code/${original}/</code> is renamed to <code>code/${to}/</code>.`;
  }

  function renumber() {
    let n = 0;
    for (const entry of live()) {
      if (entry.kind !== 'chapter') continue;
      n += 1;
      const index = entry.box.querySelector<HTMLElement>(':scope > .lerpette-head .lerpette-head__index');
      if (index) index.textContent = String(n).padStart(2, '0');
    }
  }

  function move(entry: Entry, by: -1 | 1) {
    const chapters = live().filter((other) => other.kind === 'chapter');
    const at = chapters.indexOf(entry);
    const swap = chapters[at + by];
    if (!swap) return;
    const i = entries.indexOf(entry);
    const j = entries.indexOf(swap);
    [entries[i], entries[j]] = [entries[j], entries[i]];
    if (by < 0) swap.box.before(entry.box);
    else swap.box.after(entry.box);
    renumber();
    placeAddButtons();
    entry.box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    changed();
  }

  function remove(entry: Entry) {
    bar.ask(`Delete “${entry.fields.title}”? Its code folder stays.`, [
      { label: 'Keep it', primary: true, run: () => {} },
      {
        label: 'Delete',
        run: () => {
          closeChapter(entry);
          if (entry.isNew) {
            entries.splice(entries.indexOf(entry), 1);
            entry.box.remove();
          } else {
            entry.deleted = true;
            entry.box.classList.add('ed-deleted');
            entry.box.append(h('div.ed-deleted__strip', {},
              h('span', { text: `“${entry.fields.title}” will be deleted on save.` }),
              h('button.ed-btn', { type: 'button', onclick: () => undelete(entry) }, 'Undo')));
          }
          renumber();
          placeAddButtons();
          changed();
        }
      }
    ]);
  }

  function undelete(entry: Entry) {
    entry.deleted = false;
    entry.box.classList.remove('ed-deleted');
    entry.box.querySelector('.ed-deleted__strip')?.remove();
    renumber();
    placeAddButtons();
    changed();
  }

  function addChapter(after: Entry) {
    const taken = live().filter((entry) => entry.kind === 'chapter').map((entry) => entry.fields.id);
    const id = freshId('New chapter', taken);
    const fields: HeadingFields = { depth: 2, title: 'New chapter', id, explicit: true, ops: [] };
    const box = h('section.lerpette-step.ed-new', { id: `ed-${id}` },
      h('div.lerpette-head', {},
        h('span.lerpette-head__index-row', {}, h('span.lerpette-head__index', { text: '··' })),
        h('h2', { text: fields.title })),
      h('div.prose-block'));
    after.box.after(box);
    const entry: Entry = {
      uid: uid++,
      kind: 'chapter',
      origHeading: '',
      origBody: '',
      heading: writeHeading(fields),
      body: '\nWrite here.\n',
      fields,
      origId: null,
      isNew: true,
      deleted: false,
      wasLast: false,
      box,
      prose: box.querySelector('.prose-block') as HTMLElement,
      origHtml: ''
    };
    entries.splice(entries.indexOf(after) + 1, 0, entry);
    renumber();
    placeAddButtons();
    openChapter(entry);
    render(entry);
    entry.box.querySelector<HTMLInputElement>('.ed-input--title')?.select();
    changed();
  }

  function placeAddButtons() {
    player.querySelectorAll('.ed-add').forEach((el) => el.remove());
    if (rawMixtape !== null) return;
    for (const entry of live()) {
      entry.box.after(h('button.ed-add', { type: 'button', onclick: () => addChapter(entry) }, '+ Add a chapter here'));
    }
  }

  // Click a box's header or prose to open it; links and the code boxes keep working.
  const onBoxClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const box = target.closest<HTMLElement>('.lerpette-intro, .lerpette-step');
    if (!box || target.closest('a, button, input, .ed-chapter, .lerpette-code, .ed-deleted__strip')) return;
    const entry = entries.find((candidate) => candidate.box === box);
    if (entry && !entry.deleted) openChapter(entry);
  };
  if (structured) {
    player.addEventListener('click', onBoxClick);
    for (const entry of entries) {
      entry.box.classList.add('ed-editable');
      entry.box.querySelector(':scope > .lerpette-head')?.append(
        h('button.ed-open-btn', { type: 'button', title: 'Edit this section', 'aria-label': `Edit ${entry.fields.title}`, onclick: () => openChapter(entry) }, '✎ Edit'));
    }
    placeAddButtons();
  }

  // ------------------------------------------------------------ images

  async function uploadImage(file: File): Promise<string> {
    try {
      const reply = await api<{ name: string }>('POST', 'image', file, { c, l, name: file.name || 'pasted.png' });
      toast(`Saved ${reply.name} beside mixtape.md.`, 'ok');
      return reply.name;
    } catch (error) {
      toast((error as Error).message, 'bad');
      return '';
    }
  }

  // ------------------------------------------------------------ settings sheet

  function editControl(apply: (text: string) => string) {
    try {
      controlText = apply(controlText);
      changed();
    } catch (error) {
      toast(error instanceof TomlEditError ? error.message : String(error), 'bad', 6000);
      renderSettings();
    }
  }

  function renderSettings() {
    const { control: parsed, problems: tomlProblems } = parseControl(controlText);
    const chapters = live().filter((entry) => entry.kind === 'chapter');
    const byline = readByline(head) ?? { author: '', date: '' };

    const order = h('input.ed-input', { type: 'number', step: 1, value: parsed.order ?? '', placeholder: 'by date', 'aria-label': 'Order' }) as HTMLInputElement;
    order.addEventListener('change', () => editControl((text) => setKey(text, 'order', order.value === '' ? null : Math.round(Number(order.value)))));
    const landing = h('input', { type: 'checkbox', checked: parsed.landing, 'aria-label': 'Serve at /' }) as HTMLInputElement;
    landing.addEventListener('change', () => editControl((text) => setKey(text, 'landing', landing.checked ? true : null)));

    const author = h('input.ed-input', { value: byline.author, 'aria-label': 'Author' }) as HTMLInputElement;
    const date = h('input.ed-input', { type: 'date', value: byline.date, 'aria-label': 'Date' }) as HTMLInputElement;
    const writeLine = () => {
      if (!author.value.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.value)) return;
      head = writeByline(head, { author: author.value.replace(/\|/g, '/'), date: date.value });
      changed();
    };
    author.addEventListener('change', writeLine);
    date.addEventListener('change', writeLine);

    const perChapter = (table: 'caption' | 'idle_status', values: Record<string, string>, which: Entry[], empty: string) =>
      which.length === 0
        ? h('p.ed-field__hint', { text: 'No chapters need one.' })
        : h('div.ed-grid', {}, ...which.flatMap((entry) => {
            const input = h('input.ed-input', { value: values[entry.fields.id] ?? '', placeholder: empty, 'aria-label': `${table} for ${entry.fields.id}` }) as HTMLInputElement;
            input.addEventListener('change', () => editControl((text) => setTableKey(text, table, entry.fields.id, input.value.trim() ? input.value : null)));
            return [h('code.ed-grid__key', { text: entry.fields.id, title: entry.fields.title }), input];
          }));

    const withFence = chapters.filter((entry) => entry.body.includes('```lerpit') || parsed.idleStatus[entry.fields.id] !== undefined);

    const rawControl = h('textarea.ed-raw', { spellcheck: false, rows: 8, 'aria-label': 'control.toml' }) as HTMLTextAreaElement;
    rawControl.value = controlText;
    rawControl.addEventListener('input', () => {
      controlText = rawControl.value;
      changed();
    });
    rawControl.addEventListener('change', () => renderSettings());

    const rawDoc = h('textarea.ed-raw.ed-raw--tall', { spellcheck: false, rows: 14, 'aria-label': 'mixtape.md' }) as HTMLTextAreaElement;
    rawDoc.value = buildMixtape();
    const canRaw = rawMixtape !== null || entries.every((entry) => !entryDirty(entry)) && !orderChanged();
    rawDoc.disabled = !canRaw;
    rawDoc.addEventListener('input', () => {
      if (rawMixtape === null) {
        entries.forEach(closeChapter);
        player.classList.add('ed-raw-mode');
      }
      rawMixtape = rawDoc.value;
      placeAddButtons();
      changed();
    });

    const problemList = h('ul.ed-problems', {}, ...(problems.length
      ? problems.map((problem) => h('li', {},
          h('p', { html: problemHtml(problem.message) }),
          problem.fix ? h('p.ed-problems__fix', { html: problemHtml(problem.fix) }) : null,
          h('span.ed-problems__where', { text: `${problem.where} · ${problem.id}` })))
      : [h('li.ed-problems__none', { text: 'Nothing. The site finds no problem here.' })]));

    sheet.body.replaceChildren(
      h('section.ed-group', {},
        field('Status', segmented<LerpetteStatus>(
          [{ value: PUBLISHED, label: 'Published' }, { value: UNLISTED, label: 'Unlisted' }, { value: DRAFT, label: 'Draft' }],
          parsed.status,
          (value) => {
            editControl((text) => setKey(text, 'status', value === PUBLISHED ? null : value));
            sheet.body.querySelector('.ed-status-hint')!.textContent = STATUS_TEXT[value];
          }), undefined),
        h('p.ed-field__hint.ed-status-hint', { text: STATUS_TEXT[parsed.status] }),
        field('Serve at /', h('label.ed-check', {}, landing, h('span', { text: 'The landing page' })), 'Only a published lerpette can be the landing page.'),
        field('Order in its collection', order, 'Lowest first; the rest follow newest first.')),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: 'Byline' }),
        h('div.ed-row', {}, field('Author', author), field('Date', date)),
        h('p.ed-field__hint', { text: 'The first line of mixtape.md. An undated lerpette sorts last.' })),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: 'Captions' }),
        h('p.ed-field__hint', { text: 'The line under the panel, per chapter. Empty leaves it to the code.' }),
        perChapter('caption', parsed.caption, chapters, 'from the code')),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: 'Code box idle text' }),
        h('p.ed-field__hint', { text: 'What a chapter\'s code box says before its first build.' }),
        perChapter('idle_status', parsed.idleStatus, withFence, 'Press run to build.')),
      collectionGroup(),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: `Problems (${problems.length})` }),
        problemList),
      h('details.ed-group', {},
        h('summary.ed-group__title', { text: 'control.toml as text' }),
        tomlProblems.length ? h('ul.ed-chapter__problems', {}, ...tomlProblems.map((problem) => h('li', { text: problem.what }))) : null,
        rawControl,
        h('p.ed-field__hint', { text: 'Comments you write here are kept.' })),
      h('details.ed-group', { open: rawMixtape !== null || !structured },
        h('summary.ed-group__title', { text: 'mixtape.md as text' }),
        rawDoc,
        h('p.ed-field__hint', { text: canRaw ? 'Editing here takes over from the chapter editors until you save; the page reloads after.' : 'Save your chapter edits first.' }))
    );
  }

  /** The collection's cards, set from here: the same pickers as the collection page. */
  function collectionGroup() {
    const parsed = parseCollectionControl(collectionControl.text).control;
    const titles = tree.collections.map((entry) => entry.title);
    const { styles, palettes } = cardPickers(
      { style: parsed.cardStyle, palette: parsed.palette },
      autoStyleFor(collectionData.title, titles),
      (key, value) => {
        try {
          collectionControl.text = setCollectionKey(collectionControl.text, key, value);
          changed();
        } catch (error) {
          toast(error instanceof TomlEditError ? error.message : String(error), 'bad', 6000);
        }
      });
    const href = `/${c}/`;
    return h('section.ed-group', {},
      h('h3.ed-group__title', { text: `Collection · ${collectionData.title}` }),
      h('p.ed-field__hint', { text: 'The collection\'s colours (its cards, and every lesson\'s panels) and the picture its cards draw. Saved to the collection\'s control.toml with this page.' }),
      field('Palette', palettes),
      field('Card style', styles),
      h('a.ed-link', {
        href,
        onclick: (event: Event) => {
          event.preventDefault();
          markOn(href);
          location.href = href;
        }
      }, 'Edit the collection: title, introduction, its lerpettes →'));
  }

  // ------------------------------------------------------------ save

  async function save() {
    if (busy) return;
    const text = buildMixtape();
    const mixChanged = text !== mixtape.text;
    const ctlChanged = controlText !== (control?.text ?? '');
    const renames = live()
      .filter((entry) => entry.kind === 'chapter' && entry.origId && entry.origId !== entry.fields.id && data.codeFolders.includes(entry.origId))
      .map((entry) => ({ from: entry.origId!, to: entry.fields.id }));
    const cardsChanged = collectionDirty();
    if (!mixChanged && !ctlChanged && renames.length === 0 && !cardsChanged) {
      toast('Nothing to save.');
      return;
    }

    // Prose alone is already on the page, re-rendered; anything else changes what the
    // player builds (panels, ids, order, captions, code boxes) or the cards on the
    // page's shelf, so the page reloads.
    const proseOnly = rawMixtape === null && !ctlChanged && !cardsChanged && !renames.length && !orderChanged() && head === origHead
      && entries.every((entry) => !entryDirty(entry) || (!entry.isNew && !entry.deleted && entry.heading === entry.origHeading
        && !entry.body.includes('```lerpit') && !entry.origBody.includes('```lerpit')));

    busy = true;
    bar.setBusy(true);
    stashResume({ path: location.pathname, open: live().filter((entry) => entry.panel).map((entry) => entry.fields.id), scrollY: window.scrollY });
    try {
      let reply: { hash: string | null; problems: LerpetteProblem[] } | null = null;
      if (mixChanged) {
        reply = await api('PUT', 'file', { c, l, file: 'mixtape.md', text, baseHash: mixtape.hash, quiet: true });
        mixtape = { text, hash: reply!.hash! };
      }
      if (ctlChanged) {
        reply = await api('PUT', 'file', { c, l, file: 'control.toml', text: controlText, baseHash: control?.hash ?? null, quiet: true });
        control = reply!.hash ? { text: controlText, hash: reply!.hash } : null;
      }
      if (cardsChanged) {
        const saved = await api<{ hash: string | null }>('PUT', 'file', { c, file: 'control.toml', text: collectionControl.text, baseHash: collectionControl.file?.hash ?? null, quiet: true });
        collectionControl.file = saved.hash ? { text: collectionControl.text, hash: saved.hash } : null;
      }
      for (const rename of renames) await api('POST', 'rename-code', { c, l, ...rename });
      // A freshly added chapter opens with something to run, rather than silently
      // inheriting its neighbour's runtime or sitting there with runtime-missing.
      const newChapters = live().filter((entry) => entry.kind === 'chapter' && entry.isNew).map((entry) => entry.fields.id);
      for (const id of newChapters) await api('POST', 'scaffold-chapter', { c, l, id });
      try {
        localStorage.removeItem(backupKey);
      } catch {}

      if (!proseOnly) {
        reloading = true;
        location.reload();
        return;
      }
      clearResume();
      for (const entry of entries) {
        entry.origBody = entry.body;
        entry.origHtml = entry.prose.innerHTML;
        entry.box.classList.remove('ed-dirty');
      }
      if (reply) {
        problems = reply.problems;
        bar.setProblems(problems.length);
      }
      changed();
      toast('Saved.', 'ok');
    } catch (error) {
      clearResume();
      if (error instanceof ApiFailure && error.status === 409) {
        const current = (error.detail as { current: FileState } | null)?.current ?? null;
        const which = mixChanged && current?.hash !== mixtape.hash ? 'mixtape.md' : 'control.toml';
        bar.ask(`${which} changed on disk since you opened it (another editor, or VS Code).`, [
          { label: 'Keep editing', primary: true, run: () => {} },
          {
            label: 'Overwrite with mine',
            run: () => {
              if (which === 'mixtape.md') mixtape = { text: mixtape.text, hash: current?.hash ?? '' };
              else control = current;
              void save();
            }
          },
          { label: 'Drop mine, reload', run: () => discardAndLeave(true) }
        ]);
      } else {
        toast((error as Error).message, 'bad', 7000);
      }
    } finally {
      busy = false;
      bar.setBusy(false);
    }
  }

  // ------------------------------------------------------------ leaving

  function discardAndLeave(stayInEditMode: boolean) {
    try {
      localStorage.removeItem(backupKey);
    } catch {}
    reloading = true;
    if (stayInEditMode) stashResume({ path: location.pathname, open: [], scrollY: window.scrollY });
    else clearResume(true);
    location.reload();
  }

  function done() {
    if (dirtyCount() === 0) {
      discardAndLeave(false);
      return;
    }
    bar.ask(`Leave edit mode and drop ${dirtyCount()} unsaved ${dirtyCount() === 1 ? 'change' : 'changes'}?`, [
      { label: 'Keep editing', primary: true, run: () => {} },
      { label: 'Drop them', run: () => discardAndLeave(false) }
    ]);
  }

  window.addEventListener('beforeunload', (event) => {
    if (!reloading && dirtyCount() > 0) event.preventDefault();
  });
  holdReloads(() => !reloading && dirtyCount() > 0);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  });

  // ------------------------------------------------------------ resume and restore

  const resume = readResume(location.pathname);
  if (resume) {
    clearResume();
    for (const id of resume.open) {
      const entry = entries.find((candidate) => candidate.fields.id === id);
      if (entry) openChapter(entry, false);
    }
    requestAnimationFrame(() => window.scrollTo(0, resume.scrollY));
  } else if (location.hash) {
    const entry = entries.find((candidate) => `#${candidate.box.id}` === location.hash);
    if (entry) openChapter(entry);
  }

  let draft: { at: number; baseHash: string; mixtape: string; control: string } | null = null;
  try {
    draft = JSON.parse(localStorage.getItem(backupKey) ?? 'null');
  } catch {}
  if (draft && (draft.mixtape !== mixtape.text || draft.control !== controlText)) {
    const when = new Date(draft.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const saved = draft;
    const drop = () => { try { localStorage.removeItem(backupKey); } catch {} };
    if (draft.baseHash === mixtape.hash) {
      bar.ask(`You have unsaved edits from ${when}.`, [
        { label: 'Restore them', primary: true, run: () => restore(saved) },
        { label: 'Drop them', run: drop }
      ]);
    } else {
      // The file moved on under the draft, so putting the draft back in place would
      // silently undo whatever changed it. As text, the author can see both.
      bar.ask(`Unsaved edits from ${when}, but mixtape.md changed on disk since.`, [
        { label: 'Open them as text', primary: true, run: () => restore(saved, true) },
        { label: 'Drop them', run: drop }
      ]);
    }
  }

  function restore(saved: { mixtape: string; control: string }, asText = false) {
    controlText = saved.control;
    const next = splitDocument(saved.mixtape);
    const sameShape = !asText && structured && next.sections.length === entries.length
      && next.sections.every((section, index) => section.kind === entries[index].kind);
    if (sameShape) {
      head = next.head;
      next.sections.forEach((section, index) => {
        const entry = entries[index];
        if (section.heading === entry.heading && section.body === entry.body) return;
        entry.heading = section.heading;
        entry.fields = readHeading(section.heading);
        entry.body = section.body;
        const title = entry.box.querySelector<HTMLElement>(':scope > .lerpette-head h2');
        if (title) title.textContent = entry.fields.title;
        entry.box.classList.add('ed-dirty');
        render(entry);
      });
    } else {
      rawMixtape = saved.mixtape;
      player.classList.add('ed-raw-mode');
      placeAddButtons();
      renderSettings();
      sheet.open();
    }
    changed();
    toast('Restored. Save to keep them.', 'ok');
  }

  changed();
}
