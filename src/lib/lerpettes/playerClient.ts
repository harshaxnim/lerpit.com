import { loadLerpetteStepRuntime } from './runtimeLoader';

type ClientStep = {
  id: string;
  title: string;
  runtimeImportKey: string;
  assetBasePath: string;
};

type PlayerConfig = {
  playerId: string;
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
    const stageHost = root.querySelector<HTMLElement>('[data-stage-host]');
    const stageCanvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
    const stageToggle = root.querySelector<HTMLButtonElement>('[data-stage-toggle]');
    const stageActiveStep = root.querySelector<HTMLElement>('[data-stage-active-step]');
    const stageStatus = root.querySelector<HTMLElement>('[data-stage-status]');

    if (!(stageHost instanceof HTMLElement) || !(stageCanvas instanceof HTMLCanvasElement)) {
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

    const { playerId, steps } = config;
    const stepsById = new Map(steps.map((step) => [step.id, step]));
    const mountedRuntimes = new Map<string, Awaited<ReturnType<typeof loadLerpetteStepRuntime>>>();
    const shared = new Map();
    let activeStepId = steps[0].id;
    let activeViewportSectionId: string | null = null;
    let currentRuntime: Awaited<ReturnType<typeof loadLerpetteStepRuntime>> | null = null;
    let activationToken = 0;
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
        stageToggle.setAttribute('aria-label', 'Viewport is visible');
        setStageToggleArrows(true);
        return;
      }

      const isOpen = stagePanel.classList.contains('is-open');
      stageToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      stageToggle.setAttribute('aria-label', isOpen ? 'Hide viewport' : 'Show viewport');
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

    };

    const createRuntimeContext = (stepId: string) => {
      const step = stepsById.get(stepId);
      if (!step) {
        throw new Error(`Unknown step id "${stepId}".`);
      }

      return {
        canvas: stageCanvas,
        host: stageHost,
        currentStepId: stepId,
        shared,
        setCaption(value: string) {
          if (stageStatus) stageStatus.textContent = value;
        },
        resolveAssetUrl(relativePath: string) {
          return new URL(relativePath, new URL(step.assetBasePath, window.location.origin)).toString();
        }
      };
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

      if (currentRuntime && typeof currentRuntime.resize === 'function') {
        currentRuntime.resize(createRuntimeContext(activeStepId));
      }
    };

    stageToggle?.addEventListener('click', handleStageToggle);

    const onStageMediaChange = () => {
      syncStageDrawerState();
    };
    mobileStageMedia.addEventListener('change', onStageMediaChange);

    const activateStep = async (stepId: string, sectionId = stepId) => {
      const step = stepsById.get(stepId);
      if (!step) {
        return;
      }

      const nextToken = ++activationToken;
      const previousStepId = activeStepId;
      const previousRuntime = currentRuntime;

      setActiveChrome(sectionId);
      if (stepId === activeStepId && currentRuntime) {
        return;
      }

      if (previousRuntime && previousStepId !== stepId && typeof previousRuntime.exit === 'function') {
        await previousRuntime.exit(createRuntimeContext(previousStepId));
      }

      const runtime = await loadLerpetteStepRuntime(step.runtimeImportKey);
      if (nextToken !== activationToken) {
        return;
      }

      if (!mountedRuntimes.has(stepId)) {
        await runtime.mount(createRuntimeContext(stepId));
        mountedRuntimes.set(stepId, runtime);
      }

      if (typeof runtime.enter === 'function') {
        await runtime.enter(createRuntimeContext(stepId));
      }

      currentRuntime = runtime;
      activeStepId = stepId;

      if (stageActiveStep) {
        stageActiveStep.textContent = step.title;
      }
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
      const markerY = window.innerHeight * 0.5;
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

    window.addEventListener('resize', () => {
      if (currentRuntime && typeof currentRuntime.resize === 'function') {
        currentRuntime.resize(createRuntimeContext(activeStepId));
      }

      syncStageDrawerState();
      syncActiveSectionToViewport();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && currentRuntime && typeof currentRuntime.enter === 'function') {
        void currentRuntime.enter(createRuntimeContext(activeStepId));
      }
    });

    window.addEventListener(
      'scroll',
      () => {
        scheduleActiveSectionSync();
      },
      { passive: true }
    );

    window.addEventListener('beforeunload', () => {
      mountedRuntimes.forEach((runtime, stepId) => {
        runtime.dispose?.(createRuntimeContext(stepId));
      });

      if (scrollSyncFrame) {
        window.cancelAnimationFrame(scrollSyncFrame);
      }

      stageToggle?.removeEventListener('click', handleStageToggle);
      mobileStageMedia.removeEventListener('change', onStageMediaChange);
      root.removeEventListener('click', onFootnoteReferenceClick);
      window.removeEventListener('hashchange', onFootnoteHashChange);
    });

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
