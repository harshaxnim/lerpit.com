Author: Harsha | Date: 2026-10-19

# Perf lab {#intro +viewport2d}

A bench for the 2D viewport: each chapter draws a known load, so its cost per frame can be measured and compared before and after a framework change. `scripts/perf-lab.mjs` profiles every chapter here in Chrome.

## Empty {#empty}

Nothing in `step`, nothing in `draw`. What is left is what the framework costs on its own.

## Trail {#trail}

The particles lesson's figure: one circle and a 300-point path behind it.

## Circles {#circles}

A thousand circles, each moving every frame.

## Lines {#lines}

Three thousand separate line segments, in a hundred colours.

## *Labels*: **twenty** of `sketch.pixels.text()`, $\sin t$ each {#labels}

Twenty text labels whose values change every frame.
