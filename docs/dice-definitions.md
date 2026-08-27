# Dice definitions

## Coordinate and scale convention

All geometry uses a right-handed, Y-up coordinate system shared by domain code, Rapier, and
Three.js:

- positive Y is world up;
- the tray floor is Y=0;
- gravity points along negative Y;
- quaternions are represented as `{ x, y, z, w }` and rotate local vectors into world space.

Ideal die vertices are centered at the origin and normalized to a circumradius of one. Renderer and
physics adapters apply their own scale from this common definition.

The 3DDiceRoller reference uses Z-up coordinates. Its topology is converted once while authoring a
definition:

```text
targetX = sourceX
targetY = sourceZ
targetZ = -sourceY
```

No source-coordinate conversion is permitted in runtime update loops.

## Definition model

Each `PolyhedronDefinition` contains three distinct concepts:

- `vertices`: ideal normalized collider/topology vertices;
- `faces`: logical polygons expressed as vertex indices and explicit values;
- `faceDefinitions`: value/result-direction pairs used by result resolution.

Render triangulation, chamfer faces, UVs, materials, and collider objects are derived data. They are
not allowed to determine a die result.

For ordinary dice, a result direction is the outward normal of the numbered face. A traditional d4
is different: the result is associated with the vertex opposite the resting face. Its future logical
result directions will therefore be the negated resting-face normals while its render polygon normals
remain outward.

## d6 vertical slice

The d6 is the first and currently only registered definition. Its ideal cube vertices use coordinates
`±1/sqrt(3)`, giving every vertex unit distance from the origin.

| Value | Local result normal | Opposite value |
| ----: | ------------------- | -------------: |
|     1 | `(0, -1, 0)`        |              6 |
|     2 | `(1, 0, 0)`         |              5 |
|     3 | `(0, 0, 1)`         |              4 |
|     4 | `(0, 0, -1)`        |              3 |
|     5 | `(-1, 0, 0)`        |              2 |
|     6 | `(0, 1, 0)`         |              1 |

This preserves the source reference's face numbering and standard opposite-face sum of seven.

## Face resolution

For each logical face, the resolver normalizes the rigid-body quaternion, rotates the local result
normal into world space, and calculates its dot product with `(0, 1, 0)`. The value with the greatest
alignment is returned.

The d6 tests cover all six axis-aligned outcomes, non-unit quaternion normalization, invalid
quaternions, face/value alignment, outward polygon winding, and normalized vertex scale.
