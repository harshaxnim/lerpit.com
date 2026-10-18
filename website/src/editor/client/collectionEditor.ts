/*
 * Edit mode on a collection page, and the "new" flows on the library page.
 *
 * On a collection page the title and introduction are edited where they stand, and the
 * card style and palette are picked in the sheet: every card on the page is redrawn by
 * the same cardArt() the build uses, as you click, so you choose by looking.
 */

import type { LerpetteProblem } from '@lerpit/framework/types';
import { DRAFT, parseCollectionControl, parseControl, PUBLISHED, UNLISTED, type LerpetteStatus } from '../../lib/control';
import { autoStyleFor, blankCard, cardPickers, redrawCard } from './cards';
import { joinDocument, splitDocument, tidyBody, writeHeading, readHeading } from '../lib/mixtapeDoc';
import { setKey, TomlEditError } from '../lib/tomlEdit';
import { api, ApiFailure, createBar, createSheet, debounce, field, h, problemHtml, segmented, toast, type Sheet } from './dom';
import { createMarkdownEditor } from './markdownEditor';
import { clearResume, createAndGo, holdReloads, markOn } from './resume';

type FileState = { text: string; hash: string } | null;
type CardLerpette = { slug: string; title: string; summary: string; publishedOn: string; chapters: number; status: string; problems: number; control: FileState };
type CollectionData = {
  slug: string;
  href: string;
  title: string;
  document: FileState;
  control: FileState;
  problems: LerpetteProblem[];
  lerpettes: CardLerpette[];
};
type Tree = { author: string; collections: Array<{ slug: string; title: string }> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63);

// ------------------------------------------------------------------ new lerpette / collection forms

function newLerpetteForm(sheet: Sheet, c: string, collectionTitle: string, author: string, taken: string[]) {
  const title = h('input.ed-input', { placeholder: 'Springs, by hand', 'aria-label': 'Title' }) as HTMLInputElement;
  const slug = h('input.ed-input', { placeholder: 'springs-by-hand', 'aria-label': 'Folder', spellcheck: false }) as HTMLInputElement;
  const summary = h('textarea.ed-raw', { rows: 3, placeholder: 'One paragraph: what the reader will build. The library card shows it.', 'aria-label': 'Summary' }) as HTMLTextAreaElement;
  const who = h('input.ed-input', { value: author, 'aria-label': 'Author' }) as HTMLInputElement;
  let slugTouched = false;
  title.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(title.value);
  });
  slug.addEventListener('input', () => (slugTouched = true));
  const create = h('button.ed-btn.ed-btn--primary', { type: 'submit' }, 'Create draft') as HTMLButtonElement;
  const form = h('form.ed-form', {},
    h('p.ed-field__hint', { html: `A new lerpette in <b>${collectionTitle.replace(/</g, '&lt;')}</b>. It starts as a <b>draft</b>, so only you can see it, with one chapter and a 2D viewport.` }),
    field('Title', title),
    field('Folder, and so its URL', slug, `<code>/${c}/…/</code> · lowercase letters, digits and dashes`),
    field('Summary', summary),
    field('Author', who),
    h('div.ed-row', {}, create));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!title.value.trim()) return toast('Give it a title.', 'bad');
    if (!SLUG.test(slug.value)) return toast('The folder must be lowercase letters, digits and dashes.', 'bad');
    if (taken.includes(slug.value)) return toast(`${c} already has ${slug.value}.`, 'bad');
    create.disabled = true;
    try {
      await createAndGo(() => api<{ href: string }>('POST', 'lerpette', { c, slug: slug.value, title: title.value, summary: summary.value, author: who.value }));
    } catch (error) {
      toast((error as Error).message, 'bad', 6000);
      create.disabled = false;
    }
  });
  sheet.body.replaceChildren(form);
  sheet.el.querySelector('.ed-sheet__title')!.textContent = 'New lerpette';
  sheet.open();
  title.focus();
}

function newCollectionForm(sheet: Sheet, tree: Tree) {
  const title = h('input.ed-input', { placeholder: 'Animation', 'aria-label': 'Title' }) as HTMLInputElement;
  const slug = h('input.ed-input', { placeholder: 'animation', 'aria-label': 'Folder', spellcheck: false }) as HTMLInputElement;
  const summary = h('textarea.ed-raw', { rows: 3, placeholder: 'What this collection is about, in a sentence or two.', 'aria-label': 'Summary' }) as HTMLTextAreaElement;
  const choice: { style: string | null; palette: string | null } = { style: null, palette: null };
  const preview = blankCard();
  const auto = () => autoStyleFor(title.value.trim() || 'New collection', [...tree.collections.map((entry) => entry.title), title.value.trim() || 'New collection']);
  const redraw = () => redrawCard(preview, { title: 'First steps', collection: title.value.trim() || 'New collection', summary: summary.value, date: '', chapters: 1 }, {
    ...(choice.style ? { style: choice.style } : { style: auto() }),
    ...(choice.palette ? { palette: choice.palette } : {})
  });
  const pickers = h('div');
  const drawPickers = () => {
    const { styles, palettes } = cardPickers(choice, auto(), () => redraw());
    pickers.replaceChildren(field('Card style', styles), field('Palette', palettes));
  };
  let slugTouched = false;
  title.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(title.value);
    redraw();
  });
  title.addEventListener('change', drawPickers);
  slug.addEventListener('input', () => (slugTouched = true));
  const create = h('button.ed-btn.ed-btn--primary', { type: 'submit' }, 'Create collection') as HTMLButtonElement;
  const form = h('form.ed-form', {},
    field('Title', title),
    field('Folder, and so its URL', slug, '<code>/…/</code> · lowercase letters, digits and dashes'),
    field('Summary', summary),
    h('div.ed-preview', {}, preview, h('p.ed-field__hint', { text: 'Its cards will look like this. Change it any time on the collection page.' })),
    pickers,
    h('div.ed-row', {}, create));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!title.value.trim()) return toast('Give it a title.', 'bad');
    if (!SLUG.test(slug.value)) return toast('The folder must be lowercase letters, digits and dashes.', 'bad');
    if (tree.collections.some((entry) => entry.slug === slug.value)) return toast(`There is already a collection at ${slug.value}.`, 'bad');
    create.disabled = true;
    try {
      await createAndGo(() => api<{ href: string }>('POST', 'collection', {
        slug: slug.value, title: title.value, summary: summary.value,
        ...(choice.style ? { cardStyle: choice.style } : {}), ...(choice.palette ? { cardPalette: choice.palette } : {})
      }));
    } catch (error) {
      toast((error as Error).message, 'bad', 6000);
      create.disabled = false;
    }
  });
  drawPickers();
  redraw();
  sheet.body.replaceChildren(form);
  sheet.el.querySelector('.ed-sheet__title')!.textContent = 'New collection';
  sheet.open();
  title.focus();
}

function addNewCards(showcase: HTMLElement, onClick: () => void) {
  const grid = showcase.querySelector('.cassette-grid');
  grid?.append(h('button.ed-new-card', { type: 'button', onclick: onClick },
    h('span.ed-new-card__plus', { text: '+' }),
    h('span', { text: 'New lerpette' }),
    h('small', { text: 'starts as a draft' })));
}

// ------------------------------------------------------------------ the library

export async function startLibrary() {
  const tree = await api<Tree>('GET', 'tree');
  document.body.classList.add('ed-on');
  const sheet = createSheet('New');
  createBar({ label: 'Editing', title: 'The library', onDone: () => leave() });

  const header = document.querySelector('.collection-header');
  header?.append(h('button.ed-btn.ed-btn--primary.ed-new-collection', { type: 'button', onclick: () => newCollectionForm(sheet, tree) }, '+ New collection'));
  for (const showcase of document.querySelectorAll<HTMLElement>('.archive-collection[data-collection]')) {
    const c = showcase.dataset.collection!;
    const entry = tree.collections.find((candidate) => candidate.slug === c);
    const taken = [...showcase.querySelectorAll<HTMLAnchorElement>('.cassette-card')].map((card) => card.pathname.split('/').filter(Boolean)[1]);
    addNewCards(showcase, () => newLerpetteForm(sheet, c, entry?.title ?? c, tree.author, taken));
    // Beside "Open collection", in the same button: the same page, already in edit mode.
    const open = showcase.querySelector<HTMLAnchorElement>('.section-heading a.button');
    const href = `/${c}/`;
    const edit = h('a.button.button--ghost.ed-edit-collection', {
      href,
      onclick: (event: Event) => {
        event.preventDefault();
        markOn(href);
        location.href = href;
      }
    }, 'Edit collection');
    // The heading spaces its children apart, so the two buttons go in as one group.
    const group = h('div.ed-heading-actions', {}, edit);
    if (open) {
      open.before(group);
      group.append(open);
    } else {
      showcase.querySelector('.section-heading')?.append(group);
    }
  }
}

function leave() {
  clearResume(true);
  location.reload();
}

// ------------------------------------------------------------------ one collection

export async function startCollection(showcase: HTMLElement, c: string) {
  const [data, tree] = await Promise.all([api<CollectionData>('GET', 'collection', undefined, { c }), api<Tree>('GET', 'tree')]);
  let doc = data.document;
  let control = data.control;
  let controlText = control?.text ?? '';
  const problems = data.problems;
  let reloading = false;
  let busy = false;

  const parts = splitDocument(doc?.text ?? '');
  const title = parts.sections[0]?.kind === 'title' ? parts.sections[0] : null;
  const origTitle = title ? readHeading(title.heading).title : data.title;
  const origBody = title ? joinDocument({ head: '', sections: parts.sections }).slice(title.heading.length) : '';
  let titleText = origTitle;
  let body = origBody;

  document.body.classList.add('ed-on');
  const sheet = createSheet('Collection settings');
  const bar = createBar({
    label: 'Editing',
    title: data.title,
    onSave: () => void save(),
    onSettings: () => {
      renderSettings();
      sheet.toggle();
    },
    settingsLabel: '⚙ Cards & settings',
    onProblems: () => {
      renderSettings();
      sheet.open();
    },
    onDone: () => {
      if (dirty() === 0) return leave();
      bar.ask(`Leave edit mode and drop ${dirty()} unsaved ${dirty() === 1 ? 'change' : 'changes'}?`, [
        { label: 'Keep editing', primary: true, run: () => {} },
        { label: 'Drop them', run: () => { reloading = true; leave(); } }
      ]);
    }
  });
  bar.setProblems(problems.length);

  // Each lerpette's control.toml, for its status and order: edited here as text, saved
  // with the collection.
  const lerpetteControls = new Map(data.lerpettes.map((entry) => [entry.slug, { file: entry.control, text: entry.control?.text ?? '' }]));
  const lerpettesDirty = () => [...lerpetteControls.values()].filter((entry) => entry.text !== (entry.file?.text ?? '')).length;

  const dirty = () => (titleText !== origTitle ? 1 : 0) + (body !== origBody ? 1 : 0) + (controlText !== (control?.text ?? '') ? 1 : 0) + lerpettesDirty();
  const changed = () => bar.setDirty(dirty());

  // -------------------------------------------------- the cards, redrawn live

  const allTitles = () => tree.collections.map((entry) => (entry.slug === c ? titleText.trim() || c : entry.title));
  const autoStyle = () => autoStyleFor(titleText.trim() || c, allTitles());
  const redrawCards = () => {
    const { control: parsed } = parseCollectionControl(controlText);
    for (const card of showcase.querySelectorAll<HTMLAnchorElement>('a.cassette-card')) {
      const slug = card.pathname.split('/').filter(Boolean)[1];
      const lerpette = data.lerpettes.find((entry) => entry.slug === slug);
      if (!lerpette) continue;
      redrawCard(card, { title: lerpette.title, collection: titleText.trim() || c, summary: lerpette.summary, date: lerpette.publishedOn, chapters: lerpette.chapters }, {
        style: parsed.cardStyle ?? autoStyle(),
        ...(parsed.cardPalette ? { palette: parsed.cardPalette } : {})
      });
    }
  };

  // -------------------------------------------------- title and introduction, in place

  if (!title) toast('collection.md has no # title; edit it as text in Settings.', 'info', 6000);
  const heading = showcase.querySelector<HTMLElement>(`#collection-${c}`);
  const copy = showcase.querySelector<HTMLElement>('.collection-copy');
  if (heading && title) {
    const input = h('input.ed-input.ed-input--title.ed-input--collection', { value: titleText, 'aria-label': 'Collection title' }) as HTMLInputElement;
    input.addEventListener('input', () => {
      titleText = input.value;
      bar.el.querySelector('.ed-bar__title')!.textContent = titleText;
      changed();
      redrawCards();
    });
    heading.hidden = true;
    heading.after(input);
  }

  const render = debounce(async () => {
    try {
      const reply = await api<{ html: string }>('POST', 'render', { c, markdown: body });
      if (copy) copy.innerHTML = reply.html;
    } catch (error) {
      toast((error as Error).message, 'bad');
    }
  }, 220);
  if (copy && title) {
    const editor = createMarkdownEditor({
      value: body.replace(/^\n/, ''),
      placeholder: 'What the collection is about. The first paragraph is its summary.',
      onChange: (text) => {
        body = `\n${text}`;
        changed();
        render();
      },
      keys: [{ key: 'Mod-s', run: () => (void save(), true) }]
    });
    copy.before(h('div.ed-chapter.ed-chapter--collection', {}, editor.el, h('p.ed-chapter__preview-label', { text: 'Preview · as the page renders it' })));
  }

  // -------------------------------------------------- new lerpette

  addNewCards(showcase, () => newLerpetteForm(sheet, c, titleText, tree.author, data.lerpettes.map((entry) => entry.slug)));

  // -------------------------------------------------- settings

  function renderSettings() {
    sheet.el.querySelector('.ed-sheet__title')!.textContent = 'Collection settings';
    const { control: parsed, problems: tomlProblems } = parseCollectionControl(controlText);
    const choice = { style: parsed.cardStyle, palette: parsed.cardPalette };
    const { styles, palettes } = cardPickers(choice, autoStyle(), (key, value) => {
      try {
        controlText = setKey(controlText, key, value);
      } catch (error) {
        toast(error instanceof TomlEditError ? error.message : String(error), 'bad', 6000);
      }
      changed();
      redrawCards();
      raw.value = controlText;
    });
    const raw = h('textarea.ed-raw', { spellcheck: false, rows: 6, 'aria-label': 'control.toml' }) as HTMLTextAreaElement;
    raw.value = controlText;
    raw.addEventListener('input', () => {
      controlText = raw.value;
      changed();
      redrawCards();
    });
    raw.addEventListener('change', renderSettings);

    // One row per lerpette: its status and its place in the collection.
    const rows = data.lerpettes.map((entry) => {
      const state = lerpetteControls.get(entry.slug)!;
      const own = parseControl(state.text).control;
      const edit = (apply: (text: string) => string) => {
        try {
          state.text = apply(state.text);
          changed();
        } catch (error) {
          toast(error instanceof TomlEditError ? error.message : String(error), 'bad', 6000);
        }
      };
      const order = h('input.ed-input.ed-input--order', { type: 'number', step: 1, value: own.order ?? '', placeholder: '—', 'aria-label': `Order of ${entry.title}` }) as HTMLInputElement;
      order.addEventListener('change', () => edit((text) => setKey(text, 'order', order.value === '' ? null : Math.round(Number(order.value)))));
      return h('div.ed-lerpette', {},
        h('a.ed-lerpette__title', { href: `/${c}/${entry.slug}/`, text: entry.title, title: 'Open it' }),
        h('div.ed-lerpette__controls', {},
          segmented<LerpetteStatus>(
            [{ value: PUBLISHED, label: 'Published' }, { value: UNLISTED, label: 'Unlisted' }, { value: DRAFT, label: 'Draft' }],
            own.status,
            (value) => edit((text) => setKey(text, 'status', value === PUBLISHED ? null : value))),
          order));
    });

    sheet.body.replaceChildren(
      h('section.ed-group', {},
        h('p.ed-field__hint', { text: 'Every card in this collection draws these. The cards on the page redraw as you pick.' }),
        field('Card style', styles),
        field('Palette', palettes)),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: `Lerpettes (${data.lerpettes.length})` }),
        h('p.ed-field__hint', { text: 'Status, and order in the collection (lowest first; the rest follow newest first). Saved to each one\'s control.toml.' }),
        ...(rows.length ? rows : [h('p.ed-field__hint', { text: 'None yet.' })])),
      h('section.ed-group', {},
        h('h3.ed-group__title', { text: `Problems (${problems.length})` }),
        h('ul.ed-problems', {}, ...(problems.length
          ? problems.map((problem) => h('li', {}, h('p', { html: problemHtml(problem.message) }), problem.fix ? h('p.ed-problems__fix', { html: problemHtml(problem.fix) }) : null))
          : [h('li.ed-problems__none', { text: 'Nothing. The site finds no problem here.' })]))),
      h('details.ed-group', {},
        h('summary.ed-group__title', { text: 'control.toml as text' }),
        tomlProblems.length ? h('ul.ed-chapter__problems', {}, ...tomlProblems.map((problem) => h('li', { text: problem.what }))) : null,
        raw),
      h('details.ed-group', { open: !title },
        h('summary.ed-group__title', { text: 'collection.md as text' }),
        rawDocArea()));
  }

  let rawDoc: string | null = null;
  function rawDocArea() {
    const area = h('textarea.ed-raw.ed-raw--tall', { spellcheck: false, rows: 10, 'aria-label': 'collection.md' }) as HTMLTextAreaElement;
    area.value = rawDoc ?? buildDoc();
    area.addEventListener('input', () => {
      rawDoc = area.value;
      bar.setDirty(dirty() + 1);
    });
    return area;
  }

  function buildDoc(): string {
    if (rawDoc !== null) return rawDoc;
    if (!title) return doc?.text ?? '';
    const headingLine = titleText === origTitle ? title.heading : writeHeading({ ...readHeading(title.heading), title: titleText });
    return parts.head + headingLine + (body === origBody ? origBody : tidyBody(body, true));
  }

  async function save() {
    if (busy) return;
    const text = buildDoc();
    const docChanged = text !== (doc?.text ?? '');
    const ctlChanged = controlText !== (control?.text ?? '');
    if (!docChanged && !ctlChanged && lerpettesDirty() === 0) return toast('Nothing to save.');
    busy = true;
    bar.setBusy(true);
    try {
      if (docChanged) {
        const reply = await api<{ hash: string }>('PUT', 'file', { c, file: 'collection.md', text, baseHash: doc?.hash ?? null, quiet: true });
        doc = { text, hash: reply.hash };
      }
      if (ctlChanged) {
        const reply = await api<{ hash: string | null }>('PUT', 'file', { c, file: 'control.toml', text: controlText, baseHash: control?.hash ?? null, quiet: true });
        control = reply.hash ? { text: controlText, hash: reply.hash } : null;
      }
      for (const [l, state] of lerpetteControls) {
        if (state.text === (state.file?.text ?? '')) continue;
        const reply = await api<{ hash: string | null }>('PUT', 'file', { c, l, file: 'control.toml', text: state.text, baseHash: state.file?.hash ?? null, quiet: true });
        state.file = reply.hash ? { text: state.text, hash: reply.hash } : null;
      }
      // A collection page is light, so it simply reloads onto what is now on disk.
      reloading = true;
      markOn(location.pathname);
      location.reload();
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409) {
        bar.ask('The file changed on disk since you opened it.', [
          { label: 'Keep editing', primary: true, run: () => {} },
          { label: 'Drop mine, reload', run: () => { reloading = true; markOn(location.pathname); location.reload(); } }
        ]);
      } else {
        toast((error as Error).message, 'bad', 7000);
      }
    } finally {
      busy = false;
      bar.setBusy(false);
    }
  }

  window.addEventListener('beforeunload', (event) => {
    if (!reloading && dirty() > 0) event.preventDefault();
  });
  holdReloads(() => !reloading && dirty() > 0);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  });
  changed();
}
