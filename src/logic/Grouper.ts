/**
 * Groups alignment tokens into alignment groups.
 *
 * Based on gofmt-style rules, tokens are grouped when ALL of the following are true:
 * 1. Same operator type (: with :, = with =)
 * 2. Same indentation level (different nesting = no alignment)
 * 3. Same AST parent type (structural role must match)
 * 4. Same token index on line (1st : aligns with 1st :, 2nd with 2nd)
 * 5. Consecutive lines (blank lines break groups)
 */

import { AlignmentGroup, AlignmentToken } from "../core/types";

/**
 * Groups tokens into alignment groups based on gofmt-style rules.
 *
 * Uses a bucket-based approach: tokens are first grouped by their structural
 * properties (type, indent, parentType, tokenIndex), then filtered to only
 * include consecutive line sequences.
 */
export function groupTokens(tokens: AlignmentToken[]): AlignmentGroup[] {
  if (tokens.length === 0) {
    return [];
  }

  // Group tokens by their structural key
  // For tokenIndex 0: group broadly (type, indent, parentType, scopeId)
  // For tokenIndex > 0:
  //   - If operatorCountOnLine > 1 (inline object): isolate by line number (no cross-object align)
  //   - If operatorCountOnLine == 1 (multi-line block): use scopeId (allow alignment within block)
  const buckets = new Map<string, AlignmentToken[]>();

  for (const token of tokens) {
    let key: string;
    if (token.tokenIndex === 0) {
      // First operator on line: group broadly
      key = `${token.type}|${token.indent}|${token.parentType}|${token.tokenIndex}|${token.scopeId}`;
    } else if (
      token.operatorCountOnLine > 1 &&
      token.parentType !== "function_arguments" &&
      token.parentType !== "trailing_comment" // Don't isolate trailing comments
    ) {
      // Inline object (multiple operators on one line): isolate by line
      // Each inline object is a separate type, don't align across them
      // Exceptions:
      //   - function_arguments: should align across lines (that's the whole point)
      //   - trailing_comment: should align across lines regardless of what else is on the line
      key = `${token.type}|${token.indent}|${token.parentType}|${token.tokenIndex}|line_${token.line}`;
    } else {
      // Multi-line block (one operator per line): use scopeId for shared alignment
      // Also applies to function_arguments and trailing_comment regardless of operatorCountOnLine
      key = `${token.type}|${token.indent}|${token.parentType}|${token.tokenIndex}|${token.scopeId}`;
    }
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(token);
  }

  const groups: AlignmentGroup[] = [];

  // For each bucket, find consecutive line sequences
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Sort by line number
    bucket.sort((a, b) => a.line - b.line);

    // Find consecutive sequences
    let currentGroup: AlignmentToken[] = [bucket[0]];

    for (let i = 1; i < bucket.length; i++) {
      const prev = currentGroup[currentGroup.length - 1];
      const curr = bucket[i];

      // Must be on consecutive lines
      if (curr.line === prev.line + 1) {
        currentGroup.push(curr);
      } else {
        // Finalize current group if it has multiple tokens
        if (currentGroup.length > 1) {
          groups.push(createGroup(currentGroup));
        }
        // Start new group
        currentGroup = [curr];
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 1) {
      groups.push(createGroup(currentGroup));
    }
  }

  // Sort groups by first token's line and column for consistent ordering
  groups.sort((a, b) => {
    if (a.tokens[0].line !== b.tokens[0].line) {
      return a.tokens[0].line - b.tokens[0].line;
    }
    return a.tokens[0].column - b.tokens[0].column;
  });

  return groups;
}

/**
 * Creates an alignment group from a list of tokens.
 *
 * For `:` and `,` operators (Go style): Pad AFTER the operator so VALUES align.
 *   "short":    value  <- colon at column 8, pad after to align values
 *   "longer":   value  <- colon at column 9, less pad needed
 *   { key: "short",   next: 1 }  <- comma padded to align next key
 *   { key: "longer",  next: 1 }
 *
 * For `=`, `&&`, `||` operators: Pad BEFORE the operator so OPERATORS align.
 *   passes   = sum(...)  <- operator at column 9
 *   warnings = sum(...)  <- operator at column 9
 *
 * For `funcArg` (function argument values): Pad BEFORE so values RIGHT-align.
 *   token(0,  8, ...)  <- 8 gets 1 space before to align with 15
 *   token(0, 15, ...)  <- 15 at rightmost position
 */
function createGroup(tokens: AlignmentToken[]): AlignmentGroup {
  const operatorType = tokens[0].type;

  // `:` and `,` pad after (values/next keys align), everything else pads before (operators align)
  const padAfter = operatorType === ":" || operatorType === ",";

  let targetColumn: number;

  if (operatorType === "funcArg") {
    // For function arguments: right-align by END position
    // targetColumn = max end position (where the rightmost argument ends)
    // spacesNeeded = targetColumn - thisEndColumn (calculated in decorator)
    const maxEndColumn = Math.max(
      ...tokens.map((t) => t.column + t.text.length),
    );
    targetColumn = maxEndColumn;
  } else if (padAfter) {
    // For `:`, find the rightmost position where an operator ENDS
    // Values should all start at the same column after this
    const maxEndColumn = Math.max(
      ...tokens.map((t) => t.column + t.text.length),
    );
    targetColumn = maxEndColumn;
  } else {
    // For `=` etc., find the rightmost column where an operator STARTS
    const maxColumn = Math.max(...tokens.map((t) => t.column));
    targetColumn = maxColumn;
  }

  return {
    id: `${tokens[0].line}-${tokens[0].column}-${tokens[0].type}`,
    tokens,
    targetColumn,
    padAfter,
  };
}

/**
 * Filters groups to only include those within a visible range.
 */
export function filterGroupsInRange(
  groups: AlignmentGroup[],
  startLine: number,
  endLine: number,
): AlignmentGroup[] {
  return groups.filter((group) => {
    // Include if any token in the group is within the range
    return group.tokens.some((t) => t.line >= startLine && t.line <= endLine);
  });
}
