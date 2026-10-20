Author: Harsha | Date: 2026-10-18

# Particles {#intro =viewport2d}

Let's start off by creating a physics engine for point particles because [points are the best](https://life.inspirho.com/cg/with-just-one-polka-dot-nothing-can-be-achieved/)! We can learn a bit about first order and second order ODEs, numerical integration techniques. We will add a spring to a fixed wall, then add springs between two particles, and finally simulate a soft body by adding a lot of particles connected by springs. Such a system is often called a mass-spring system and is quite powerful for how simple it is.

## Movement by _Teleportation_ {#teleportation}

Let's look the simplest way to move the particle, by literally placing them in space based on a function's value. It is not physical, but it starts us off on the path to physically simulate particles based on Newton's laws $F = ma$.

We could update the particle's position based on these functions of time:

$$
(x, y) = (sin(4t), sin(3t))
$$

Unfortunately we might not have neat closed form solutions like this most of the times. We usually have to go by some form of $F = ma$ to make it physically grounded and most of the times, we might only have equations that govern accelerations and velocities, and not positions directly like we did just now. These are called ODEs or PDEs, and we will build up to it by taking the next step of using velocity fields.

## Going with the _Flow_ {#flow}

An intermediate step before moving onto $F = ma$ is driving particles by directly using velocities. Let's create a grid of velocity vectors and make the particle follow the velocity on the grid at the particle's position.

> A grid of vectors is called a _vector field_. Similarly, a grid of scalar values on a surface is a scalar field. Do note that this need not be a grid in a flat square sense, it could be warped on a surface.

Let's use an interesting yet simple formula for the vector field:

$$
v = (-y, x)
$$

Now we need to find the particle positions based on this velocity field. We know that relationship between $v$ and $p$ is as follows:

$$
\frac{dp}{dt} = v(p), \qquad p = (x, y)
$$

For very simple cases such as these, we could solve it analytically. Applying our field to it,

$$
\frac{dx}{dt} = -y, \qquad \frac{dy}{dt} = x
$$

which is satisfied by a circle around the origin:

$$
x = r\cos(t + \phi), \qquad y = r\sin(t + \phi)
$$

where the radius $r$ and the starting angle $\phi$ come from where the particle starts.

But for general cases, we need numerical integration to solve this system, which is an approximation. Start from the definition of the derivative:

$$
\frac{dp}{dt} = \lim_{\epsilon \to 0} \frac{p(t + \epsilon) - p(t)}{\epsilon}
$$

To approximate it discretely, we replace the limit $\epsilon \to 0$ with a small finite step $\epsilon = \Delta t$:

$$
\frac{p(t + \Delta t) - p(t)}{\Delta t} = v(p(t))
$$

and rearranging gives the next position from the current one:

$$
p(t + \Delta t) = p(t) + \Delta t \, v(p(t))
$$

We're using an integration scheme to find a particle's position in the next timestep given the current position, velocity and step size. Intuitively you may observe that the smaller the timestep, the more accurate the output is in following the circle. If you look into the panel you should see how our paritcles aren't actually following a circle, but are rather spiraling out. This is because we are using the velocity at timestep $t$ and using the same velocity over $\Delta{t}$.

> Check out the `Controls -> Sub-steps`, and observe how changing the number of sub-steps impacts the particle's trajectory.

Contrast with the previous solution where we had a closed form solution for particle positions, where the step size doesn't really matter.

## Let's get _Physical_ {#physical}

Now we will drive particles based on Newton's law $F=ma$. To introduce forces like gravity and springs, we will need to introduce a measure of inertia for these particles, i.e., mass.