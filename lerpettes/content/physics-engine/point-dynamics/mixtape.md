Author: Harsha | Date: 2026-09-22

# Point bodies dynamics

A physics simulator solves the equations of motion using an integrator to iteratively advance the state through time. In simpler words, we use newton's laws of motion to update positions and velocities of bodies over small time steps.

In this article, we shall look at a simple physics simulation loop by building an n-body simulation. We shall start with a single particle under a spring force, and then build up to n-bodies that exert gravity on each other, which should not be that different qualitatively.

## The Loop

Some terminology we need to familirize ourselves first -
* State - the quantities that define the configuration of the system at that point of time. In this case (positions, velocities).
* Integrator - a numerical method that takes in current state, acceleration and time step size and estimates the state at the next time step.

It would look something like this -

<!-- todo make this into a flow chart either in latex, or in svg -->
$$
State(t) -> Integration\ over \Delta t -> State(t+\Delta t)
$$

Let's now take a look into the integration step. Let's say we start with state $s_t = (x_t, v_t)$. To calculate the next state $s_{t+1}$, the most intuitive way to do it is just apply newton's equations on state $s_t$ at time $t$.


<!-- Todo the gap between these two equations is too big -->
$$
a_t = k \times x_t
$$
$$
v_{t+1} = a_t * \Delta t
$$
$$
x_{t+1} = v_t * \Delta t
$$

Okay, now onto the code.

<!-- The id over here should be put into the wasm/JS code and be built on the client which will be used to display in the viewport on the right. -->
<!-- What i need is a full blown editor of relevant files for this article. The application of this ranges from -
A. I should be able to only expose a certain part of the file in the editor as tagged by id in the files.
B. Small toggle for full file edit access.
C. We should have a client side compiler that uses the user code, compiles wasm, and uses js to show it on the right in the viewport (note how the right panel can be general).
D. A reset button to reset the code back to original state.
E. Author's solution should be togglable for the viewport control, but put the control somewhere intuitive, just before editing the code.
F. have a compile button, reset button.
G. have a solutions tab on top that shows the solution read-only, and viewport loads solution. and back to edit mode should switch back to user's compiled code.
I. put the code section in the ui in a different color. the section should be part of the article, but it should be as tall as the viewport.
-->
