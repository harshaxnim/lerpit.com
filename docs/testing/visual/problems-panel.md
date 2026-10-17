# Problems panel

Route: any lesson with problems (the local view of an unlisted or unfinished lesson), and `/library/`.

- [ ] A folded disclosure above the intro: "!" mark, title, count.
- [ ] Opens without JavaScript.
- [ ] Each problem: where (path relative to lerpettes/content), what is wrong, the fix, and its id.
- [ ] Inline code in messages rendered as code, not backticks.
- [ ] Production build prints the same list to the terminal and still builds.

Deliberate mistakes to try in a scratch lesson, each must appear as a problem with a fix:
- [ ] `## Title {#id +viewpoint2d}` (unknown panel)
- [ ] a chapter with `+viewport2d` and a `code/<id>/js/index.ts` that exports a hand-written runtime (ignored before; now used, so no problem)
- [ ] front matter (`---` block) at the top of mixtape.md
- [ ] raw HTML other than a comment in prose
- [ ] a `lerpit` fence naming a missing file or region
- [ ] control.toml with an unknown key or bad value
