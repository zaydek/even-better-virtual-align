# TODO

## Deferred: SQL Enhancements

Per LLM Council recommendation, SQL support is limited to "Tabular Patterns" only.
Complex query logic (WHERE, SELECT AS, subqueries) is explicitly out of scope.

### Not Implemented (by design)

- **WHERE clause alignment** - Too many edge cases, low value vs complexity
- **SELECT AS alignment** - Inconsistent results with complex queries
- **Subqueries** - Would require recursive parsing
- **Operator width normalization** - Manual workaround: add extra spaces in fixtures

## Completed: Test Architecture Refactor

**Status**: Done. See `PLAN.md` for details.

- [x] Decouple ParserService from VS Code API
- [x] Add `npm run test:unit` for fast testing (1.1s vs 5s)
- [x] No VS Code window opens during unit tests

## Completed: SQL/PostgreSQL Alignment ("Tabular Patterns")

**Status**: Implemented. Limited to grid-like patterns per council advice.

- [x] CREATE TABLE column name AND type alignment (Definition Grid)
- [x] INSERT VALUES tuple alignment (columns pad after commas)
- [x] CREATE INDEX grouping (consecutive lines share scope)

### Fixtures

- `src/test/fixtures/sql/create-table/` - Column names and types
- `src/test/fixtures/sql/insert-values-simple/` - Tuple columns
- `src/test/fixtures/sql/insert-values-json/` - Tuple columns (no JSON parsing)

### Notes

- SQL uses regex-based parsing (no Tree-sitter grammar available)
- Only "tabular" patterns are supported (CREATE TABLE, INSERT VALUES, CREATE INDEX)
- WHERE/SELECT/subqueries intentionally unsupported
