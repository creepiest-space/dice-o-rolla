export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuaternionLike extends Vector3Like {
  readonly w: number;
}
