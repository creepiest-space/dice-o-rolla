import type { DiceExpression, ModifierExpression, RollExpression, RollNotation } from './ast.js';
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

      const sidesStart = this.#index;
      this.#consumeDigits();
      if (sidesStart === this.#index) {
        this.#fail('INVALID_SIDES', 'A dice expression must specify its number of sides');
      }

      const sides = this.#readInteger(sidesStart, this.#index, 'sides');
      if (count < 1) {
        this.#failAt('INVALID_COUNT', 'Dice count must be at least one', integerStart);
      }
      if (sides < 2) {
        this.#failAt('INVALID_SIDES', 'A die must have at least two sides', sidesStart);
      }

      return {
        kind: 'dice',
        count,
        sides,
      } satisfies DiceExpression;
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
