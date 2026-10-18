# Authoring problems

Every problem the site can find in a lerpette, by the id shown beside it on the page
(`where · id`). A problem never stops the build: the lerpette is still published, the
problem is listed at the top of its page in the local view, and a production build prints
the same list to the terminal.

Generated from `website/src/lib/problems.ts`; a test fails when the two disagree.

## Library

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `content-root-missing` | There is no lerpettes/content folder | The site publishes nothing. | Create `lerpettes/content/` with one folder per collection. |
| `landing-empty` | The landing collection has no published lerpette | '/' falls back to the newest published lerpette anywhere. | Publish a lerpette in the landing collection (site.config.ts's `landingCollection`), or set `landing = true` in one lerpette's control.toml. |
| `landing-multiple` | More than one lerpette sets landing = true | '/' shows the newest of them; the others are ignored. | Keep `landing = true` in one control.toml. |
| `internal-error` | Reading a lerpette threw | That lerpette is published empty. This is a bug in the site, not the document. | Report it with the message; the lerpette itself may be fine. |

## Documents

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `document-missing` | No mixtape.md or collection.md | The page has no content of its own. | Write `mixtape.md` (a lerpette) or `collection.md` (a collection). |
| `document-duplicate` | Both .md and .mdx exist | Only the .md is read. | Keep one of them. |
| `collection-title-missing` | A collection has no # title | Its slug is shown as its title. | Start collection.md with `# Title`. |
| `title-missing` | A lerpette has no # title | Its slug is shown as its title. | Put one `# Title` under the byline line. |
| `summary-missing` | No summary paragraph after the title | Its card in the library is blank. | Write one paragraph straight after the title. |
| `meta-line-missing` | The Author | Date line is missing or malformed | The lerpette is undated and sorts last. | Make the first line exactly `Author: <name> | Date: YYYY-MM-DD`. |
| `meta-line-misplaced` | An Author | Date line appears in the body | It renders as prose. | Keep exactly one byline line, as the first line. |
| `front-matter` | The document starts with a --- front-matter block | It renders as a rule and a stray heading. | Delete the `---` block; settings go in control.toml. |
| `raw-html` | Raw HTML in prose | The tag and what it wraps are left out of the page. | Write it in Markdown. HTML comments (`<!-- -->`) are fine and are dropped. |
| `link-missing` | A relative link or image points at a missing file | A broken link or image. | Add the file beside the document, or correct the path. |

## Chapters and headings

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `chapters-missing` | A lerpette has no ## chapters | There is no stage and nothing to play. | Add `## Title {#id}` headings. |
| `chapter-id-missing` | A chapter heading has no {#id} | Its id is guessed from the title, so renaming it moves its code folder and breaks links. | Write the heading as `## Title {#id}`. |
| `chapter-id-duplicate` | Two chapters share an id | The second answers to a different id, and its code folder is not found. | Give each chapter its own id. |
| `heading-token` | Something in a heading’s braces is not a panel change | It is ignored. | Inside the braces write `#id`, then `+name`, `-name` or `=name` panel changes. |
| `panel-unknown` | A heading names a panel that does not exist | That panel is left out of the chapter. | Use a panel the registry has: `canvas`, `viewport2d`, `viewport3d`, `table`, `readout`. |
| `runtime-missing` | No chapter has anything to run | The page renders without a stage. | Name a panel in a heading, add a `lerpit` fence, or add `code/<id>/js/index.ts`. |

## Code folders

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `code-dir-missing` | Chapters but no code/ folder | No chapter can run code. | Add `code/` beside mixtape.md, with one folder per chapter id. |
| `code-stray-file` | A file directly under code/ | Nothing reads it. | Move it into a chapter folder, or `code/shared/`. |
| `code-dir-unmatched` | A code/<id>/ folder matches no chapter | Nothing loads it. | Rename the folder to a chapter id, or add the chapter. |
| `chapter-code-unused` | A chapter has a code folder that nothing runs | The code is never used. | Add `js/index.ts`, name a panel in the heading, or point a fence at the files. |

## Code boxes (lerpit fences)

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `fence-syntax` | A ```lerpit fence line does not parse | The box is missing the files it could not read. | Write the fence line as ```` ```lerpit path/file.js:region other.cpp ````. |
| `fence-body-ignored` | Code written inside a ```lerpit fence | It is ignored; the files on the fence line are what show. | Leave the block empty; the files go on the fence line. |
| `fence-outside-chapter` | A ```lerpit fence outside a chapter | There is no code folder to read its files from. | Move the fence under a `## Title {#id}` heading. |
| `fence-file-missing` | A fence names a file that is not there | That tab is left out of the box. | Add the file under `code/<id>/`, or correct the path. |
| `fence-region-missing` | A fence names a region the file does not mark | That tab is left out of the box. | Use a region the file marks, or add `// lerpit:<name>:edit:start` … `:end`. |
| `region-marker` | A lerpit: region marker is malformed | The region is not marked, so there is no exercise there. | Markers are `// lerpit:<id>:<kind>:start|hint|solution|end`, unnested. |

## control.toml

| id | problem | what the reader loses | fix |
| --- | --- | --- | --- |
| `landing-unpublished` | A draft or unlisted lerpette sets landing = true | It is not used for '/'. | Publish it (`status = "published"`), or remove `landing = true`. |
| `control-unreadable` | control.toml could not be read | All of it is ignored; the lerpette takes the defaults. | Check the file's permissions, or delete it. |
| `control-syntax` | control.toml is not valid TOML | All of it is ignored; the lerpette takes the defaults. | One setting per line, values quoted: `status = "draft"`. |
| `control-unknown-key` | control.toml sets a key the site does not have | That line is ignored. | A lerpette knows status, landing, order, [caption], [idle_status]; a collection knows card_style and card_palette. |
| `control-bad-value` | control.toml gives a key a value it cannot take | That key keeps its default. | See the message for the values that key takes. |
| `control-chapter-unknown` | control.toml's [caption] or [idle_status] names a missing chapter | That line is ignored. | Use the chapter ids from the headings. |
