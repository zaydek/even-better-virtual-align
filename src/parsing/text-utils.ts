/**
 * Pure text utility functions for parsing.
 */

/**
 * Gets the indentation level (leading whitespace count) of a line.
 */
export function getIndentLevel(lineText: string): number {
  const match = lineText.match(/^(\s*)/);
  return match ? match[1].length : 0;
}
