/**
 * Shared test helpers for alignment extension tests.
 */

import { AlignmentToken } from "../core/types";

/**
 * Helper to create tokens with default values for testing.
 */
export function token(
  line: number,
  column: number,
  text: string,
  type: "=" | ":" | "," | "&&" | "||" | "and" | "or" | "//" | "funcArg",
  opts?: {
    indent?: number;
    parentType?: string;
    tokenIndex?: number;
    scopeId?: string;
    operatorCountOnLine?: number;
  },
): AlignmentToken {
  return {
    line,
    column,
    text,
    type,
    indent: opts?.indent ?? 0,
    parentType: opts?.parentType ?? "pair",
    tokenIndex: opts?.tokenIndex ?? 0,
    scopeId: opts?.scopeId ?? "default_scope",
    operatorCountOnLine: opts?.operatorCountOnLine ?? 1,
  };
}
