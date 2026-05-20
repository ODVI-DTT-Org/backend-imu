# Duplicate Client Detection

This script identifies potential duplicate client records using multiple matching strategies.

## Quick Start

```bash
# Process new clients (default)
npm run detect-duplicates

# Recheck all clients
npm run detect-duplicates --all

# Preview changes without writing
npm run detect-duplicates --dry-run

# Disable AI validation
npm run detect-duplicates --ai-disabled

# Custom batch size
npm run detect-duplicates --batch-size 50
```

## How It Works

The script uses three matching strategies in sequence:

1. **Trigram Matching** (PostgreSQL pg_trgm)
   - Fast string similarity
   - Threshold: >85%
   - Good for obvious duplicates

2. **Fuzzy Matching** (Levenshtein distance)
   - Detects typos and variations
   - Threshold: >80%
   - Applied to candidates not caught by trigram

3. **AI Validation** (OpenAI GPT-4o Mini)
   - Final decision for borderline cases (60-80%)
   - Considers name, DOB, agency
   - Only invoked when uncertain

## Output Format

The script updates the `duplicate_metadata` JSONB column with:

```json
{
  "is_possible_duplicate": true,
  "confidence_score": 85,
  "similar_clients": [
    {
      "id": "uuid-1",
      "name": "JOHN SMITH",
      "similarity_method": "trigram",
      "score": 0.88
    }
  ],
  "ai_flagged": false,
  "last_checked_at": "2026-05-20T10:00:00Z"
}
```

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/imu_dev
OPENAI_API_KEY=sk-... # Optional; skip AI if not set
```

## Command-Line Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--all` | `-a` | boolean | false | Recheck all clients |
| `--batch-size` | `-b` | number | 100 | Clients per batch |
| `--dry-run` | `-d` | boolean | false | Preview only |
| `--ai-disabled` | | boolean | false | Skip AI validation |

## Examples

```bash
# Initial run on all clients
npm run detect-duplicates -- --all

# Weekly incremental check
npm run detect-duplicates

# Test with dry-run
npm run detect-duplicates -- --dry-run --batch-size 10

# Without AI (faster)
npm run detect-duplicates -- --ai-disabled
```

## Performance

- Trigram/Fuzzy: ~200 clients/minute
- With AI: ~50-100 clients/minute (depends on matches)
- Full dataset (5000 clients): 30-60 minutes with AI, 2-5 minutes without

## Querying Results

```sql
-- Find all flagged duplicates
SELECT id, fullname, duplicate_metadata
FROM clients
WHERE duplicate_metadata->>'is_possible_duplicate' = 'true'
ORDER BY (duplicate_metadata->>'confidence_score')::int DESC;

-- Find AI-flagged duplicates
SELECT id, fullname, duplicate_metadata
FROM clients
WHERE duplicate_metadata->>'ai_flagged' = 'true';

-- Find duplicates with high confidence
SELECT id, fullname, duplicate_metadata
FROM clients
WHERE (duplicate_metadata->>'confidence_score')::int >= 85;
```

## Manual Review Workflow

1. Query for flagged duplicates (query examples above)
2. Review suspicious records
3. Manual merge or deletion as needed
4. Re-run script to clean up if records change

## Testing

```bash
npm test -- scripts/__tests__
```

Run full test suite including unit and integration tests.

## Troubleshooting

**"pg_trgm extension not found"**
- Enable in PostgreSQL: `CREATE EXTENSION pg_trgm;`

**"OPENAI_API_KEY not set"**
- AI validation will be skipped
- Set `OPENAI_API_KEY` environment variable to enable

**"Database connection failed"**
- Verify `DATABASE_URL` is set
- Check database is running and credentials are correct

**"Timeout during AI validation"**
- API calls have a 5-second timeout with 3 retries
- Check OpenAI API status and rate limits
