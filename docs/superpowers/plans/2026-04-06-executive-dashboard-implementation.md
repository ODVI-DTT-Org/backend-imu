# Executive Dashboard with Excel Generation - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing tabbed Reports page into a single-page Executive Dashboard with real-time KPIs, traffic light indicators, and Excel report generation powered by BullMQ queues.

**Architecture:** Single-page Vue 3 dashboard fetching KPI data from backend API, with async Excel generation queued via BullMQ/Redis and processed by background workers. Reports stored in S3 with presigned URLs for download.

**Tech Stack:** Vue 3 (Composition API), TypeScript, Pinia, Chart.js, Hono, PostgreSQL, BullMQ, Redis, ExcelJS, AWS S3

---

## Task 1: Database Schema - Create Report Tables

**Files:**
- Create: `backend/src/migrations/050_create_report_jobs_table.sql`
- Create: `backend/src/migrations/051_create_scheduled_reports_table.sql`

- [ ] **Step 1: Create migration for report_jobs table**

Create file: `backend/src/migrations/050_create_report_jobs_table.sql`

```sql
-- Migration: 050_create_report_jobs_table.sql
-- Description: Table to track BullMQ report generation jobs

CREATE TABLE IF NOT EXISTS report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL UNIQUE, -- BullMQ job ID
  report_type TEXT NOT NULL CHECK (report_type IN (
    'agent-performance',
    'client-acquisition',
    'visit-completion',
    'loan-releases',
    'geographic-coverage'
  )),
  params JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  download_url TEXT,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX idx_report_jobs_created_by ON report_jobs(created_by, created_at DESC);
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
CREATE INDEX idx_report_jobs_job_id ON report_jobs(job_id);

-- Comment
COMMENT ON TABLE report_jobs IS 'Tracks Excel report generation jobs queued via BullMQ';
```

- [ ] **Step 2: Create migration for scheduled_reports table**

Create file: `backend/src/migrations/051_create_scheduled_reports_table.sql`

```sql
-- Migration: 051_create_scheduled_reports_table.sql
-- Description: Table to manage recurring report schedules

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'agent-performance',
    'client-acquisition',
    'visit-completion',
    'loan-releases',
    'geographic-coverage'
  )),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  config JSONB NOT NULL DEFAULT '{}',
  recipients TEXT[] NOT NULL,
  active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE active = true;
CREATE INDEX idx_scheduled_reports_created_by ON scheduled_reports(created_by);
CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(active, next_run_at);

-- Comment
COMMENT ON TABLE scheduled_reports IS 'Manages recurring Excel report schedules with email delivery';
```

- [ ] **Step 3: Run migrations**

Run: `cd backend && npx tsx src/scripts/run-migration.ts src/migrations/050_create_report_jobs_table.sql`

Expected: `Migration 050 completed successfully`

Run: `cd backend && npx tsx src/scripts/run-migration.ts src/migrations/051_create_scheduled_reports_table.sql`

Expected: `Migration 051 completed successfully`

- [ ] **Step 4: Verify tables created**

Run: `psql $DATABASE_URL -c "\d report_jobs"`

Expected output shows table structure with all columns

Run: `psql $DATABASE_URL -c "\d scheduled_reports"`

Expected output shows table structure with all columns

- [ ] **Step 5: Commit**

```bash
git add backend/src/migrations/050_*.sql backend/src/migrations/051_*.sql
git commit -m "feat: add report_jobs and scheduled_reports tables for Excel generation"
```

---

## Task 2: Backend - Install Dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install BullMQ dependencies**

Run: `cd backend && pnpm add bullmq ioredis`

Expected: Package installed with versions in package.json

- [ ] **Step 2: Install ExcelJS**

Run: `cd backend && pnpm add exceljs`

Expected: Package installed

- [ ] **Step 3: Install AWS SDK v3 for S3**

Run: `cd backend && pnpm add @aws-sdk/client-s3`

Expected: Package installed

- [ ] **Step 4: Install Nodemailer for email**

Run: `cd backend && pnpm add nodemailer`

Expected: Package installed

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "feat: install BullMQ, ExcelJS, AWS SDK, and Nodemailer dependencies"
```

---

## Task 3: Backend - Create BullMQ Queue Configuration

**Files:**
- Create: `backend/src/queues/reportQueue.ts`
- Create: `backend/src/types/queues.ts`

- [ ] **Step 1: Create queue types**

Create file: `backend/src/types/queues.ts`

```typescript
export type ReportType =
  | 'agent-performance'
  | 'client-acquisition'
  | 'visit-completion'
  | 'loan-releases'
  | 'geographic-coverage'

export interface ReportParams {
  startDate: string
  endDate: string
  area?: string
  agentId?: string
  municipality?: string
}

export interface ReportJobData {
  type: ReportType
  params: ReportParams
  userId: string
  mode: 'quick' | 'custom' | 'scheduled'
  columns?: string[]
  sheets?: string[]
}

export interface ReportJobResult {
  success: boolean
  downloadUrl?: string
  error?: string
}
```

- [ ] **Step 2: Create BullMQ queue**

Create file: `backend/src/queues/reportQueue.ts`

```typescript
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import type { ReportType, ReportParams, ReportJobData } from '../types/queues.js'

// Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3
})

// Create report generation queue
export const reportQueue = new Queue<ReportJobData>('report-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // 7 days
      count: 1000
    },
    removeOnFail: {
      age: 30 * 24 * 3600 // 30 days
    }
  }
})

// Enqueue quick report
export async function enqueueQuickReport(
  type: ReportType,
  params: ReportParams,
  userId: string
): Promise<string> {
  const job = await reportQueue.add('generate-report', {
    type,
    params,
    userId,
    mode: 'quick'
  }, {
    jobId: crypto.randomUUID(),
    priority: 5
  })

  return job.id!
}

// Enqueue custom report
export async function enqueueCustomReport(
  type: ReportType,
  params: ReportParams,
  userId: string,
  options: { columns?: string[], sheets?: string[] }
): Promise<string> {
  const job = await reportQueue.add('generate-report', {
    type,
    params,
    userId,
    mode: 'custom',
    columns: options.columns,
    sheets: options.sheets
  }, {
    jobId: crypto.randomUUID(),
    priority: 3
  })

  return job.id!
}

// Enqueue scheduled report
export async function enqueueScheduledReport(
  type: ReportType,
  params: ReportParams,
  userId: string
): Promise<string> {
  const job = await reportQueue.add('generate-report', {
    type,
    params,
    userId,
    mode: 'scheduled'
  }, {
    jobId: crypto.randomUUID(),
    priority: 1
  })

  return job.id!
}

// Get job status
export async function getJobStatus(jobId: string) {
  const job = await reportQueue.getJob(jobId)

  if (!job) {
    return null
  }

  const state = await job.getState()
  const progress = job.progress

  return {
    id: job.id,
    status: state === 'completed' ? 'completed' :
           state === 'failed' ? 'failed' :
           state === 'active' ? 'processing' : 'queued',
    progress: typeof progress === 'number' ? progress : 0,
    data: job.data,
    result: await job.getValue('returnvalue'),
    failedReason: job.failedReason
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && pnpm build`

Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/queues/ backend/src/types/
git commit -m "feat: create BullMQ queue configuration for report generation"
```

---

## Task 4: Backend - Create KPI Calculation Functions

**Files:**
- Create: `backend/src/services/kpiCalculator.ts`
- Create: `backend/src/types/kpi.ts`

- [ ] **Step 1: Create KPI types**

Create file: `backend/src/types/kpi.ts`

```typescript
export interface KPIValue {
  value: number | string
  previousValue?: number
  trend: 'up' | 'down' | 'neutral'
  indicator: 'green' | 'yellow' | 'red'
  sparklineData: number[]
}

export interface KPISummary {
  newClientsWeekly: KPIValue
  visitCompletionRate: KPIValue
  loansReleasedMonthly: KPIValue
  underservedMunicipalities: KPIValue
  agentRankings: {
    top: AgentRanking[]
    bottom: AgentRanking[]
  }
}

export interface AgentRanking {
  agentId: string
  name: string
  completionRate: number
  totalClients: number
  completedTouchpoints: number
  totalTouchpoints: number
}

export interface KPIParams {
  period: 'weekly' | 'monthly'
  startDate?: string
  endDate?: string
}
```

- [ ] **Step 2: Create KPI calculator service**

Create file: `backend/src/services/kpiCalculator.ts`

```typescript
import { pool } from '../db/db.js'
import type { KPIValue, KPISummary, AgentRanking, KPIParams } from '../types/kpi.js'

export class KPICalculator {
  /**
   * Calculate all KPIs for the dashboard
   */
  async calculateKPIs(params: KPIParams): Promise<KPISummary> {
    const { startDate, endDate, period } = this.getDateRange(params)

    const [
      newClientsWeekly,
      visitCompletionRate,
      loansReleasedMonthly,
      underservedMunicipalities,
      agentRankings
    ] = await Promise.all([
      this.calculateNewClients(startDate, endDate, period),
      this.calculateVisitCompletionRate(startDate, endDate, period),
      this.calculateLoansReleased(startDate, endDate),
      this.calculateUnderservedMunicipalities(),
      this.calculateAgentRankings(startDate, endDate)
    ])

    return {
      newClientsWeekly,
      visitCompletionRate,
      loansReleasedMonthly,
      underservedMunicipalities,
      agentRankings
    }
  }

  /**
   * Calculate new clients acquired in current period vs previous
   */
  private async calculateNewClients(
    startDate: string,
    endDate: string,
    period: 'weekly' | 'monthly'
  ): Promise<KPIValue> {
    // Current period
    const currentResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE created_at BETWEEN $1 AND $2
    `, [startDate, endDate])

    const value = parseInt(currentResult.rows[0].count)

    // Previous period (same duration)
    const { previousStart, previousEnd } = this.getPreviousPeriod(startDate, endDate, period)

    const previousResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE created_at BETWEEN $1 AND $2
    `, [previousStart, previousEnd])

    const previousValue = parseInt(previousResult.rows[0].count)

    // Calculate trend
    const trend = this.calculateTrend(value, previousValue)
    const indicator = this.getTrafficLight(value, previousValue, 'newClients')
    const sparklineData = await this.getNewClientsSparkline(period, 8)

    return {
      value,
      previousValue,
      trend,
      indicator,
      sparklineData
    }
  }

  /**
   * Calculate visit completion rate
   */
  private async calculateVisitCompletionRate(
    startDate: string,
    endDate: string,
    period: 'weekly' | 'monthly'
  ): Promise<KPIValue> {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) as total
      FROM touchpoints
      WHERE date BETWEEN $1 AND $2
    `, [startDate, endDate])

    const completed = parseInt(result.rows[0].completed) || 0
    const total = parseInt(result.rows[0].total) || 0
    const rate = total > 0 ? (completed / total) * 100 : 0

    const value = `${rate.toFixed(1)}%`
    const rateValue = rate

    // Previous period
    const { previousStart, previousEnd } = this.getPreviousPeriod(startDate, endDate, period)

    const previousResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) as total
      FROM touchpoints
      WHERE date BETWEEN $1 AND $2
    `, [previousStart, previousEnd])

    const prevCompleted = parseInt(previousResult.rows[0].completed) || 0
    const prevTotal = parseInt(previousResult.rows[0].total) || 0
    const previousRateValue = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0

    const trend = this.calculateTrend(rateValue, previousRateValue)
    const indicator = this.getTrafficLight(rateValue, previousRateValue, 'completionRate')
    const sparklineData = await this.getCompletionRateSparkline(period, 8)

    return {
      value,
      previousValue: previousRateValue,
      trend,
      indicator,
      sparklineData
    }
  }

  /**
   * Calculate loans released this month
   */
  private async calculateLoansReleased(
    startDate: string,
    endDate: string
  ): Promise<KPIValue> {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE loan_released = true
        AND loan_released_at BETWEEN $1 AND $2
    `, [startDate, endDate])

    const value = parseInt(result.rows[0].count)

    // Previous month
    const date = new Date(endDate)
    const previousMonthStart = new Date(date.getFullYear(), date.getMonth() - 1, 1)
    const previousMonthEnd = new Date(date.getFullYear(), date.getMonth(), 0)

    const previousResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM clients
      WHERE loan_released = true
        AND loan_released_at BETWEEN $1 AND $2
    `, [previousMonthStart, previousMonthEnd])

    const previousValue = parseInt(previousResult.rows[0].count)

    const trend = this.calculateTrend(value, previousValue)
    const indicator = this.getTrafficLight(value, previousValue, 'loansReleased')
    const sparklineData = await this.getLoansReleasedSparkline(6)

    return {
      value,
      previousValue,
      trend,
      indicator,
      sparklineData
    }
  }

  /**
   * Calculate underserved municipalities
   */
  private async calculateUnderservedMunicipalities(): Promise<KPIValue> {
    const result = await pool.query(`
      SELECT COUNT(DISTINCT municipality) as count
      FROM (
        SELECT municipality, COUNT(*) as client_count
        FROM clients
        WHERE municipality IS NOT NULL
        GROUP BY municipality
        HAVING COUNT(*) < 10
      ) underserved
    `)

    const value = parseInt(result.rows[0].count)

    // Previous week (for comparison)
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)

    const previousResult = await pool.query(`
      SELECT COUNT(DISTINCT c.municipality) as count
      FROM (
        SELECT municipality, COUNT(*) as client_count
        FROM clients
        WHERE municipality IS NOT NULL
          AND created_at < $1
        GROUP BY municipality
        HAVING COUNT(*) < 10
      ) c
    `, [lastWeek])

    const previousValue = parseInt(previousResult.rows[0].count)

    const trend = this.calculateTrend(value, previousValue, true) // Reverse trend (lower is better)
    const indicator = value <= 5 ? 'green' : value <= 10 ? 'yellow' : 'red'
    const sparklineData = await this.getUnderservedSparkline(8)

    return {
      value,
      previousValue,
      trend,
      indicator,
      sparklineData
    }
  }

  /**
   * Calculate agent rankings
   */
  private async calculateAgentRankings(
    startDate: string,
    endDate: string
  ): Promise<{ top: AgentRanking[], bottom: AgentRanking[] }> {
    const result = await pool.query(`
      SELECT
        u.id as agent_id,
        u.first_name || ' ' || u.last_name as name,
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT t.id) as total_touchpoints,
        COUNT(DISTINCT CASE WHEN t.status = 'Completed' THEN t.id END) as completed_touchpoints,
        ROUND(
          COUNT(DISTINCT CASE WHEN t.status = 'Completed' THEN t.id END)::numeric /
          NULLIF(COUNT(DISTINCT t.id), 0) * 100,
          2
        ) as completion_rate
      FROM users u
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN touchpoints t ON t.client_id = c.id AND t.date BETWEEN $1 AND $2
      WHERE u.role = 'caravan'
      GROUP BY u.id, u.first_name, u.last_name
      HAVING COUNT(DISTINCT t.id) > 0
      ORDER BY completion_rate DESC
    `, [startDate, endDate])

    const rankings: AgentRanking[] = result.rows.map(row => ({
      agentId: row.agent_id,
      name: row.name,
      completionRate: parseFloat(row.completion_rate),
      totalClients: parseInt(row.total_clients),
      completedTouchpoints: parseInt(row.completed_touchpoints),
      totalTouchpoints: parseInt(row.total_touchpoints)
    }))

    return {
      top: rankings.slice(0, 10),
      bottom: rankings.slice(-5).reverse()
    }
  }

  /**
   * Helper: Get date range based on params
   */
  private getDateRange(params: KPIParams): { startDate: string; endDate: string; period: 'weekly' | 'monthly' } {
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (params.startDate && params.endDate) {
      return {
        startDate: params.startDate,
        endDate: params.endDate,
        period: params.period
      }
    }

    if (params.period === 'weekly') {
      // Start of current week (Monday)
      startDate = new Date(now)
      const dayOfWeek = now.getDay()
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      startDate.setDate(diff)
      startDate.setHours(0, 0, 0, 0)
    } else {
      // Start of current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period: params.period
    }
  }

  /**
   * Helper: Get previous period for comparison
   */
  private getPreviousPeriod(
    startDate: string,
    endDate: string,
    period: 'weekly' | 'monthly'
  ): { previousStart: string; previousEnd: string } {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const duration = end.getTime() - start.getTime()

    const previousEnd = new Date(start.getTime() - 1)
    const previousStart = new Date(previousEnd.getTime() - duration)

    return {
      previousStart: previousStart.toISOString(),
      previousEnd: previousEnd.toISOString()
    }
  }

  /**
   * Helper: Calculate trend direction
   */
  private calculateTrend(
    current: number,
    previous: number,
    reverse = false
  ): 'up' | 'down' | 'neutral' {
    if (previous === 0) return 'neutral'

    const change = ((current - previous) / previous) * 100

    if (Math.abs(change) < 5) return 'neutral'

    if (reverse) {
      // Lower is better (e.g., underserved municipalities)
      return change < 0 ? 'up' : 'down'
    }

    return change > 0 ? 'up' : 'down'
  }

  /**
   * Helper: Get traffic light indicator
   */
  private getTrafficLight(
    current: number,
    previous: number,
    metricType: string
  ): 'green' | 'yellow' | 'red' {
    if (metricType === 'completionRate') {
      if (current >= 90) return 'green'
      if (current >= 70) return 'yellow'
      return 'red'
    }

    if (metricType === 'newClients' || metricType === 'loansReleased') {
      const change = previous > 0 ? ((current - previous) / previous) * 100 : 0
      if (change >= 10) return 'green'
      if (change >= 0) return 'yellow'
      return 'red'
    }

    return 'yellow'
  }

  /**
   * Helper: Get sparkline data for new clients
   */
  private async getNewClientsSparkline(period: 'weekly' | 'monthly', count: number): Promise<number[]> {
    const data: number[] = []
    const now = new Date()

    for (let i = count - 1; i >= 0; i--) {
      const endDate = new Date(now)
      const startDate = new Date(now)

      if (period === 'weekly') {
        startDate.setDate(now.getDate() - (i * 7) - 6)
        endDate.setDate(now.getDate() - (i * 7))
      } else {
        startDate.setMonth(now.getMonth() - (i + 1))
        endDate.setMonth(now.getMonth() - i)
        endDate.setDate(0)
      }

      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM clients
        WHERE created_at BETWEEN $1 AND $2
      `, [startDate.toISOString(), endDate.toISOString()])

      data.push(parseInt(result.rows[0].count))
    }

    return data
  }

  /**
   * Helper: Get sparkline data for completion rate
   */
  private async getCompletionRateSparkline(period: 'weekly' | 'monthly', count: number): Promise<number[]> {
    const data: number[] = []
    const now = new Date()

    for (let i = count - 1; i >= 0; i--) {
      const endDate = new Date(now)
      const startDate = new Date(now)

      if (period === 'weekly') {
        startDate.setDate(now.getDate() - (i * 7) - 6)
        endDate.setDate(now.getDate() - (i * 7))
      } else {
        startDate.setMonth(now.getMonth() - (i + 1))
        endDate.setMonth(now.getMonth() - i)
        endDate.setDate(0)
      }

      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Completed') as completed,
          COUNT(*) as total
        FROM touchpoints
        WHERE date BETWEEN $1 AND $2
      `, [startDate.toISOString(), endDate.toISOString()])

      const completed = parseInt(result.rows[0].completed) || 0
      const total = parseInt(result.rows[0].total) || 0
      const rate = total > 0 ? (completed / total) * 100 : 0

      data.push(parseFloat(rate.toFixed(1)))
    }

    return data
  }

  /**
   * Helper: Get sparkline data for loans released
   */
  private async getLoansReleasedSparkline(count: number): Promise<number[]> {
    const data: number[] = []
    const now = new Date()

    for (let i = count - 1; i >= 0; i--) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - (i + 1), 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() - i, 0)

      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM clients
        WHERE loan_released = true
          AND DATE_TRUNC('month', loan_released_at) = DATE_TRUNC('month', $1::timestamp)
      `, [endDate])

      data.push(parseInt(result.rows[0].count))
    }

    return data
  }

  /**
   * Helper: Get sparkline data for underserved municipalities
   */
  private async getUnderservedSparkline(count: number): Promise<number[]> {
    const data: number[] = []
    const now = new Date()

    for (let i = count - 1; i >= 0; i--) {
      const weekEnd = new Date(now)
      weekEnd.setDate(now.getDate() - (i * 7))
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekEnd.getDate() - 7)

      const result = await pool.query(`
        SELECT COUNT(DISTINCT municipality) as count
        FROM (
          SELECT municipality, COUNT(*) as client_count
          FROM clients
          WHERE municipality IS NOT NULL
            AND created_at < $1
          GROUP BY municipality
          HAVING COUNT(*) < 10
        ) underserved
      `, [weekEnd])

      data.push(parseInt(result.rows[0].count))
    }

    return data
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && pnpm build`

Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/kpiCalculator.ts backend/src/types/kpi.ts
git commit -m "feat: create KPI calculator service for dashboard metrics"
```

---

## Task 5: Backend - Create Dashboard API Routes

**Files:**
- Create: `backend/src/routes/dashboard.ts`

- [ ] **Step 1: Create dashboard routes**

Create file: `backend/src/routes/dashboard.ts`

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { pool } from '../db/db.js'
import { KPICalculator } from '../services/kpiCalculator.js'
import type { KPIParams } from '../types/kpi.js'
import { logger } from '../utils/logger.js'

const dashboard = new Hono()
const kpiCalculator = new KPICalculator()

/**
 * GET /api/dashboard/kpis
 * Fetch all KPI data for executive dashboard
 */
dashboard.get('/kpis', authMiddleware, async (c) => {
  const user = c.get('user')

  try {
    // Parse query params
    const period = (c.req.query('period') || 'weekly') as 'weekly' | 'monthly'
    const startDate = c.req.query('startDate') || undefined
    const endDate = c.req.query('endDate') || undefined

    const params: KPIParams = {
      period,
      startDate,
      endDate
    }

    // Calculate KPIs
    const kpis = await kpiCalculator.calculateKPIs(params)

    return c.json({
      success: true,
      data: kpis
    })

  } catch (error) {
    logger.error('dashboard/kpis', 'Failed to fetch KPIs', {
      error: error.message,
      userId: user.sub
    })

    return c.json({
      success: false,
      message: 'Failed to fetch dashboard data'
    }, 500)
  }
})

/**
 * GET /api/dashboard/agent-rankings
 * Fetch detailed agent rankings for drill-down
 */
dashboard.get('/agent-rankings', authMiddleware, async (c) => {
  const user = c.get('user')

  try {
    const startDate = c.req.query('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = c.req.query('endDate') || new Date().toISOString()

    const result = await pool.query(`
      SELECT
        u.id as agent_id,
        u.first_name || ' ' || u.last_name as name,
        u.email,
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT t.id) as total_touchpoints,
        COUNT(DISTINCT CASE WHEN t.status = 'Completed' THEN t.id END) as completed_touchpoints,
        COUNT(DISTINCT CASE WHEN c.loan_released THEN c.id END) as loans_released,
        ROUND(
          COUNT(DISTINCT CASE WHEN t.status = 'Completed' THEN t.id END)::numeric /
          NULLIF(COUNT(DISTINCT t.id), 0) * 100,
          2
        ) as completion_rate
      FROM users u
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN touchpoints t ON t.client_id = c.id AND t.date BETWEEN $1 AND $2
      WHERE u.role = 'caravan'
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY completion_rate DESC
    `, [startDate, endDate])

    return c.json({
      success: true,
      data: result.rows
    })

  } catch (error) {
    logger.error('dashboard/agent-rankings', 'Failed to fetch agent rankings', {
      error: error.message,
      userId: user.sub
    })

    return c.json({
      success: false,
      message: 'Failed to fetch agent rankings'
    }, 500)
  }
})

/**
 * GET /api/dashboard/underserved-areas
 * Fetch detailed list of underserved municipalities
 */
dashboard.get('/underserved-areas', authMiddleware, async (c) => {
  const user = c.get('user')

  try {
    const result = await pool.query(`
      SELECT
        municipality,
        COUNT(*) as client_count,
        province,
        psgc.region
      FROM clients
      WHERE municipality IS NOT NULL
      GROUP BY municipality, province, psgc.region
      HAVING COUNT(*) < 10
      ORDER BY client_count ASC
    `)

    return c.json({
      success: true,
      data: result.rows
    })

  } catch (error) {
    logger.error('dashboard/underserved-areas', 'Failed to fetch underserved areas', {
      error: error.message,
      userId: user.sub
    })

    return c.json({
      success: false,
      message: 'Failed to fetch underserved areas'
    }, 500)
  }
})

export default dashboard
```

- [ ] **Step 2: Register dashboard routes in main app**

Modify file: `backend/src/index.ts`

Find the route registration section and add:

```typescript
import dashboard from './routes/dashboard.js'

// Add after other routes
app.route('/api/dashboard', dashboard)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && pnpm build`

Expected: No TypeScript errors

- [ ] **Step 4: Test API endpoint manually**

Run: `curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/dashboard/kpis?period=weekly`

Expected: JSON response with KPI data

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/dashboard.ts backend/src/index.ts
git commit -m "feat: create dashboard API endpoints for KPI data"
```

---

## Task 6: Frontend - Install Dependencies

**Files:**
- Modify: `imu-web-vue/package.json`

- [ ] **Step 1: Install Chart.js for sparklines**

Run: `cd imu-web-vue && pnpm add chart.js`

Expected: Package installed

- [ ] **Step 2: Install Vue Chart.js wrapper**

Run: `cd imu-web-vue && pnpm add vue-chartjs`

Expected: Package installed

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/package.json imu-web-vue/pnpm-lock.yaml
git commit -m "feat: install Chart.js and vue-chartjs for sparklines"
```

---

## Task 7: Frontend - Create Dashboard Types

**Files:**
- Create: `imu-web-vue/src/views/reports/types.ts`

- [ ] **Step 1: Create TypeScript types for dashboard**

Create file: `imu-web-vue/src/views/reports/types.ts`

```typescript
export type ReportType =
  | 'agent-performance'
  | 'client-acquisition'
  | 'visit-completion'
  | 'loan-releases'
  | 'geographic-coverage'

export type Period = 'weekly' | 'monthly'

export interface KPIValue {
  value: number | string
  previousValue?: number
  trend: 'up' | 'down' | 'neutral'
  indicator: 'green' | 'yellow' | 'red'
  sparklineData: number[]
}

export interface KPISummary {
  newClientsWeekly: KPIValue
  visitCompletionRate: KPIValue
  loansReleasedMonthly: KPIValue
  underservedMunicipalities: KPIValue
  agentRankings: {
    top: AgentRanking[]
    bottom: AgentRanking[]
  }
}

export interface AgentRanking {
  agent_id: string
  name: string
  completion_rate: number
  total_clients: number
  completed_touchpoints: number
  total_touchpoints: number
}

export interface UnderservedArea {
  municipality: string
  client_count: number
  province: string
  region: string
}

export interface ReportJob {
  id: string
  type: ReportType
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  downloadUrl?: string
  error?: string
  createdAt: Date
  completedAt?: Date
}

export interface ReportParams {
  startDate: string
  endDate: string
  area?: string
  agentId?: string
  municipality?: string
}

export interface ScheduledReport {
  id: string
  name: string
  reportType: ReportType
  frequency: 'daily' | 'weekly' | 'monthly'
  recipients: string[]
  active: boolean
  nextRunAt: Date
  lastRunAt?: Date
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/types.ts
git commit -m "feat: create TypeScript types for dashboard and reports"
```

---

## Task 8: Frontend - Create KPI Card Component

**Files:**
- Create: `imu-web-vue/src/views/reports/components/KPICard.vue`

- [ ] **Step 1: Create KPICard component**

Create file: `imu-web-vue/src/views/reports/components/KPICard.vue`

```vue
<template>
  <div class="kpi-card" :class="`indicator-${indicator}`" @click="handleClick">
    <!-- Header -->
    <div class="kpi-header">
      <h3 class="kpi-title">{{ title }}</h3>
      <TrafficLight :status="indicator" size="md" />
    </div>

    <!-- Main Value -->
    <div class="kpi-value">
      <span v-if="loading" class="skeleton">---</span>
      <span v-else class="value">{{ value }}</span>
    </div>

    <!-- Trend with Sparkline -->
    <div class="kpi-trend">
      <KPISparkline
        v-if="!loading && sparklineData.length > 0"
        :data="sparklineData"
        :trend="trend"
        :width="100"
        :height="30"
      />
      <span class="trend-text" :class="trend">
        {{ trendText }} {{ periodLabel }}
      </span>
    </div>

    <!-- Comparison Badge (if previous value exists) -->
    <div v-if="previousValue !== undefined && !loading" class="kpi-comparison">
      <span class="comparison-badge" :class="trend">
        {{ formatChange(value, previousValue) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TrafficLight from './TrafficLight.vue'
import KPISparkline from './KPISparkline.vue'
import type { KPIValue } from '../types'

interface Props {
  title: string
  value: number | string
  previousValue?: number
  trend: 'up' | 'down' | 'neutral'
  indicator: 'green' | 'yellow' | 'red'
  sparklineData: number[]
  periodLabel: string
  loading?: boolean
  onClick?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  if (props.onClick) {
    props.onClick()
  }
  emit('click')
}

const trendText = computed(() => {
  switch (props.trend) {
    case 'up':
      return '↑'
    case 'down':
      return '↓'
    default:
      return '→'
  }
})

function formatChange(current: number | string, previous: number): string {
  const curr = typeof current === 'string' ? parseFloat(current) : current
  const change = ((curr - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}
</script>

<style scoped>
.kpi-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.kpi-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.kpi-card.indicator-green {
  border-left: 4px solid #22c55e;
}

.kpi-card.indicator-yellow {
  border-left: 4px solid #f59e0b;
}

.kpi-card.indicator-red {
  border-left: 4px solid #ef4444;
}

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.kpi-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  margin: 0;
}

.kpi-value {
  margin-bottom: 0.75rem;
}

.value {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
}

.skeleton {
  display: inline-block;
  width: 80px;
  height: 40px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.kpi-trend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.trend-text {
  font-size: 0.875rem;
  font-weight: 500;
}

.trend-text.up {
  color: #22c55e;
}

.trend-text.down {
  color: #ef4444;
}

.trend-text.neutral {
  color: #6b7280;
}

.kpi-comparison {
  display: flex;
  justify-content: flex-end;
}

.comparison-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.comparison-badge.up {
  background: #dcfce7;
  color: #166534;
}

.comparison-badge.down {
  background: #fee2e2;
  color: #991b1b;
}

.comparison-badge.neutral {
  background: #f3f4f6;
  color: #374151;
}

/* Responsive */
@media (max-width: 768px) {
  .value {
    font-size: 1.5rem;
  }
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd imu-web-vue && pnpm build`

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/views/reports/components/KPICard.vue
git commit -m "feat: create KPI card component with traffic light indicator"
```

---

## Task 9: Frontend - Create TrafficLight Component

**Files:**
- Create: `imu-web-vue/src/views/reports/components/TrafficLight.vue`

- [ ] **Step 1: Create TrafficLight component**

Create file: `imu-web-vue/src/views/reports/components/TrafficLight.vue`

```vue
<template>
  <div class="traffic-light" :class="`status-${status} size-${size}`">
    <div class="light"></div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  status: 'green' | 'yellow' | 'red'
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  size: 'md'
})
</script>

<style scoped>
.traffic-light {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.light {
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

/* Sizes */
.size-sm .light {
  width: 8px;
  height: 8px;
}

.size-md .light {
  width: 12px;
  height: 12px;
}

.size-lg .light {
  width: 16px;
  height: 16px;
}

/* Status colors */
.status-green .light {
  background: #22c55e;
  color: rgba(34, 197, 94, 0.5);
}

.status-yellow .light {
  background: #f59e0b;
  color: rgba(245, 158, 11, 0.5);
}

.status-red .light {
  background: #ef4444;
  color: rgba(239, 68, 68, 0.5);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/components/TrafficLight.vue
git commit -m "feat: create traffic light indicator component"
```

---

## Task 10: Frontend - Create KPISparkline Component

**Files:**
- Create: `imu-web-vue/src/views/reports/components/KPISparkline.vue`

- [ ] **Step 1: Create KPISparkline component**

Create file: `imu-web-vue/src/views/reports/components/KPISparkline.vue`

```vue
<template>
  <div class="sparkline-container">
    <canvas ref="canvasRef" :width="width" :height="height"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { Chart, ChartConfiguration, registerables } from 'chart.js/auto'

Chart.register(...registerables)

interface Props {
  data: number[]
  trend: 'up' | 'down' | 'neutral'
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 100,
  height: 30
})

const canvasRef = ref<HTMLCanvasElement>()
let chartInstance: Chart | null = null

const sparklineColor = computed(() => {
  switch (props.trend) {
    case 'up':
      return '#22c55e'
    case 'down':
      return '#ef4444'
    default:
      return '#6b7280'
  }
})

function createChart() {
  if (!canvasRef.value) return

  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy()
  }

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  const config: ChartConfiguration = {
    type: 'line',
    data: {
      labels: props.data.map((_, i) => i),
      datasets: [{
        data: props.data,
        borderColor: sparklineColor.value,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.4
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      layout: {
        padding: 0
      }
    }
  }

  chartInstance = new Chart(ctx, config)
}

onMounted(createChart)

watch(() => props.data, createChart, { deep: true })
watch(() => props.trend, createChart)

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>

<style scoped>
.sparkline-container {
  display: inline-block;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/components/KPISparkline.vue
git commit -m "feat: create sparkline chart component for KPI trends"
```

---

## Task 11: Frontend - Create useKPICalculations Composable

**Files:**
- Create: `imu-web-vue/src/views/reports/composables/useKPICalculations.ts`

- [ ] **Step 1: Create useKPICalculations composable**

Create file: `imu-web-vue/src/views/reports/composables/useKPICalculations.ts`

```typescript
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { KPISummary, Period } from '../types'

export function useKPICalculations() {
  const authStore = useAuthStore()

  const kpis = ref<KPISummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const period = ref<Period>('weekly')

  const fetchKPIs = async (selectedPeriod?: Period) => {
    const token = authStore.token
    if (!token) {
      error.value = 'Not authenticated'
      return
    }

    loading.value = true
    error.value = null

    try {
      const queryParams = new URLSearchParams({
        period: selectedPeriod || period.value
      })

      const response = await fetch(`/api/dashboard/kpis?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch KPIs')
      }

      const result = await response.json()

      if (result.success) {
        kpis.value = result.data
      } else {
        throw new Error(result.message || 'Failed to fetch KPIs')
      }

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      console.error('[useKPICalculations] Failed to fetch KPIs:', err)
    } finally {
      loading.value = false
    }
  }

  const setPeriod = (newPeriod: Period) => {
    period.value = newPeriod
    fetchKPIs(newPeriod)
  }

  // Computed properties for each KPI
  const newClientsWeekly = computed(() => kpis.value?.newClientsWeekly || null)
  const visitCompletionRate = computed(() => kpis.value?.visitCompletionRate || null)
  const loansReleasedMonthly = computed(() => kpis.value?.loansReleasedMonthly || null)
  const underservedMunicipalities = computed(() => kpis.value?.underservedMunicipalities || null)
  const agentRankings = computed(() => kpis.value?.agentRankings || null)

  // Loading states for individual KPIs
  const isLoading = computed(() => loading.value)

  return {
    kpis,
    newClientsWeekly,
    visitCompletionRate,
    loansReleasedMonthly,
    underservedMunicipalities,
    agentRankings,
    loading,
    isLoading,
    error,
    period,
    fetchKPIs,
    setPeriod
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/composables/useKPICalculations.ts
git commit -m "feat: create useKPICalculations composable for KPI data fetching"
```

---

## Task 12: Frontend - Create ExecutiveDashboard View

**Files:**
- Create: `imu-web-vue/src/views/reports/ExecutiveDashboard.vue`

- [ ] **Step 1: Create ExecutiveDashboard view**

Create file: `imu-web-vue/src/views/reports/ExecutiveDashboard.vue`

```vue
<template>
  <div class="executive-dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <h1>Executive Dashboard</h1>

      <div class="dashboard-controls">
        <!-- Period Toggle -->
        <div class="period-toggle">
          <button
            :class="{ active: period === 'weekly' }"
            @click="setPeriod('weekly')"
          >
            Weekly
          </button>
          <button
            :class="{ active: period === 'monthly' }"
            @click="setPeriod('monthly')"
          >
            Monthly
          </button>
        </div>

        <!-- Refresh Button -->
        <button class="btn-refresh" @click="fetchKPIs" :disabled="loading">
          <RefreshCw :class="{ spinning: loading }" />
        </button>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error && !loading" class="error-state">
      <AlertCircle />
      <p>{{ error }}</p>
      <button @click="fetchKPIs">Retry</button>
    </div>

    <!-- KPI Cards Grid -->
    <div v-if="!error" class="kpi-grid">
      <!-- New Clients (Weekly) -->
      <KPICard
        v-if="newClientsWeekly"
        title="New Clients"
        :value="newClientsWeekly.value"
        :previous-value="newClientsWeekly.previousValue"
        :trend="newClientsWeekly.trend"
        :indicator="newClientsWeekly.indicator"
        :sparkline-data="newClientsWeekly.sparklineData"
        period-label="vs last period"
        :loading="loading"
      />

      <!-- Visit Completion Rate -->
      <KPICard
        v-if="visitCompletionRate"
        title="Visit Completion Rate"
        :value="visitCompletionRate.value"
        :previous-value="visitCompletionRate.previousValue"
        :trend="visitCompletionRate.trend"
        :indicator="visitCompletionRate.indicator"
        :sparkline-data="visitCompletionRate.sparklineData"
        period-label="vs last period"
        :loading="loading"
      />

      <!-- Loans Released (Monthly) -->
      <KPICard
        v-if="loansReleasedMonthly"
        title="Loans Released"
        :value="loansReleasedMonthly.value"
        :previous-value="loansReleasedMonthly.previousValue"
        :trend="loansReleasedMonthly.trend"
        :indicator="loansReleasedMonthly.indicator"
        :sparkline-data="loansReleasedMonthly.sparklineData"
        period-label="vs last month"
        :loading="loading"
      />

      <!-- Underserved Municipalities -->
      <KPICard
        v-if="underservedMunicipalities"
        title="Underserved Municipalities"
        :value="underservedMunicipalities.value"
        :previous-value="underservedMunicipalities.previousValue"
        :trend="underservedMunicipalities.trend"
        :indicator="underservedMunicipalities.indicator"
        :sparkline-data="underservedMunicipalities.sparklineData"
        period-label="municipalities with <10 clients"
        :loading="loading"
        @click="showUnderservedAreasModal = true"
      />

      <!-- Agent Rankings Summary -->
      <div class="kpi-card rankings-summary" @click="showAgentRankingsModal = true">
        <div class="kpi-header">
          <h3 class="kpi-title">Agent Rankings</h3>
          <TrendingUp />
        </div>
        <div class="rankings-preview">
          <div v-if="agentRankings?.top?.[0]" class="top-agent">
            <Trophy />
            <span>{{ agentRankings.top[0].name }}</span>
            <span class="rate">{{ agentRankings.top[0].completion_rate }}%</span>
          </div>
        </div>
        <p class="view-details">View all rankings →</p>
      </div>
    </div>

    <!-- Modals -->
    <AgentRankingsModal
      v-if="showAgentRankingsModal"
      :rankings="agentRankings"
      @close="showAgentRankingsModal = false"
    />

    <UnderservedAreasModal
      v-if="showUnderservedAreasModal"
      @close="showUnderservedAreasModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RefreshCw, AlertCircle, TrendingUp, Trophy } from 'lucide-vue-next'
import KPICard from './components/KPICard.vue'
import AgentRankingsModal from './components/AgentRankingsModal.vue'
import UnderservedAreasModal from './components/UnderservedAreasModal.vue'
import { useKPICalculations } from './composables/useKPICalculations'

const {
  newClientsWeekly,
  visitCompletionRate,
  loansReleasedMonthly,
  underservedMunicipalities,
  agentRankings,
  loading,
  error,
  period,
  fetchKPIs,
  setPeriod
} = useKPICalculations()

const showAgentRankingsModal = ref(false)
const showUnderservedAreasModal = ref(false)

onMounted(() => {
  fetchKPIs()
})
</script>

<style scoped>
.executive-dashboard {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.dashboard-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.dashboard-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.period-toggle {
  display: flex;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 4px;
}

.period-toggle button {
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.period-toggle button.active {
  background: white;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.btn-refresh {
  padding: 0.5rem;
  border: none;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem;
  background: #fef2f2;
  border-radius: 12px;
  color: #991b1b;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (min-width: 1024px) {
  .kpi-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

.rankings-summary {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
}

.rankings-preview {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.top-agent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #111827;
}

.rate {
  margin-left: auto;
  color: #22c55e;
}

.view-details {
  margin: 0;
  font-size: 0.875rem;
  color: #6b7280;
  text-align: center;
}

@media (max-width: 768px) {
  .executive-dashboard {
    padding: 1rem;
  }

  .dashboard-header {
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/ExecutiveDashboard.vue
git commit -m "feat: create executive dashboard view with KPI cards grid"
```

---

## Task 13: Frontend - Create AgentRankingsModal Component

**Files:**
- Create: `imu-web-vue/src/views/reports/components/AgentRankingsModal.vue`

- [ ] **Step 1: Create AgentRankingsModal component**

Create file: `imu-web-vue/src/views/reports/components/AgentRankingsModal.vue`

```vue
<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Agent Performance Rankings</h2>
          <button class="btn-close" @click="emit('close')">
            <X />
          </button>
        </div>

        <div class="modal-body">
          <!-- Top Performers -->
          <section class="ranking-section">
            <h3>
              <Trophy />
              Top 10 Performers
            </h3>
            <table class="ranking-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent</th>
                  <th>Completion Rate</th>
                  <th>Clients</th>
                  <th>Touchpoints</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(agent, index) in rankings?.top" :key="agent.agent_id">
                  <td>{{ index + 1 }}</td>
                  <td>{{ agent.name }}</td>
                  <td>
                    <span class="rate-badge excellent">{{ agent.completion_rate }}%</span>
                  </td>
                  <td>{{ agent.total_clients }}</td>
                  <td>{{ agent.completed_touchpoints }}/{{ agent.total_touchpoints }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Bottom Performers -->
          <section class="ranking-section">
            <h3>
              <TrendingDown />
              Needs Improvement
            </h3>
            <table class="ranking-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent</th>
                  <th>Completion Rate</th>
                  <th>Clients</th>
                  <th>Touchpoints</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(agent, index) in rankings?.bottom" :key="agent.agent_id">
                  <td>{{ index + 1 }}</td>
                  <td>{{ agent.name }}</td>
                  <td>
                    <span
                      class="rate-badge"
                      :class="agent.completion_rate >= 70 ? 'fair' : 'poor'"
                    >
                      {{ agent.completion_rate }}%
                    </span>
                  </td>
                  <td>{{ agent.total_clients }}</td>
                  <td>{{ agent.completed_touchpoints }}/{{ agent.total_touchpoints }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" @click="generateReport">
            <Download />
            Generate Full Report
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Trophy, TrendingDown, X, Download } from 'lucide-vue-next'
import type { AgentRanking } from '../types'

interface Props {
  rankings: {
    top: AgentRanking[]
    bottom: AgentRanking[]
  } | null
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
  generateReport: []
}>()
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.btn-close {
  padding: 0.5rem;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.btn-close:hover {
  background: #f3f4f6;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.ranking-section {
  margin-bottom: 2rem;
}

.ranking-section:last-child {
  margin-bottom: 0;
}

.ranking-section h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1rem;
  font-weight: 600;
}

.ranking-table {
  width: 100%;
  border-collapse: collapse;
}

.ranking-table th {
  text-align: left;
  padding: 0.75rem;
  background: #f9fafb;
  font-weight: 600;
  font-size: 0.875rem;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
}

.ranking-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.875rem;
}

.rate-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.75rem;
}

.rate-badge.excellent {
  background: #dcfce7;
  color: #166534;
}

.rate-badge.fair {
  background: #fef3c7;
  color: #92400e;
}

.rate-badge.poor {
  background: #fee2e2;
  color: #991b1b;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: #1e40af;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #1e3a8a;
}

@media (max-width: 640px) {
  .ranking-table {
    font-size: 0.75rem;
  }

  .ranking-table th,
  .ranking-table td {
    padding: 0.5rem;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/components/AgentRankingsModal.vue
git commit -m "feat: create agent rankings modal component"
```

---

## Task 14: Frontend - Create UnderservedAreasModal Component

**Files:**
- Create: `imu-web-vue/src/views/reports/components/UnderservedAreasModal.vue`

- [ ] **Step 1: Create UnderservedAreasModal component**

Create file: `imu-web-vue/src/views/reports/components/UnderservedAreasModal.vue`

```vue
<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Underserved Municipalities</h2>
          <button class="btn-close" @click="emit('close')">
            <X />
          </button>
        </div>

        <div class="modal-body">
          <p class="modal-description">
            Municipalities with fewer than 10 assigned clients. These areas may need additional coverage.
          </p>

          <table class="areas-table">
            <thead>
              <tr>
                <th>Municipality</th>
                <th>Province</th>
                <th>Region</th>
                <th>Clients</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="area in areas" :key="area.municipality">
                <td>{{ area.municipality }}</td>
                <td>{{ area.province }}</td>
                <td>{{ area.region }}</td>
                <td>{{ area.client_count }}</td>
                <td>
                  <span
                    class="status-badge"
                    :class="area.client_count < 5 ? 'critical' : 'warning'"
                  >
                    {{ area.client_count < 5 ? 'Critical' : 'Needs Attention' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

interface UnderservedArea {
  municipality: string
  client_count: number
  province: string
  region: string
}

const authStore = useAuthStore()
const areas = ref<UnderservedArea[]>([])
const loading = ref(false)

const emit = defineEmits<{
  close: []
}>()

onMounted(async () => {
  await fetchUnderservedAreas()
})

async function fetchUnderservedAreas() {
  const token = authStore.token
  if (!token) return

  loading.value = true

  try {
    const response = await fetch('/api/dashboard/underserved-areas', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch underserved areas')
    }

    const result = await response.json()

    if (result.success) {
      areas.value = result.data
    }
  } catch (error) {
    console.error('Failed to fetch underserved areas:', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 900px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.btn-close {
  padding: 0.5rem;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.btn-close:hover {
  background: #f3f4f6;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.modal-description {
  margin-bottom: 1rem;
  color: #6b7280;
  font-size: 0.875rem;
}

.areas-table {
  width: 100%;
  border-collapse: collapse;
}

.areas-table th {
  text-align: left;
  padding: 0.75rem;
  background: #f9fafb;
  font-weight: 600;
  font-size: 0.875rem;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
}

.areas-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.875rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.75rem;
  display: inline-block;
}

.status-badge.critical {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: #f3f4f6;
  color: #374151;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/reports/components/UnderservedAreasModal.vue
git commit -m "feat: create underserved areas modal component"
```

---

## Task 15: Frontend - Update Router to Include Executive Dashboard

**Files:**
- Modify: `imu-web-vue/src/router/index.ts`

- [ ] **Step 1: Add executive dashboard route**

Modify file: `imu-web-vue/src/router/index.ts`

Find the reports routes section and add the executive dashboard route:

```typescript
{
  path: '/reports/executive',
  name: 'executive-dashboard',
  component: () => import('@/views/reports/ExecutiveDashboard.vue'),
  meta: { requiresAuth: true, title: 'Executive Dashboard' }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd imu-web-vue && pnpm build`

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/router/index.ts
git commit -m "feat: add executive dashboard route to router"
```

---

## Task 16: Frontend - Add Navigation Link to Executive Dashboard

**Files:**
- Modify: `imu-web-vue/src/components/layout/Sidebar.vue` (or equivalent navigation component)

- [ ] **Step 1: Find sidebar/navigation component**

Run: `find imu-web-vue/src -name "*Sidebar*" -o -name "*Nav*" -o -name "*Menu*"`

Expected output shows navigation component file

- [ ] **Step 2: Add executive dashboard link to navigation**

Add the navigation link (exact implementation depends on your navigation component structure):

```vue
<router-link to="/reports/executive" class="nav-link">
  <BarChart3 />
  <span>Executive Dashboard</span>
</router-link>
```

- [ ] **Step 3: Verify link appears in UI**

Run: `cd imu-web-vue && pnpm dev`

Navigate to the app and verify the "Executive Dashboard" link appears in the sidebar/navigation

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/components/layout/
git commit -m "feat: add executive dashboard link to navigation"
```

---

This completes the implementation plan for Phase 1 and 2 (Foundation + Data Integration). The plan includes:

✅ Database schema for report jobs and scheduled reports
✅ Backend dependencies (BullMQ, ExcelJS, AWS SDK, Nodemailer)
✅ BullMQ queue configuration
✅ KPI calculation service
✅ Dashboard API endpoints
✅ Frontend dependencies (Chart.js)
✅ TypeScript types
✅ KPI card components (KPICard, TrafficLight, KPISparkline)
✅ useKPICalculations composable
✅ ExecutiveDashboard view
✅ AgentRankingsModal and UnderservedAreasModal
✅ Router integration
✅ Navigation link

**Total Tasks:** 16
**Estimated Time:** 2-3 days for Phases 1-2

The remaining tasks (Phases 3-6) would cover:
- Excel generation
- BullMQ worker
- Report generation endpoints
- Download center
- Scheduled reports
- Testing and polish

Would you like me to continue with the remaining tasks for Phases 3-6, or would you prefer to start executing this plan first?
