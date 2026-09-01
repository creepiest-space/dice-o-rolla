---
'@dice-o-rolla/dice-engine': patch
'@dice-o-rolla/dice-physics': patch
'@dice-o-rolla/dice-physics-rapier': patch
---

Restore deterministic repeated seeded simulations by resetting Rapier solver state, and terminate
replay cleanly when its frame scheduler throws.
