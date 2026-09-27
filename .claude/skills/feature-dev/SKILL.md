---
name: feature-dev
description: Five-hat pipeline (product, architect, UX, dev, tester) for any non-trivial change to lerpit.com. Use when adding or reworking a feature, a page, a player behaviour, or any visible UI. Skip only for typo-level edits and pure content changes to a mixtape.
---

# Feature development

One person wears five hats, in order. Each hat has a gate: do not put on the next hat until the current one's checklist passes. Sub-tasks at the dev stage are done one at a time, never in parallel, so the tester hat can follow each one immediately.

Use TodoWrite to track the phases and the dev sub-tasks.

## Project invariants

These outrank anything a hat wants to do. Break one only with the user's explicit yes.

- **Scroll drives the runtime.** A mixtape is a continuous scroll where the active `## Heading {#step-id}` swaps the right-pane runtime (`website/src/lib/playerClient.ts`). Anything that turns reading into clicking breaks the format.
- **One stylesheet.** All CSS is `website/src/styles/global.css`. No component `<style>` blocks, no CSS modules, no utility framework.
- **Tokens, not literals.** `--paper --paper-deep --panel --ink --muted --line --line-strong --accent --accent-soft --accent-warm`, `--font-serif` (Cardo) for prose, `--font-mono` (IBM Plex Mono) for eyebrows, indices, labels. Square corners. 1px borders. No shadows except on transient overlays.
- **No frontmatter, no sidecar metadata.** Title, summary, author, date and steps are inferred from the document (see README). Do not add a metadata layer.
- **Breakpoints already in use:** 1180px (stage becomes a drawer), 900px (rail hides, single column), 640px. Reuse them; don't add new ones without a reason.
- **Spacing rhythm:** 1rem gaps and 1rem/1.05rem box padding. Match it.
- **Local changes only.** No PRs, no new branches, no worktrees (global CLAUDE.md).

---

## 1. Product

**Goal:** know what the feature is for before anything is designed.

1. State the intent in one sentence: who hits this, when, and what they get.
2. Write the use cases, including the ones the user did not mention. For this site that usually means: first-time reader landing on `/`; reader deep-linking to `#step-id` mid-lesson; reader on a phone; reader coming back to a lesson they half-read; author writing a new mixtape.
3. Name what is explicitly **out** of scope.
4. Sketch the final vision even if only a subset ships now. The architect hat needs to know the direction.
5. **Ask.** Any case where two readings lead to different work is a question, asked now, in a short list. Do not guess and do not ask about things a careful default settles.

**Gate:**
- [ ] Intent is one sentence, not a paragraph
- [ ] Use cases listed, including deep-link and mobile
- [ ] Out-of-scope named
- [ ] Final vision sketched, and the shipping subset marked
- [ ] Open questions asked and answered (or explicitly deferred with an assumption stated)

---

## 2. Explore

**Goal:** know the code that the change lands in.

1. Read the actual files, not a summary of them. For player/UI work that is: `website/src/components/LerpettePlayer.astro`, `website/src/lib/playerClient.ts`, the relevant block of `website/src/styles/global.css`, and `website/src/lib/content.ts` if anything is inferred from the document.
2. Find the nearest existing pattern and copy its shape. The stage drawer (`.lerpette-stage__toggle`, `.is-open`) is the reference for anything that collapses; the footnotes collapse in `playerClient.ts` is the reference for progressive disclosure inside prose.
3. Note the CSS you will touch by line, so the diff stays small.

**Gate:**
- [ ] Nearest existing pattern identified, with file:line
- [ ] List of files to change, with what changes in each
- [ ] Nothing in the list duplicates something that already exists

---

## 3. Architect

**Goal:** a design that reaches the product's final vision by extension, not by rewrite, and costs nothing extra today.

Rules:
- Build the shipping subset only. No abstraction whose second user is hypothetical.
- The seam matters more than the layer. Ask: when the next item in the final vision arrives, what one file does it touch? If the answer is "several", move the seam.
- Prefer data-driven over branch-driven. Chapters, segments, steps are lists; render from the list.
- Prefer CSS state over JS state. A class or a custom property on a root element beats a variable in a closure, because it stays inspectable and it transitions for free.
- One source of truth for a number. A scroll threshold, a strip height, a column width: define it once (CSS custom property or one constant) and derive everything from it.
- Say plainly what would need rewriting if the product's direction changed, and accept it if the cost is small.

**Gate:**
- [ ] Shipping subset only; no speculative abstraction
- [ ] Named the seam the next feature in the vision extends, and how
- [ ] Magic numbers exist once, not twice
- [ ] No new dependency (this site has 12 and likes it that way)
- [ ] Does not break a project invariant
- [ ] Rejected alternatives noted in a line each

---

## 4. UX

**Goal:** the thing is legible, reachable and calm before a line of production code is written.

Mock first: build it in the scratchpad and look at it. See the `mockup` skill, which is not optional for visual work.

**Checklist:**
- [ ] **Clutter.** Every element earns its pixels. Nothing duplicates information that is already on screen a second time.
- [ ] **Hierarchy.** One primary thing per region. Eyebrow / title / body sizes follow the site's existing ramp.
- [ ] **Margins and gaps.** 1rem rhythm. Equal optical space above and below a divider. Nothing crowds a border.
- [ ] **Overlap.** Sticky and fixed elements: check what passes underneath. A sticky strip needs an opaque background, and its fade tail must not land on top of the next element's border.
- [ ] **Layout shift.** States must not resize anything in flow. Reserve height; animate opacity, transform, clip-path, colour.
- [ ] **Clickability.** Hit area at least 24x24px even when the visible mark is 6px (use an `::after { inset: -9px 0 }` pad). Cursor, hover and `:focus-visible` states on everything clickable. Keyboard-reachable in DOM order.
- [ ] **Readability.** Prose 1.05-1.1rem, line-height ~1.5, measure under ~80 characters. Mono labels 0.72-0.8rem with letter-spacing. Muted text only for secondary information.
- [ ] **Contrast.** Body text and any text on a tinted panel clears 4.5:1; large text and UI marks clear 3:1.
- [ ] **Motion.** Scroll-linked motion maps 1:1 to the thing the reader is moving, or it feels like drag. Transitions 140-200ms. Everything collapses to an instant swap under `prefers-reduced-motion`.
- [ ] **States.** Empty, first, middle, last, active, hover, focus, deep-linked. Each one looked at, not assumed.
- [ ] **Widths.** Checked at 1440, 1180, 900 and 640.

**Gate:** all of the above, verified in a mock with screenshots, not by reasoning about the CSS.

---

## 5. Dev, then test, one sub-task at a time

**Goal:** land the agreed design in small verified steps.

Split the work into sub-tasks that each leave the site working. For each sub-task, in this order, before starting the next one:

1. **Dev.** Implement it. Follow the conventions in the files you are editing: `.astro` markup mirrors the existing block, CSS goes next to the rules it relates to in `global.css`, client logic goes in `playerClient.ts` behind the existing init.
2. **Test.** Prove it:
   - `npm run test:js` when anything under `lerpettes/libs/` changed (add a vitest case for new logic; there is no DOM harness, so keep new logic in pure functions that can be tested without a browser)
   - `npm run build` for anything that touches content inference or routing
   - a visual pass per the `mockup` skill against the real dev server for anything visible
3. Only then start the next sub-task.

**Per sub-task gate:**
- [ ] Does one thing, site still works without the later sub-tasks
- [ ] Reuses an existing pattern where one exists
- [ ] Tests run and pass, or the reason none apply is stated
- [ ] Visually checked at the states that sub-task can reach
- [ ] No leftover scratch code, no commented-out blocks, no console noise

---

## 6. Review and hand off

- [ ] Re-read the diff as a stranger. Anything that needs a comment to be understood gets simplified or gets the comment.
- [ ] Project invariants re-checked
- [ ] UX checklist re-run on the real page, not the mock
- [ ] Temp servers killed, temp tabs closed, scratchpad files left in the scratchpad
- [ ] Report: what shipped, what was deliberately left out, what the next extension point is. Changes stay local and uncommitted unless the user asks.
