# TODO

## Deferred: SQL Enhancements (per LLM Council)

These were explicitly recommended to defer:

- [ ] **Operator width normalization** - Make single-char operators (e.g., `=`) pad to match multi-char operators (e.g., `<@`) in the same group. Currently handled manually in fixtures. "Nice to have" polish.

- [ ] **JSON-in-SQL alignment** - Parse JSON inside SQL string literals and align internal keys/values. Risky due to nested quote handling. Recommend opt-in setting if implemented later.

## Completed: Test Architecture Refactor

**Status**: Done. See `PLAN.md` for details.

- [x] Decouple ParserService from VS Code API
- [x] Add `npm run test:unit` for fast testing (1.1s vs 5s)
- [x] No VS Code window opens during unit tests

## Completed: SQL/PostgreSQL Alignment

**Status**: Implemented and tested.

- [x] INSERT VALUES tuple alignment (columns pad after commas)
- [x] WHERE clause operator alignment (LHS padded so operators align)
- [x] SELECT AS alias alignment
- [x] CREATE TABLE column name AND type alignment (Definition Grid)
- [x] CREATE INDEX grouping (consecutive lines share scope)

### Fixtures

- `src/test/fixtures/sql/create-table/` - Column names and types
- `src/test/fixtures/sql/insert-values-simple/` - Tuple columns
- `src/test/fixtures/sql/insert-values-json/` - Tuple columns (no JSON parsing)
- `src/test/fixtures/sql/select-where/` - WHERE operators
- `src/test/fixtures/sql/select-complex/` - SELECT AS and WHERE

### Notes

- Fixtures use regular spaces (not `·`) for easier editing
- SQL uses regex-based parsing (no Tree-sitter grammar available)
