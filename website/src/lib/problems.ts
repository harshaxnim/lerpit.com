/*
 * Every authoring problem the site can report, by id.
 *
 * content.ts and control.ts report a problem with one of these ids, a message written
 * for the case at hand, and a fix. The id is what is stable: it is shown beside the
 * message on the page, it is what docs/authoring/problems.md is organised by, and a
 * test fails if a report uses an id that is not here or one here is never reported.
 *
 * `area` groups them in the catalogue. `costs` says what the reader loses while the
 * problem stands, which is how an author decides what to fix first.
 */

export type ProblemArea = 'library' | 'document' | 'chapters' | 'code' | 'fences' | 'control';

export type ProblemSpec = {
  area: ProblemArea;
  /** One line, in the catalogue's heading. */
  title: string;
  /** What the reader loses while it stands. */
  costs: string;
};

export const PROBLEMS = {
  'content-root-missing': { area: 'library', title: 'There is no lerpettes/content folder', costs: 'The site publishes nothing.' },
  'landing-empty': { area: 'library', title: "The landing collection has no published lerpette", costs: "'/' falls back to the newest published lerpette anywhere." },
  'landing-multiple': { area: 'library', title: 'More than one lerpette sets landing = true', costs: "'/' shows the newest of them; the others are ignored." },
  'landing-unpublished': { area: 'control', title: 'A draft or unlisted lerpette sets landing = true', costs: "It is not used for '/'." },
  'internal-error': { area: 'library', title: 'Reading a lerpette threw', costs: 'That lerpette is published empty. This is a bug in the site, not the document.' },

  'document-missing': { area: 'document', title: 'No mixtape.md or collection.md', costs: 'The page has no content of its own.' },
  'document-duplicate': { area: 'document', title: 'Both .md and .mdx exist', costs: 'Only the .md is read.' },
  'collection-title-missing': { area: 'document', title: 'A collection has no # title', costs: 'Its slug is shown as its title.' },
  'title-missing': { area: 'document', title: 'A lerpette has no # title', costs: 'Its slug is shown as its title.' },
  'summary-missing': { area: 'document', title: 'No summary paragraph after the title', costs: 'Its card in the library is blank.' },
  'meta-line-missing': { area: 'document', title: 'The Author | Date line is missing or malformed', costs: 'The lerpette is undated and sorts last.' },
  'meta-line-misplaced': { area: 'document', title: 'An Author | Date line appears in the body', costs: 'It renders as prose.' },
  'front-matter': { area: 'document', title: 'The document starts with a --- front-matter block', costs: 'It renders as a rule and a stray heading.' },
  'raw-html': { area: 'document', title: 'Raw HTML in prose', costs: 'The tag and what it wraps are left out of the page.' },
  'link-missing': { area: 'document', title: 'A relative link or image points at a missing file', costs: 'A broken link or image.' },
  'note-open': { area: 'document', title: 'An author left a `LERP:` note unresolved', costs: 'Nothing to the reader — the tag is already invisible, like any comment — but the task behind it is still pending.' },

  'chapters-missing': { area: 'chapters', title: 'A lerpette has no ## chapters', costs: 'There is no stage and nothing to play.' },
  'chapter-id-missing': { area: 'chapters', title: 'A chapter heading has no {#id}', costs: 'Its id is guessed from the title, so renaming it moves its code folder and breaks links.' },
  'chapter-id-duplicate': { area: 'chapters', title: 'Two chapters share an id', costs: 'The second answers to a different id, and its code folder is not found.' },
  'heading-token': { area: 'chapters', title: 'Something in a heading’s braces is not a panel change', costs: 'It is ignored.' },
  'panel-unknown': { area: 'chapters', title: 'A heading names a panel that does not exist', costs: 'That panel is left out of the chapter.' },
  'runtime-missing': { area: 'chapters', title: 'No chapter has anything to run', costs: 'The page renders without a stage.' },

  'code-dir-missing': { area: 'code', title: 'Chapters but no code/ folder', costs: 'No chapter can run code.' },
  'code-stray-file': { area: 'code', title: 'A file directly under code/', costs: 'Nothing reads it.' },
  'code-dir-unmatched': { area: 'code', title: 'A code/<id>/ folder matches no chapter', costs: 'Nothing loads it.' },
  'chapter-code-unused': { area: 'code', title: 'A chapter has a code folder that nothing runs', costs: 'The code is never used.' },

  'fence-syntax': { area: 'fences', title: 'A ```lerpit fence line does not parse', costs: 'The box is missing the files it could not read.' },
  'fence-body-ignored': { area: 'fences', title: 'Code written inside a ```lerpit fence', costs: 'It is ignored; the files on the fence line are what show.' },
  'fence-outside-chapter': { area: 'fences', title: 'A ```lerpit fence outside a chapter', costs: 'There is no code folder to read its files from.' },
  'fence-file-missing': { area: 'fences', title: 'A fence names a file that is not there', costs: 'That tab is left out of the box.' },
  'fence-region-missing': { area: 'fences', title: 'A fence names a region the file does not mark', costs: 'That tab is left out of the box.' },
  'region-marker': { area: 'fences', title: 'A lerpit: region marker is malformed', costs: 'The region is not marked, so there is no exercise there.' },

  'control-unreadable': { area: 'control', title: 'control.toml could not be read', costs: 'All of it is ignored; the lerpette takes the defaults.' },
  'control-syntax': { area: 'control', title: 'control.toml is not valid TOML', costs: 'All of it is ignored; the lerpette takes the defaults.' },
  'control-unknown-key': { area: 'control', title: 'control.toml sets a key the site does not have', costs: 'That line is ignored.' },
  'control-bad-value': { area: 'control', title: 'control.toml gives a key a value it cannot take', costs: 'That key keeps its default.' },
  'control-chapter-unknown': { area: 'control', title: "control.toml's [caption] or [idle_status] names a missing chapter", costs: 'That line is ignored.' }
} as const satisfies Record<string, ProblemSpec>;

export type ProblemId = keyof typeof PROBLEMS;

export const PROBLEM_IDS = Object.keys(PROBLEMS) as ProblemId[];
