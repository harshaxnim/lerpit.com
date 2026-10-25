# The bobblehead and picture points

The Finale stage (`code/jellostapler/`) can simulate Dwight as a bobblehead as well as the jello.
His head is just two particles; the picture of his head follows the line between them, moving
and turning with it at a fixed size.

## Picture points (`v` lines)

The body file gains one line kind:

```
v <x> <y> <a> [<b> [<c>]]
```

A *picture point*: a corner of the picture that is not a particle.

- With one particle, it is carried by it: it keeps its offset from particle `a`.
- With two, it is carried rigidly by the line `a b`: it keeps its distance from the line's middle,
  along the line and square to it, and turns with the line, but does not grow or shrink when the
  spring between them stretches. (So the face keeps its size while the head wobbles.)
- With three, it keeps its place relative to the triangle `a b c`: some amount along `a→b` plus
  some amount along `a→c`.

The point may be far outside the particles; that is what lets two particles carry a whole head.
Triangles (`t`) count corners as the particles first, then the `v` lines in order. A file with no
`v` lines (the jello) reads exactly as before.

In code: `readSoftBody` stores them in `body.points`, and `picturePoints(body)` returns where every
corner is now. The stage builds, draws and hit-tests its picture from
`picturePoints(body)` instead of `body.particles`.

## The bobblehead body (`assets/bobblehead.txt`)

- Particles 0–1: the head.
- Particle 2: fixed at the root of the neck. Particles 3–4: fixed on the shoulders.
- Springs: between the two head particles, from each head particle to the root, and from each
  shoulder to the head particle on its side only (no cross springs).
- Picture: two pieces, cut along one line (y 0.0161, through the neck coil). The head piece above
  it rides on the line between the head particles at a fixed size; the body piece below rides on
  the root. Nothing stretches.

### Why three fixed particles, not one

With only the root fixed, every spring from the head ends at the same point, so turning the whole
head about that point changes no spring's length: the head spins freely (up to 180° in tests).
Adding a chest point straight below the root did not help much: the springs from each head
particle to the two points run almost parallel, so the head still rocked by 30° or more whatever
the stiffness. Two shoulder points, spread sideways, make the stiffness count. With the author's
positions the head tilts about 10° under the stage's shake, with no growth over ten minutes at 30
or 60 frames a second.

## The editor

A temporary page, not part of the site: `bobble/editor.html` in the session scratchpad, served at
`http://127.0.0.1:8765/bobble/editor.html` (the `body` folder there links to the stage's assets).

- Handles: the root, the shoulder (or chest) point, the middle of the head (move) and the right
  head particle (how far apart the two are), and the cut line.
- Sliders: the head particles' distance and turn, their mass, the two stiffnesses, k′, k_d,
  sub-steps, and the stage's push-and-stop shake.
- It runs the stage's own step, shows the largest tilt and sway, and the sub-steps needed at 30
  and 60 frames a second.
- Copy or download the body file, then put it in `assets/bobblehead.txt`. Settings are kept in the
  browser; settings saved for the earlier three-particle head are moved to the two-particle one.

## Verified

- Headless runs of the editor's physics: stability and tilt for each anchor choice, and ten
  minutes of shaking at the defaults and at the author's positions.
- The exported file loads in the stage: the head rocks, the picture follows the two particles,
  restart keeps the choice, no page errors.
- The editor on a 1300 px desktop and a 390 px phone, with no page errors.
- Typecheck clean for the stage.
