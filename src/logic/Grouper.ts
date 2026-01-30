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
 */
export function groupTokens(tokens: AlignmentToken[]): AlignmentGroup[] {
  if (tokens.length === 0) {
    return [];
  }

  // Sort by line number, then by column for consistent ordering
  const sorted = [...tokens].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  const groups: AlignmentGroup[] = [];
  let currentGroup: AlignmentToken[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sorted[i];

    // All conditions for grouping (gofmt-style):
    // 1. Same operator type
    const sameType = curr.type === prev.type;
    
    // 2. Same indentation level (handles nesting - the JSON problem)
    const sameIndent = curr.indent === prev.indent;
    
    // 3. Same AST parent type (handles structural role - the TypeScript problem)
    const sameParentType = curr.parentType === prev.parentType;
    
    // 4. Same token index on line (1st : with 1st :, etc.)
    const sameTokenIndex = curr.tokenIndex === prev.tokenIndex;
    
    // 5. Consecutive lines (must be on adjacent lines)
    const isConsecutive = curr.line === prev.line + 1;

    if (sameType && sameIndent && sameParentType && sameTokenIndex && isConsecutive) {
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

  return groups;
}

/**
 * Creates an alignment group from a list of tokens.
 * Calculates the target column as where values should start:
 * the rightmost operator end position + 1 (for minimum 1 space after operator).
 */
function createGroup(tokens: AlignmentToken[]): AlignmentGroup {
  // Find the rightmost position where an operator ends
  const maxEndColumn = Math.max(...tokens.map((t) => t.column + t.text.length));
  // Values should start 1 space after the rightmost operator
  const targetColumn = maxEndColumn + 1;

  return {
    id: `${tokens[0].line}-${tokens[0].column}-${tokens[0].type}`,
    tokens,
    targetColumn,
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
