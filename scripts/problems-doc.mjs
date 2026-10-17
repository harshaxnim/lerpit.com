#!/usr/bin/env node
// Writes docs/authoring/problems.md from website/src/lib/problems.ts. Run after adding a problem id:
//   node scripts/problems-doc.mjs
import fs from 'node:fs';
const src = fs.readFileSync('website/src/lib/problems.ts', 'utf8');
const rows = [...src.matchAll(/'([a-z0-9-]+)': \{ area: '(\w+)', title: (["'])(.*?)\3, costs: (["'])(.*?)\5 \}/g)].map((m) => ({ id: m[1], area: m[2], title: m[4], costs: m[6] }));
const FIX = {
  'content-root-missing': 'Create `lerpettes/content/` with one folder per collection.',
  'landing-empty': "Publish a lerpette in the landing collection (site.config.ts's `landingCollection`), or set `landing = true` in one lerpette's control.toml.",
  'landing-multiple': 'Keep `landing = true` in one control.toml.',
  'landing-unpublished': 'Publish it (`status = "published"`), or remove `landing = true`.',
  'internal-error': 'Report it with the message; the lerpette itself may be fine.',
  'document-missing': 'Write `mixtape.md` (a lerpette) or `collection.md` (a collection).',
  'document-duplicate': 'Keep one of them.',
  'collection-title-missing': 'Start collection.md with `# Title`.',
  'title-missing': 'Put one `# Title` under the byline line.',
  'summary-missing': 'Write one paragraph straight after the title.',
  'meta-line-missing': 'Make the first line exactly `Author: <name> | Date: YYYY-MM-DD`.',
  'meta-line-misplaced': 'Keep exactly one byline line, as the first line.',
  'front-matter': 'Delete the `---` block; settings go in control.toml.',
  'raw-html': 'Write it in Markdown. HTML comments (`<!-- -->`) are fine and are dropped.',
  'link-missing': 'Add the file beside the document, or correct the path.',
  'chapters-missing': 'Add `## Title {#id}` headings.',
  'chapter-id-missing': 'Write the heading as `## Title {#id}`.',
  'chapter-id-duplicate': 'Give each chapter its own id.',
  'heading-token': 'Inside the braces write `#id`, then `+name`, `-name` or `=name` panel changes.',
  'panel-unknown': 'Use a panel the registry has: `canvas`, `viewport2d`, `viewport3d`, `table`, `readout`.',
  'runtime-missing': 'Name a panel in a heading, add a `lerpit` fence, or add `code/<id>/js/index.ts`.',
  'code-dir-missing': 'Add `code/` beside mixtape.md, with one folder per chapter id.',
  'code-stray-file': 'Move it into a chapter folder, or `code/shared/`.',
  'code-dir-unmatched': 'Rename the folder to a chapter id, or add the chapter.',
  'chapter-code-unused': 'Add `js/index.ts`, name a panel in the heading, or point a fence at the files.',
  'fence-syntax': 'Write the fence line as ```` ```lerpit path/file.js:region other.cpp ````.',
  'fence-body-ignored': 'Leave the block empty; the files go on the fence line.',
  'fence-outside-chapter': 'Move the fence under a `## Title {#id}` heading.',
  'fence-file-missing': 'Add the file under `code/<id>/`, or correct the path.',
  'fence-region-missing': 'Use a region the file marks, or add `// lerpit:<name>:edit:start` … `:end`.',
  'region-marker': 'Markers are `// lerpit:<id>:<kind>:start|hint|solution|end`, unnested.',
  'control-unreadable': "Check the file's permissions, or delete it.",
  'control-syntax': 'One setting per line, values quoted: `status = "draft"`.',
  'control-unknown-key': 'Known keys: status, landing, order, card_style, [caption], [idle_status].',
  'control-bad-value': 'See the message for the values that key takes.',
  'control-chapter-unknown': 'Use the chapter ids from the headings.'
};
const AREAS = { library: 'Library', document: 'Documents', chapters: 'Chapters and headings', code: 'Code folders', fences: 'Code boxes (lerpit fences)', control: 'control.toml' };
let out = `# Authoring problems\n\nEvery problem the site can find in a lerpette, by the id shown beside it on the page\n(\`where · id\`). A problem never stops the build: the lerpette is still published, the\nproblem is listed at the top of its page in the local view, and a production build prints\nthe same list to the terminal.\n\nGenerated from \`website/src/lib/problems.ts\`; a test fails when the two disagree.\n`;
for (const [area, name] of Object.entries(AREAS)) {
  out += `\n## ${name}\n\n| id | problem | what the reader loses | fix |\n| --- | --- | --- | --- |\n`;
  for (const row of rows.filter((r) => r.area === area)) out += `| \`${row.id}\` | ${row.title} | ${row.costs} | ${FIX[row.id] ?? ''} |\n`;
}
fs.writeFileSync('docs/authoring/problems.md', out);
console.log(rows.length, 'problems', rows.filter((r) => !FIX[r.id]).map((r) => r.id));
