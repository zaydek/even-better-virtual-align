/**
 * AST utility functions for Tree-sitter node operations.
 */

import { OperatorType } from "../core/types";
import { TreeNode } from "./tree-sitter-types";

/**
 * Types that should be ignored when checking if an operator is inside a string or comment.
 */
const IGNORED_TYPES = new Set([
  "string",
  "template_string",
  "string_literal",
  "comment",
  "line_comment",
  "block_comment",
  "string_fragment",
  "interpolation",
  "formatted_string",
]);

/**
 * Checks if a node is inside a string or comment context.
 */
export function isInsideStringOrComment(node: TreeNode): boolean {
  let current: TreeNode | null = node.parent;
  while (current) {
    if (IGNORED_TYPES.has(current.type)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Normalizes operator text to a canonical type.
 */
export function normalizeOperator(text: string): OperatorType | null {
  switch (text) {
    case "=":
      return "=";
    case ":":
      return ":";
    case ",":
      return ",";
    case "&&":
      return "&&";
    case "||":
      return "||";
    case "and":
      return "and";
    case "or":
      return "or";
    default:
      // Check for comments (// ... or # ...)
      if (text.startsWith("//") || text.startsWith("#")) {
        return "//";
      }
      return null;
  }
}

/**
 * Gets the AST parent type for structural grouping.
 * Tokens with different parent types should not align.
 */
export function getParentType(node: TreeNode): string {
  return node.parent?.type ?? "unknown";
}

// Object-like types that we should skip when looking for arrays
const OBJECT_LIKE_TYPES = new Set([
  "object",
  "object_expression",
  "object_literal",
  "object_pattern",
  "dictionary",
  "dict",
]);

// Array-like types that indicate siblings should align
const ARRAY_LIKE_TYPES = new Set([
  "array",
  "array_expression",
  "array_literal",
  "list",
  "tuple",
  "tuple_type",
  "type_arguments",
]);

// Scope types that should stop the search
const BLOCK_SCOPE_TYPES = new Set([
  "statement_block",
  "block",
  "class_body",
  "function_definition",
  "function_declaration",
  "arrow_function",
  "class_definition",
  "class_declaration",
  "if_statement",
  "for_statement",
  "while_statement",
  "program",
]);

/**
 * Gets a scope identifier for context-aware grouping.
 * Tokens in different scopes (different objects, blocks) shouldn't align.
 *
 * Special case: For inline objects that are direct children of an array,
 * use the array's scope so that sibling inline objects can align together.
 */
export function getScopeId(node: TreeNode): string {
  let current: TreeNode | null = node.parent;
  let firstObject: TreeNode | null = null;

  while (current) {
    const nodeType = current.type;
    const nodeTypeLower = nodeType.toLowerCase();

    // Track the first object-like node we encounter
    const isObjectLike =
      OBJECT_LIKE_TYPES.has(nodeType) ||
      nodeTypeLower.includes("object") ||
      nodeTypeLower.includes("dict");
    if (isObjectLike && !firstObject) {
      firstObject = current;
    }

    // If we hit an array-like type, use its scope
    const isArrayLike =
      ARRAY_LIKE_TYPES.has(nodeType) ||
      nodeTypeLower.includes("array") ||
      nodeTypeLower.includes("list") ||
      nodeTypeLower.includes("tuple");
    if (isArrayLike) {
      return `array_${current.id}`;
    }

    // If we hit a block scope, stop searching
    if (BLOCK_SCOPE_TYPES.has(nodeType)) {
      if (firstObject) {
        return `object_${firstObject.id}`;
      }
      return `${nodeType}_${current.id}`;
    }

    current = current.parent;
  }

  // If we found an object but no array, use the object's scope
  if (firstObject) {
    return `object_${firstObject.id}`;
  }

  return "root";
}
