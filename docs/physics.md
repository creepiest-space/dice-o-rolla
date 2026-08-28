# Physics and settling

## Units and defaults

The engine uses normalized dice geometry in a right-handed, Y-up world. The default Rapier gravity
is `(0, -9.81, 0)`, and the default engine step is `1 / 60` second.

| Setting                    | Default                         |
| -------------------------- | ------------------------------- |
| tray clear area            | 10 × 10                         |
| tray wall height/thickness | 6 / 0.25                        |
| tray friction/restitution  | 0.8 / 0.1                       |
| die mass/scale             | 1 / 1                           |
| die friction/restitution   | 0.7 / 0.15                      |
| linear/angular damping     | 0.25 / 0.25                     |
| linear velocity threshold  | 0.08                            |
| angular velocity threshold | 0.08                            |
| stable duration            | 300 ms                          |
| hard roll timeout          | 10,000 ms                       |
| spawn Y                    | 3.5–5                           |
| horizontal spawn range     | -2–2 on X and Z for small rolls |
| impulse                    | X/Z -2.5–2.5, Y 0.5–2           |
| torque impulse             | -3–3 on each axis               |

The six-unit walls enclose the full default spawn range. Lower walls allowed high horizontal throws
to leave the finite floor and never settle; the 20/50-die load regression covers that containment.

## Fixed-step loop

Frame time is clamped and accumulated. Physics consumes complete fixed steps, while rendering uses
the remainder divided by the fixed step as interpolation alpha. Long browser frames therefore do
not pass an unstable variable delta into Rapier.

For rolls with more than four physical dice, spawn positions use a tray-aligned grid with small
random jitter. This reduces initial collider overlap while retaining random orientations and
impulses.

## Settling policy

Each die has an independent detector. A sample is below threshold only when both linear and angular
velocity magnitudes are within their limits. The condition must remain true for the complete stable
duration; any faster sample resets accumulated stability. Rapier sleeping confirms settlement
immediately, but only when velocities are also below threshold.

The hard timeout is terminal and prevents orphaned promises. It is not a source of a fabricated
result: a timed-out roll rejects instead of selecting a random face.

## Randomness and reproducibility

`RandomSource` affects only throw initial conditions. `SeededRandomSource` makes tests and calibrated
profiles reproducible. The reported value always comes from the final physical quaternion and
logical face normals.

Themes do not alter mass, friction, restitution, damping, gravity, or throw energy. Applications can
provide a physics preset through `DiceEngineOptions` independently of `setTheme()`.

## Tuning guidance

- Keep the spawn range below the tray walls or enlarge the tray/walls together.
- Increase `maxRollTimeMs` only after checking for escaped or permanently colliding bodies.
- Measure high-count rolls with deterministic seeds before changing thresholds.
- Preserve convex-hull colliders for standard dice; bounding boxes invalidate physical behavior.
- Treat values inherited from other unit systems as qualitative hints, not compatible constants.
