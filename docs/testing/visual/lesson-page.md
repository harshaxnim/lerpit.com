# Lesson page

Routes: every lesson (`/`, `/meta/issue-zero/`, `/meta/issue-one/`, `/meta/live-code/`,
`/physics-engine/point-dynamics/`, `/physics-engine/simple-body-dynamics/`,
`/rendering/shadow-maps/`). Sizes: 1400×900 and 390×844.

## Byline
- [ ] Date / author / collection / title, separated by ` / `, on one line, ellipsised if long.
- [ ] Collection crumb links to the collection page.
- [ ] Pinned under the top edge once scrolled; an opaque paper band behind it.
- [ ] On a chapter, a fifth crumb names the chapter; on the intro it is absent and the title is current.
- [ ] At 1400 the stage's tabs sit in the same row, in the right-hand track.

## Chapters
- [ ] Intro numbered `00`, chapters `01`, `02`… in order.
- [ ] Chapter header freezes under the byline while its section scrolls.
- [ ] The active chapter is marked; scrolling moves the mark, the byline crumb and the stage together.
- [ ] Clicking a chapter's blank prose area makes it active; clicking a link inside it does not.
- [ ] A chapter without its own code shows the `!` mark with "missing code folder" on hover (only where expected).

## Prose
- [ ] Body text in Cardo, labels in Syne, code in IBM Plex Mono.
- [ ] Inline and display maths (KaTeX) render, no raw `$`.
- [ ] Images become figures with a caption from the title or alt text.
- [ ] Footnotes start folded; a reference opens them and highlights the target briefly.
- [ ] Links to other lessons and to `#anchors` work.

## Shelf at the foot
- [ ] Other lerpettes as cassette cards; the current one is not among them.

## Whole page
- [ ] No horizontal scroll at 390.
- [ ] No console errors (check-site records these).
