# Lerp on a line segment

This is issue zero. The purpose of the site is built into the lesson itself: take a topic that feels bigger than you can comfortably hold in your head, split it into named chunks, and then move between those chunks one clear state at a time.

Author: Harsha | Date: 2026-03-25

Lerp is a good first example because the rule is small:

$$
\operatorname{lerp}(A, B, t) = A + t(B - A)
$$

Two known points, one parameter, and a line segment traced as that parameter changes. It is enough structure to talk about state, interpolation, and transitions without adding too many moving parts at once.[^sweller]

![A notebook-style line segment with checkpoints at A, 0.25, 0.5, 0.75, and B.](./segment-diagram.svg)

```c
float lerp_f32(float a, float b, float t) {
  return a + (b - a) * t;
}
```

The left side of the player carries the lesson document: prose, math, figures, references, and code samples. The right side keeps one live stage so the lesson can point at a concrete state instead of making you imagine it.[^mayer][^miller]

[^sweller]: John Sweller, *Cognitive Load During Problem Solving: Effects on Learning* (1988), [doi:10.1207/s15516709cog1202_4](https://doi.org/10.1207/s15516709cog1202_4).
[^mayer]: Richard E. Mayer and Celeste Pilegard, *Principles for Managing Essential Processing in Multimedia Learning* (2014), [doi:10.1017/CBO9781139547369.016](https://doi.org/10.1017/CBO9781139547369.016).
[^miller]: G. A. Miller, *The Magical Number Seven, Plus or Minus Two* (1956), [doi:10.1037/h0043158](https://doi.org/10.1037/h0043158).

## Set the start at A {#start}

At the beginning, the point is exactly at `A`, because `t = 0`.

$$
\operatorname{lerp}(A, B, 0) = A
$$

This is the easiest checkpoint to understand because nothing is hidden yet. The moving point and the anchor coincide, so you can read the rest of the lesson against a stable reference.

## Move to one quarter of the segment {#quarter}

Now let the parameter increase, but only a little.

$$
\operatorname{lerp}(A, B, 0.25) = A + 0.25(B - A)
$$

At this stage the relationship between the parameter and the geometry starts to feel concrete. The point has not “jumped somewhere in the middle.” It has moved a quarter of the way from the start toward the end.

```ts
const x = lerp(pointA.x, pointB.x, 0.25);
const y = lerp(pointA.y, pointB.y, 0.25);
```

## Check the midpoint {#midpoint}

The midpoint is the most legible checkpoint in the sequence.

$$
\operatorname{lerp}(A, B, 0.5) = \frac{A + B}{2}
$$

Once the halfway state is obvious, it becomes easier to trust the rest of the parameter range. This is also where interpolation starts to feel like a reusable mental tool rather than a one-off formula.

## Move near the target {#near-target}

With `t = 0.75`, the point has covered most of the distance while still following the same straight path.

The lesson here is simple: changing `t` changes where you are on the segment, not what the segment is. The geometry stays the same. Only the selected point changes.

## Finish at B {#finish}

The last checkpoint closes the loop.

$$
\operatorname{lerp}(A, B, 1) = B
$$

By the time the point reaches `B`, the full path from start to finish has been explained as one controlled parameter change. Later lerpettes can build on that same idea when the state is more complex than a single point on a line.
