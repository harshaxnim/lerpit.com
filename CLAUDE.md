# lerpit.com

Lerpit publishes lerpettes: articles with a live stage beside them. The repository has
three parts, and each has its own quality bar. Before changing code, know which part it
belongs to.

## 1. The website (`website/`)

The site, its pages, styles, editor and build.

- It must look right and work. Its code quality matters less than in the other two parts.
- Keep it consistent where that is cheap. The docs describe some of its behaviour, so
  consistent behaviour keeps them accurate.

## 2. The framework (`lerpettes/framework/`, `lerpettes/libs/`)

What authors use to write stages: `createStage`, `ctx`, `sketch`, controls, readings and
the runtimes.

- Design it deliberately. Its interface is a product for authors, so every name, option and
  type is something they must learn.
- Keep interfaces consistent. Similar things are named, ordered and behave the same way
  across `ctx`, `sketch` and the helpers.
- Optimise it for performance. Stages may be slow; the framework must not be.
- Watch for features that stages build for themselves, such as pointer dragging, image
  loading or textured meshes. When one appears, propose to the user that it moves into the
  framework; don't move it without asking. Record proposals in the dated ledger in
  `docs/features/framework-gaps/`, and read the latest file there before framework work.
- Never change the framework on your own initiative. Don't write ad hoc helpers in stage
  code that belong in the framework either. If a stage needs such a feature, or its code
  must look very different from the other chapters, stop and flag it to the user before
  building it.

## 3. Stage code (`lerpettes/content/**/code/<chapter>/`)

The code beside each chapter of each article. It is instructional: readers study it to
learn the concept.

- Make it simple, readable and explicit, and keep it in one consistent style. Plain
  loops and named steps (accumulate forces, then integrate) beat clever abstractions.
- Inefficient or verbose code is fine when it makes the concept easier to follow. Don't
  optimise stage code or refactor it for good design.
- Read the other chapters of the same article first, and match how their code looks.
- Keep `index.ts` short. Heavy, non-instructional work goes in a precomputed asset (for
  example a mesh file) plus at most one small loader file. Precompute it offline rather
  than building it in the stage.
- Few comments. The code should explain itself. Teaching belongs in the article:
  - the author writes the article prose;
  - Claude does not write that prose, but leaves notes for the author as
    `<!-- LERP: ... -->` comments in `mixtape.md`, such as formulas to explain, figures to
    draw and points to make.

## Docs

`docs/` is mainly for people writing new articles and stages: `docs/authoring.md` first,
then `docs/authoring/problems.md`. Framework design notes are in `docs/features/`.
