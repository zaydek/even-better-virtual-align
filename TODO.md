# TODO: SQL/PostgreSQL Alignment Support

## Status

**IMPLEMENTED** - Basic SQL alignment working. All tests passing.

## What's Working

- [x] INSERT VALUES tuple alignment (columns 1-2 padded)
- [x] WHERE clause operator alignment (LHS padded so operators align)
- [x] SELECT AS alias alignment
- [x] CREATE TABLE column name AND type alignment
- [x] CREATE INDEX grouping (consecutive CREATE INDEX lines group together)

## Deferred (per LLM Council recommendation)

- [ ] Operator width normalization (e.g., `=` → `= ` when `<@` present) - "nice to have" polish
- [ ] JSON-in-SQL alignment (parsing JSON inside string literals) - risky, opt-in later

## Fixtures

- `src/test/fixtures/sql/create-table/` - Column names align
- `src/test/fixtures/sql/insert-values-simple/` - Tuple columns align
- `src/test/fixtures/sql/insert-values-json/` - Tuple columns align (no JSON parsing)
- `src/test/fixtures/sql/select-where/` - WHERE operators align
- `src/test/fixtures/sql/select-complex/` - SELECT AS and WHERE align

## Notes

- Fixtures now use regular spaces instead of `·` for easier editing
- Council files removed (merged into main after.sql.txt files)
