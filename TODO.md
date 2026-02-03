# TODO: SQL/PostgreSQL Alignment Support

## Status
Fixtures created and reviewed by LLM Council. Parser implementation pending.

## Fixtures Ready
- `src/test/fixtures/sql/create-table/` - Column name, type, constraint alignment
- `src/test/fixtures/sql/insert-values-simple/` - Tuple value alignment
- `src/test/fixtures/sql/insert-values-json/` - Tuple + JSON key/value alignment
- `src/test/fixtures/sql/select-where/` - Operator alignment in WHERE clauses
- `src/test/fixtures/sql/select-complex/` - AS alias alignment, CTE formatting

## Rules to Implement (Council-Approved)

### Rule A: Definition List
- **Scope:** `CREATE TABLE` columns, `SELECT` lists with `AS`
- **Logic:** Pad names to max width so types/aliases align

### Rule B: Operator Zone
- **Scope:** `WHERE` clauses, `JOIN` conditions
- **Logic:**
  1. Pad LHS so operators start at same column
  2. Pad shorter operators to match widest (e.g., `=` → `=·` when `<@` present)

### Rule C: The Matrix
- **Scope:** `INSERT INTO ... VALUES` tuples
- **Logic:** Pad each cell to max column width

## Implementation Tasks
- [ ] Add SQL language detection in `ParserService.ts`
- [ ] Implement token extraction for:
  - [ ] CREATE TABLE column definitions
  - [ ] INSERT VALUES tuples
  - [ ] WHERE clause operators
  - [ ] SELECT AS aliases
  - [ ] CREATE INDEX keywords (ON, USING)
- [ ] Update `Grouper.ts` with SQL-specific grouping logic
- [ ] Wire up `.sql` file extension detection
- [ ] Run fixtures with `UPDATE_SNAPSHOTS=1 npm test`

## Notes
- JSON-in-SQL alignment (Fixture 3) is ambitious - consider MVP without it
- Alignment should reset per-statement (at `;`, `CREATE`, `INSERT`, `SELECT`)
- Council files (`after.council.sql.txt`) available for comparison
