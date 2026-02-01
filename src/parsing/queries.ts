/**
 * Tree-sitter queries for extracting alignable operators.
 *
 * Each query captures the operator token with @op.
 */

export const QUERIES: Record<string, string> = {
  typescript: `
    ; Variable declarations: const x = 1
    (variable_declarator
      name: (_)
      "=" @op
      value: (_))

    ; Assignment expressions: x = 1
    (assignment_expression
      left: (_)
      "=" @op
      right: (_))

    ; Enum member assignments: Up = "up"
    (enum_assignment
      name: (_)
      "=" @op
      value: (_))

    ; Object properties: { key: value }
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: number
    (type_annotation
      ":" @op)

    ; Logical operators
    (binary_expression
      operator: "&&" @op)
    (binary_expression
      operator: "||" @op)

    ; Trailing comments: // comment
    (comment) @op

    ; Function calls: func(arg1, arg2, ...)
    (call_expression
      function: [(identifier) @func_name (member_expression property: (property_identifier) @func_name)]
      arguments: (arguments) @func_args) @func_call
  `,

  // TSX uses the same query patterns as TypeScript
  tsx: `
    ; Variable declarations: const x = 1
    (variable_declarator
      name: (_)
      "=" @op
      value: (_))

    ; Assignment expressions: x = 1
    (assignment_expression
      left: (_)
      "=" @op
      right: (_))

    ; Enum member assignments: Up = "up"
    (enum_assignment
      name: (_)
      "=" @op
      value: (_))

    ; Object properties: { key: value }
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: number
    (type_annotation
      ":" @op)

    ; Logical operators
    (binary_expression
      operator: "&&" @op)
    (binary_expression
      operator: "||" @op)

    ; Trailing comments: // comment
    (comment) @op

    ; Function calls: func(arg1, arg2, ...)
    (call_expression
      function: [(identifier) @func_name (member_expression property: (property_identifier) @func_name)]
      arguments: (arguments) @func_args) @func_call
  `,

  python: `
    ; Assignments: x = 1
    (assignment
      left: (_)
      "=" @op
      right: (_))

    ; Keyword arguments: func(x=1)
    (keyword_argument
      name: (_)
      "=" @op
      value: (_))

    ; Default parameters: def foo(x=1)
    (default_parameter
      name: (_)
      "=" @op
      value: (_))

    ; Dictionary pairs: {"key": value}
    (pair
      key: (_)
      ":" @op
      value: (_))

    ; Type annotations: x: int
    (typed_parameter
      ":" @op)

    ; Boolean operators
    (boolean_operator
      operator: "and" @op)
    (boolean_operator
      operator: "or" @op)

    ; Trailing comments: # comment
    (comment) @op
  `,

  css: `
    ; CSS declarations: property: value
    (declaration
      (property_name)
      ":" @op)
  `,
};

/**
 * WASM file names for each language (from @vscode/tree-sitter-wasm).
 */
export const WASM_FILES: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  python: "tree-sitter-python.wasm",
  css: "tree-sitter-css.wasm",
};
