import type {
  DiceExpression,
  DiceScoreRule,
  DiceSelection,
  DiceSelectionOperator,
  ModifierExpression,
  PairedDiceExpression,
  RollExpression,
  RollNotation,
} from './ast.js';
import { NotationParseError } from './errors.js';
import type { NotationParseErrorCode } from './errors.js';

type Sign = 1 | -1;

class NotationParser {
  readonly #input: string;
  #index = 0;

  public constructor(input: string) {
    this.#input = input;
  }

  public parse(): RollNotation {
    this.#skipWhitespace();
    if (this.#isAtEnd()) {
      this.#fail('EMPTY_NOTATION', 'Notation must contain at least one term');
    }

    const expressions: RollExpression[] = [];
    let first = true;

    while (!this.#isAtEnd()) {
      const sign = this.#readSign(first);
      this.#skipWhitespace();

      if (this.#isAtEnd()) {
        this.#fail('EXPECTED_TERM', 'Expected a dice expression or integer modifier');
      }

      expressions.push(this.#readTerm(sign));
      this.#skipWhitespace();
      first = false;

      if (!this.#isAtEnd() && !this.#isSign(this.#current())) {
        this.#fail('EXPECTED_OPERATOR', 'Expected "+" or "-" between terms');
      }
    }

    return {
      kind: 'roll',
      source: this.#input,
      expressions,
    };
  }

  #readSign(first: boolean): Sign {
    const character = this.#current();
    if (character === '+') {
      this.#index += 1;
      return 1;
    }
    if (character === '-') {
      this.#index += 1;
      return -1;
    }
    if (first) {
      return 1;
    }

    return this.#fail('EXPECTED_OPERATOR', 'Expected "+" or "-" between terms');
  }

  #readTerm(sign: Sign): RollExpression {
    const termStart = this.#index;
    const integerStart = this.#index;
    this.#consumeDigits();
    const integerEnd = this.#index;

    if (this.#current()?.toLowerCase() === 'd') {
      if (sign === -1) {
        this.#failAt('NEGATIVE_DICE', 'Negative dice expressions are not supported', termStart);
      }

      const count =
        integerStart === integerEnd ? 1 : this.#readInteger(integerStart, integerEnd, 'count');
      this.#index += 1;

      if (count < 1) {
        this.#failAt('INVALID_COUNT', 'Dice count must be at least one', integerStart);
      }

      if (this.#current() === '%') {
        this.#index += 1;
        this.#assertNoPairedDiceOperations();
        return {
          kind: 'paired-dice',
          count,
          type: 'd100',
        } satisfies PairedDiceExpression;
      }

      const sidesStart = this.#index;
      this.#consumeDigits();
      if (sidesStart === this.#index) {
        this.#fail('INVALID_SIDES', 'A dice expression must specify its number of sides');
      }

      const sides = this.#readInteger(sidesStart, this.#index, 'sides');
      if (sides < 2) {
        this.#failAt('INVALID_SIDES', 'A die must have at least two sides', sidesStart);
      }

      if (sides === 100 || sides === 66) {
        this.#assertNoPairedDiceOperations();
        return {
          kind: 'paired-dice',
          count,
          type: `d${sides}`,
        } satisfies PairedDiceExpression;
      }

      return this.#readDiceOperations({
        kind: 'dice',
        count,
        sides,
      });
    }

    if (integerStart === integerEnd) {
      const character = this.#current();
      if (character === undefined) {
        this.#fail('EXPECTED_TERM', 'Expected a dice expression or integer modifier');
      }
      this.#fail('UNEXPECTED_CHARACTER', `Unexpected character "${character}"`);
    }

    const value = this.#readInteger(integerStart, integerEnd, 'modifier') * sign;
    return {
      kind: 'modifier',
      value,
    } satisfies ModifierExpression;
  }

  #readDiceOperations(expression: DiceExpression): DiceExpression {
    this.#skipWhitespace();
    const selection = this.#startsSelection() ? this.#readSelection(expression.count) : undefined;
    this.#skipWhitespace();
    const score =
      this.#current()?.toLowerCase() === 's' ? this.#readScoreRules(expression.sides) : undefined;
    this.#skipWhitespace();

    if (this.#startsSelection() || this.#current()?.toLowerCase() === 's') {
      this.#fail(
        'INVALID_DICE_OPERATION',
        'Dice operations must contain at most one keep/drop operator followed by one score map',
      );
    }

    return {
      ...expression,
      ...(selection === undefined ? {} : { selection }),
      ...(score === undefined ? {} : { score }),
    };
  }

  #readSelection(diceCount: number): DiceSelection {
    const start = this.#index;
    const first = this.#current()?.toLowerCase();
    const second = this.#peek(1)?.toLowerCase();
    if ((first !== 'k' && first !== 'd') || (second !== 'h' && second !== 'l')) {
      return this.#failAt('INVALID_SELECTION', 'Expected kh, kl, dh, or dl', start);
    }
    const operator: DiceSelectionOperator = `${first}${second}`;
    this.#index += 2;
    this.#skipWhitespace();

    const countStart = this.#index;
    this.#consumeDigits();
    if (countStart === this.#index) {
      this.#failAt('INVALID_SELECTION', `Selection ${operator} requires a count`, start);
    }
    const count = this.#readInteger(countStart, this.#index, 'selection count');
    if (count < 1) {
      this.#failAt('INVALID_SELECTION', 'Selection count must be at least one', countStart);
    }
    const keepsDice = operator === 'kh' || operator === 'kl';
    if ((keepsDice && count > diceCount) || (!keepsDice && count >= diceCount)) {
      this.#failAt(
        'INVALID_SELECTION',
        keepsDice
          ? 'Cannot keep more dice than the term rolls'
          : 'Drop count must leave at least one die',
        countStart,
      );
    }
    return { operator, count };
  }

  #readScoreRules(sides: number): readonly DiceScoreRule[] {
    const operationStart = this.#index;
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#current() !== '{') {
      this.#failAt('INVALID_SCORE_RULE', 'Score notation requires "{" after "s"', operationStart);
    }
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#current() === '}') {
      this.#fail('INVALID_SCORE_RULE', 'Score map must contain at least one rule');
    }

    const rules: DiceScoreRule[] = [];
    while (true) {
      const ruleStart = this.#index;
      const minimum = this.#readScoreFace();
      this.#skipWhitespace();
      let maximum = minimum;
      if (this.#current() === '.') {
        if (this.#peek(1) !== '.') {
          this.#fail('INVALID_SCORE_RULE', 'Score ranges must use ".."');
        }
        this.#index += 2;
        this.#skipWhitespace();
        maximum = this.#readScoreFace();
      }
      if (minimum > maximum) {
        this.#failAt(
          'INVALID_SCORE_RULE',
          'Score range minimum must not exceed its maximum',
          ruleStart,
        );
      }
      if (minimum < 1 || maximum > sides) {
        this.#failAt(
          'INVALID_SCORE_RULE',
          `Score rule faces must be within [1, ${sides}]`,
          ruleStart,
        );
      }
      this.#skipWhitespace();
      if (this.#current() !== '=') {
        this.#fail('INVALID_SCORE_RULE', 'Score rule requires "=" before its score');
      }
      this.#index += 1;
      this.#skipWhitespace();
      const score = this.#readSignedScore();

      if (rules.some((rule) => minimum <= rule.maximum && maximum >= rule.minimum)) {
        this.#failAt('OVERLAPPING_SCORE_RULE', 'Score rule ranges must not overlap', ruleStart);
      }
      rules.push({ minimum, maximum, score });

      this.#skipWhitespace();
      if (this.#current() === '}') {
        this.#index += 1;
        return Object.freeze(rules.map((rule) => Object.freeze(rule)));
      }
      if (this.#current() !== ',') {
        this.#fail('INVALID_SCORE_RULE', 'Score rules must be separated by commas');
      }
      this.#index += 1;
      this.#skipWhitespace();
      if (this.#current() === '}') {
        this.#fail('INVALID_SCORE_RULE', 'Score map must not have a trailing comma');
      }
    }
  }

  #readScoreFace(): number {
    const start = this.#index;
    this.#consumeDigits();
    if (start === this.#index) {
      this.#fail('INVALID_SCORE_RULE', 'Score rule requires a face value');
    }
    return this.#readInteger(start, this.#index, 'score rule face');
  }

  #readSignedScore(): number {
    const sign = this.#current() === '-' ? -1 : 1;
    if (this.#current() === '-' || this.#current() === '+') this.#index += 1;
    const start = this.#index;
    this.#consumeDigits();
    if (start === this.#index) {
      this.#fail('INVALID_SCORE_RULE', 'Score rule requires an integer score');
    }
    return this.#readInteger(start, this.#index, 'score') * sign;
  }

  #assertNoPairedDiceOperations(): void {
    this.#skipWhitespace();
    if (this.#startsSelection() || this.#current()?.toLowerCase() === 's') {
      this.#fail(
        'INVALID_DICE_OPERATION',
        'Keep/drop and score operations are not supported for paired dice',
      );
    }
  }

  #startsSelection(): boolean {
    const first = this.#current()?.toLowerCase();
    const second = this.#peek(1)?.toLowerCase();
    return (first === 'k' || first === 'd') && (second === 'h' || second === 'l');
  }

  #readInteger(start: number, end: number, description: string): number {
    const value = Number(this.#input.slice(start, end));
    if (!Number.isSafeInteger(value)) {
      this.#failAt('UNSAFE_INTEGER', `${description} must be a safe integer`, start);
    }
    return value;
  }

  #consumeDigits(): void {
    while (!this.#isAtEnd() && this.#isDigit(this.#current())) {
      this.#index += 1;
    }
  }

  #skipWhitespace(): void {
    while (!this.#isAtEnd() && this.#isWhitespace(this.#current())) {
      this.#index += 1;
    }
  }

  #current(): string | undefined {
    return this.#input[this.#index];
  }

  #peek(offset: number): string | undefined {
    return this.#input[this.#index + offset];
  }

  #isAtEnd(): boolean {
    return this.#index >= this.#input.length;
  }

  #isDigit(character: string | undefined): boolean {
    if (character === undefined) return false;
    const code = character.charCodeAt(0);
    return code >= 48 && code <= 57;
  }

  #isWhitespace(character: string | undefined): boolean {
    return character === ' ' || character === '\t' || character === '\n' || character === '\r';
  }

  #isSign(character: string | undefined): boolean {
    return character === '+' || character === '-';
  }

  #fail(code: NotationParseErrorCode, message: string): never {
    return this.#failAt(code, message, this.#index);
  }

  #failAt(code: NotationParseErrorCode, message: string, index: number): never {
    throw new NotationParseError(code, message, this.#input, index);
  }
}

export function parseNotation(input: string): RollNotation {
  return new NotationParser(input).parse();
}
