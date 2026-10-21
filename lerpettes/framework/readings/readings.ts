import { formatReading, fraction, graphRange, vectorComponents } from './format';
import { resolveReadingsView, type ReadingsView } from './view';

/*
 * Readings: the stage's top-left card, for what a step reports rather than what the
 * reader sets. Energy draining away, a count climbing, a velocity flipping sign.
 *
 * A step adds one in one line, a label and a function returning the current value:
 *
 *   readings().number('t', () => world.time, { unit: 's' });
 *   readings().graph('PE + KE', () => totalEnergy(world), { unit: 'J', min: 0 });
 *
 * Each call returns that one reading, as the controls card's addBinding does, rather
 * than the card, so the two cards read the same way in a setup.
 *
 * The framework calls those functions while the step is on screen and throws the
 * whole card away when the step ends, so no step keeps state just to feed a reading.
 *
 * The card has two modes: every reading (full), or one reading alone (mini). It starts
 * mini, on its first reading. A step that wants it otherwise says so on the card,
 * before or after adding readings: .expand() for the whole card, .mini('label') to start on a reading other than
 * the first. The last one said wins. The reader moves between the two by clicking: the
 * title of the full card shrinks it to the reading it was last on, a reading in the full
 * card shrinks it to that reading, and the mini card opens back up.
 *
 * Each kind is one entry in KINDS: how to build its row, and how to show a value.
 * Adding a kind is one entry there plus one method on Readings.
 */

export type ReadingTone = 'ok' | 'info' | 'warn';

/** Options every kind takes. A reading shown alone keeps its label unless `miniLabel: false`. */
export type BaseOptions = { miniLabel?: boolean };
export type NumberOptions = BaseOptions & { unit?: string; digits?: number };
/**
 * `min` / `max` fix an edge of the scale; values past it are cut off. `keepInView` is a value
 * (or several) the scale always reaches while still fitting the data, e.g. `keepInView: 0`
 * to read a quantity against zero rather than against its own wobble.
 */
export type GraphOptions = NumberOptions & { min?: number; max?: number; keepInView?: number | number[]; seconds?: number };
export type MeterOptions = NumberOptions & { min?: number; max?: number; percent?: boolean; mark?: number };
export type TextOptions = BaseOptions & { tone?: (value: string) => ReadingTone | null | undefined };
export type VectorLike = ArrayLike<number> | { x: number; y: number; z: number };

/**
 * One reading, as adding it returns it, the way tweakpane's addBinding returns its
 * binding. Only the label for now; it is where per-reading calls (update, remove,
 * tone) go when they are wanted, which a builder returning the card never could.
 */
export type Reading = { readonly label: string };

export type Readings = {
  /** A single value: a time, a count, a total. Counts want digits: 0. */
  number(label: string, read: () => number, options?: NumberOptions): Reading;
  /** Three components side by side: a position, a velocity, a force. */
  vector(label: string, read: () => VectorLike, options?: NumberOptions): Reading;
  /** A value over the last few seconds, with its current value. Range follows the data unless fixed. */
  graph(label: string, read: () => number, options?: GraphOptions): Reading;
  /** A value inside known bounds, as a bar. min 0 and max 1 unless given. */
  meter(label: string, read: () => number, options?: MeterOptions): Reading;
  /** A word or two of state, with an optional coloured dot. */
  text(label: string, read: () => string, options?: TextOptions): Reading;
  /** Frames per second, measured here. Turns warm below 30. */
  fps(label?: string, options?: BaseOptions): Reading;
  /** Start with every reading showing. */
  expand(): void;
  /** Start shrunk to one reading, the first unless a label is given. This is the default. */
  mini(label?: string): void;
};

type AnyOptions = NumberOptions & GraphOptions & MeterOptions & TextOptions & { bad?: (value: number) => boolean };

type Kind<State> = {
  /** Read every frame rather than about ten times a second. */
  everyFrame?: boolean;
  build(row: HTMLElement, label: string, options: AnyOptions): State;
  /** Called on every read, before show; for kinds that keep history. */
  sample?(state: State, value: unknown, now: number, options: AnyOptions): void;
  show(state: State, value: unknown, options: AnyOptions, now: number): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Text kinds refresh this often, so a value holds still long enough to be read. */
const SLOW_MS = 100;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** The label-and-value line every kind starts with. Returns the value cell. */
function headRow(row: HTMLElement, label: string): HTMLElement {
  const line = element('div', 'lerpette-reading__row');
  const value = element('span', 'lerpette-reading__value');
  line.append(element('span', 'lerpette-reading__label', label), value);
  row.append(line);
  return value;
}

function showNumber(cell: HTMLElement, value: unknown, digits: number, unit?: string, round = false) {
  cell.textContent = formatReading(value, digits, { round });
  if (unit) cell.append(element('span', 'lerpette-reading__unit', unit));
}

const numberKind: Kind<HTMLElement> = {
  build: (row, label) => headRow(row, label),
  show(cell, value, options) {
    showNumber(cell, value, options.digits ?? 2, options.unit);
    if (options.bad) cell.classList.toggle('is-bad', options.bad(value as number));
  }
};

const vectorKind: Kind<HTMLElement[]> = {
  build(row, label, options) {
    const unitCell = headRow(row, label);
    if (options.unit) unitCell.append(element('span', 'lerpette-reading__unit', options.unit));
    const grid = element('div', 'lerpette-reading__vector');
    const cells = ['x', 'y', 'z'].map((axis) => {
      const slot = element('span');
      const number = element('b');
      number.style.fontWeight = 'inherit';
      slot.append(element('span', 'lerpette-reading__axis', axis), number);
      grid.append(slot);
      return number;
    });
    row.append(grid);
    return cells;
  },
  show(cells, value, options) {
    const components = vectorComponents(value);
    cells.forEach((cell, i) => (cell.textContent = formatReading(components[i], options.digits ?? 2)));
  }
};

type GraphState = {
  value: HTMLElement;
  svg: SVGSVGElement;
  line: SVGPolylineElement;
  dot: SVGCircleElement;
  samples: Array<[number, number]>;
};

const graphKind: Kind<GraphState> = {
  everyFrame: true,
  build(row, label) {
    const value = headRow(row, label);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'lerpette-reading__graph');
    svg.setAttribute('viewBox', '0 0 100 28');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const floor = document.createElementNS(SVG_NS, 'line');
    for (const [k, v] of Object.entries({ x1: '0', x2: '100', y1: '27.5', y2: '27.5', stroke: 'rgba(81, 131, 173, 0.3)', 'vector-effect': 'non-scaling-stroke' })) {
      floor.setAttribute(k, v);
    }
    const line = document.createElementNS(SVG_NS, 'polyline');
    for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', 'vector-effect': 'non-scaling-stroke' })) {
      line.setAttribute(k, v);
    }
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '1.6');
    dot.setAttribute('fill', 'var(--accent)');
    svg.append(floor, line, dot);
    svg.style.color = 'var(--ink)';
    row.append(svg);
    return { value, svg, line, dot, samples: [] };
  },
  sample(state, value, now, options) {
    const window = (options.seconds ?? 6) * 1000;
    state.samples.push([now, value as number]);
    while (state.samples.length > 0 && now - state.samples[0][0] > window) {
      state.samples.shift();
    }
  },
  show(state, value, options, now) {
    showNumber(state.value, value, options.digits ?? 1, options.unit, true);
    const finite = state.samples.filter(([, y]) => Number.isFinite(y));
    if (finite.length < 2) {
      state.line.setAttribute('points', '');
      return;
    }

    const [low, high] = graphRange(finite.map(([, y]) => y), options.min, options.max, [options.keepInView ?? []].flat());
    const window = (options.seconds ?? 6) * 1000;
    const start = now - window;
    const points = finite.map(([t, y]) => [((t - start) / window) * 100, 27 - fraction(y, low, high) * 25]);
    state.line.setAttribute('points', points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));

    // The viewBox is stretched to the row's width, so the dot is squeezed back to round.
    const [x, y] = points[points.length - 1];
    const box = state.svg.getBoundingClientRect();
    const squash = box.width > 0 ? (28 / box.height) / (100 / box.width) : 1;
    state.dot.setAttribute('cx', String(x));
    state.dot.setAttribute('cy', String(y));
    state.dot.setAttribute('transform', `translate(${x} ${y}) scale(${squash} 1) translate(${-x} ${-y})`);
  }
};

type MeterState = { value: HTMLElement; fill: HTMLElement };

const meterKind: Kind<MeterState> = {
  build(row, label, options) {
    const value = headRow(row, label);
    const bar = element('div', 'lerpette-reading__meter');
    const fill = element('span', 'lerpette-reading__fill');
    bar.append(fill);
    if (options.mark != null) {
      const mark = element('span', 'lerpette-reading__mark');
      mark.style.left = `${fraction(options.mark, options.min ?? 0, options.max ?? 1) * 100}%`;
      bar.append(mark);
    }
    row.append(bar);
    return { value, fill };
  },
  show(state, value, options) {
    const v = value as number;
    state.fill.style.width = `${fraction(v, options.min ?? 0, options.max ?? 1) * 100}%`;
    if (options.percent) {
      state.value.textContent = Number.isFinite(v) ? (v * 100).toFixed(options.digits ?? 0) : '—';
      state.value.append(element('span', 'lerpette-reading__unit', '%'));
    } else {
      showNumber(state.value, v, options.digits ?? 2, options.unit);
    }
  }
};

type TextState = { dot: HTMLElement; text: HTMLElement };

const textKind: Kind<TextState> = {
  build(row, label) {
    const value = headRow(row, label);
    const dot = element('span', 'lerpette-reading__dot');
    const text = element('span');
    value.append(dot, text);
    return { dot, text };
  },
  show(state, value, options) {
    const text = value == null ? '—' : String(value);
    const tone = options.tone?.(text);
    state.dot.hidden = !tone;
    if (tone) state.dot.dataset.tone = tone;
    state.text.textContent = text;
  }
};

const KINDS = {
  number: numberKind,
  vector: vectorKind,
  graph: graphKind,
  meter: meterKind,
  text: textKind
} as const;

type KindName = keyof typeof KINDS;

type Row = {
  label: string;
  kind: Kind<any>;
  state: unknown;
  read: () => unknown;
  options: AnyOptions;
  everyFrame: boolean;
  node: HTMLElement;
  failed: boolean;
};

export type ReadingsCard = {
  readings: Readings;
  /** Applies the starting view. Call once the step's setup has added its readings. */
  settle(): void;
  /** Samples every reading that is due. Call once per frame. */
  tick(now: number): void;
  /** Takes the card out of the page. */
  remove(): void;
};

let cardIds = 0;

/**
 * Builds the card into `host` and hands back the author-facing builder. `restored` is
 * the view the reader left before a restart, or null for a fresh start; `remember` is
 * told every view the reader moves to, so the runtime has it for the next restart.
 */
export function createReadingsCard(
  host: HTMLElement,
  restored: ReadingsView | null,
  remember: (view: ReadingsView) => void
): ReadingsCard {
  const rows: Row[] = [];
  let lastSlow = -Infinity;

  const card = element('div', 'lerpette-stage__card');
  const head = element('div', 'lerpette-stage__card-head');
  const title = element('button', 'lerpette-stage__card-title', 'Readings');
  title.type = 'button';
  const body = element('div', 'lerpette-stage__card-body');
  body.id = `lerpette-readings-${++cardIds}`;
  title.setAttribute('aria-controls', body.id);
  head.append(title);
  card.append(head, body);
  host.append(card);

  let authored: ReadingsView | null = null;
  let settled = false;
  let view: ReadingsView = { mode: 'expanded', mini: null };
  /** The reading the card was last shrunk to, which the title returns to. */
  let lastMini: string | null = null;

  const show = (next: ReadingsView) => {
    view = next;
    if (next.mode === 'mini' && next.mini != null) lastMini = next.mini;
    card.classList.toggle('is-mini', next.mode === 'mini' && next.mini != null);
    title.setAttribute('aria-expanded', String(next.mode === 'expanded'));
    title.title = 'Show one reading';
    for (const row of rows) {
      const alone = next.mode === 'mini' && row.label === next.mini;
      row.node.classList.toggle('is-mini', alone);
      row.node.setAttribute('aria-label', alone ? `${row.label}: show all readings` : `${row.label}: show only this reading`);
    }
  };

  // Everything the reader does goes through here, so a restart can put it back.
  const choose = (next: ReadingsView) => {
    show(next);
    remember({ ...next });
  };

  // The title only shows on the full card; it shrinks it to the reading last shown alone.
  title.addEventListener('click', () => choose(resolveReadingsView({ mode: 'mini', mini: lastMini }, null, labels())));

  const labels = () => rows.map((row) => row.label);

  const settle = () => {
    settled = true;
    if (authored?.mode === 'mini' && authored.mini != null && !labels().includes(authored.mini)) {
      console.warn(`[lerpit] mini('${authored.mini}') names no reading in this step; showing the first instead.`);
    }
    show(resolveReadingsView(restored, authored, labels()));
  };

  const add = (name: KindName, label: string, read: () => unknown, options: AnyOptions = {}, everyFrame = false): Reading => {
    const node = element('div', 'lerpette-reading');
    node.classList.toggle('has-mini-label', options.miniLabel !== false);
    node.title = label;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${label}: show only this reading`);
    const kind = KINDS[name] as Kind<any>;
    const row: Row = { label, kind, state: kind.build(node, label, options), read, options, everyFrame: everyFrame || !!kind.everyFrame, node, failed: false };
    rows.push(row);
    body.append(node);

    const toggle = () => choose(view.mode === 'mini' ? { mode: 'expanded', mini: null } : { mode: 'mini', mini: label });
    node.addEventListener('click', toggle);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });

    // A reading added after setup (from a frame callback, say) joins the view the card
    // is already in, which may be the one it was waiting for.
    if (settled) show(resolveReadingsView(view, null, labels()));
    return { label };
  };

  const readings: Readings = {
    number: (label, read, options) => add('number', label, read, options),
    vector: (label, read, options) => add('vector', label, read, options),
    graph: (label, read, options) => add('graph', label, read, options),
    meter: (label, read, options) => add('meter', label, read, options),
    text: (label, read, options) => add('text', label, read, options as AnyOptions),
    fps(label = 'fps', options = {}) {
      let frames = 0;
      let since = performance.now();
      let fps = NaN;
      const read = () => {
        frames += 1;
        const now = performance.now();
        if (now - since >= 500) {
          fps = (frames * 1000) / (now - since);
          frames = 0;
          since = now;
        }
        return fps;
      };
      return add('number', label, read, { ...options, digits: 0, bad: (v) => v < 30 }, true);
    },
    expand() {
      authored = { mode: 'expanded', mini: null };
    },
    mini(label) {
      authored = { mode: 'mini', mini: label ?? null };
    }
  };

  return {
    readings,
    settle,
    tick(now) {
      const slow = now - lastSlow >= SLOW_MS;
      if (slow) lastSlow = now;

      for (const row of rows) {
        if (!row.everyFrame && !slow) continue;

        let value: unknown;
        try {
          value = row.read();
        } catch (error) {
          // Said once, where an author previewing the step will look, and kept on the
          // row so the reading shows that it broke rather than freezing on a stale value.
          if (!row.failed) {
            row.failed = true;
            console.error(`[lerpit] the reading "${row.label}" failed`, error);
          }
          const cell = row.node.querySelector<HTMLElement>('.lerpette-reading__value');
          if (cell) {
            cell.textContent = '!';
            cell.classList.add('is-bad');
            cell.title = error instanceof Error ? error.message : String(error);
          }
          continue;
        }

        row.kind.sample?.(row.state, value, now, row.options);
        // fps counts every frame but, like any number, is shown at the readable rate.
        if (row.kind !== graphKind && !slow) continue;
        row.kind.show(row.state, value, row.options, now);
      }
    },
    remove() {
      card.remove();
    }
  };
}
