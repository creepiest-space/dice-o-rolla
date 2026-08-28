# Performance observations

## Reproducible load profile

`packages/dice-engine/test/performance.test.ts` runs headless Rapier with the production engine,
fixed-step scheduler, fake renderer, and deterministic seeds. It covers `20d6`, `50d6`, and `100d6`.
This is a reliability/load regression rather than a portable microbenchmark.

A local run on Darwin x86_64 with Bun 1.4.0 produced:

| Roll    | Simulated terminal time | Test wall time | Outcome                       |
| ------- | ----------------------: | -------------: | ----------------------------- |
| `20d6`  |                3,217 ms |        ~222 ms | settled                       |
| `50d6`  |                3,383 ms |        ~536 ms | settled                       |
| `100d6` |               10,033 ms |        ~598 ms | rejected by 10 s hard timeout |

The complete three-case command took about 1.48 seconds wall time in that run. Wall timings vary by
machine and include shared WASM initialization, so regression assertions intentionally use simulated
termination and result correctness rather than CPU milliseconds.

## Supported load and limitations

The measured reliability target is 20–50 simultaneous d6 bodies. Both cases settle under the default
timeout and return one physically resolved value per body. The 100-die case is retained to verify
bounded termination and currently times out for its deterministic stress seed; 100 simultaneous
dice is not claimed as a reliable production load.

At high counts, collision density and grid cell size dominate settling. Rendering cost is separate:
the current Three.js adapter creates one geometry, material set, and canvas texture set per die. It
does not yet use instancing, a shared label atlas, or pooled resources. Browser performance therefore
depends on GPU, pixel ratio, die mix, and container size in addition to Rapier cost.

Future optimization should preserve orientation-derived results and first measure:

- shared geometries/materials or instancing;
- a label atlas instead of per-face canvas textures;
- larger or dynamically sized trays for 100-body scenarios;
- collider/spawn packing and sleep behavior;
- optional quality controls for shadow maps and pixel ratio.

## Browser release smoke test

The production demo bundle was exercised in a local Chromium WebGL context after the full build.
The release smoke sequence verified engine initialization, an individual roll, two immediately
queued rolls, result display, theme change, clear, a 390 × 844 responsive viewport, physics-preset
reinitialization, and teardown. Teardown removed the renderer canvas as expected.
