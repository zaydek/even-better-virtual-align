/**
 * Groups alignment tokens into alignment groups.
 *
 * Tokens are grouped when they:
 * 1. Have the same operator type
 * 2. Have the same scope ID (same parent context)
 * 3. Are on consecutive or near-consecutive lines (max gap of 1)
 */

import { AlignmentGroup, AlignmentToken } from "../core/types";

/** Maximum line gap allowed between tokens in the same group */
const MAX_LINE_GAP = 1;

/**
 * Groups tokens into alignment groups based on type, scope, and proximity.
 */
export function groupTokens(tokens: AlignmentToken[]): AlignmentGroup[] {
  if (tokens.length === 0) {
    return [];
  }

  // Sort by line number for sequential processing
  const sorted = [...tokens].sort((a, b) => a.line - b.line);

  const groups: AlignmentGroup[] = [];
  let currentGroup: AlignmentToken[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sorted[i];

    // Check if current token can join the current group
    const sameType = curr.type === prev.type;
    const sameScope = curr.scopeId === prev.scopeId;
    const closeEnough = curr.line - prev.line <= MAX_LINE_GAP;

    if (sameType && sameScope && closeEnough) {
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
