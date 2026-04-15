# Touchpoint Summary Denormalization - Deployment Guide

**Date:** 2026-04-16
**Branch:** feature/touchpoint-summary-denormalization
**Target Database:** qa2
**Target Environment:** qa2

## Prerequisites

1. Database access to qa2
2. Backend deployment permissions
3. Mobile app deployment permissions (if applicable)

## Phase 6: Deployment Steps

### Step 1: Database Migration (qa2)

**IMPORTANT:** Run migrations in order

```bash
# Navigate to backend directory
cd backend

# Check migration status
pnpm migration:status

# Run migration 072 - Add columns
psql -h <qa2-host> -U <user> -d qa2 -f src/migrations/072_add_touchpoint_summary_to_clients.sql

# Verify migration 072
psql -h <qa2-host> -U <user> -d qa2 -c "\d clients"
# Should show: touchpoint_summary, touchpoint_number, next_touchpoint

# Run migration 073 - Populate existing data
psql -h <qa2-host> -U <user> -d qa2 -f src/migrations/073_populate_touchpoint_summary_for_existing_clients.sql

# Verify migration 073
psql -h <qa2-host> -U <user> -d qa2 -c "SELECT id, first_name, touchpoint_number, next_touchpoint FROM clients LIMIT 5;"
# Should show populated data
```

### Step 2: Backend Deployment

```bash
# Merge feature branch to develop
git checkout develop
git merge feature/touchpoint-summary-denormalization

# Resolve any conflicts
# git push

# Deploy to qa2 (using your deployment process)
# Example:
# pnpm deploy:qa2
# or
# kubectl apply -f k8s/qa2/
```

### Step 3: Verification on qa2

```bash
# Test API endpoints
curl https://qa2-api.example.com/api/clients?page=1&perPage=5 \
  -H "Authorization: Bearer <qa2-token>"

# Verify response includes new fields
# Should see: touchpoint_number, next_touchpoint, touchpoint_summary

# Create a test touchpoint
curl -X POST https://qa2-api.example.com/api/touchpoints \
  -H "Authorization: Bearer <qa2-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "<test-client-id>",
    "touchpoint_number": 1,
    "type": "Visit",
    "date": "2026-04-16",
    "status": "Completed"
  }'

# Verify summary was updated
curl https://qa2-api.example.com/api/clients/<test-client-id> \
  -H "Authorization: Bearer <qa2-token>"
```

### Step 4: Monitor Performance

```bash
# Check query performance
# Enable query logging if not already enabled
# Monitor slow queries

# Compare with baseline
# Before: ~2-3 seconds for 100 clients
# After: ~200-500ms for 100 clients
```

### Step 5: Mobile App Deployment (Optional)

If mobile app needs updates:

```bash
# Mobile app changes already committed in feature branch
# No mobile app changes needed - only backend

# If mobile app needs to use new fields:
# 1. Update mobile app to consume new API response fields
# 2. Test on staging environment
# 3. Deploy to app stores
```

## Rollback Procedure

If issues occur:

### Database Rollback
```sql
-- No rollback needed - columns are additive
-- If issues occur, code can be reverted without affecting data
```

### Backend Rollback
```bash
# Revert to previous commit
git revert <commit-hash>
git push

# Redeploy previous version
```

### Mobile Rollback
```bash
# Revert mobile app changes
git revert <mobile-commit-hash>

# Deploy previous app version
```

## Post-Deployment Checklist

- [ ] Migration 072 applied successfully
- [ ] Migration 073 applied successfully
- [ ] Backend deployed to qa2
- [ ] API endpoints responding correctly
- [ ] Touchpoint creation updates summary
- [ ] Client queries show improved performance
- [ ] Validation rules working correctly
- [ ] No errors in application logs
- [ ] Monitoring metrics look good

## Monitoring

### Key Metrics to Monitor

1. **API Response Time**
   - GET /api/clients
   - GET /api/clients/assigned
   - POST /api/touchpoints

2. **Database Query Performance**
   - Slow query log
   - Connection pool usage
   - Index usage statistics

3. **Application Logs**
   - Touchpoint summary update errors
   - Validation failures
   - API errors

### Alerts

Set up alerts for:
- API response time > 1 second
- Error rate > 1%
- Database connection pool exhaustion
- Touchpoint summary update failures

## Production Deployment (Future)

For production deployment:

1. Test thoroughly on qa2
2. Schedule maintenance window
3. Run migrations during low-traffic period
4. Monitor closely after deployment
5. Have rollback plan ready

## Success Criteria

✅ Migrations applied without errors
✅ API endpoints returning correct data
✅ Performance improvement observed
✅ No increase in error rates
✅ Touchpoint validation working correctly
✅ Mobile apps functioning normally

## Support

For issues or questions:
- Check verification guide: `docs/TOUCHPOINT_SUMMARY_VERIFICATION.md`
- Check design spec: `docs/superpowers/specs/2026-04-16-touchpoint-summary-denormalization-design.md`
- Check implementation plan: `docs/superpowers/plans/2026-04-16-touchpoint-summary-denormalization.md`

## Next Steps After qa2 Deployment

1. Monitor for 1-2 weeks
2. Collect performance metrics
3. Gather user feedback
4. Plan production deployment
5. Update documentation based on learnings
