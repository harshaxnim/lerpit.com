import { resolveStepPanel } from '@lerpit/framework/panels';
import { PANEL_LABELS } from '@lerpit/framework/panels/registry';
import { createChapterRuntime } from '@lerpit/framework/runtimes/createChapterRuntime';
import { createEditorLayer, type EditorLayer } from '@lerpit/framework/runtimes/editorLayer';
import type { LerpettePanelKind, LerpettePanelSlot } from '@lerpit/framework/panels';
import { loadLerpetteStepRuntime } from './runtimeLoader';

/** The slice of a step the player needs in the browser, as LerpettePlayer.astro
    projects it. Anything added here has to be added there too, or it arrives
    undefined. */
type ClientStep = {
  id: string;
  title: string;
  runtimeImportKey: string;
  assetBasePath: string;
  codePath: string;
  /** Panels this chapter declared in its heading. Empty means a legacy index.ts. */
  panels: string[];
};

type PlayerConfig = {
  lessonTitle: string;
  steps: ClientStep[];
};

const initializedPlayers = new WeakSet<HTMLElement>();

function readPlayerConfig(root: HTMLElement): PlayerConfig | null {
  const configEl = root.querySelector<HTMLScriptElement>('[data-player-config]');
  if (!configEl?.textContent) {
    return null;
  }

  try {
    return JSON.parse(configEl.textContent) as PlayerConfig;
  } catch {
    return null;
  }
}

export function initLerpettePlayers() {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-lerpette-player]'));

  roots.forEach((root) => {
    if (initializedPlayers.has(root)) {
      return;
    }

    const config = readPlayerConfig(root);
    if (!config || config.steps.length === 0) {
      return;
    }

    const sectionEls = Array.from(root.querySelectorAll<HTMLElement>('[data-section-id]'));
    const sectionButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-target-id]'));
    const stagePanel = root.querySelector<HTMLElement>('.lerpette-stage');
    const panelHost = root.querySelector<HTMLElement>('[data-panel-host]');
    const panelTabs = root.querySelector<HTMLElement>('[data-panel-tabs]') ?? document.createElement('div');
    const panelLabels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel-label]'));
    const stageToggle = root.querySelector<HTMLButtonElement>('[data-stage-toggle]');
    const stageStatus = root.querySelector<HTMLElement>('[data-stage-status]');
    const bylineEl = root.querySelector<HTMLElement>('.lerpette-brow--pinned');
    const bylineTitle = root.querySelector<HTMLElement>('[data-byline-title]');
    const bylineSection = root.querySelector<HTMLElement>('[data-byline-section]');
    const bylineNow = root.querySelector<HTMLElement>('[data-byline-now]');

    if (!(panelHost instanceof HTMLElement)) {
      return;
    }

    initializedPlayers.add(root);
    initFootnotesToggles(root);
    const revealFootnoteTarget = (hash: string) => {
      if (!hash.startsWith('#')) {
        return;
      }

      const id = decodeURIComponent(hash.slice(1));
      if (!id) {
        return;
      }

      const target = document.getElementById(id);
      if (!(target instanceof HTMLElement) || !root.contains(target)) {
        return;
      }

      const footnotes = target.closest<HTMLElement>('.footnotes');
      if (!(footnotes instanceof HTMLElement)) {
        return;
      }

      const wasCollapsed = footnotes.classList.contains('is-collapsed');
      setFootnotesCollapsed(footnotes, false);

      if (wasCollapsed) {
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'nearest' });
        });
      }

      target.classList.add('is-footnote-target');
      window.setTimeout(() => {
        target.classList.remove('is-footnote-target');
      }, 1400);
    };
    const onFootnoteHashChange = () => {
      revealFootnoteTarget(window.location.hash);
    };
    const onFootnoteReferenceClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>('a[href]');
      const href = link?.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        return;
      }

      revealFootnoteTarget(href);
    };
    root.addEventListener('click', onFootnoteReferenceClick);
    window.addEventListener('hashchange', onFootnoteHashChange);
    revealFootnoteTarget(window.location.hash);

    const { lessonTitle, steps } = config;
    const stepsById = new Map(steps.map((step) => [step.id, step]));
    const mountedRuntimes = new Map<string, Awaited<ReturnType<typeof loadLerpetteStepRuntime>>>();
    const SLOT_CLASS = 'lerpette-stage__panel';
    let shared = new Map<string, unknown>();
    let activePanel: LerpettePanelKind<any> | null = null;
    let activeSurface: unknown = null;
    /**
     * Empty until a step has actually been activated, rather than pre-seeded with the
     * first step's id. Seeding it made the first activation look like a re-activation
     * of something already on screen, which is both untrue and the reason the drawer
     * toggle did not shimmer when the panel first appeared. Every other read of this
     * is guarded by `currentRuntime`, which is null over the same window.
     */
    let activeStepId = '';
    let activeViewportSectionId: string | null = null;
    let currentRuntime: Awaited<ReturnType<typeof loadLerpetteStepRuntime>> | null = null;
    let activationToken = 0;
    let activationChain: Promise<void> = Promise.resolve();
    let scrollSyncFrame = 0;
    const mobileStageMedia = window.matchMedia('(max-width: 1180px)');
    const stageToggleArrows = Array.from(root.querySelectorAll<HTMLElement>('[data-stage-toggle-arrow]'));

    const setStageToggleArrows = (isOpen: boolean) => {
      const glyph = isOpen ? '▶' : '◀';
      stageToggleArrows.forEach((arrow) => {
        arrow.textContent = glyph;
      });
    };

    const syncStageDrawerState = () => {
      if (!(stagePanel instanceof HTMLElement) || !(stageToggle instanceof HTMLButtonElement)) {
        return;
      }

      if (!mobileStageMedia.matches) {
        stagePanel.classList.remove('is-open');
        stageToggle.setAttribute('aria-expanded', 'true');
        stageToggle.setAttribute('aria-label', `${activePanel?.label ?? 'Panel'} is visible`);
        setStageToggleArrows(true);
        return;
      }

      const isOpen = stagePanel.classList.contains('is-open');
      stageToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      const name = activePanel?.label ?? 'panel';
      stageToggle.setAttribute('aria-label', isOpen ? `Hide ${name}` : `Show ${name}`);
      setStageToggleArrows(isOpen);
    };

    const setActiveChrome = (sectionId: string) => {
      sectionEls.forEach((section) => {
        section.classList.toggle('is-active', section.dataset.sectionId === sectionId);
      });

      sectionButtons.forEach((button) => {
        const isActive = button.dataset.targetId === sectionId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-current', isActive ? 'location' : 'false');
      });

      // The byline is the only wayfinding on the page: its last crumb is where you are.
      // On the intro that is the lesson title itself, so the section crumb stays off.
      const isIntro = sectionId === 'intro';
      const sectionTitle = isIntro ? '' : stepsById.get(sectionId)?.title ?? '';

      bylineTitle?.classList.toggle('is-current', isIntro);
      if (bylineSection) {
        bylineSection.hidden = isIntro || sectionTitle === '';
      }
      if (bylineNow && sectionTitle) {
        bylineNow.textContent = sectionTitle;
      }
    };

    const slot: LerpettePanelSlot = {
      host: panelHost,
      tabs: panelTabs,
      lessonTitle,
      get shared() {
        return shared;
      },
      setCaption(value: string) {
        if (stageStatus) stageStatus.textContent = value;
      }
    };

    const writePanelLabel = (label: string) => {
      panelLabels.forEach((el) => {
        el.textContent = label;
      });
    };

    // The label is written when a panel is created, which is too late if the step's
    // module never loads: the reader is then left with an unnamed empty box and a
    // failure message. Naming the slot up front means the worst case is a labelled
    // box that says what went wrong.
    writePanelLabel(resolveStepPanel({}).label);

    /**
     * Pass a light down the drawer toggle, to say the panel behind it has changed.
     *
     * Below the drawer breakpoint the toggle is the only part of the panel on screen,
     * so without this a reader scrolling into a new chapter has nothing telling them
     * the thing behind it is now showing something else.
     *
     * The class comes off and goes back on around a forced reflow. Re-adding it in
     * the same frame is otherwise a no-op, because as far as style resolution is
     * concerned the class never left and the animation never restarts.
     */
    const shimmerStageToggle = () => {
      if (!stageToggle) {
        return;
      }

      stageToggle.classList.remove('is-fresh');
      void stageToggle.offsetWidth;
      stageToggle.classList.add('is-fresh');
    };

    /**
     * Tear the current panel down and stand the next one up. Ordering matters: runtimes
     * stop and dispose before `shared` is dropped, because `shared` is where they park
     * live wasm handles and WebGL renderers — losing the map first would leak them with
     * no way left to reach them.
     */
    const swapPanel = async (next: LerpettePanelKind<any>, forStepId: string) => {
      if (activePanel) {
        for (const [stepId, runtime] of mountedRuntimes) {
          await runtime.dispose?.(createRuntimeContext(stepId));
        }
        mountedRuntimes.clear();
        currentRuntime = null;

        activePanel.destroy?.(activeSurface, slot);
        panelHost.replaceChildren();
        panelHost.className = SLOT_CLASS;
        shared.clear();
        shared = new Map<string, unknown>();
      }

      panelHost.classList.add(next.hostClass);
      activeSurface = await next.create(slot);
      activePanel = next;

      // A chapter driven by the chapter runtime writes its own tabs when its stack is
      // built. Anything else gets the one tab that used to be the corner label, drawn
      // here so both kinds of chapter start with the same strip.
      if (declaredPanelsFor(forStepId).length === 0) {
        const only = document.createElement('button');
        only.type = 'button';
        only.className = 'lerpette-stage__tab';
        only.setAttribute('role', 'tab');
        only.setAttribute('aria-selected', 'true');
        only.disabled = true;
        only.textContent = next.label;
        // One operation, so the strip goes from the last chapter's tabs straight to
        // this one's. Clearing first and appending after is a frame of blank.
        panelTabs.replaceChildren(only);
      }

      writePanelLabel(next.label);
      // The drawer's accessible name is built from the panel's label, and the first
      // sync runs before any panel exists.
      syncStageDrawerState();
    };

    let editorLayer: EditorLayer | null = null;
    let editorLayerReady: Promise<void> = Promise.resolve();

    /** What a step's heading asked for, for deciding who owns the strip. */
    const declaredPanelsFor = (stepId: string) => stepsById.get(stepId)?.panels ?? [];

    const createRuntimeContext = (stepId: string) => {
      const step = stepsById.get(stepId);
      if (!step) {
        throw new Error(`Unknown step id "${stepId}".`);
      }

      const section = sectionEls.find((el) => el.dataset.sectionId === stepId);

      return {
        host: panelHost,
        tabs: panelTabs,
        lessonTitle,
        shared,
        surface: activeSurface,
        currentStepId: stepId,
        codeHosts: section ? [...section.querySelectorAll<HTMLElement>('[data-lerpit-code]')] : [],
        codePath: step.codePath,
        editors: editorLayer ?? undefined,
        setCaption(value: string) {
          if (stageStatus) stageStatus.textContent = value;
        },
        resolveAssetUrl(relativePath: string) {
          return new URL(relativePath, new URL(step.assetBasePath, window.location.origin)).toString();
        }
      };
    };

    const resizePanelAndRuntime = () => {
      if (!activePanel) return;
      activePanel.resize?.(activeSurface, slot);
      currentRuntime?.resize?.(createRuntimeContext(activeStepId));
    };

    const handleStageToggle = () => {
      if (
        !mobileStageMedia.matches ||
        !(stagePanel instanceof HTMLElement) ||
        !(stageToggle instanceof HTMLButtonElement)
      ) {
        return;
      }

      stagePanel.classList.toggle('is-open');
      syncStageDrawerState();
      resizePanelAndRuntime();
    };

    stageToggle?.addEventListener('click', handleStageToggle);

    const onStageMediaChange = () => {
      syncStageDrawerState();
    };
    mobileStageMedia.addEventListener('change', onStageMediaChange);

    const runActivation = async (stepId: string, sectionId: string) => {
      const step = stepsById.get(stepId);
      if (!step) {
        return;
      }

      const token = ++activationToken;
      const stale = () => token !== activationToken;

      setActiveChrome(sectionId);
      if (stepId === activeStepId && currentRuntime && activePanel) {
        return;
      }

      // A chapter whose heading names panels is driven by the chapter runtime, which
      // builds its own column out of the registry. One that names none is a lesson
      // written before panels existed and keeps its own index.ts. The two paths meet
      // here and nowhere else.
      const declared = step.panels ?? [];
      const runtime =
        declared.length > 0 ? createChapterRuntime(declared) : await loadLerpetteStepRuntime(step.runtimeImportKey);
      if (stale()) return;

      // The chapter runtime fills the slot itself, so the player stands up an empty
      // one for it rather than a panel of its own. Its identity is the panel list, so
      // two chapters asking for the same panels keep the column between them.
      const nextPanel =
        declared.length > 0
          ? {
              label: PANEL_LABELS[declared[0]] ?? 'Panel',
              hostClass: 'lerpette-panel--stack',
              create: () => ({}),
              // Identity is what the player compares to decide whether to rebuild, so
              // the same list has to produce the same object.
              ...({ __key: declared.join(',') } as Record<string, unknown>)
            }
          : resolveStepPanel(runtime);

      const reuse = declared.length > 0 && activePanel && (activePanel as never as Record<string, unknown>).__key === declared.join(',');

      if (currentRuntime && activeStepId !== stepId) {
        await currentRuntime.exit?.(createRuntimeContext(activeStepId));
        if (stale()) return;
      }

      if (!reuse && nextPanel !== activePanel) {
        await swapPanel(nextPanel as never, stepId);
        if (stale()) return;
      }

      if (!mountedRuntimes.has(stepId)) {
        // The boxes have to exist before a runtime can claim them.
        await editorLayerReady;
        if (stale()) return;
        await runtime.mount(createRuntimeContext(stepId));
        if (stale()) return;
        mountedRuntimes.set(stepId, runtime);
      }

      await runtime.enter?.(createRuntimeContext(stepId));
      if (stale()) return;

      // Includes the first activation, where activeStepId is still empty: the panel
      // going from nothing to something is the change most worth pointing at.
      if (activeStepId !== stepId) {
        shimmerStageToggle();
      }

      currentRuntime = runtime;
      activeStepId = stepId;
    };

    /**
     * Activations are serialized. Each one awaits a module load, possibly a panel
     * teardown and a mount, and scrolling fast enough can start the next before the
     * last has finished; interleaving those would leave the panel and the runtime
     * disagreeing about which step is on screen.
     */
    const activateStep = (stepId: string, sectionId = stepId) => {
      activationChain = activationChain
        .then(() => runActivation(stepId, sectionId))
        .catch((error: unknown) => {
          console.error(`[lerpette] step "${stepId}" failed to activate`, error);
          // The scroll sync already moved on optimistically; let it retry this section.
          activeViewportSectionId = null;
          if (stageStatus) stageStatus.textContent = 'This step failed to load.';
        });

      return activationChain;
    };

    const activateIntro = () => {
      const firstStepId = steps[0]?.id;
      if (!firstStepId) {
        return;
      }

      void activateStep(firstStepId, 'intro');
    };

    const handleSectionTarget = (sectionId: string) => {
      if (sectionId === 'intro') {
        activateIntro();
        return;
      }

      void activateStep(sectionId, sectionId);
    };

    const getViewportSectionId = () => {
      // The marker sits on the line where chapter headers freeze, i.e. just under the
      // pinned byline. That keeps the three indicators saying the same thing: the frozen
      // header, the byline's last crumb, and the runtime in the viewport.
      const markerY = bylineEl ? bylineEl.getBoundingClientRect().bottom + 1 : window.innerHeight * 0.5;
      const sections = sectionEls
        .map((section) => {
          const rect = section.getBoundingClientRect();

          return {
            id: section.dataset.sectionId ?? 'intro',
            containsMarker: rect.top <= markerY && rect.bottom >= markerY,
            passedMarker: rect.top <= markerY
          };
        })
        .filter((section) => Boolean(section.id));
      const passedSections = sections.filter((section) => section.passedMarker);

      return (
        sections.find((section) => section.containsMarker)?.id ??
        passedSections[passedSections.length - 1]?.id ??
        sections[0]?.id ??
        'intro'
      );
    };

    const syncActiveSectionToViewport = () => {
      const sectionId = getViewportSectionId();
      setActiveChrome(sectionId);

      if (sectionId === activeViewportSectionId) {
        return;
      }

      activeViewportSectionId = sectionId;
      handleSectionTarget(sectionId);
    };

    const scheduleActiveSectionSync = () => {
      if (scrollSyncFrame) {
        return;
      }

      scrollSyncFrame = window.requestAnimationFrame(() => {
        syncActiveSectionToViewport();
        scrollSyncFrame = 0;
      });
    };

    sectionButtons.forEach((link) => {
      link.addEventListener('click', () => {
        const sectionId = link.dataset.targetId;
        if (sectionId) {
          handleSectionTarget(sectionId);
        }
      });
    });

    sectionEls.forEach((section) => {
      section.addEventListener('click', (event) => {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.closest('a') ||
            target.closest('button') ||
            target.closest('summary') ||
            target.closest('input') ||
            target.closest('textarea') ||
            target.closest('select'))
        ) {
          return;
        }

        const sectionId = section.dataset.sectionId;
        if (sectionId) {
          handleSectionTarget(sectionId);
        }
      });
    });

    const onWindowResize = () => {
      resizePanelAndRuntime();
      syncStageDrawerState();
      syncActiveSectionToViewport();
    };
    window.addEventListener('resize', onWindowResize);

    const onVisibilityChange = () => {
      if (!document.hidden && currentRuntime && typeof currentRuntime.enter === 'function') {
        void currentRuntime.enter(createRuntimeContext(activeStepId));
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onWindowScroll = () => {
      scheduleActiveSectionSync();
    };
    window.addEventListener('scroll', onWindowScroll, { passive: true });

    /**
     * Every code box on the page, built now rather than when its chapter becomes the
     * active one. A reader scrolling past a chapter sees the code it is about; before
     * this they saw an empty rectangle until that chapter happened to be on screen.
     *
     * Activation waits on this rather than racing it. A runtime claims its boxes while
     * mounting, and mounting happens exactly once, so a runtime that mounted before the
     * boxes existed would have nothing to build into and no second chance to notice.
     */
    editorLayerReady = createEditorLayer({
      sections: sectionEls,
      codePathFor: (stepId) => stepsById.get(stepId)?.codePath ?? null,
      // Pressing run on a chapter that is scrolled away builds into a panel nobody is
      // looking at, so it is made the active one first.
      activate: (stepId) => activateStep(stepId)
    }).then((layer) => {
      editorLayer = layer;
    });

    const teardownPlayer = () => {
      editorLayer?.destroy();
      editorLayer = null;

      mountedRuntimes.forEach((runtime, stepId) => {
        runtime.dispose?.(createRuntimeContext(stepId));
      });

      if (activePanel) {
        activePanel.destroy?.(activeSurface, slot);
      }

      if (scrollSyncFrame) {
        window.cancelAnimationFrame(scrollSyncFrame);
      }

      stageToggle?.removeEventListener('click', handleStageToggle);
      mobileStageMedia.removeEventListener('change', onStageMediaChange);
      root.removeEventListener('click', onFootnoteReferenceClick);
      window.removeEventListener('hashchange', onFootnoteHashChange);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('scroll', onWindowScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    window.addEventListener('pagehide', teardownPlayer);

    const hash = window.location.hash.replace('#', '');
    if (hash === 'intro') {
      activateIntro();
    } else if (stepsById.has(hash)) {
      handleSectionTarget(hash);
    } else {
      activateIntro();
    }

    syncStageDrawerState();
    syncActiveSectionToViewport();
  });
}

function initFootnotesToggles(root: HTMLElement) {
  const footnotesBlocks = Array.from(root.querySelectorAll<HTMLElement>('.prose-block .footnotes'));

  footnotesBlocks.forEach((footnotes) => {
    if (footnotes.dataset.footnotesToggleReady === 'true') {
      return;
    }

    const heading = footnotes.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6');
    if (!heading) {
      return;
    }

    const headingText = heading.textContent?.trim();
    if (!headingText) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'footnotes__title-toggle';
    button.textContent = headingText;
    button.setAttribute('aria-expanded', 'false');

    const updateExpandedState = () => {
      const isCollapsed = !footnotes.classList.contains('is-collapsed');
      setFootnotesCollapsed(footnotes, isCollapsed);
    };

    button.addEventListener('click', updateExpandedState);
    heading.replaceChildren(button);
    setFootnotesCollapsed(footnotes, true);
    footnotes.dataset.footnotesToggleReady = 'true';
  });
}

function setFootnotesCollapsed(footnotes: HTMLElement, collapsed: boolean) {
  footnotes.classList.toggle('is-collapsed', collapsed);
  const button = footnotes.querySelector<HTMLButtonElement>('.footnotes__title-toggle');
  button?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}
