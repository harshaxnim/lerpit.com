import {
  createFileEditor,
  deriveSource,
  hintText,
  loadLiveCodeFile,
  parseFence,
  scanRegions,
  tabLabel,
  type EditorFile,
  type EditorTab,
  type FileEditor
} from '@lerpit/libs/live-code/js';

/**
 * Every code box on the page, built once when the page loads.
 *
 * An editor sits in the prose, in the left column, beside the words it is about. It
 * belongs to the document rather than to the panel, so it has no business waiting for
 * a chapter to become the active one: a reader scrolling past a chapter should see the
 * code they will be asked to write, not an empty rectangle that fills in later.
 *
 * That is the whole reason this is separate from the runtimes. A runtime is built and
 * torn down as the reader moves between chapters; these are built once and outlive all
 * of it. What a runtime does is claim the boxes in its own section, so that pressing
 * run compiles into that chapter's panels.
 *
 * Pressing run on a chapter the reader has scrolled away from activates it first. The
 * alternative is building into a panel nobody is looking at, which would silently
 * replace what is on screen with the result of a different chapter.
 */

export type ChapterRun = (editor: FileEditor, files: EditorFile[]) => Promise<void> | void;

export type EditorLayer = {
  /** The boxes inside one chapter's section, in document order. */
  editorsFor(stepId: string): FileEditor[];
  /** A runtime taking responsibility for what run does in its own section. */
  claim(stepId: string, run: ChapterRun): void;
  /** A runtime going away. Its boxes stay; they just stop having anywhere to build. */
  release(stepId: string): void;
  destroy(): void;
};

/** Read one fence: what it names, what those files hold, and what the reader gets. */
async function buildTabs(codePath: string, spec: string): Promise<EditorTab[]> {
  const { entries } = parseFence(spec);
  const tabs: EditorTab[] = [];

  for (const entry of entries) {
    const source = await loadLiveCodeFile(codePath, entry.path);
    const starter = deriveSource(source, 'starter');
    const solution = deriveSource(source, 'solution');
    const { regions } = scanRegions(source);

    // The fence's id picks which exercise this box is about, so only that `edit`
    // region is marked. `highlight` and `hide` are properties of the file rather than
    // exercises, so they always apply.
    const shown = starter.regions.filter(
      (region) => region.kind !== 'edit' || !entry.regionId || region.id === entry.regionId
    );

    const hints: Record<string, string> = {};
    for (const region of shown) {
      const hint = hintText(source, region.id);
      if (hint) {
        hints[region.id] = hint;
      }
    }

    tabs.push({
      label: tabLabel(entry.path),
      path: entry.path,
      starter: starter.text,
      regions: shown,
      // A file that sets no exercise reads the same either way, and offering to reveal
      // an identical copy of itself is worse than not offering.
      solution: regions.some((region) => region.kind === 'edit') ? solution.text : null,
      hints
    });
  }

  return tabs;
}

export type EditorLayerOptions = {
  /** The chapter sections on the page, each carrying `data-section-id`. */
  sections: HTMLElement[];
  /** Where a chapter's source files live, by step id. */
  codePathFor: (stepId: string) => string | null;
  /** Make this chapter the active one before its build lands in the panel. */
  activate: (stepId: string) => Promise<void>;
  idleStatus?: string;
};

export async function createEditorLayer(options: EditorLayerOptions): Promise<EditorLayer> {
  const byStep = new Map<string, FileEditor[]>();
  const runs = new Map<string, ChapterRun>();

  for (const section of options.sections) {
    const stepId = section.dataset.sectionId;
    if (!stepId) {
      continue;
    }

    const hosts = [...section.querySelectorAll<HTMLElement>('[data-lerpit-code]')];
    if (hosts.length === 0) {
      continue;
    }

    const codePath = options.codePathFor(stepId);
    if (!codePath) {
      continue;
    }

    for (const host of hosts) {
      const spec = host.dataset.lerpitCode ?? '';
      if (!spec.trim()) {
        continue;
      }

      let tabs: EditorTab[];
      try {
        tabs = await buildTabs(codePath, spec);
      } catch (error) {
        // One unreadable file costs its own box and says why, rather than throwing and
        // taking every other editor on the page with it.
        host.textContent = error instanceof Error ? error.message : String(error);
        host.classList.add('lerpette-code--broken');
        continue;
      }

      if (tabs.length === 0) {
        continue;
      }

      const run = async (files: EditorFile[]) => {
        await options.activate(stepId);
        const handler = runs.get(stepId);
        if (!handler) {
          editor.status('This chapter has nothing to build into.', 'bad');
          return;
        }

        await handler(editor, files);
      };

      const editor: FileEditor = createFileEditor(host, {
        tabs,
        idleStatus: options.idleStatus ?? 'Press run to build.',
        storageScope: codePath,
        onRun: run,
        onRunSolution: run
      });

      const list = byStep.get(stepId) ?? [];
      list.push(editor);
      byStep.set(stepId, list);
    }
  }

  return {
    editorsFor: (stepId) => byStep.get(stepId) ?? [],
    claim: (stepId, run) => runs.set(stepId, run),
    release: (stepId) => runs.delete(stepId),
    destroy() {
      byStep.forEach((list) => list.forEach((editor) => editor.destroy()));
      byStep.clear();
      runs.clear();
    }
  };
}
