# Simple dynamics

This lerpette starts with two of the smallest useful ideas in rigid body simulation: a force accumulating over time, and an impulse changing velocity immediately.

Author: Harsha | Date: 2026-03-25

## Accumulated force {#intro}

Forces act over time, so they usually change velocity through integration.

$$
v_{t + \Delta t} = v_t + \frac{F}{m}\Delta t
$$

The point of this chapter is just to separate “push over time” from “instant change.” Once that distinction is clear, the rest of the engine starts to organize itself.

## Impulse as an immediate correction {#impulse}

Impulses are useful when the change is instantaneous.

$$
\Delta v = \frac{J}{m}
$$

That is why impulses show up naturally in collisions and constraints: they correct the velocity state directly instead of being accumulated like forces.

```ts
velocity += impulse / mass;
```
