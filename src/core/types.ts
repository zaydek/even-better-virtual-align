/**
 * Core types for alignment extension.
 * These interfaces decouple parsing from rendering.
 */

/** Supported operator types across all languages */
export type OperatorType = "=" | ":" | "&&" | "||" | "and" | "or";

/** A single alignable operator found in the document */
export interface AlignmentToken {
  /** Line number (0-indexed) */
  line: number;
  /** Column where the operator starts */
  column: number;
  /** The operator text */
  text: string;
  /** Normalized operator type for grouping */
  type: OperatorType;
  /** Indentation level of this line (leading whitespace count) */
  indent: number;
  /** AST parent node type (e.g., "pair", "property_signature") */
  parentType: string;
  /** Index of this operator on its line (0 = first, 1 = second, etc.) */
  tokenIndex: number;
}

/** A group of tokens that should be aligned together */
export interface AlignmentGroup {
  /** Unique identifier for this group */
  id: string;
  /** Tokens in this group, sorted by line */
  tokens: AlignmentToken[];
  /** Target column to align to (max column in group) */
  targetColumn: number;
}

/** Supported language identifiers */
export type SupportedLanguage =
  | "typescript"
  | "typescriptreact"
  | "json"
  | "jsonc"
  | "yaml"
  | "python";

/** Check if a language ID is supported */
export function isSupportedLanguage(
  langId: string,
): langId is SupportedLanguage {
  return ["typescript", "typescriptreact", "json", "jsonc", "yaml", "python"].includes(
    langId,
  );
}

/** Map VS Code language IDs to parser language keys */
export function getParserLanguage(langId: SupportedLanguage): string {
  switch (langId) {
    case "typescript":
      return "typescript";
    case "typescriptreact":
      return "tsx"; // TSX needs its own parser for JSX syntax
    case "json":
    case "jsonc":
      return "json";
    case "yaml":
      return "yaml";
    case "python":
      return "python";
  }
}
