/**
 * Keeping a reader's edits between visits.
 *
 * An exercise is worth a few minutes of someone's attention, and losing it to an
 * accidental refresh is the kind of small betrayal that stops people trying things.
 * So each file the reader has changed is kept under its own key, and restored when
 * they come back.
 *
 * The hard part is not storing it, it is knowing when to throw it away. An author who
 * edits a lesson changes the code around the reader's work, and replaying a year-old
 * edit into a file that has moved on produces something that belongs to nobody. Every
 * entry therefore carries a fingerprint of the starting source it was based on, and an
 * entry whose fingerprint no longer matches is dropped without a word: the reader gets
 * the current lesson, which is the only thing that can still be correct.
 *
 * Every call is wrapped. Private windows, cleared site data and browsers set to block
 * storage all throw on plain access, and none of that is worth losing the editor over.
 */

type Entry = {
  /** Fingerprint of the starter this edit was made against. */
  fingerprint: string;
  text: string;
};

const PREFIX = 'lerpit:code:';

/**
 * A short, stable fingerprint of the starting source.
 *
 * This is FNV-1a, chosen because it is eight lines and has no dependency. It is not a
 * cryptographic hash and does not need to be: the only question it answers is "is this
 * the same text the reader was working from", and the cost of a collision is one
 * reader seeing their old edit in a changed file.
 */
export function fingerprint(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function keyFor(scope: string, path: string): string {
  return `${PREFIX}${scope}/${path}`;
}

/** Whether this browser will let us store anything at all. */
function available(): boolean {
  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export type EditorStore = {
  /** The reader's text for this file, or null to start from the lesson's own. */
  read: (path: string, starter: string) => string | null;
  /** Keep what they have written. Writing the starter back clears the entry instead. */
  write: (path: string, starter: string, text: string) => void;
  /** Forget this file, which is what reset means. */
  clear: (path: string) => void;
};

/**
 * A store scoped to one chapter. `scope` is the chapter's code path, so two lessons
 * with a file of the same name never read each other's edits.
 */
export function createEditorStore(scope: string): EditorStore {
  const usable = available();

  return {
    read(path, starter) {
      if (!usable) {
        return null;
      }

      try {
        const raw = window.localStorage.getItem(keyFor(scope, path));
        if (!raw) {
          return null;
        }

        const entry = JSON.parse(raw) as Entry;
        if (entry?.fingerprint !== fingerprint(starter) || typeof entry.text !== 'string') {
          // The lesson moved on. Drop it rather than leave it to fail again later.
          window.localStorage.removeItem(keyFor(scope, path));
          return null;
        }

        return entry.text;
      } catch {
        return null;
      }
    },

    write(path, starter, text) {
      if (!usable) {
        return;
      }

      try {
        if (text === starter) {
          // Unchanged from the lesson's own text, so there is nothing of theirs to
          // keep and an entry would only be something to invalidate later.
          window.localStorage.removeItem(keyFor(scope, path));
          return;
        }

        const entry: Entry = { fingerprint: fingerprint(starter), text };
        window.localStorage.setItem(keyFor(scope, path), JSON.stringify(entry));
      } catch {
        // Out of quota, or storage blocked part way through a session. The editor
        // keeps working; only the memory of it is lost.
      }
    },

    clear(path) {
      if (!usable) {
        return;
      }

      try {
        window.localStorage.removeItem(keyFor(scope, path));
      } catch {
        // Nothing to do, and nothing worth saying.
      }
    }
  };
}
