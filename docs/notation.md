# Dice notation

Dice O Rolla parses additive expressions containing standard dice, paired dice, and integer
modifiers. Letters are case-insensitive, and whitespace may separate grammar tokens.

```text
d20
2d6 + 4
1d8 + 2d6 - 1
d%
d100
d66
```

## Keep and drop

A standard dice term can contain one selection suffix:

| Suffix | Meaning                   |
| ------ | ------------------------- |
| `khN`  | keep the highest `N` dice |
| `klN`  | keep the lowest `N` dice  |
| `dhN`  | drop the highest `N` dice |
| `dlN`  | drop the lowest `N` dice  |

For example, `4d6kh3` rolls four physical d6 dice and totals the highest three. `4d6dl1` has the
same numeric behavior. All four dice remain in `RollResult.dice`: included dice have
`included: true`, while discarded dice have `included: false`. Ties are resolved stably by physical
die order and do not affect the total.

The selection count must be positive. Keep cannot select more dice than the term rolls, and drop
must leave at least one die.

## Score maps

A score suffix maps face values or inclusive face ranges to integer contributions:

```text
5d20s{1=-2,17..19=1,20=2}
```

Each `1` contributes `-2`, each value from `17` through `19` contributes `1`, and each `20`
contributes `2`. Every unlisted face contributes `0`. The roll total is the sum of these scores, not
the sum of the raw face values. `RollResult.dice` preserves both as `value` and `score`.

Rules must not overlap, ranges must be ordered and remain within the die's faces, and both faces and
scores must be safe integers. A map must contain at least one rule.

Keep/drop may precede a score map:

```text
4d20kh3s{1=-2,17..19=1,20=2} + 1
```

Evaluation order is:

1. physically roll every requested die;
2. apply keep/drop independently to each dice term;
3. map included face values to scores;
4. add integer modifiers.

Discarded dice retain their raw value and mapped score for inspection, but contribute nothing to
the total.

## Paired dice

`d%`, `d100`, and `d66` are logical values assembled from two physical component dice. Keep/drop
and score maps are currently rejected on these terms because applying rules to their individual
components would be ambiguous.
