import type { MathJson } from '../ir';
import type { Scope } from './scope';

export type Emission = [code: string, precedence: number];

export interface ExpressionEmitter {
  readonly sp: string;
  scope: Scope;
  emit(node: MathJson | undefined, minPrec?: number): string;
}
