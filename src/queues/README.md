# BullMQ Queuing System

This directory contains the BullMQ-based queuing infrastructure for the IMU backend.

## Architecture

### Queues

- **`bulk-operations`** - Bulk deletes, bulk approvals, bulk operations
- **`reports`** - Report generation, CSV exports
- **`location-assignments`** - PSGC matching, municipality assignments
- **`sync-operations`** - PowerSync batch operations (high priority)

### Components

```
queues/
├── index.ts                    # Main exports
├── queue-manager.ts            # Queue singleton manager
├── base-processor.ts           # Abstract processor class
├── jobs/
│   └── job-types.ts            # Job type definitions
├── processors/
│   └── bulk-delete-processor.ts # Bulk delete processor (example)
└── utils/
    └── job-helpers.ts          # Job helper functions
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379/0
# Alternative: Individual parameters
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Queue Concurrency Settings
QUEUE_CONCURRENCY_BULK_OPERATIONS=5
QUEUE_CONCURRENCY_REPORTS=2
QUEUE_CONCURRENCY_LOCATIONS=3
QUEUE_CONCURRENCY_SYNC=10
```

### Redis Setup

**Development (Docker):**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Production Options:**
- Upstash (https://upstash.com) - Free tier available
- Redis Cloud (https://redis.com/try-free)
- Self-hosted Redis

## Usage

### Adding Jobs

```typescript
import { addBulkJob, addReportJob, addLocationJob } from '../queues/index.js';

// Bulk delete
const job = await addBulkJob(
  'bulk_delete_users',
  userId,
  itemIds,
  { dryRun: false }
);

// Report generation
const job = await addReportJob(
  'report_agent_performance',
  userId,
  { startDate: '2026-01-01', endDate: '2026-01-31' }
);

// Location assignment
const job = await addLocationJob(
  'bulk_assign_user_psgc',
  userId,
  psgcIds
);
```

### Checking Job Status

```typescript
import { getJobStatus } from '../queues/index.js';

const status = await getJobStatus(jobId);
console.log(status);
// {
//   id: 'bull:123456789:abcdef',
//   name: 'bulk_delete_users',
//   queueName: 'bulk-operations',
//   state: 'completed',
//   progress: 100,
//   result: { ... }
// }
```

### Creating Processors

```typescript
import { BaseProcessor } from '../queues/base-processor.js';
import type { BulkJobData, JobResult } from '../queues/job-types.js';

export class MyProcessor extends BaseProcessor<BulkJobData, JobResult> {
  constructor() {
    super('bulk-operations'); // Queue name
  }

  async process(job: Job<BulkJobData>): Promise<JobResult> {
    const { type, userId, items } = job.data;

    // Process items with progress tracking
    for (let i = 0; i < items.length; i++) {
      // Update progress
      await this.updateProgress(job, {
        progress: Math.floor((i / items.length) * 100),
        total: items.length,
        current: i + 1,
        message: `Processing item ${i + 1} of ${items.length}`,
      });

      // Process item
      await this.processItem(items[i]);
    }

    return createJobResult(items.length, succeeded, failed, startedAt);
  }
}
```

## API Endpoints

### Job Management

- `GET /api/jobs/health` - Get queue system health (admin only)
- `POST /api/jobs/psgc/matching` - Start PSGC matching job
- `POST /api/jobs/reports/generate` - Generate report in background
- `POST /api/jobs/user-locations/assign` - Assign locations in background
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs` - List user's jobs
- `DELETE /api/jobs/:id` - Cancel job

## Monitoring

### Health Check

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.imu.app/api/jobs/health
```

Response:
```json
{
  "success": true,
  "health": {
    "status": "ok",
    "redis": true,
    "queues": {
      "bulk-operations": {
        "counts": { "waiting": 5, "active": 1, "completed": 100, "failed": 2 },
        "workerRunning": true
      },
      "reports": {
        "counts": { "waiting": 0, "active": 0, "completed": 50, "failed": 0 },
        "workerRunning": true
      }
    }
  }
}
```

### Bull Board UI (Optional)

For visual job monitoring, you can add Bull Board:

```bash
pnpm add @bull-board/express @bull-board/api-bullmq express
```

Then create a UI server at a separate port.

## Job Types

### Bulk Operations
- `bulk_delete_users` - Delete multiple users
- `bulk_delete_groups` - Delete multiple groups
- `bulk_delete_caravans` - Delete multiple caravans
- `bulk_delete_itineraries` - Delete multiple itineraries
- `bulk_delete_clients` - Delete multiple clients
- `bulk_delete_touchpoints` - Delete multiple touchpoints
- `bulk_approve` - Approve multiple items
- `bulk_reject` - Reject multiple items

### Reports
- `report_agent_performance` - Agent performance report
- `report_client_activity` - Client activity report
- `report_touchpoint_summary` - Touchpoint summary report
- `report_attendance_summary` - Attendance summary report
- `report_target_achievement` - Target achievement report
- `report_conversion` - Conversion report
- `report_area_coverage` - Area coverage report
- `export_touchpoints_csv` - Export touchpoints to CSV
- `export_clients_csv` - Export clients to CSV
- `export_attendance_csv` - Export attendance to CSV

### Location Assignments
- `psgc_matching` - Match clients to PSGC codes
- `bulk_assign_user_psgc` - Assign PSGC codes to users
- `bulk_assign_user_municipalities` - Assign municipalities to users
- `bulk_assign_group_municipalities` - Assign municipalities to groups
- `bulk_assign_caravan_municipalities` - Assign municipalities to caravans

### Sync Operations
- `powersync_batch` - Process PowerSync batch operations

## Migration from PostgreSQL Jobs

The old PostgreSQL-based background job system (`background_jobs` table) is still available but will be phased out.

New endpoints should use BullMQ queues instead of the old system.

## Testing

```typescript
import { getQueueManager } from '../queues/index.js';

// Test queue connection
const manager = getQueueManager();
const health = await manager.getHealth();
console.log(health);

// Add test job
const testJob = await manager.addJob('bulk-operations', 'bulk_delete_users', {
  userId: 'test-user-id',
  type: 'bulk_delete_users',
  items: ['id1', 'id2', 'id3'],
});

console.log('Test job added:', testJob.id);
```

## Troubleshooting

### Redis Connection Failed

1. Check Redis is running: `docker ps | grep redis`
2. Check REDIS_URL in .env file
3. Test Redis connection: `redis-cli ping`

### Jobs Not Processing

1. Check worker is started: Look for "Worker started" log message
2. Check job status: `GET /api/jobs/health`
3. Check for errors in logs

### High Memory Usage

1. Reduce concurrency in environment variables
2. Enable job removal: `removeOnComplete` and `removeOnFail` settings
3. Restart workers periodically

## Next Steps

Phase 2 will convert existing synchronous endpoints to use queues:

1. Bulk delete endpoints (users, groups, caravans, itineraries)
2. Bulk approve/reject endpoints
3. Synchronous report endpoints
4. Location assignment endpoints

See: `docs/superpowers/plans/` for detailed implementation plan.
