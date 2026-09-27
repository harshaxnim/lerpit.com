import type { LerpettePanel } from '../panel';
import type { LerpettePanelSlot } from '../types';

/**
 * Rows of numbers, for a chapter whose output is data rather than a picture.
 *
 * issue-one is the reason this exists: it reads a struct out of linear memory and its
 * whole subject is the layout of those bytes. Before panels it drew "intentionally left
 * blank" on a canvas and pushed the actual content through the caption, one string a
 * reader could not edit.
 *
 * A chapter fills this by calling `out.row()` once per row, which keeps the rule that
 * every function writes into its first argument rather than returning something. The
 * panel owns the markup, the header, the column order and the number formatting, so
 * every table on the site lines up the same way without anyone arranging it.
 */

export type TableTarget = {
  /** One row. Keys become columns, in the order they are first seen. */
  row(values: Record<string, unknown>): void;
};

type Bundle = {
  host: HTMLElement;
  rows: Array<Record<string, unknown>>;
  columns: string[];
};

const bundles = new WeakMap<TableTarget, Bundle>();

/**
 * Numbers are shown with a fixed number of decimals so a column does not jitter between
 * widths as values change, which is the difference between a table you can read at a
 * glance and one that shimmers.
 */
function cell(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }

  return value === null || value === undefined ? '' : String(value);
}

export const tablePanel: LerpettePanel<TableTarget> = {
  name: 'table',
  label: 'Table',
  hostClass: 'lerpette-panel--table',
  // Rewriting a table sixty times a second destroys the reader's selection and thrashes
  // layout to show numbers that did not change. It redraws when the state moved.
  cadence: 'change',
  members: { required: ['draw'], optional: [] },

  create(slot: LerpettePanelSlot): TableTarget {
    const scroller = document.createElement('div');
    scroller.className = 'lerpette-table';
    scroller.setAttribute('aria-label', `Data for ${slot.lessonTitle}`);
    slot.host.append(scroller);

    const target: TableTarget = {
      row(values) {
        const bundle = bundles.get(target);
        if (!bundle) {
          return;
        }

        bundle.rows.push(values);
        for (const key of Object.keys(values)) {
          if (!bundle.columns.includes(key)) {
            bundle.columns.push(key);
          }
        }
      }
    };

    bundles.set(target, { host: scroller, rows: [], columns: [] });
    return target;
  },

  begin(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    bundle.rows = [];
    bundle.columns = [];
  },

  end(target) {
    const bundle = bundles.get(target);
    if (!bundle) {
      return;
    }

    if (bundle.rows.length === 0) {
      bundle.host.replaceChildren();
      return;
    }

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const column of bundle.columns) {
      const th = document.createElement('th');
      th.textContent = column;
      headRow.append(th);
    }
    head.append(headRow);

    const body = document.createElement('tbody');
    for (const row of bundle.rows) {
      const tr = document.createElement('tr');
      for (const column of bundle.columns) {
        const td = document.createElement('td');
        // textContent, never innerHTML: these strings come out of reader-edited code.
        td.textContent = cell(row[column]);
        td.classList.toggle('is-number', typeof row[column] === 'number');
        tr.append(td);
      }
      body.append(tr);
    }

    table.append(head, body);
    bundle.host.replaceChildren(table);
  },

  destroy(target) {
    bundles.delete(target);
  }
};
