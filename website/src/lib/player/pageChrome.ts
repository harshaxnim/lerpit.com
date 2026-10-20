/**
 * Everything on a lesson page that is not the stage: the footnotes, the byline's last
 * crumb, which section is active as the page scrolls, and the drawer the stage folds
 * into below 1180px. None of it knows what a runtime is; it says which section the
 * reader is on and lets the stage player decide what that means.
 */

export type PageChromeOptions = {
  root: HTMLElement;
  /** Chapter titles by id, for the byline's last crumb. */
  titles: Map<string, string>;
  /** The reader moved onto a section, by scrolling, clicking or following a link. */
  onSection(sectionId: string): void;
  /** The drawer opened or closed, which changes the stage's size. */
  onDrawer(): void;
};

export type PageChrome = {
  /** Mark a section active: the frozen header, the byline crumb. */
  setActive(sectionId: string): void;
  /** Re-read which section is under the byline and report it if it changed. */
  sync(): void;
  /** Forget the last reported section, so the next sync reports again (after a failure). */
  forget(): void;
  /** The panel behind the drawer changed: rename the toggle, and shimmer if it is new. */
  setPanel(label: string, shimmer: boolean): void;
  destroy(): void;
};

/** Below this the stage is a drawer. Mirrored by the 1180px queries in global.css. */
export const DRAWER_QUERY = '(max-width: 1180px)';

export function createPageChrome(options: PageChromeOptions): PageChrome {
  const { root } = options;
  const sectionEls = Array.from(root.querySelectorAll<HTMLElement>('[data-section-id]'));
  const sectionButtons = Array.from(root.querySelectorAll<HTMLElement>('[data-target-id]'));
  const stagePanel = root.querySelector<HTMLElement>('.lerpette-stage');
  const stageToggle = root.querySelector<HTMLButtonElement>('[data-stage-toggle]');
  const panelLabels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel-label]'));
  const toggleArrows = Array.from(root.querySelectorAll<HTMLElement>('[data-stage-toggle-arrow]'));
  const bylineEl = root.querySelector<HTMLElement>('.lerpette-brow--pinned');
  const bylineTitle = root.querySelector<HTMLElement>('[data-byline-title]');
  const bylineSection = root.querySelector<HTMLElement>('[data-byline-section]');
  const bylineNow = root.querySelector<HTMLElement>('[data-byline-now]');
  const drawerMedia = window.matchMedia(DRAWER_QUERY);
  const cleanups: Array<() => void> = [];
  const on = (target: Window | Document | HTMLElement, type: string, fn: (event: any) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  let panelLabel = 'Panel';
  let reportedSection: string | null = null;
  let scrollFrame = 0;

  initFootnotesToggles(root);
  const revealFootnoteTarget = (hash: string) => {
    if (!hash.startsWith('#')) return;
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!(target instanceof HTMLElement) || !root.contains(target)) return;
    const footnotes = target.closest<HTMLElement>('.footnotes');
    if (!(footnotes instanceof HTMLElement)) return;

    const wasCollapsed = footnotes.classList.contains('is-collapsed');
    setFootnotesCollapsed(footnotes, false);
    if (wasCollapsed) {
      window.requestAnimationFrame(() => target.scrollIntoView({ block: 'nearest' }));
    }
    target.classList.add('is-footnote-target');
    window.setTimeout(() => target.classList.remove('is-footnote-target'), 1400);
  };
  on(root, 'click', (event: MouseEvent) => {
    const link = event.target instanceof HTMLElement ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    const href = link?.getAttribute('href');
    if (href?.startsWith('#')) revealFootnoteTarget(href);
  });
  on(window, 'hashchange', () => revealFootnoteTarget(window.location.hash));
  revealFootnoteTarget(window.location.hash);

  const setArrows = (isOpen: boolean) => {
    const glyph = isOpen ? '▶' : '◀';
    toggleArrows.forEach((arrow) => (arrow.textContent = glyph));
  };

  const syncDrawer = () => {
    if (!stagePanel || !stageToggle) return;
    if (!drawerMedia.matches) {
      stagePanel.classList.remove('is-open');
      stageToggle.setAttribute('aria-expanded', 'true');
      stageToggle.setAttribute('aria-label', `${panelLabel} is visible`);
      setArrows(true);
      return;
    }
    const isOpen = stagePanel.classList.contains('is-open');
    stageToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    stageToggle.setAttribute('aria-label', isOpen ? `Hide ${panelLabel}` : `Show ${panelLabel}`);
    setArrows(isOpen);
  };

  // A reload keeps the drawer as it was: the dev server reloads the page on every save,
  // and closing the panel each time hides exactly what the save was meant to show.
  // Per tab and per page, so another lesson, or a fresh visit, still opens closed.
  const drawerKey = `lerpit-drawer-open:${window.location.pathname}`;
  const rememberDrawer = (isOpen: boolean) => {
    try {
      if (isOpen) sessionStorage.setItem(drawerKey, '1');
      else sessionStorage.removeItem(drawerKey);
    } catch {}
  };
  let wasOpen = false;
  try {
    wasOpen = sessionStorage.getItem(drawerKey) === '1';
  } catch {}
  if (wasOpen && drawerMedia.matches && stagePanel) {
    // Already open on the first frame rather than sliding in after the reload.
    stagePanel.style.transition = 'none';
    stagePanel.classList.add('is-open');
    void stagePanel.offsetWidth;
    stagePanel.style.transition = '';
  }

  if (stageToggle) {
    on(stageToggle, 'click', () => {
      if (!drawerMedia.matches || !stagePanel) return;
      rememberDrawer(stagePanel.classList.toggle('is-open'));
      syncDrawer();
      options.onDrawer();
    });
  }
  const onMedia = () => syncDrawer();
  drawerMedia.addEventListener('change', onMedia);
  cleanups.push(() => drawerMedia.removeEventListener('change', onMedia));

  const setActive = (sectionId: string) => {
    sectionEls.forEach((section) => section.classList.toggle('is-active', section.dataset.sectionId === sectionId));
    sectionButtons.forEach((button) => {
      const isActive = button.dataset.targetId === sectionId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'location' : 'false');
    });

    // The byline is the only wayfinding on the page: its last crumb is where you are.
    // On the intro that is the lesson title itself, so the section crumb stays off.
    const isIntro = sectionId === 'intro';
    const sectionTitle = isIntro ? '' : options.titles.get(sectionId) ?? '';
    bylineTitle?.classList.toggle('is-current', isIntro);
    if (bylineSection) bylineSection.hidden = isIntro || sectionTitle === '';
    if (bylineNow && sectionTitle) bylineNow.textContent = sectionTitle;
  };

  const sectionUnderByline = () => {
    // Half way down the window: a chapter takes over as soon as its header reaches the
    // middle, while the reader is starting it, not once it has scrolled to the top.
    const markerY = window.innerHeight * 0.5;
    const sections = sectionEls.map((section) => {
      const rect = section.getBoundingClientRect();
      return { id: section.dataset.sectionId ?? 'intro', contains: rect.top <= markerY && rect.bottom >= markerY, passed: rect.top <= markerY };
    });
    const passed = sections.filter((section) => section.passed);
    return sections.find((s) => s.contains)?.id ?? passed[passed.length - 1]?.id ?? sections[0]?.id ?? 'intro';
  };

  const sync = () => {
    // Only a stuck byline may paint above itself; at rest the same band would cover
    // the site header.
    if (bylineEl) bylineEl.classList.toggle('is-stuck', window.scrollY > 0 && bylineEl.getBoundingClientRect().top <= 0);
    const sectionId = sectionUnderByline();
    setActive(sectionId);
    if (sectionId === reportedSection) return;
    reportedSection = sectionId;
    options.onSection(sectionId);
  };

  on(window, 'scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      sync();
    });
  }, { passive: true });

  sectionButtons.forEach((button) =>
    on(button, 'click', () => {
      const id = button.dataset.targetId;
      if (id) options.onSection(id);
    })
  );

  sectionEls.forEach((section) =>
    on(section, 'click', (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('a, button, summary, input, textarea, select')) return;
      const id = section.dataset.sectionId;
      if (id) options.onSection(id);
    })
  );

  /**
   * Pass a light down the drawer toggle, to say the panel behind it has changed. The
   * class comes off and goes back on around a forced reflow; re-adding it in the same
   * frame is otherwise a no-op and the animation never restarts.
   */
  const shimmer = () => {
    if (!stageToggle) return;
    stageToggle.classList.remove('is-fresh');
    void stageToggle.offsetWidth;
    stageToggle.classList.add('is-fresh');
  };

  return {
    setActive,
    sync,
    forget() {
      reportedSection = null;
    },
    setPanel(label, isNew) {
      panelLabel = label;
      panelLabels.forEach((el) => (el.textContent = label));
      syncDrawer();
      if (isNew) shimmer();
    },
    destroy() {
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      cleanups.forEach((fn) => fn());
    }
  };
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
