import { EditorState, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { DerivedRegion, RegionKind } from './regions';

/**
 * What a region looks like once it is in the editor.
 *
 * The parser works in line numbers over a string. CodeMirror works in character
 * positions that move as the reader types. This is the layer between them: it takes
 * the parser's spans once, and from then on carries them through every edit so a
 * region still points at its own code after the reader has rewritten half of it.
 *
 * Three kinds, three behaviours:
 *  - `edit`      marked until the reader changes it, then not. "Your turn" stops
 *                being true once they have taken it, and a highlight that stays is
 *                decoration rather than a pointer. It is removed outright, with no
 *                transition, so nothing on screen is moving while they type.
 *  - `highlight` marked for good. "This is the part worth looking at" is still true
 *                afterwards.
 *  - `hide`      folded behind a band, and opened by clicking it.
 *
 * Only the marking lives here. Every line stays editable, including the ones inside
 * a region and the ones outside every region.
 */

export type LiveRegion = {
  id: string;
  kind: RegionKind;
  /** Character positions, moved along by every edit. */
  from: number;
  to: number;
  /** Whether the reader has changed this region. Only ever true for `edit`. */
  touched: boolean;
};

/** Replace the tracked regions, which happens when a tab's document is swapped. */
export const setRegions = StateEffect.define<LiveRegion[]>();

/** Open or close one `hide` band. */
export const toggleHide = StateEffect.define<string>();

/** Which `hide` regions the reader has opened. */
const openedHides = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(value, tr) {
    let next = value;

    for (const effect of tr.effects) {
      if (effect.is(setRegions)) {
        next = new Set();
        continue;
      }

      if (!effect.is(toggleHide)) {
        continue;
      }

      const copy = new Set(next);
      if (copy.has(effect.value)) {
        copy.delete(effect.value);
      } else {
        copy.add(effect.value);
      }
      next = copy;
    }

    return next;
  }
});

const regionState = StateField.define<LiveRegion[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRegions)) {
        return effect.value;
      }
    }

    if (!tr.docChanged) {
      return value;
    }

    return value.map((region) => {
      // Associate outward, so text typed at either edge counts as inside the region
      // rather than sliding out of it.
      const from = tr.changes.mapPos(region.from, -1);
      const to = tr.changes.mapPos(region.to, 1);
      let touched = region.touched;

      if (region.kind === 'edit' && !touched) {
        tr.changes.iterChangedRanges((fromA, toA) => {
          if (fromA <= region.to && toA >= region.from) {
            touched = true;
          }
        });
      }

      return { id: region.id, kind: region.kind, from, to, touched };
    });
  }
});

/** The band standing in for a folded `hide` region. */
class FoldBand extends WidgetType {
  constructor(
    private readonly id: string,
    private readonly lines: number
  ) {
    super();
  }

  eq(other: FoldBand) {
    return other.id === this.id && other.lines === this.lines;
  }

  toDOM(view: EditorView) {
    const band = document.createElement('button');
    band.type = 'button';
    band.className = 'live-code__fold';
    band.textContent = `${this.lines} ${this.lines === 1 ? 'line' : 'lines'} the chapter is not about`;
    band.title = 'Show these lines';
    band.addEventListener('click', (event) => {
      event.preventDefault();
      view.dispatch({ effects: toggleHide.of(this.id) });
    });

    return band;
  }

  /** Without this the click never reaches the handler above. */
  ignoreEvent() {
    return false;
  }
}

const EDIT_LINE = Decoration.line({ class: 'cm-lerpit-edit' });
const HIGHLIGHT_LINE = Decoration.line({ class: 'cm-lerpit-highlight' });

/**
 * Turn the tracked regions into decorations.
 *
 * Line decorations rather than ranges, because a region is always whole lines and a
 * ground colour that stops mid-line reads as a selection rather than as a region.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const regions = state.field(regionState, false);
  if (!regions?.length) {
    return Decoration.none;
  }

  const opened = state.field(openedHides, false) ?? new Set<string>();
  const marks: Range<Decoration>[] = [];

  for (const region of regions) {
    if (region.from > region.to || region.to > state.doc.length) {
      continue;
    }

    const firstLine = state.doc.lineAt(region.from);
    const lastLine = state.doc.lineAt(region.to);

    if (region.kind === 'hide' && !opened.has(region.id)) {
      marks.push(
        Decoration.replace({
          block: true,
          widget: new FoldBand(region.id, lastLine.number - firstLine.number + 1)
        }).range(firstLine.from, lastLine.to)
      );
      continue;
    }

    const line = region.kind === 'edit' ? (region.touched ? null : EDIT_LINE) : HIGHLIGHT_LINE;
    if (!line) {
      continue;
    }

    for (let number = firstLine.number; number <= lastLine.number; number += 1) {
      marks.push(line.range(state.doc.line(number).from));
    }
  }

  // Decoration.set sorts for us, which matters because a hide band and a highlight
  // can be produced out of document order when regions are re-tracked.
  return Decoration.set(marks, true);
}

const regionDecorations = EditorView.decorations.compute([regionState, openedHides, 'doc'], buildDecorations);

/** Everything the editor needs to mark regions. */
export function regionMarking(): Extension {
  return [regionState, openedHides, regionDecorations];
}

/**
 * Turn the parser's line spans into the positions this layer tracks.
 *
 * A region whose span is null kept no lines in this view, which is what an exercise
 * with an empty starter looks like. It is dropped rather than tracked at width zero,
 * because a marker on nothing is a marker the reader cannot see the point of.
 */
export function toLiveRegions(state: EditorState, regions: DerivedRegion[]): LiveRegion[] {
  const live: LiveRegion[] = [];

  for (const region of regions) {
    if (!region.span) {
      continue;
    }

    const first = region.span.first + 1;
    const last = region.span.last + 1;
    if (first < 1 || last > state.doc.lines) {
      continue;
    }

    live.push({
      id: region.id,
      kind: region.kind,
      from: state.doc.line(first).from,
      to: state.doc.line(last).to,
      touched: false
    });
  }

  return live;
}

/** Whether the reader has changed any exercise in this document. */
export function hasEdits(state: EditorState): boolean {
  return (state.field(regionState, false) ?? []).some((region) => region.kind === 'edit' && region.touched);
}
