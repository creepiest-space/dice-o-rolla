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
is different: the result is associated with the vertex opposite the resting face. Its logical result
directions are therefore the negated resting-face normals while its render polygon normals remain
outward. Each rendered d4 face carries the three values belonging to its vertices.

## Registered polyhedra

| Type | Vertices | Polygon faces | Values | Topology                 |
| ---- | -------: | ------------: | -----: | ------------------------ |
| d4   |        4 |             4 |    1–4 | tetrahedron              |
| d6   |        8 |             6 |    1–6 | cube                     |
| d8   |        6 |             8 |    1–8 | octahedron               |
| d10  |       12 |            10 |   1–10 | pentagonal trapezohedron |
| d12  |       20 |            12 |   1–12 | dodecahedron             |
| d20  |       12 |            20 |   1–20 | icosahedron              |

All reference vertices are rotated from source Z-up coordinates and individually normalized. The
d10 reference half-height was rounded to `0.105`; the target uses `0.10616611026445441` so its
normalized kite faces are exactly planar while preserving topology and numbering.
The ordinary d10's logical value ten is rendered with the conventional `0` label.

The d6 ideal cube vertices use coordinates `±1/sqrt(3)`, giving every vertex unit distance from the
origin.

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

Tests cover every result direction of every registered die, non-unit quaternion normalization,
invalid quaternions, face/value alignment, polygon planarity, outward winding, complete value sets,
and normalized vertex scale. Rapier integration tests physically settle every standard shape and
verify that the renderer snapshot resolves to the returned value.
