# Pinned controls

A chapter can keep some of its controls showing while the controls card is folded. The card
still starts folded, so the stage stays clear, but the one or two controls that carry the
lesson are where a reader sees them.

## The interface

```ts
ctx.controls().addBinding(s, 'k', { label: "Spring Constant k'", min: 50, max: 2000, pinned: true });
ctx.controls().addBinding(s, 'damping', { label: 'Damping Constant k_d', min: 0, max: 20 });
ctx.controls().addBinding(s, 'web', { label: 'Show the web', pinned: true });
```

- `pinned` is one of the `ControlOptions`: what the stage reads off a control. Tweakpane gets
  the rest of the params unchanged, with `pinned` removed.
- It works on every control added straight to the card: `addBinding`, `addButton`,
  `addFolder` and `addBlade`. A pinned folder stays as a whole, folded or open as the reader
  left it. A control inside a folder takes tweakpane's params alone.
- `ctx.controls()` returns `Controls`: tweakpane's `Pane` with those four methods retyped, so
  `pinned` autocompletes and must be a boolean. Return types are tweakpane's own, so
  `.on('change', (e) => e.value)` keeps its type.

### Why an option on each control

Three shapes were weighed:

- `pinned: true` on the control (chosen). The choice sits on the line that makes the control,
  it works the same for every kind of control, and a typo is a type error.
- A list on the card, `controls({ pinned: ['k'] })`. This names controls by key in a second
  place that can drift, buttons have no key, the same key on two objects is ambiguous, and the
  card's options are only read on the first `controls()` call.
- A second pane, `pinnedControls()`. This adds a method to `ctx` for one card, splits the
  saved slider values across two panes, and forces pinned rows to always come first.

The readings card's `.mini(label)` is the nearest relative: both decide what a folded card
still shows. Readings name one reading on the card because a mini card shows exactly one;
controls can pin several, so the option belongs on each control.

## Behaviour

On 2026-10-24 the author first chose a separate "More controls" line under the pinned rows
(option C of three mockups). They then moved the toggle back into the head: the title itself
says what folding hides, with the chevron on its left.

| Card state | Shows |
| --- | --- |
| Nothing pinned | Exactly as before: the "Controls" title in the head is the fold toggle. |
| Folded, some pinned | The head titled "⌄ More Controls", then the pinned rows, at the full card width. |
| Open, some pinned | The head titled "⌃ Fewer Controls", then every row, in the order added. |
| Every control pinned | Every row and no title, since folding would hide nothing. |

- `expanded: true` still starts the card open. Folding it keeps the pinned rows.
- Restart keeps the reader's fold and slider values, and moving to another chapter and back
  keeps the card as it was. Both work as they did before this feature.
- On a narrow stage, pinned rows use the existing half-width layout, with each label above
  its control.
- A pinned control that the chapter hides itself (`binding.hidden = true`) stays hidden.

## How it works

- `stage/chrome.ts`, `pinnable(pane, added)`: replaces the four `add*` methods on the pane
  instance. Each one strips `pinned`, calls tweakpane's method (bound, so its generics
  survive), adds the class `is-pinned` to the new row's element, and calls `added`.
- `added` is `syncToggle`, which reads the rows under `.tp-rotv_c`. With nothing pinned the
  title reads "Controls"; with something pinned it reads "More Controls" or "Fewer Controls"
  after a chevron; with everything pinned it is hidden.
- `stage/chrome.css` decides what folds. A folded card hides its body unless the controls
  contain an `.is-pinned` row. In that case only the rows that are not pinned are hidden, and
  the card keeps its open width. Nothing in JavaScript tracks the fold beyond the existing
  `is-collapsed` class.

## Verified

The checks were run in headless Chrome against the dev server, on the jelly stapler chapter
and on the real `chrome.ts` module loaded into the page. The script, `pintest.mjs`, is in the
session scratchpad. All 16 checks passed:

- Folded: only the pinned rows show, at the full card width, under a "More Controls" title
  with a chevron.
- Opening shows every row in the order they were added, under "Fewer Controls". Folding
  again leaves the pinned rows.
- A pinned slider moves with the keyboard while the card is folded.
- Restart keeps the fold, the pinned rows and the slider value.
- A chapter with no pinned controls (Flow) folds exactly as before.
- Every control pinned: there is no toggle, and every row shows.
- `expanded: true` starts open. Folding keeps a pinned slider, a pinned button and a pinned
  folder, and hides the one control that is not pinned.
- Phone width (390 px): the pinned rows show inside the stage.
- No page errors.

There is no DOM test environment in vitest (`environment: 'node'`, no jsdom), so there is no
unit test. Adding one would mean a new dev dependency.

## Known limits and possible next steps

- Controls inside a folder cannot be pinned on their own. Supporting it would mean wrapping
  each folder's `add*` methods the same way and keeping a folder showing while it holds a
  pinned row.
- Rows are matched by element, so a control moved with tweakpane's `index` param keeps its
  pin.
- Tweakpane checkboxes were invisible on the stage, because `--tp-input-background-color`
  was the card's own paper colour. Fixed on 2026-10-27; see the gap ledger entry.
