Author: Harsha | Date: 2026-03-25

# Shadow maps

This lerpette treats a shadow map as a two-step story: first build a depth view from the light, then filter or sample that depth when shading from the camera.

## Capture the depth pass {#depth-pass}

The first step is to render the scene from the light's point of view and store depth.

$$
d = z_{light-space}
$$

That pass is not the final image. It is an intermediate surface that later shading can compare against.

## Filter and compare {#filter-pass}

Once the depth map exists, later shading compares the current fragment against the stored depth and applies filtering to reduce harsh edges.

```glsl
float visible = currentDepth <= shadowDepth ? 1.0 : 0.0;
```

Thinking of the shadow map as a small sequence of surfaces makes the pipeline easier to reason about than treating it as a single opaque feature.
