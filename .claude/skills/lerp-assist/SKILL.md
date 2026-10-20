---
name: lerp-assist
description: Sweep lerpette content for inline LERP: instruction-comments the author left mid-draft (in mixtape.md, control.toml, or chapter code under code/<id>/js or src), carry out each instruction — editing prose, a toml setting, or the associated code — and delete the tag once it's actually done. Use whenever the user asks to run lerp-assist, process/handle/sweep LERP tags, resolve inline authoring notes or TODOs left in lerpette content, or says things like "go through the notes I left in the content" or "handle the tags in that mixtape."
---

# lerp-assist

Lerpette content accumulates small inline notes while an author is mid-draft: a
reminder to fix a caption, add a chapter, tune a value, add a diagram. Typing those
as plain prose would ship to the published page. A bare `<...>` tag would collide
with real angle-bracket syntax that already appears in mixtape prose and code boxes
(`std::vector<int32_t>`, HTML-ish snippets) — not a safe delimiter.

The format already has the answer: `docs/authoring.md` says `mixtape.md` turns raw
HTML off but **comments are fine**, and the codebase already tags code regions with
its own comment convention (`// lerpit:step:edit:start`). So an author instruction is
a comment too, with its own marker, `LERP:`, in whichever syntax the file already uses:

| file type | tag |
| --- | --- |
| Markdown (`mixtape.md`, `collection.md`, `docs/**/*.md`) | `<!-- LERP: <instruction> -->` |
| TOML (`control.toml`) | `# LERP: <instruction>` |
| JS/TS (`code/<id>/js/*.ts`, `src/*.js`, framework files) | `// LERP: <instruction>` (or `/* LERP: ... */` for a longer note) |

Same marker everywhere, so one grep finds every tag regardless of file type.

## Find every tag

```
grep -rn "LERP:" --include="*.md" --include="*.toml" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.astro
```

Primary territory is `lerpettes/content/` (`mixtape.md`, `control.toml`, `code/`), but
a tag can land anywhere prose or code gets written — `docs/`, `website/src/`,
framework files — so don't narrow the search beyond excluding generated/vendor output.

## Resolve one tag at a time

Don't batch these as a blind find-and-replace. For each tag:

1. Read enough context to know what's being asked — the file, and if it's a
   `mixtape.md` tag sitting under a `## Heading {#id}`, also check that chapter's
   `code/<id>/` directory. The instruction is often about the code, not the prose
   next to it.
2. Make the actual change the instruction calls for: rewrite a paragraph, flip a
   `control.toml` key, edit the chapter's `step`/`draw`/`setup`, add a file, rename
   something — whatever it asks for.
3. Check the change actually satisfies the instruction before moving on.
4. Delete the tag's comment line entirely — no leftover blank line, no trailing
   whitespace.

Make every change with the Edit or Write tool, never `sed`/`python`/heredoc through
Bash — in this repo, Bash-made edits don't show up in Claude Code's per-turn changes
view and can't be rewound, so Edit/Write is the only way the user can review and undo
what you did.

If a tag is genuinely ambiguous, or needs a judgment call only the author can make (a
subjective tone choice, a missing number, a real fork between two valid directions),
leave it in place rather than guessing and deleting it — call it out in the final
report instead. That's different from a tag that's merely terse but has one obvious
reasonable reading; resolve those rather than punting.

## When you're done

Leave the work as local, uncommitted changes — no commits, no PRs, no new branches,
unless the user asks. Report:

- how many tags were found
- one line per resolved tag: what changed, and where (`file:line`, or `file` plus
  chapter id)
- any left unresolved, and why

If the edits touched a chapter's TS/JS, mention `npm test`, and for anything that
changes what a page looks like, that `node scripts/check-site.mjs` is this repo's
visual-diff harness — but don't run either unprompted, and don't take on
screenshotting yourself; that's the `mockup` skill's job.
