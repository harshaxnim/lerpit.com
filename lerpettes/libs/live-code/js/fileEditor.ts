import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import {
  autocompletion,
  acceptCompletion,
  closeCompletion,
  completeAnyWord,
  closeBrackets,
  closeBracketsKeymap
} from '@codemirror/autocomplete';
import { syntaxHighlighting, bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tagHighlighter, tags as t } from '@lezer/highlight';
import { regionMarking, setRegions, toLiveRegions } from './editorRegions';
import { createEditorStore, type EditorStore } from './editorStore';
import type { DerivedRegion } from './regions';

/**
 * A small multi-file editor that mounts into the article column rather than the
 * panel, so the code sits with the prose it is about and the result draws on the
 * right.
 *
 * CodeMirror does the editing: syntax highlighting, completion, undo, brackets.
 * Tabs are ours, because no editor ships them, and the order is the order the fence
 * named. Each file keeps its own EditorState, so switching tabs preserves that
 * file's cursor and undo history rather than just its text.
 *
 * The whole document is editable, including outside a region. Regions mark what the
 * chapter is about; see editorRegions.ts.
 */

/** A file as the compilers want it. */
export type EditorFile = {
  /** The path the fence named, which is what the compiler is told the file is. */
  name: string;
  source: string;
};

export type EditorStatus = 'idle' | 'busy' | 'ok' | 'bad';

/** One tab: a file, the document the reader opens, and what is behind the chips. */
export type EditorTab = {
  /** What the tab says. */
  label: string;
  /** Path relative to the chapter's code directory, as written in the fence. */
  path: string;
  /** The file with the starters in place, which is what the reader opens. */
  starter: string;
  /** Regions in that document. */
  regions: DerivedRegion[];
  /** The same file with the answers in place, or null when it sets no exercise. */
  solution: string | null;
  /** Hint prose by region id, for the regions that carry one. */
  hints: Record<string, string>;
};

export type FileEditorOptions = {
  tabs: EditorTab[];
  /** What run does. Rejecting is fine; the message becomes the status line. */
  onRun: (files: EditorFile[]) => Promise<void> | void;
  idleStatus: string;
  /** Run the author's answer instead, when the reader asks to see it work. */
  onRunSolution?: (files: EditorFile[]) => Promise<void> | void;
  /**
   * Where to keep the reader's edits between visits. The chapter's code path, so two
   * lessons with a file of the same name never read each other's work. Left out, the
   * box forgets everything on reload.
   */
  storageScope?: string;
};

export type FileEditor = {
  /** Current contents, with the open tab's live text folded back in. */
  getFiles: () => EditorFile[];
  status: (text: string, kind?: EditorStatus) => void;
  /** Append a line to the log. Pass null to clear and hide it. */
  log: (line: string | null) => void;
  /** Ask the editor to run, as though the button were pressed. */
  run: () => void;
  destroy: () => void;
};

/**
 * Tag-to-class map for syntax highlighting.
 *
 * This is `tagHighlighter`, the same public builder `@lezer/highlight`'s own
 * `classHighlighter` is made with. It emits stable `tok-` class names, so the colours
 * live in global.css with the rest of the site rather than in a JavaScript theme. The
 * stock `classHighlighter` would have done most of this, but it has no class for
 * function names, which is the distinction worth having.
 *
 * Resolution is most-specific-first: `tag.set` is walked in specificity order and stops
 * at the first match, so a call gets `tok-function` even though `variableName` is also
 * mapped. Order in this array does not matter.
 *
 * Every tag below is one the C++ or JavaScript grammar actually emits.
 */
const highlighter = tagHighlighter([
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier],
    class: 'tok-keyword'
  },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.string, t.special(t.string), t.character, t.escape, t.regexp], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom, t.literal, t.self], class: 'tok-literal' },
  { tag: [t.typeName, t.standard(t.typeName), t.className, t.namespace], class: 'tok-type' },
  { tag: [t.definition(t.typeName), t.definition(t.className)], class: 'tok-type tok-def' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: t.function(t.definition(t.variableName)), class: 'tok-function tok-def' },
  { tag: [t.variableName, t.propertyName, t.labelName], class: 'tok-name' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], class: 'tok-name tok-def' },
  // C++ preprocessor lines, macro names, and JavaScript decorators.
  { tag: [t.meta, t.processingInstruction, t.macroName, t.special(t.name)], class: 'tok-meta' },
  {
    tag: [
      t.operator,
      t.arithmeticOperator,
      t.logicOperator,
      t.bitwiseOperator,
      t.compareOperator,
      t.definitionOperator,
      t.updateOperator,
      t.derefOperator
    ],
    class: 'tok-operator'
  },
  { tag: t.invalid, class: 'tok-invalid' }
]);

/** Blank lines left under the longest file, so there is somewhere to type. */
const SPARE_LINES = 4;

/** Pick a language by extension; unknown files fall back to JavaScript. */
function languageFor(name: string) {
  return /\.(cpp|cc|cxx|c|h|hpp)$/.test(name) ? cpp() : javascript({ typescript: /\.tsx?$/.test(name) });
}

export function createFileEditor(host: HTMLElement, options: FileEditorOptions): FileEditor {
  const tabs = options.tabs;
  if (tabs.length === 0) {
    throw new Error('A code box needs at least one file.');
  }

  /** Read-only is swapped in when the reader is looking at the author's answer. */
  const editable = new Compartment();
  const store: EditorStore | null = options.storageScope ? createEditorStore(options.storageScope) : null;

  let running = false;
  let showingSolution = false;
  let showingHint = false;
  let activeIndex = 0;

  const root = document.createElement('div');
  root.className = 'live-code';

  const tabStrip = document.createElement('div');
  tabStrip.className = 'live-code__tabs';
  tabStrip.setAttribute('role', 'tablist');
  tabStrip.setAttribute('aria-label', 'Files');

  const chips = document.createElement('span');
  chips.className = 'live-code__modes';

  const hintChip = document.createElement('button');
  hintChip.type = 'button';
  hintChip.className = 'live-code__mode';
  hintChip.textContent = 'hint';

  const solutionChip = document.createElement('button');
  solutionChip.type = 'button';
  solutionChip.className = 'live-code__mode live-code__mode--solution';
  solutionChip.textContent = 'solution';

  chips.append(hintChip, solutionChip);

  const banner = document.createElement('p');
  banner.className = 'live-code__banner';
  banner.hidden = true;

  const editorHost = document.createElement('div');
  editorHost.className = 'live-code__editor';

  const bar = document.createElement('div');
  bar.className = 'live-code__bar';

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'live-code__button';
  runButton.textContent = 'Run';

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'live-code__button live-code__button--ghost';
  resetButton.textContent = 'Reset';

  const status = document.createElement('p');
  status.className = 'live-code__status';
  status.dataset.kind = 'idle';
  status.textContent = options.idleStatus;

  bar.append(runButton, resetButton, status);

  const logEl = document.createElement('pre');
  logEl.className = 'live-code__log';
  logEl.hidden = true;

  root.append(tabStrip, banner, editorHost, bar, logEl);
  host.replaceChildren(root);

  const appendLog = (line: string) => {
    logEl.hidden = false;
    logEl.textContent += (logEl.textContent ? '\n' : '') + line;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setStatus = (text: string, kind: EditorStatus = 'idle') => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  const makeState = (tab: EditorTab, text: string, regions: DerivedRegion[], readOnly: boolean) => {
    const state = EditorState.create({
      doc: text,
      extensions: [
        // Composed by hand rather than using basicSetup, which brings a search panel,
        // code folding and the language modes' snippet completions. Symbols only here.
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        // Enabled rather than written. Every one of these is a first-party CodeMirror
        // extension, so what a reader knows from any other editor built on it applies
        // here too, and there is nothing of ours to maintain.
        foldGutter(),
        // At the foot of the editor, where it groups with the run row: both are
        // controls, and the code stays where the reader was looking.
        search(),
        // Put the cursor in a symbol and every other use of it lights up. Selecting
        // it first is not required: highlightWordAroundCursor is what makes this a
        // symbol highlight rather than a find-the-selection, and it is off by default.
        // wholeWords keeps `force` from lighting up `forces`, which is the whole
        // point when the thing being traced is a name.
        highlightSelectionMatches({ highlightWordAroundCursor: true, wholeWords: true }),
        languageFor(tab.path),
        syntaxHighlighting(highlighter),
        regionMarking(),
        editable.of(EditorState.readOnly.of(readOnly)),
        // `override` replaces every source the language would otherwise contribute,
        // which is what removes the snippet templates. What is left is the identifiers
        // already written in the file, for both languages.
        autocompletion({ override: [completeAnyWord], icons: false }),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnly) {
            saveSoon();
          }
        }),
        EditorView.contentAttributes.of({ 'aria-label': `${tab.label}, editable` }),
        // Above the default keymap, so Tab is ours before anything else sees it.
        Prec.highest(
          keymap.of([
            // Tab takes the completion when the popup is open, and indents otherwise.
            { key: 'Tab', run: acceptCompletion },
            indentWithTab,
            {
              key: 'Mod-Enter',
              run: () => {
                void run();
                return true;
              }
            },
            {
              // Capturing Tab traps keyboard focus, so Escape is the way out: it
              // dismisses the completion popup first, and leaves the editor after.
              key: 'Escape',
              run: (view) => {
                if (closeCompletion(view)) {
                  return true;
                }
                view.contentDOM.blur();
                return true;
              }
            }
          ])
        ),
        // searchKeymap before the default one, so Mod-f opens the panel rather than
        // falling through to the browser's own find, which cannot see a virtualised
        // document and would only search the lines currently rendered.
        keymap.of([...closeBracketsKeymap, ...searchKeymap, ...foldKeymap, ...defaultKeymap, ...historyKeymap])
      ]
    });

    // Regions are tracked as positions, which needs the document to exist first.
    return state.update({ effects: setRegions.of(toLiveRegions(state, regions)) }).state;
  };

  /**
   * Writes are held back until typing pauses. Committing on every keystroke turns a
   * sentence of code into dozens of synchronous localStorage writes on the main
   * thread, which is exactly the thread the editor is drawing on.
   */
  let saveTimer = 0;
  const saveSoon = () => {
    if (!store) {
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      stash();
      tabs.forEach((tab, index) => {
        store.write(tab.path, tab.starter, readerStates[index].doc.toString());
      });
    }, 400);
  };

  /** The reader's own work, one state per tab, restored if they have been here before. */
  const readerStates = tabs.map((tab) =>
    makeState(tab, store?.read(tab.path, tab.starter) ?? tab.starter, tab.regions, false)
  );
  /** The author's answer, built once on first use and never edited. */
  const solutionStates = new Map<number, EditorState>();

  const view = new EditorView({ state: readerStates[activeIndex], parent: editorHost });

  /** Keep the open file's state, so its cursor and undo history survive a switch. */
  const stash = () => {
    if (!showingSolution) {
      readerStates[activeIndex] = view.state;
    }
  };

  const readFiles = (): EditorFile[] => {
    stash();
    return tabs.map((tab, index) => ({
      name: tab.path,
      source: (index === activeIndex && !showingSolution ? view.state : readerStates[index]).doc.toString()
    }));
  };

  const solutionFiles = (): EditorFile[] =>
    tabs.map((tab) => ({ name: tab.path, source: tab.solution ?? tab.starter }));

  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    runButton.disabled = true;
    try {
      await options.onRun(readFiles());
    } catch (error) {
      fail(error);
    } finally {
      running = false;
      syncControls();
    }
  };

  /**
   * The status line is one line that does not wrap, so a long compiler message would
   * be cut off at narrow widths. The log wraps and scrolls, so the full text always
   * has somewhere to be, whichever half of the build produced it.
   */
  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'bad');
    if (!logEl.textContent?.includes(message)) {
      appendLog(message);
    }
  }

  const runSolution = async () => {
    const runner = options.onRunSolution ?? options.onRun;
    running = true;
    runButton.disabled = true;
    try {
      await runner(solutionFiles());
    } catch (error) {
      fail(error);
    } finally {
      running = false;
      syncControls();
    }
  };

  const tabButtons: HTMLButtonElement[] = [];

  const hintsFor = (index: number) => Object.entries(tabs[index].hints);
  const hasSolution = tabs.some((tab) => tab.solution !== null);

  function syncControls() {
    const hints = hintsFor(activeIndex);

    hintChip.hidden = hints.length === 0;
    hintChip.classList.toggle('is-on', showingHint);
    hintChip.setAttribute('aria-pressed', showingHint ? 'true' : 'false');
    hintChip.disabled = showingSolution;

    solutionChip.hidden = !hasSolution;
    solutionChip.classList.toggle('is-on', showingSolution);
    solutionChip.setAttribute('aria-pressed', showingSolution ? 'true' : 'false');

    root.classList.toggle('is-solution', showingSolution);
    runButton.disabled = running || showingSolution;
    resetButton.disabled = running || showingSolution;

    // What the answer costs the reader is a tooltip on the chip that swaps it, not a
    // band above the code: the warm ground and the dead run button already say the
    // state, and a second line saying the same thing pushes the code down for nothing.
    solutionChip.dataset.tooltip = showingSolution
      ? "The author's answer, read only. Your own code is still here behind it."
      : "Show the author's answer, and run it in the panel.";

    // A hint is prose the reader has to read, so it takes the row.
    if (!showingSolution && showingHint && hints.length > 0) {
      banner.hidden = false;
      banner.className = 'live-code__banner live-code__banner--hint';
      banner.textContent =
        hints.length === 1 ? hints[0][1] : hints.map(([id, text]) => `${id}: ${text}`).join('\n');
      return;
    }

    banner.hidden = true;
  }

  const showTab = (index: number) => {
    if (index === activeIndex) {
      return;
    }

    stash();
    activeIndex = index;
    view.setState(currentStateFor(index));

    tabButtons.forEach((button, i) => {
      const isActive = i === index;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    });

    // A hint belongs to the file it was written in, so moving tab puts it away.
    showingHint = false;
    syncControls();
  };

  function currentStateFor(index: number): EditorState {
    if (!showingSolution) {
      return readerStates[index];
    }

    const cached = solutionStates.get(index);
    if (cached) {
      return cached;
    }

    const tab = tabs[index];
    // A file with no exercise reads the same either way, so it shows what it already
    // showed rather than a second copy of itself.
    const built = makeState(tab, tab.solution ?? tab.starter, tab.regions, true);
    solutionStates.set(index, built);
    return built;
  }

  // One file needs no tab strip; the filename would just be chrome.
  if (tabs.length > 1) {
    tabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'live-code__tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.tabIndex = index === 0 ? 0 : -1;
      button.classList.toggle('is-active', index === 0);
      button.textContent = tab.label;
      button.title = tab.path;
      button.addEventListener('click', () => showTab(index));
      // Left and right move between tabs, which is what a tablist is expected to do.
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return;
        }
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        showTab(next);
        tabButtons[next]?.focus();
      });
      tabStrip.append(button);
      tabButtons.push(button);
    });
  }

  tabStrip.append(chips);

  hintChip.addEventListener('click', () => {
    showingHint = !showingHint;
    syncControls();
  });

  solutionChip.addEventListener('click', () => {
    stash();
    showingSolution = !showingSolution;
    showingHint = false;
    view.setState(currentStateFor(activeIndex));
    syncControls();

    if (showingSolution) {
      void runSolution();
    } else {
      void run();
    }
  });

  runButton.addEventListener('click', () => void run());
  resetButton.addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    tabs.forEach((tab, index) => {
      store?.clear(tab.path);
      readerStates[index] = makeState(tab, tab.starter, tab.regions, false);
    });
    view.setState(readerStates[activeIndex]);
    showingHint = false;
    syncControls();
    void run();
  });

  syncControls();
  sizeToContent();

  /**
   * Ask the box for the height this editor wants.
   *
   * Measured from the longest document any tab holds, answer included, so the box is
   * the same height whichever tab is open and whichever chip is pressed. Growing it
   * as the reader types would reflow every paragraph below it mid-keystroke; the
   * editor scrolls inside instead. global.css clamps the number at both ends.
   */
  function sizeToContent() {
    const longest = tabs.reduce((most, tab) => {
      const lines = Math.max(tab.starter.split('\n').length, tab.solution?.split('\n').length ?? 0);
      return Math.max(most, lines);
    }, 0);

    // One rendered line, not the content box divided by its lines: CodeMirror
    // stretches the content to fill the editor, so that average is inflated by
    // whatever height the box happened to start at. Asking CodeMirror instead gives
    // a cached figure from before this box was laid out, which is worse.
    const perLine = view.contentDOM.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (!perLine) {
      return;
    }

    const chrome = tabStrip.offsetHeight + bar.offsetHeight;
    // Room for a few lines the reader has not written yet. Sized exactly to the
    // longest file, an exercise that asks for a four line body starts scrolling on
    // the first one.
    const wanted = Math.round(perLine * (longest + SPARE_LINES) + chrome);
    host.style.setProperty('--code-h', `${wanted}px`);
  }

  return {
    getFiles: readFiles,
    status: setStatus,
    log: (line: string | null) => {
      if (line === null) {
        logEl.textContent = '';
        logEl.hidden = true;
        return;
      }

      appendLog(line);
    },
    run: () => void run(),
    destroy: () => {
      window.clearTimeout(saveTimer);
      view.destroy();
      host.replaceChildren();
    }
  };
}
