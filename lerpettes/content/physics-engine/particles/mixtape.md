Author: Harsha | Date: 2026-10-18

# Particles {#intro =viewport2d}

Let's start off by creating a physics engine for point particles because [points are the best](https://life.inspirho.com/cg/with-just-one-polka-dot-nothing-can-be-achieved/)! We can learn a bit about first order and second order ODEs, numerical integration techniques. We will add a spring to a fixed wall, then add springs between two particles, and finally simulate a soft body by adding a lot of particles connected by springs. Such a system is often called a mass-spring system and is quite powerful for how simple it is.

## Placing the particle {#place-the-particle}

Let's look the simplest way to move the particle, by literally placing them in space based on a function's value. It is not physical, but it starts us off on the path to physically simulate particles based on Newton's laws $F = ma$.

We could update the particle's position based on these functions of time:
```python
x = sin(4t)
y = sin(3t)
```
