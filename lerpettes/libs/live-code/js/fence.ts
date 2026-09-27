/**
 * The `lerpit` fence: where a code box goes in a chapter, and what it shows.
 *
 * ````markdown
 * ```lerpit forces.cpp:force spring.cpp:step
 * ```
 * ````
 *
 * Each word is a file and, after a colon, the region in it the reader may edit. A
 * word with no colon means the whole file is editable. Paths are relative to the
 * chapter's own `code/<step-id>/` directory, so `forces.cpp` and `wasm/forces.cpp`
 * both work and a lesson can point a box straight at source it already ships.
 *
 * The author writes the files out rather than the box collecting whatever happens to
 * carry the region, because the order written is the tab order and the first one is
 * the tab that opens. Inferring that from the filesystem would mean an exercise's
 * tabs reshuffling when an unrelated file is added.
 *
 * A word starting with a dash is an option, not a file. No options are defined yet;
 * the shape is reserved so that when one is needed it cannot be mistaken for a
 * filename, and so an author who guesses at one is told rather than silently given a
 * box with a missing tab.
 *
 * A plain markdown fence is the carrier because it is already a node this site's
 * pipeline understands. The alternative was raw HTML, which is dropped by
 * remark-rehype unless `allowDangerousHtml` is set, and that flag is not scoped to
 * one tag: it would let any document on the site emit arbitrary markup.
 */

/** The language word that makes a fence a code box rather than a listing. */
export const FENCE_LANG = 'lerpit';

export type FenceEntry = {
  /** Path relative to the chapter's `code/<step-id>/` directory. */
  path: string;
  /** The region in that file, or null when the whole file is editable. */
  regionId: string | null;
};

/** Options this fence understands. Reserved, and empty on purpose. */
export const FENCE_FLAGS: readonly string[] = [];

export type FenceSpec = {
  entries: FenceEntry[];
  /** Recognised options, in the order written. Always empty until one is defined. */
  flags: string[];
  /** What is wrong with the fence as written, in the author's terms. */
  problems: Array<{ message: string; fix: string }>;
};

/** A path that climbs out of the chapter, or starts at the filesystem root. */
function escapesChapter(path: string): boolean {
  return path.startsWith('/') || path.split('/').includes('..');
}

/**
 * Read a fence's info string, the part after the language word.
 *
 * Nothing here throws. A fence an author got wrong still renders, and what is wrong
 * with it goes in the page's problem panel, which is how every other authoring
 * mistake on this site behaves.
 */
export function parseFence(meta: string): FenceSpec {
  const problems: FenceSpec['problems'] = [];
  const entries: FenceEntry[] = [];
  const flags: string[] = [];
  const words = meta.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    problems.push({
      message: 'This `lerpit` fence names no files, so the box would have no tabs.',
      fix: 'Write ```` ```lerpit forces.cpp:force ```` with a file and the region in it.'
    });

    return { entries, flags, problems };
  }

  for (const word of words) {
    if (word.startsWith('-')) {
      readFlag(word);
      continue;
    }

    // Split at the last colon: a region name cannot contain one, and a path should not.
    const colon = word.lastIndexOf(':');
    const path = colon < 0 ? word : word.slice(0, colon);
    const regionId = colon < 0 ? null : word.slice(colon + 1);

    if (!path) {
      problems.push({
        message: `\`${word}\` names a region but no file.`,
        fix: 'Write the file first, as `forces.cpp:force`.'
      });
      continue;
    }

    if (colon >= 0 && !regionId) {
      problems.push({
        message: `\`${word}\` ends in a colon with no region after it.`,
        fix: `Write \`${path}\` for the whole file, or \`${path}:<region>\` for part of it.`
      });
      continue;
    }

    if (regionId && !/^[A-Za-z0-9_-]+$/.test(regionId)) {
      problems.push({
        message: `\`${regionId}\` is not a usable region name.`,
        fix: 'Use letters, digits, dashes and underscores, and the same name in the file.'
      });
      continue;
    }

    if (escapesChapter(path)) {
      problems.push({
        message: `\`${path}\` reaches outside the chapter's own code directory.`,
        fix: 'Point at a file under `code/<step-id>/`, relative to it.'
      });
      continue;
    }

    if (entries.some((entry) => entry.path === path)) {
      problems.push({
        message: `\`${path}\` is named twice in this fence, so it would be two tabs on one file.`,
        fix: 'Name each file once. One box shows one region per file.'
      });
      continue;
    }

    entries.push({ path, regionId });
  }

  if (entries.length === 0 && problems.length === 0) {
    problems.push({
      message: 'This `lerpit` fence names only options, so the box would have no tabs.',
      fix: 'Add a file, as `forces.cpp:force`.'
    });
  }

  return { entries, flags, problems };

  function readFlag(word: string) {
    const name = word.replace(/^-+/, '');
    if (FENCE_FLAGS.includes(name)) {
      flags.push(name);
      return;
    }

    problems.push({
      message: `\`${word}\` is not an option this fence understands.`,
      fix:
        FENCE_FLAGS.length === 0
          ? 'There are no options yet. A word starting with a dash is reserved for one, so name the file without it.'
          : `Use one of ${FENCE_FLAGS.map((flag) => `\`--${flag}\``).join(', ')}.`
    });
  }
}

/** What the tab says: the filename, with the directories left off. */
export function tabLabel(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
