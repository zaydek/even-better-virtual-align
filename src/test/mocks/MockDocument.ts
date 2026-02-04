/**
 * Mock document implementation for testing.
 * Allows running ParserService tests without VS Code.
 */

import { ParseableDocument } from "../../core/types";

/**
 * Creates a mock document from a string.
 */
export function createMockDocument(
  content: string,
  languageId: string
): ParseableDocument {
  const lines = content.split("\n");

  return {
    languageId,
    lineCount: lines.length,
    getText: () => content,
    lineAt: (line: number) => ({ text: lines[line] ?? "" }),
  };
}
