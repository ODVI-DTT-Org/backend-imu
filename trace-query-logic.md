# Query Logic Analysis

## The Problem Scenario

Assume we have:
- Client A (id=1)
- Addresses: [A1, A2] 
- Phone numbers: [P1, P2]

## OLD QUERY Execution Trace

```sql
SELECT c.*,
  json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL) as addresses,
  json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL) as phone_numbers,
FROM clients c
LEFT JOIN addresses a ON a.client_id = c.id
LEFT JOIN phone_numbers p ON p.client_id = c.id
...
GROUP BY c.id, ...
```

### Step-by-step:

1. **FROM clients c** → 1 row (Client A)

2. **LEFT JOIN addresses a** → 2 rows:
   - (Client A, A1)
   - (Client A, A2)

3. **LEFT JOIN phone_numbers p** → 4 rows (Cartesian product!):
   - (Client A, A1, P1)
   - (Client A, A1, P2)
   - (Client A, A2, P1)
   - (Client A, A2, P2)

4. **GROUP BY c.id** → 1 group

5. **json_agg(DISTINCT a) FILTER (WHERE a.id IS NOT NULL)**:
   - Input: 4 rows, but each row has a different 'a' value??
   - Wait: On row 1, a = A1. On row 2, a = A1. On row 3, a = A2. On row 4, a = A2.
   - So DISTINCT should give: A1, A2 → 2 addresses ✓
   
6. **json_agg(DISTINCT p) FILTER (WHERE p.id IS NOT NULL)**:
   - Input: 4 rows
   - On row 1, p = P1. On row 2, p = P2. On row 3, p = P1. On row 4, p = P2.
   - DISTINCT should give: P1, P2 → 2 phones ✓

### So OLD QUERY should return:
- 1 row for Client A
- addresses: [A1, A2] (2 addresses)
- phone_numbers: [P1, P2] (2 phones)

## NEW QUERY Execution Trace

```sql
FROM clients c
LEFT JOIN LATERAL (
  SELECT json_agg(...) as addresses_json
  FROM addresses a
  WHERE a.client_id = c.id
) addr ON true
LEFT JOIN LATERAL (
  SELECT json_agg(...) as phones_json
  FROM phone_numbers p
  WHERE p.client_id = c.id
) phones ON true
```

### Step-by-step:

1. **FROM clients c** → 1 row (Client A)

2. **LEFT JOIN LATERAL (addresses subquery)**:
   - The subquery returns 1 row with addresses_json = [A1, A2]
   - Result: 1 row (Client A, [A1, A2])

3. **LEFT JOIN LATERAL (phones subquery)**:
   - The subquery returns 1 row with phones_json = [P1, P2]
   - Result: 1 row (Client A, [A1, A2], [P1, P2])

### NEW QUERY returns:
- 1 row for Client A
- addresses_json: [A1, A2] (2 addresses)
- phones_json: [P1, P2] (2 phones)

## Both should give the same result?

Theoretically, yes. Both should give 1 row per client with correct data.

### So why did the user report duplication?

Possible causes:
1. The GROUP BY in the old query was missing some columns
2. The DISTINCT on composite types (address rows) doesn't work as expected
3. There's a different join (like client_favorites) that causes issues
4. The addresses/phones arrays have duplicates within them

### The real issue: DISTINCT on row types

In PostgreSQL, DISTINCT on composite types (entire rows) compares all fields.
If two address rows have the same id but different other fields, they might not be deduplicated correctly.

Also, json_agg(DISTINCT a) on the 4-row Cartesian product might not work as expected
because the 'a' value on each of the 4 rows is the same object reference, but the
combined rows are different.

### NEW QUERY Advantage:

The LATERAL JOIN approach avoids this entirely by:
1. Pre-aggregating addresses BEFORE joining (1 row with JSON array)
2. Pre-aggregating phones BEFORE joining (1 row with JSON array)
3. No Cartesian product, no row multiplication

This is more reliable and predictable.
