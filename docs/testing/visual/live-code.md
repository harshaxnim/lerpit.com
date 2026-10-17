# Live code

Route: `/meta/live-code/`. Sizes: 1400×900, 390×844.

## Boxes
- [ ] Every fence becomes a box beside its prose, built when the page loads, not when the chapter activates.
- [ ] File tabs in the fence's order; the first is open.
- [ ] Edit regions are marked; highlight regions tinted; hidden regions not shown.
- [ ] `hint` and `solution` chips only where the file sets an exercise.

## Running
- [ ] The first box in a chapter builds when the chapter activates; status reads "Running. Built in …".
- [ ] Run (and Cmd+Enter) rebuilds; Reset restores the starter text.
- [ ] Run on a chapter that is scrolled away makes it active first.
- [ ] JS chapter: viewport draws the bob and trail; Readout shows t, x, v, energy.
- [ ] C++ chapter: first build fetches the toolchain (slow), later builds are quick; viewport draws the same picture.
- [ ] A syntax error shows in the log under the box; status turns bad; the panel keeps the last good build.
- [ ] A `step` that throws says so once and stops calling it; the panel does not freeze silently.

## Persistence
- [ ] Edits survive a reload (local storage, per chapter path).
- [ ] Solution view is read-only.
