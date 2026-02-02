/**
 * Core types for alignment extension.
 * These interfaces decouple parsing from rendering.
 */

/** Supported operator types across all languages */
export type OperatorType =
  | "="
  | ":"
  | ","
  | "}"
  | "&&"
  | "||"
  | "and"
  | "or"
  | "//"
  | "funcArg"; // Function argument value (for right-alignment)

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
  /** Scope identifier - tokens must be in the same scope to align */
  scopeId: string;
  /** Total number of operators on this line (for shape-based grouping) */
  operatorCountOnLine: number;
}

/** A group of tokens that should be aligned together */
export interface AlignmentGroup {
  /** Unique identifier for this group */
  id: string;
  /** Tokens in this group, sorted by line */
  tokens: AlignmentToken[];
  /** Target column to align to (max column in group) */
  targetColumn: number;
  /**
   * Whether to pad AFTER the operator (true) or BEFORE (false).
   * - For `:` operators: pad after (values align, like Go)
   * - For `=`, `&&`, `||`: pad before (operators align)
   */
  padAfter: boolean;
}

/** Supported language identifiers */
export type SupportedLanguage =
  | "typescript"
  | "typescriptreact"
  | "json"
  | "jsonc"
  | "yaml"
  | "python"
  | "css"
  | "scss"
  | "less"
  | "markdown";

/** All supported languages for configuration */
export const ALL_SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "typescript",
  "typescriptreact",
  "json",
  "jsonc",
  "yaml",
  "python",
  "css",
  "scss",
  "less",
  "markdown",
];

/** Check if a language ID is supported */
export function isSupportedLanguage(
  langId: string,
): langId is SupportedLanguage {
  return ALL_SUPPORTED_LANGUAGES.includes(langId as SupportedLanguage);
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
    case "css":
    case "scss":
    case "less":
      return "css"; // CSS grammar handles all CSS-like languages
    case "markdown":
      return "markdown"; // Special handling - parses code blocks
  }
}
