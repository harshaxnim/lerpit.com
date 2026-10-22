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

A grid of vectors is called a _vector field_. Similarly, a grid of scalar values on a surface is a scalar field. Do note that this need not be a grid in a flat square sense, it could be warped on a surface.

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

We're using an integration scheme to find a particle's position in the next timestep given the current position, velocity and step size. This particular scheme is called explicit Euler. Intuitively you may observe that the smaller the timestep, the more accurate the output is in following the circle. If you look into the panel you should see how our paritcles aren't actually following a circle, but are rather spiraling out. This is because we are using the velocity at timestep $t$ and using the same velocity over $\Delta{t}$. The velocity, being tangential at curves, will put the particle slightly outside the curved path in that timestep, and it keeps accumulating over time resulting in this spiraling out behavior.

> Check out the `Controls > Sub-steps`, and observe how changing the number of sub-steps impacts the particle's trajectory. Contrast with the previous solution where we had a closed form solution for particle positions, where the step size doesn't throw the particle out of trajectory path.

We shall later look at other kinds of integration schemes with higher accuracy in a future lerpette where we will explore the math and the numerical methods that are applicable and relevant for various types of simulations.

I would like to end this section by noting that the velocity field itself need not be static like we have it here. It can be a function of time, or an output of another simulation entirely that might simulate water surface or wind for instance.


## Let's get _Physical_ {#physical}

Now we graduate to the next level! We will drive particles based on Newton's law $F=ma$. We will see an emergence of really complex phenomenon at this stage with relatively simple rules. To introduce forces like gravity and springs, we will need to introduce a measure of inertia for these particles, i.e., mass.

We now have acceleration which is a second order differential of position with respect to time.

$$
\ddot{x}_p = \dot{v}_p = a_p = \frac{F_p}{m_p}
$$

where the dot implies a time differentiation of a variable, e.g., $\dot{v} = \frac{dv}{dt}$, and $F_p$ is the total force on particle $p$. Scene designers usually setup forces, like gravity, attractors, springs, constraints, etc., and the simulator's job is to move the particles to new positions every timestep pertaining to these forces. How do we do that? We need to find positions starting from forces.

```
for every timestep:
	accumulate all the forces on the particle p;
	calculate effective acceleration due to forces;
	calculate velocity due to acceleration;
	calcualte new position;
```

$$
a_{n+1} = \frac{f(x_n,\,t)}{m}
$$

$$
v_{n+1} = v_n + \Delta{t}\,a_{n+1}
$$

$$
x_{n+1} = x_n + \Delta{t}\,v_{n+1}
$$

This integration scheme is called symplectic Euler, and we will learn more about it and a few other methods in an upcoming chapter. For now, notice how we're using $v_{n+1}$ in calcualting $x_{n+1}$.

Let's put it to work by simulating the notorious 3-body problem. It's been proven that it's impossible to get a general closed form analytical solution to this problem. However, we can definitely simulate it using numerical methods. And it's almost trivial to do so. Just initialize the three bodies with three different initial states (I selected a stable state just for the aesthetics, but note that the stabe states are carefully crafted initial conditions), and follow our playbook of accumulating forces (using $\frac{G\,m_1\,m_2}{{r_{12}}^2}$) to finding the next position for each body, and that's it, _voila_!


## _Spring_ to life {#spring}

Let's now take a look at an isolated case of a single particle of mass $m$ attached to a spring with spring-constant $k$. On the right, we see such a setup with the spring attached to a wall on one side, and mass on the other. Let's start with the spring compressed by ~33%. First we'll use the swanky new integration scheme we just learnt, but I added a control to switch it to explicit Euler, the integration scheme we learnt in the previous section.

> Compare both the integration schemes in `Controls > Scheme` and try observing the differences between them. Notice how the system blows up using explicit Euler with low sub-step count. Contrast it with symplectic Euler's stability. Observe the tracked _Total Mechanical Energy_ of the system. Note the slight wobbles in the energy with symplectic Euler, and the blow up with explicit Euler methods.

Now that we know how to affect mass with spring forces, we have unlocked a nifty ability to model quite a few relatively complex behaviors. Let's now look at what happens if we connect a bunch of these points with springs!

## 