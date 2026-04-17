Author: Harsha | Date: 2026-04-16

# How LerpIt?

*A devlog for how I build LerpIt.*

I document as I try to make a simple WASM (CPP using Emscripten) + JS (TS + Threejs) page to get a hang of the interactions, memory model, etc. I am mainly concerned with passing memory between CPP and JS in as pleasant a way as possible. JS and CPP share access to the same memory called **Linear Memory** which is like a huge malloc, within which the stack and heap are allocated. All new memory creations are allocated within this memory chunk, which means if we ever run out of space, there will be a reallocation to find a new contiguous chunk. When this happens, we are in hot water if we have references to previous allocations, especially in JS. So this is one complication that needs to handled conciously. Before we get ourselves carried away in these details, let's start with some common scenarios.

I setup the emscripten sdk. We start simple, pipe a number from CPP to JS. From there we work our way up through global variables, arrays, structs, and arrays of structs, and end up at Structure of Arrays (SoA), which is the most efficient and common pattern in data heavy applications like physics simulations, rendering, etc.

I only use the caption field in the viewport in this lesson to show the data being passed from CPP to JS.

## Simple Function {#function}

Starting off with a function that returns my favourite number. Since this is a simple return, there's no fiddling around with the Linear Memory. It instead uses the execution stack to pass the return value back to the caller. Embind expects a `emscripten::function()` to register your function. Pass it your function's pointer.

The cpp declaration:
```cpp
int answerToUniverse()
{
    return 42;
}
```

And the binding:
```cpp
emscripten::function("answerToUniverse", &answerToUniverse);
```

On the JS side, import the factory, await it, and call the function by name:
```ts
const answerGen = await factory();
const answer = answerGen.answerToUniverse();
```


## Global variable {#globalVar}

Let's take a look at what happens if we want to pass a gobal `int` variable from cpp. It is not any different! The module you import will contain this variable if you make sure you follow this complicated recipe - register the global variable with `emscripten::constant()`. Pass it the variable, not the address. Well, this will only send the instance of this number that's initially assigned with. Say you call a function and it updates this variable. The binding will not pick this up. You will need to pass it out the address as the constant if you want updates to be reflected in JS. The tricky part is on the JS side when you pass the address. You need to read the Linear Memory as an array of 4-byte sized elements using `module.HEAP32`. Note that the index will be the address/4 as the address is the byte offset, we need index aka 4-byte offset. So you can read the number by looking into the array as `let g: number = module.HEAP32[address/4]`;

The cpp declaration:
```cpp
int otherFavouriteNumber = 69;
```

And the binding:
```cpp
emscripten::constant("otherFavouriteNumberAddress", (uintptr_t)&otherFavouriteNumber);
```

On the JS side, read straight from the heap using the address:
```ts
let otherFavouriteNumber = favModule!.HEAP32[favModule!.otherFavouriteNumberAddress / 4];
```

## Array View {#array}

In this step, similar to the previous one, we could've passed the array like pointer, but let's look at another convenience we have at our disposal. Instead of hand crafting these reads on the JS side, we can do something simpler on cpp side. I introduce you to `typed_memory_view`! You can use this convenient binding:

The cpp declaration and binding — `typed_memory_view` looks at the pointer type and picks the right JS typed array automatically:
```cpp
std::vector<int32_t> fibArray = {1, 1, 2, 3, 5, 8, 13, 21};

EMSCRIPTEN_BINDINGS(fibPointer_module)
{
  emscripten::function("getFibArray", +[](){ return val(typed_memory_view(fibArray.size(), fibArray.data())); });
}
```

On the JS side, you get back a zero-copy `Int32Array` view. Just index into it:
```ts
let fibArray = fibList!.getFibArray();
for (let i = 0; i < 8; i++) {
  log += `${fibArray[i]}\n`;
}
```

## Struct {#struct}
Now onto the fun part. One of the most useful thing would be being able to pass around structs of data for more complicated configurations, like the world, scenegraph, bodies, constraints, etc. Let's take a simple example of a struct and see how I can pass it from WASM to JS. Say the struct is:
```cpp
struct Vec3 {
  double x = 0., y = 0., z = 0.;
};

struct Sphere {
  int index = 0;
  double radius = 1.;
  Vec3 pos;
  Vec3 vel;
};
```

The binding uses `value_object` for structs with named fields. Each `.field()` maps a C++ member to a JS property name:
```cpp
value_object<Vec3>("Vec3")
  .field("x", &Vec3::x)
  .field("y", &Vec3::y)
  .field("z", &Vec3::z);

value_object<Sphere>("Sphere")
  .field("index", &Sphere::index)
  .field("radius", &Sphere::radius)
  .field("pos", &Sphere::pos)
  .field("vel", &Sphere::vel);

function("getDefaultSphere", +[]() { return mySphere; });
```

On the JS side, you get a plain object with named properties. This is a copy — embind marshals each field across:
```ts
const sphere = structModule!.getDefaultSphere();
ctx.setCaption(
  `Sphere #${sphere.index}\n` +
  `  radius: ${sphere.radius}\n` +
  `  pos: (${sphere.pos.x}, ${sphere.pos.y}, ${sphere.pos.z})\n` +
  `  vel: (${sphere.vel.x}, ${sphere.vel.y}, ${sphere.vel.z})`
);
```

## Array of Structs - AoS {#aos}

How would AoS look like with WASM? Pretty straightforward to be honest-

The cpp declaration:
```cpp
std::vector<Sphere> spheres = {
  {0, 1.0, {0., 0., 0.}, {0.1, 0., 0.}},
  {1, 2.0, {3., 0., 0.}, {0., 0.2, 0.}},
  {2, 0.5, {0., 5., 0.}, {0., 0., 0.3}},
};
```

The binding uses `register_vector` to wrap the `std::vector` and exposes it with a getter. Each `.get(i)` copies one struct out through `value_object`:
```cpp
register_vector<Sphere>("SphereVector");
function("getSpheres", +[]() { return spheres; });
```

On the JS side, you iterate with `.size()` and `.get(i)`. Note that both the vector return and each `.get()` are copies:
```ts
const spheres = mod!.getSpheres();
for (let i = 0; i < spheres.size(); i++) {
  const s = spheres.get(i);
  // s.index, s.radius, s.pos.x, s.vel.z — all plain JS values
}
spheres.delete();
```

## Strut of Arrays - SoA {#soa}

For the final big question, let's get SoA working. We will primarily be using this for most cases with object as it's faster with the memory access. It's also a win that it's easier in this context as we're reading through the buffers.

The cpp side stores each property as its own contiguous array. A `Spheres` struct groups them. Each property is exposed via `typed_memory_view` — zero copy:
```cpp
struct Spheres {
  std::vector<int32_t> indices;
  std::vector<double>  radii;
  std::vector<double>  positions;   // interleaved xyz
  std::vector<double>  velocities;  // interleaved xyz

  int count() const { return indices.size(); }
  val getIndices()    { return val(typed_memory_view(indices.size(),    indices.data())); }
  val getRadii()      { return val(typed_memory_view(radii.size(),      radii.data())); }
  val getPositions()  { return val(typed_memory_view(positions.size(),  positions.data())); }
  val getVelocities() { return val(typed_memory_view(velocities.size(), velocities.data())); }
};
```

The binding exposes the container as a `class_` and returns a pointer to the global instance:
```cpp
class_<Spheres>("Spheres")
  .function("count",         &Spheres::count)
  .function("getIndices",    &Spheres::getIndices)
  .function("getRadii",      &Spheres::getRadii)
  .function("getPositions",  &Spheres::getPositions)
  .function("getVelocities", &Spheres::getVelocities);

function("getSpheres", +[]() -> Spheres* { return &spheres; }, allow_raw_pointers());
```

On the JS side, we read through zero-copy typed array views. A `SphereView` class wraps the arrays with getters so you can access `s.pos.x` etc. — all reads go straight into wasm memory, no copies:
```ts
const spheres = mod!.getSpheres();
const indices    = spheres.getIndices() as Int32Array;
const radii      = spheres.getRadii() as Float64Array;
const positions  = spheres.getPositions() as Float64Array;
const velocities = spheres.getVelocities() as Float64Array;

for (let i = 0; i < count; i++) {
  const s = new SphereView(indices, radii, positions, velocities, i);
  // s.index, s.r, s.pos.x, s.vel.z — zero-copy reads from wasm memory
}
```
