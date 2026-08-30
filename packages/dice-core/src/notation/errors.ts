export type NotationParseErrorCode =
  | 'EMPTY_NOTATION'
  | 'EXPECTED_OPERATOR'
  | 'EXPECTED_TERM'
  | 'INVALID_COUNT'
  | 'INVALID_DICE_OPERATION'
  | 'INVALID_SCORE_RULE'
  | 'INVALID_SELECTION'
  | 'INVALID_SIDES'
  | 'NEGATIVE_DICE'
  | 'OVERLAPPING_SCORE_RULE'
  | 'UNSAFE_INTEGER'
  | 'UNEXPECTED_CHARACTER';

export class NotationParseError extends Error {
  public readonly code: NotationParseErrorCode;
  public readonly index: number;
  public readonly input: string;

  public constructor(code: NotationParseErrorCode, message: string, input: string, index: number) {
    super(`${message} at index ${index}`);
    this.name = 'NotationParseError';
    this.code = code;
    this.index = index;
    this.input = input;
  }
}
