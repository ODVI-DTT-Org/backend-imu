# IMU Admin Platform Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance IMU admin platform with touchpoints verification center, advanced search, and interactive analytics dashboard

**Architecture:** Sequential implementation of three independent feature areas. Each phase builds on existing Vue 3 + Hono backend patterns with PostgreSQL data layer.

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia, Hono backend, PostgreSQL, Chart.js for visualizations, date-fns for date handling

---

## File Structure

### Phase 1: Touchpoints Enhancements

**Backend Routes:**
- `backend/src/routes/touchpoints-analytics.ts` - Analytics aggregation endpoint
- `backend/src/routes/touchpoints-reports.ts` - Report generation endpoints

**Backend Services:**
- `backend/src/services/gps-validation.service.ts` - Haversine distance calculation

**Frontend Views:**
- `imu-web-vue/src/views/touchpoints/TouchpointsCenterView.vue` - Main container with tabs
- `imu-web-vue/src/views/touchpoints/TouchpointsListTab.vue` - Enhanced list with photos/GPS
- `imu-web-vue/src/views/touchpoints/TouchpointsAnalyticsTab.vue` - Charts and metrics
- `imu-web-vue/src/views/touchpoints/TouchpointsReportsTab.vue` - Reports interface

**Frontend Components:**
- `imu-web-vue/src/components/touchpoints/PhotoGrid.vue` - Photo verification grid
- `imu-web-vue/src/components/touchpoints/GPSBadge.vue` - Location status badge
- `imu-web-vue/src/components/touchpoints/FunnelChart.vue` - Conversion funnel visualization
- `imu-web-vue/src/components/touchpoints/ReportBuilder.vue` - Custom report configuration
- `imu-web-vue/src/components/touchpoints/PhotoModal.vue` - Full-size photo modal

**Frontend Stores:**
- Extend `imu-web-vue/src/stores/touchpoints.ts` with analytics and reports methods

**Frontend Types:**
- Extend `imu-web-vue/src/lib/types.ts` with GPS validation and analytics types

### Phase 2: Advanced Search

**Backend Routes:**
- `backend/src/routes/search.ts` - Full-text search and saved searches endpoints

**Frontend Views:**
- `imu-web-vue/src/views/search/AdvancedSearchView.vue` - Unified search interface

**Frontend Components:**
- `imu-web-vue/src/components/search/SearchFilters.vue` - Dynamic filter builder
- `imu-web-vue/src/components/search/SavedSearches.vue` - Saved search management
- `imu-web-vue/src/components/search/SearchResults.vue` - Enhanced results display

**Frontend Stores:**
- `imu-web-vue/src/stores/search.ts` - Search state management

### Phase 3: Dashboard Analytics

**Frontend Views:**
- Enhance `imu-web-vue/src/views/dashboard/DashboardView.vue`

**Frontend Components:**
- `imu-web-vue/src/components/dashboard/KPICard.vue` - Metric card with trend indicator
- `imu-web-vue/src/components/dashboard/TrendChart.vue` - Line chart with comparisons
- `imu-web-vue/src/components/dashboard/PerformanceTable.vue` - Ranked performance data

**Frontend Stores:**
- Extend `imu-web-vue/src/stores/dashboard.ts` with analytics methods

---

## PHASE 1: TOUCHPOINTS ENHANCEMENTS

### Task 1: Backend GPS Validation Service

**Files:**
- Create: `backend/src/services/gps-validation.service.ts`
- Test: `backend/test/services/gps-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/services/gps-validation.test.ts
import { describe, it, expect } from 'vitest'
import { GPSValidationService } from '../../src/services/gps-validation.service'

describe('GPSValidationService', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates in meters', () => {
      const lat1 = 14.5995
      const lng1 = 120.9842
      const lat2 = 14.6095
      const lng2 = 120.9942

      const distance = GPSValidationService.calculateDistance(lat1, lng1, lat2, lng2)

      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(2000) // Should be ~1.5km
    })

    it('should return 0 for identical coordinates', () => {
      const lat = 14.5995
      const lng = 120.9842

      const distance = GPSValidationService.calculateDistance(lat, lng, lat, lng)

      expect(distance).toBe(0)
    })
  })

  describe('getGPSStatus', () => {
    it('should return onsite for distance < 50m', () => {
      const status = GPSValidationService.getGPSStatus(49)
      expect(status).toBe('onsite')
    })

    it('should return near for distance 50-200m', () => {
      expect(GPSValidationService.getGPSStatus(50)).toBe('near')
      expect(GPSValidationService.getGPSStatus(200)).toBe('near')
      expect(GPSValidationService.getGPSStatus(150)).toBe('near')
    })

    it('should return offsite for distance > 200m', () => {
      expect(GPSValidationService.getGPSStatus(201)).toBe('offsite')
      expect(GPSValidationService.getGPSStatus(5000)).toBe('offsite')
    })
  })

  describe('validateTouchpointLocation', () => {
    it('should return complete validation response', async () => {
      const touchpoint = {
        time_in_gps_lat: 14.5995,
        time_in_gps_lng: 120.9842,
        time_in_gps_address: 'Test Address'
      }
      const client = {
        latitude: 14.6095,
        longitude: 120.9942
      }

      const result = await GPSValidationService.validateTouchpointLocation(touchpoint, client)

      expect(result).toHaveProperty('distance')
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('clientLocation')
      expect(result).toHaveProperty('touchpointLocation')
      expect(result).toHaveProperty('mapUrl')
    })

    it('should handle missing GPS coordinates gracefully', async () => {
      const touchpoint = {}
      const client = {}

      const result = await GPSValidationService.validateTouchpointLocation(touchpoint, client)

      expect(result.status).toBe('unknown')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test gps-validation`
Expected: FAIL with "GPSValidationService not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/services/gps-validation.service.ts
export interface GPSValidationResponse {
  touchpointId?: string
  clientLocation: {
    lat: number | null
    lng: number | null
    address: string | null
  }
  touchpointLocation: {
    lat: number | null
    lng: number | null
    address: string | null
  }
  distance: number | null
  status: 'onsite' | 'near' | 'offsite' | 'unknown'
  mapUrl: string
}

export class GPSValidationService {
  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  static calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  /**
   * Get GPS status based on distance
   */
  static getGPSStatus(distance: number): 'onsite' | 'near' | 'offsite' {
    if (distance < 50) return 'onsite'
    if (distance <= 200) return 'near'
    return 'offsite'
  }

  /**
   * Validate touchpoint location against client location
   */
  static async validateTouchpointLocation(
    touchpoint: {
      time_in_gps_lat?: number | null
      time_in_gps_lng?: number | null
      time_in_gps_address?: string | null
    },
    client: {
      latitude?: number | null
      longitude?: number | null
    },
    touchpointId?: string
  ): Promise<GPSValidationResponse> {
    // Check if coordinates are available
    const hasClientCoords =
      client.latitude !== null && client.latitude !== undefined
    const hasTouchpointCoords =
      touchpoint.time_in_gps_lat !== null &&
      touchpoint.time_in_gps_lat !== undefined

    if (!hasClientCoords || !hasTouchpointCoords) {
      return {
        touchpointId,
        clientLocation: {
          lat: client.latitude ?? null,
          lng: client.longitude ?? null,
          address: null
        },
        touchpointLocation: {
          lat: touchpoint.time_in_gps_lat ?? null,
          lng: touchpoint.time_in_gps_lng ?? null,
          address: touchpoint.time_in_gps_address ?? null
        },
        distance: null,
        status: 'unknown',
        mapUrl: ''
      }
    }

    const distance = this.calculateDistance(
      client.latitude!,
      client.longitude!,
      touchpoint.time_in_gps_lat!,
      touchpoint.time_in_gps_lng!
    )

    const status = this.getGPSStatus(distance)

    // Create Google Maps URL
    const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${client.latitude},${client.longitude}&destination=${touchpoint.time_in_gps_lat},${touchpoint.time_in_gps_lng}`

    return {
      touchpointId,
      clientLocation: {
        lat: client.latitude!,
        lng: client.longitude!,
        address: null
      },
      touchpointLocation: {
        lat: touchpoint.time_in_gps_lat!,
        lng: touchpoint.time_in_gps_lng!,
        address: touchpoint.time_in_gps_address ?? null
      },
      distance,
      status,
      mapUrl
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test gps-validation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/gps-validation.service.ts backend/test/services/gps-validation.test.ts
git commit -m "feat(touchpoints): add GPS validation service with Haversine distance calculation"
```

---

### Task 2: Backend Analytics Endpoint

**Files:**
- Create: `backend/src/routes/touchpoints-analytics.ts`
- Modify: `backend/src/index.ts:356` - Register new route

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/routes/touchpoints-analytics.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { touchpointsAnalyticsRouter } from '../../src/routes/touchpoints-analytics'
import { pool } from '../../src/db'

describe('Touchpoints Analytics API', () => {
  const app = new Hono()
  app.route('/api/touchpoints/analytics', touchpointsAnalyticsRouter)

  beforeAll(async () => {
    // Setup test data
    await pool.query(`
      INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, status, created_at)
      VALUES
        ('test-client-1', 'test-user-1', 1, 'Visit', 'Completed', NOW()),
        ('test-client-1', 'test-user-1', 2, 'Call', 'Interested', NOW() - INTERVAL '1 day'),
        ('test-client-2', 'test-user-2', 1, 'Visit', 'Completed', NOW())
    `)
  })

  afterAll(async () => {
    // Cleanup test data
    await pool.query("DELETE FROM touchpoints WHERE client_id LIKE 'test-client-%'")
  })

  it('should return aggregated analytics data', async () => {
    const response = await app.request('/api/touchpoints/analytics', {
      method: 'GET',
      query: {
        startDate: '2024-01-01',
        endDate: '2025-12-31'
      }
    })

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('summary')
    expect(data).toHaveProperty('funnel')
    expect(data).toHaveProperty('trends')
    expect(data).toHaveProperty('caravanPerformance')
    expect(data).toHaveProperty('statusDistribution')
  })

  it('should filter by caravan IDs', async () => {
    const response = await app.request('/api/touchpoints/analytics', {
      method: 'GET',
      query: {
        startDate: '2024-01-01',
        endDate: '2025-12-31',
        caravanIds: 'test-user-1'
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.caravanPerformance).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test touchpoints-analytics`
Expected: FAIL with "touchpointsAnalyticsRouter not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/routes/touchpoints-analytics.ts
import { Hono } from 'hono'
import { pool } from '../db'

export const touchpointsAnalyticsRouter = new Hono()

interface AnalyticsQuery {
  startDate?: string
  endDate?: string
  caravanIds?: string
  clientTypes?: string
  touchpointTypes?: string
  status?: string
  gpsStatus?: string
}

touchpointsAnalyticsRouter.get('/', async (c) => {
  const query = c.req.query() as AnalyticsQuery

  // Build WHERE clause
  const conditions: string[] = []
  const params: any[] = []

  if (query.startDate) {
    conditions.push('t.created_at >= $' + (params.length + 1))
    params.push(query.startDate)
  }

  if (query.endDate) {
    conditions.push('t.created_at <= $' + (params.length + 1))
    params.push(query.endDate)
  }

  if (query.caravanIds) {
    const caravanList = query.caravanIds.split(',')
    conditions.push(`t.user_id = ANY($${params.length + 1})`)
    params.push(caravanList)
  }

  if (query.clientTypes) {
    const typeList = query.clientTypes.split(',')
    conditions.push(`c.client_type = ANY($${params.length + 1})`)
    params.push(typeList)
  }

  if (query.touchpointTypes) {
    const typeList = query.touchpointTypes.split(',')
    conditions.push(`t.type = ANY($${params.length + 1})`)
    params.push(typeList)
  }

  if (query.status) {
    const statusList = query.status.split(',')
    conditions.push(`t.status = ANY($${params.length + 1})`)
    params.push(statusList)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  try {
    // Get summary statistics
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed,
        COUNT(*) FILTER (WHERE t.status IN ('Interested', 'Undecided', 'Completed')) as converted
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      ${whereClause}
    `, params)

    const summary = summaryResult.rows[0]
    const conversionRate = summary.total > 0
      ? (summary.converted / summary.total) * 100
      : 0

    // Get funnel data
    const funnelResult = await pool.query(`
      SELECT
        t.touchpoint_number,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status IN ('Interested', 'Undecided', 'Completed')) as converted
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      ${whereClause}
      GROUP BY t.touchpoint_number
      ORDER BY t.touchpoint_number
    `, params)

    const funnel: Record<string, any> = {}
    funnelResult.rows.forEach(row => {
      funnel[`touchpoint${row.touchpoint_number}`] = {
        total: parseInt(row.total),
        converted: parseInt(row.converted),
        rate: row.total > 0 ? (row.converted / row.total) * 100 : 0
      }
    })

    // Get daily trends
    const trendsResult = await pool.query(`
      SELECT
        DATE(t.created_at) as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      ${whereClause}
      GROUP BY DATE(t.created_at)
      ORDER BY DATE(t.created_at)
    `, params)

    const trends = trendsResult.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count),
      completed: parseInt(row.completed)
    }))

    // Get caravan performance
    const caravanPerformanceResult = await pool.query(`
      SELECT
        t.user_id as caravan_id,
        u.first_name || ' ' || u.last_name as caravan_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'Completed') as completed,
        AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))/60) as avg_time
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      ${whereClause}
      GROUP BY t.user_id, u.first_name, u.last_name
      ORDER BY completed DESC
    `, params)

    const caravanPerformance = caravanPerformanceResult.rows.map(row => ({
      caravanId: row.caravan_id,
      caravanName: row.caravan_name,
      total: parseInt(row.total),
      completed: parseInt(row.completed),
      rate: row.total > 0 ? (row.completed / row.total) * 100 : 0,
      avgTime: Math.round(row.avg_time || 0)
    }))

    // Get status distribution
    const statusDistributionResult = await pool.query(`
      SELECT
        t.status,
        COUNT(*) as count
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      ${whereClause}
      GROUP BY t.status
      ORDER BY count DESC
    `, params)

    const totalStatuses = statusDistributionResult.rows.reduce(
      (sum, row) => sum + parseInt(row.count),
      0
    )

    const statusDistribution = statusDistributionResult.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      percentage: totalStatuses > 0 ? (row.count / totalStatuses) * 100 : 0
    }))

    return c.json({
      summary: {
        total: parseInt(summary.total),
        completed: parseInt(summary.completed),
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgTime: 0 // Will calculate from more detailed query
      },
      funnel,
      trends,
      caravanPerformance,
      statusDistribution
    })
  } catch (error) {
    console.error('Analytics query error:', error)
    return c.json({ error: 'Failed to fetch analytics' }, 500)
  }
})
```

- [ ] **Step 4: Register route in backend/src/index.ts**

Find the line around 356 where routes are registered and add:

```typescript
import { touchpointsAnalyticsRouter } from './routes/touchpoints-analytics'

app.route('/api/touchpoints/analytics', touchpointsAnalyticsRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm test touchpoints-analytics`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/touchpoints-analytics.ts backend/test/routes/touchpoints-analytics.test.ts backend/src/index.ts
git commit -m "feat(touchpoints): add analytics aggregation endpoint with summary, funnel, trends, and performance metrics"
```

---

### Task 3: Backend GPS Validation Endpoint

**Files:**
- Modify: `backend/src/routes/touchpoints.ts:200` - Add GPS validation endpoint

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/routes/touchpoints-gps.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '../../src/db'

describe('Touchpoints GPS Validation API', () => {
  let testClientId: string
  let testTouchpointId: string
  let testUserId: string

  beforeAll(async () => {
    // Create test data
    const userResult = await pool.query(
      "INSERT INTO users (email, first_name, last_name, role) VALUES ($1, $2, $3, $4) RETURNING id",
      ['gps-test@example.com', 'Test', 'User', 'field_agent']
    )
    testUserId = userResult.rows[0].id

    const clientResult = await pool.query(
      "INSERT INTO clients (first_name, last_name, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id",
      ['GPS', 'Client', 14.5995, 120.9842]
    )
    testClientId = clientResult.rows[0].id

    const touchpointResult = await pool.query(
      `INSERT INTO touchpoints (client_id, user_id, touchpoint_number, type, status, time_in_gps_lat, time_in_gps_lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [testClientId, testUserId, 1, 'Visit', 'Completed', 14.6095, 120.9942]
    )
    testTouchpointId = touchpointResult.rows[0].id
  })

  afterAll(async () => {
    await pool.query("DELETE FROM touchpoints WHERE id = $1", [testTouchpointId])
    await pool.query("DELETE FROM clients WHERE id = $1", [testClientId])
    await pool.query("DELETE FROM users WHERE id = $1", [testUserId])
  })

  it('should validate touchpoint location and return distance', async () => {
    const response = await fetch(`http://localhost:3000/api/touchpoints/${testTouchpointId}/gps-validate`, {
      method: 'GET'
    })

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('distance')
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('clientLocation')
    expect(data).toHaveProperty('touchpointLocation')
    expect(data.distance).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test touchpoints-gps`
Expected: FAIL with 404 endpoint not found

- [ ] **Step 3: Write minimal implementation**

Add to `backend/src/routes/touchpoints.ts`:

```typescript
import { GPSValidationService } from '../services/gps-validation.service'

// GPS validation endpoint
touchpoints.get('/:id/gps-validate', async (c) => {
  const touchpointId = c.req.param('id')

  try {
    // Get touchpoint with client data
    const result = await pool.query(`
      SELECT
        t.id,
        t.time_in_gps_lat,
        t.time_in_gps_lng,
        t.time_in_gps_address,
        c.latitude as client_latitude,
        c.longitude as client_longitude
      FROM touchpoints t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.id = $1
    `, [touchpointId])

    if (result.rows.length === 0) {
      return c.json({ error: 'Touchpoint not found' }, 404)
    }

    const row = result.rows[0]

    const validation = await GPSValidationService.validateTouchpointLocation(
      {
        time_in_gps_lat: row.time_in_gps_lat,
        time_in_gps_lng: row.time_in_gps_lng,
        time_in_gps_address: row.time_in_gps_address
      },
      {
        latitude: row.client_latitude,
        longitude: row.client_longitude
      },
      touchpointId
    )

    return c.json(validation)
  } catch (error) {
    console.error('GPS validation error:', error)
    return c.json({ error: 'Failed to validate GPS location' }, 500)
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm test touchpoints-gps`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/touchpoints.ts backend/test/routes/touchpoints-gps.test.ts
git commit -m "feat(touchpoints): add GPS validation endpoint with distance calculation and status"
```

---

### Task 4: Frontend Types Extension

**Files:**
- Modify: `imu-web-vue/src/lib/types.ts:50` - Add GPS and analytics types

- [ ] **Step 1: Add TypeScript types**

```typescript
// Add to imu-web-vue/src/lib/types.ts

// GPS Validation Types
export interface GPSValidationResponse {
  touchpointId: string
  clientLocation: {
    lat: number | null
    lng: number | null
    address: string | null
  }
  touchpointLocation: {
    lat: number | null
    lng: number | null
    address: string | null
  }
  distance: number | null
  status: 'onsite' | 'near' | 'offsite' | 'unknown'
  mapUrl: string
}

// Analytics Types
export interface TouchpointAnalytics {
  summary: {
    total: number
    completed: number
    conversionRate: number
    avgTime: number
  }
  funnel: Record<string, {
    total: number
    converted: number
    rate: number
  }>
  trends: Array<{
    date: string
    count: number
    completed: number
  }>
  caravanPerformance: Array<{
    caravanId: string
    caravanName: string
    total: number
    completed: number
    rate: number
    avgTime: number
  }>
  statusDistribution: Array<{
    status: string
    count: number
    percentage: number
  }>
}

export interface AnalyticsFilters {
  startDate?: string
  endDate?: string
  caravanIds?: string[]
  clientTypes?: string[]
  touchpointTypes?: string[]
  status?: string[]
  gpsStatus?: string[]
}

// Report Types
export interface StandardReportType {
  id: 'daily-summary' | 'weekly-performance' | 'monthly-funnel'
  name: string
  description: string
}

export interface CustomReport {
  id?: string
  name: string
  filters: AnalyticsFilters
  outputType: 'table' | 'summary' | 'chart'
  createdAt?: string
}

export interface ReportFormat {
  format: 'csv' | 'pdf' | 'excel' | 'zip'
  includePhotos?: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/lib/types.ts
git commit -m "feat(touchpoints): add TypeScript types for GPS validation, analytics, and reports"
```

---

### Task 5: Frontend Touchpoints Store Extension

**Files:**
- Modify: `imu-web-vue/src/stores/touchpoints.ts:100` - Add analytics methods

- [ ] **Step 1: Add analytics methods to touchpoints store**

```typescript
// Add to imu-web-vue/src/stores/touchpoints.ts

import type { GPSValidationResponse, TouchpointAnalytics, AnalyticsFilters, CustomReport, ReportFormat } from '@/lib/types'

// Add to state
const analytics = ref<TouchpointAnalytics | null>(null)
const gpsValidation = ref<Map<string, GPSValidationResponse>>(new Map())
const customReports = ref<CustomReport[]>([])

// Add to actions
async function fetchAnalytics(filters: AnalyticsFilters = {}) {
  try {
    const params = new URLSearchParams()

    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.caravanIds?.length) params.append('caravanIds', filters.caravanIds.join(','))
    if (filters.clientTypes?.length) params.append('clientTypes', filters.clientTypes.join(','))
    if (filters.touchpointTypes?.length) params.append('touchpointTypes', filters.touchpointTypes.join(','))
    if (filters.status?.length) params.append('status', filters.status.join(','))

    const response = await apiClient.get(`/touchpoints/analytics?${params.toString()}`)
    analytics.value = response.data
    return analytics.value
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
    throw error
  }
}

async function validateGPS(touchpointId: string): Promise<GPSValidationResponse> {
  try {
    // Check cache first
    const cached = gpsValidation.value.get(touchpointId)
    if (cached) return cached

    const response = await apiClient.get(`/touchpoints/${touchpointId}/gps-validate`)
    const validation = response.data as GPSValidationResponse

    // Cache the result
    gpsValidation.value.set(touchpointId, validation)

    return validation
  } catch (error) {
    console.error('Failed to validate GPS:', error)
    throw error
  }
}

async function generateStandardReport(reportType: string, options: ReportFormat) {
  try {
    const response = await apiClient.get(`/touchpoints/reports/standard/${reportType}`, {
      params: options,
      responseType: 'blob'
    })

    // Download file
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${reportType}-${Date.now()}.${options.format}`)
    document.body.appendChild(link)
    link.click()
    link.remove()

    return true
  } catch (error) {
    console.error('Failed to generate report:', error)
    throw error
  }
}

async function saveCustomReport(report: CustomReport) {
  try {
    const response = await apiClient.post('/touchpoints/reports/custom', report)

    if (report.id) {
      const index = customReports.value.findIndex(r => r.id === report.id)
      if (index !== -1) {
        customReports.value[index] = { ...report, id: response.data.id }
      }
    } else {
      customReports.value.push({ ...report, id: response.data.id })
    }

    return response.data
  } catch (error) {
    console.error('Failed to save custom report:', error)
    throw error
  }
}

async function loadCustomReports() {
  try {
    const response = await apiClient.get('/touchpoints/reports/custom')
    customReports.value = response.data
    return customReports.value
  } catch (error) {
    console.error('Failed to load custom reports:', error)
    throw error
  }
}

async function deleteCustomReport(reportId: string) {
  try {
    await apiClient.delete(`/touchpoints/reports/custom/${reportId}`)
    customReports.value = customReports.value.filter(r => r.id !== reportId)
  } catch (error) {
    console.error('Failed to delete custom report:', error)
    throw error
  }
}

// Export new actions
return {
  // ... existing exports
  analytics,
  gpsValidation,
  customReports,
  fetchAnalytics,
  validateGPS,
  generateStandardReport,
  saveCustomReport,
  loadCustomReports,
  deleteCustomReport
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/stores/touchpoints.ts
git commit -m "feat(touchpoints): extend store with analytics, GPS validation, and reports methods"
```

---

### Task 6: GPS Badge Component

**Files:**
- Create: `imu-web-vue/src/components/touchpoints/GPSBadge.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <div
    class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
    :class="badgeClasses"
    @click="showDetails = !showDetails"
  >
    <span v-if="status === 'onsite'">✅</span>
    <span v-else-if="status === 'near'">⚠️</span>
    <span v-else-if="status === 'offsite'">❌</span>
    <span v-else>❓</span>

    <span>{{ statusText }}</span>

    <!-- Details on click -->
    <div v-if="showDetails && distance" class="absolute top-full mt-1 left-0 z-50 bg-white border rounded-lg shadow-lg p-3 text-xs w-64">
      <div class="font-medium mb-2">GPS Location Details</div>
      <div class="space-y-1">
        <div>Distance: <span class="font-medium">{{ Math.round(distance) }}m</span></div>
        <div v-if="clientLocation.lat">
          Client: {{ clientLocation.lat.toFixed(4) }}, {{ clientLocation.lng.toFixed(4) }}
        </div>
        <div v-if="touchpointLocation.lat">
          Touchpoint: {{ touchpointLocation.lat.toFixed(4) }}, {{ touchpointLocation.lng.toFixed(4) }}
        </div>
        <a v-if="mapUrl" :href="mapUrl" target="_blank" class="text-blue-600 hover:underline">
          Open in Maps →
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GPSValidationResponse } from '@/lib/types'

const props = defineProps<{
  validation: GPSValidationResponse | null
}>()

const showDetails = ref(false)

const status = computed(() => props.validation?.status || 'unknown')

const statusText = computed(() => {
  switch (status.value) {
    case 'onsite': return 'On-site'
    case 'near': return 'Near'
    case 'offsite': return 'Off-site'
    default: return 'Unknown'
  }
})

const badgeClasses = computed(() => {
  switch (status.value) {
    case 'onsite':
      return 'bg-green-100 text-green-800 cursor-pointer'
    case 'near':
      return 'bg-yellow-100 text-yellow-800 cursor-pointer'
    case 'offsite':
      return 'bg-red-100 text-red-800 cursor-pointer'
    default:
      return 'bg-gray-100 text-gray-800 cursor-pointer'
  }
})

const distance = computed(() => props.validation?.distance)
const clientLocation = computed(() => props.validation?.clientLocation || { lat: null, lng: null })
const touchpointLocation = computed(() => props.validation?.touchpointLocation || { lat: null, lng: null })
const mapUrl = computed(() => props.validation?.mapUrl || '')
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/touchpoints/GPSBadge.vue
git commit -m "feat(touchpoints): add GPS badge component with location validation display"
```

---

### Task 7: Photo Grid Component

**Files:**
- Create: `imu-web-vue/src/components/touchpoints/PhotoGrid.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    <div
      v-for="touchpoint in touchpoints"
      :key="touchpoint.id"
      class="relative group cursor-pointer"
      @click="openModal(touchpoint)"
    >
      <!-- Photo thumbnail -->
      <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden">
        <img
          v-if="touchpoint.photo_url"
          :src="touchpoint.photo_url"
          :alt="`${touchpoint.client_name} - Touchpoint ${touchpoint.touchpoint_number}`"
          class="w-full h-full object-cover"
          loading="lazy"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
          <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <!-- Overlay info -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
        <div class="absolute bottom-0 left-0 right-0 p-2 text-white text-xs">
          <div class="font-medium truncate">{{ touchpoint.client_name }}</div>
          <div class="flex items-center justify-between">
            <span>{{ formatDate(touchpoint.created_at) }}</span>
            <GPSBadge v-if="touchpoint.gps_validation" :validation="touchpoint.gps_validation" />
          </div>
        </div>
      </div>

      <!-- Touchpoint number badge -->
      <div class="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
        TP{{ touchpoint.touchpoint_number }}
      </div>
    </div>

    <!-- Photo modal -->
    <PhotoModal
      v-if="selectedTouchpoint"
      :touchpoint="selectedTouchpoint"
      @close="selectedTouchpoint = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { format } from 'date-fns'
import GPSBadge from './GPSBadge.vue'
import PhotoModal from './PhotoModal.vue'
import type { Touchpoint } from '@/lib/types'

const props = defineProps<{
  touchpoints: Touchpoint[]
}>()

const selectedTouchpoint = ref<Touchpoint | null>(null)

function formatDate(date: string) {
  return format(new Date(date), 'MMM d')
}

function openModal(touchpoint: Touchpoint) {
  selectedTouchpoint.value = touchpoint
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/touchpoints/PhotoGrid.vue
git commit -m "feat(touchpoints): add photo grid component for verification workflow"
```

---

### Task 8: Photo Modal Component

**Files:**
- Create: `imu-web-vue/src/components/touchpoints/PhotoModal.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="$emit('close')">
      <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b">
          <div>
            <h3 class="text-lg font-semibold">{{ touchpoint.client_name }}</h3>
            <p class="text-sm text-gray-500">
              Touchpoint {{ touchpoint.touchpoint_number }} · {{ formatDateTime(touchpoint.created_at) }}
            </p>
          </div>
          <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="p-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <!-- Photo -->
          <div class="bg-gray-100 rounded-lg overflow-hidden mb-4">
            <img
              v-if="touchpoint.photo_url"
              :src="touchpoint.photo_url"
              :alt="`${touchpoint.client_name} - Touchpoint ${touchpoint.touchpoint_number}`"
              class="w-full"
            />
            <div v-else class="aspect-video flex items-center justify-center text-gray-400">
              No photo available
            </div>
          </div>

          <!-- Details -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <h4 class="font-medium text-sm text-gray-500 mb-1">Touchpoint Details</h4>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt>Type:</dt>
                  <dd class="font-medium">{{ touchpoint.type }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Status:</dt>
                  <dd>
                    <span :class="getStatusClass(touchpoint.status)" class="px-2 py-1 rounded-full text-xs font-medium">
                      {{ touchpoint.status }}
                    </span>
                  </dd>
                </div>
                <div v-if="touchpoint.reason" class="flex justify-between">
                  <dt>Reason:</dt>
                  <dd class="font-medium">{{ touchpoint.reason }}</dd>
                </div>
                <div v-if="touchpoint.notes" class="col-span-2">
                  <dt class="text-gray-500">Notes:</dt>
                  <dd class="mt-1">{{ touchpoint.notes }}</dd>
                </div>
              </dl>
            </div>

            <div v-if="touchpoint.gps_validation">
              <h4 class="font-medium text-sm text-gray-500 mb-1">Location Validation</h4>
              <GPSBadge :validation="touchpoint.gps_validation" />
              <dl v-if="touchpoint.gps_validation.distance" class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between">
                  <dt>Distance:</dt>
                  <dd class="font-medium">{{ Math.round(touchpoint.gps_validation.distance) }}m</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Client Location:</dt>
                  <dd class="font-mono text-xs">
                    {{ touchpoint.gps_validation.clientLocation.lat?.toFixed(4) }},
                    {{ touchpoint.gps_validation.clientLocation.lng?.toFixed(4) }}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt>Touchpoint Location:</dt>
                  <dd class="font-mono text-xs">
                    {{ touchpoint.gps_validation.touchpointLocation.lat?.toFixed(4) }},
                    {{ touchpoint.gps_validation.touchpointLocation.lng?.toFixed(4) }}
                  </dd>
                </div>
              </dl>
              <a
                v-if="touchpoint.gps_validation.mapUrl"
                :href="touchpoint.gps_validation.mapUrl"
                target="_blank"
                class="mt-2 inline-flex items-center text-blue-600 hover:underline text-sm"
              >
                Open in Google Maps →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import GPSBadge from './GPSBadge.vue'
import type { Touchpoint } from '@/lib/types'

defineProps<{
  touchpoint: Touchpoint
}>()

defineEmits<{
  close: []
}>()

function formatDateTime(date: string) {
  return format(new Date(date), 'MMM d, yyyy · h:mm a')
}

function getStatusClass(status: string) {
  switch (status) {
    case 'Completed':
      return 'bg-green-100 text-green-800'
    case 'Interested':
      return 'bg-blue-100 text-blue-800'
    case 'Undecided':
      return 'bg-yellow-100 text-yellow-800'
    case 'Not Interested':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/touchpoints/PhotoModal.vue
git commit -m "feat(touchpoints): add photo modal component with full details and GPS validation"
```

---

### Task 9: Touchpoints Center View - Main Container

**Files:**
- Create: `imu-web-vue/src/views/touchpoints/TouchpointsCenterView.vue`
- Modify: `imu-web-vue/src/router/index.ts:100` - Add route

- [ ] **Step 1: Write main view component**

```vue
<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white border-b">
      <div class="px-6 py-4">
        <h1 class="text-2xl font-semibold text-gray-900">Touchpoints Center</h1>
        <p class="text-sm text-gray-500 mt-1">
          Verify touchpoint photos, validate GPS locations, view analytics, and generate reports
        </p>
      </div>

      <!-- Tabs -->
      <div class="px-6">
        <nav class="flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>
    </header>

    <!-- Tab content -->
    <main class="p-6">
      <TouchpointsListTab v-if="activeTab === 'list'" />
      <TouchpointsAnalyticsTab v-else-if="activeTab === 'analytics'" />
      <TouchpointsReportsTab v-else-if="activeTab === 'reports'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TouchpointsListTab from './TouchpointsListTab.vue'
import TouchpointsAnalyticsTab from './TouchpointsAnalyticsTab.vue'
import TouchpointsReportsTab from './TouchpointsReportsTab.vue'

const activeTab = ref('list')

const tabs = [
  { id: 'list', name: 'List' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'reports', name: 'Reports' }
]
</script>
```

- [ ] **Step 2: Add route to router**

Add to `imu-web-vue/src/router/index.ts`:

```typescript
{
  path: '/touchpoints-center',
  name: 'touchpoints-center',
  component: () => import('@/views/touchpoints/TouchpointsCenterView.vue'),
  meta: { requiresAuth: true }
}
```

- [ ] **Step 3: Add navigation item to sidebar**

Modify `imu-web-vue/src/components/shared/Sidebar.vue` to add Touchpoints Center menu item between Dashboard and Clients.

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/views/touchpoints/TouchpointsCenterView.vue imu-web-vue/src/router/index.ts imu-web-vue/src/components/shared/Sidebar.vue
git commit -m "feat(touchpoints): add Touchpoints Center main view with tab navigation"
```

---

### Task 10: Touchpoints List Tab

**Files:**
- Create: `imu-web-vue/src/views/touchpoints/TouchpointsListTab.vue`

- [ ] **Step 1: Write list tab component**

```vue
<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4">
      <div class="flex flex-wrap gap-4">
        <!-- Date range -->
        <select v-model="filters.dateRange" @change="applyDateRange" class="form-select">
          <option value="">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>

        <!-- Caravan filter -->
        <select v-model="filters.caravanId" class="form-select">
          <option value="">All Caravans</option>
          <option v-for="caravan in caravans" :key="caravan.id" :value="caravan.id">
            {{ caravan.first_name }} {{ caravan.last_name }}
          </option>
        </select>

        <!-- Status filter -->
        <select v-model="filters.status" class="form-select">
          <option value="">All Statuses</option>
          <option value="Completed">Completed</option>
          <option value="Interested">Interested</option>
          <option value="Undecided">Undecided</option>
          <option value="Not Interested">Not Interested</option>
        </select>

        <!-- Type filter -->
        <select v-model="filters.type" class="form-select">
          <option value="">All Types</option>
          <option value="Visit">Visit</option>
          <option value="Call">Call</option>
        </select>

        <!-- GPS status filter -->
        <select v-model="filters.gpsStatus" class="form-select">
          <option value="">All GPS Status</option>
          <option value="onsite">On-site Only</option>
          <option value="near">Near Only</option>
          <option value="offsite">Off-site Only</option>
          <option value="unknown">Unknown GPS</option>
        </select>

        <!-- Photo filter -->
        <select v-model="filters.hasPhoto" class="form-select">
          <option value="">All Touchpoints</option>
          <option value="yes">With Photos Only</option>
          <option value="no">Without Photos</option>
        </select>

        <!-- View toggle -->
        <div class="flex items-center border rounded-md">
          <button
            @click="viewMode = 'list'"
            :class="['px-3 py-2', viewMode === 'list' ? 'bg-gray-100' : '']"
            title="List View"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            @click="viewMode = 'grid'"
            :class="['px-3 py-2 border-l', viewMode === 'grid' ? 'bg-gray-100' : '']"
            title="Photo Grid"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
        </div>

        <!-- Reset button -->
        <button @click="resetFilters" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Reset Filters
        </button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-500">Loading touchpoints...</p>
    </div>

    <div v-else-if="viewMode === 'list'">
      <!-- List view with TanStack Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Touchpoint</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GPS</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Photo</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="touchpoint in touchpoints" :key="touchpoint.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ touchpoint.client_name }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                #{{ touchpoint.touchpoint_number }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ touchpoint.type }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="getStatusClass(touchpoint.status)" class="px-2 py-1 rounded-full text-xs font-medium">
                  {{ touchpoint.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(touchpoint.created_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <GPSBadge v-if="touchpoint.gps_validation" :validation="touchpoint.gps_validation" />
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <button
                  v-if="touchpoint.photo_url"
                  @click="openModal(touchpoint)"
                  class="text-blue-600 hover:text-blue-800"
                >
                  View
                </button>
                <span v-else class="text-gray-300">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <PhotoGrid v-else :touchpoints="touchpoints" />

    <!-- Modal -->
    <PhotoModal
      v-if="selectedTouchpoint"
      :touchpoint="selectedTouchpoint"
      @close="selectedTouchpoint = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { useTouchpointsStore } from '@/stores/touchpoints'
import { useUsersStore } from '@/stores/users'
import GPSBadge from '@/components/touchpoints/GPSBadge.vue'
import PhotoGrid from '@/components/touchpoints/PhotoGrid.vue'
import PhotoModal from '@/components/touchpoints/PhotoModal.vue'
import type { Touchpoint } from '@/lib/types'

const touchpointsStore = useTouchpointsStore()
const usersStore = useUsersStore()

const loading = ref(true)
const touchpoints = ref<(Touchpoint & { gps_validation?: any; client_name?: string })[]>([])
const caravans = ref<any[]>([])
const selectedTouchpoint = ref<Touchpoint | null>(null)
const viewMode = ref<'list' | 'grid'>('list')

const filters = reactive({
  dateRange: '',
  startDate: '',
  endDate: '',
  caravanId: '',
  status: '',
  type: '',
  gpsStatus: '',
  hasPhoto: ''
})

onMounted(async () => {
  await loadCaravans()
  await loadTouchpoints()
  loading.value = false
})

async function loadCaravans() {
  try {
    const result = await usersStore.fetchUsers({ role: 'field_agent' })
    caravans.value = result || []
  } catch (error) {
    console.error('Failed to load caravans:', error)
  }
}

async function loadTouchpoints() {
  try {
    const params: any = {}

    if (filters.startDate) params.startDate = filters.startDate
    if (filters.endDate) params.endDate = filters.endDate
    if (filters.caravanId) params.caravanId = filters.caravanId
    if (filters.status) params.status = filters.status
    if (filters.type) params.type = filters.type

    const result = await touchpointsStore.fetchTouchpoints(params)

    let filtered = result || []

    // Apply GPS status filter
    if (filters.gpsStatus) {
      filtered = await filterByGPSStatus(filtered, filters.gpsStatus)
    }

    // Apply photo filter
    if (filters.hasPhoto === 'yes') {
      filtered = filtered.filter(t => t.photo_url)
    } else if (filters.hasPhoto === 'no') {
      filtered = filtered.filter(t => !t.photo_url)
    }

    // Load GPS validation for all
    for (const touchpoint of filtered) {
      if (touchpoint.time_in_gps_lat && touchpoint.time_in_gps_lng) {
        try {
          const validation = await touchpointsStore.validateGPS(touchpoint.id)
          ;(touchpoint as any).gps_validation = validation
        } catch (error) {
          console.error('Failed to validate GPS:', error)
        }
      }

      // Add client name for display
      if ((touchpoint as any).client) {
        ;(touchpoint as any).client_name = `${(touchpoint as any).client.first_name} ${(touchpoint as any).client.last_name}`
      }
    }

    touchpoints.value = filtered
  } catch (error) {
    console.error('Failed to load touchpoints:', error)
  }
}

async function filterByGPSStatus(items: any[], status: string) {
  const results = []
  for (const item of items) {
    if (!item.time_in_gps_lat || !item.time_in_gps_lng) {
      if (status === 'unknown') results.push(item)
      continue
    }

    try {
      const validation = await touchpointsStore.validateGPS(item.id)
      if (validation.status === status) {
        ;(item as any).gps_validation = validation
        results.push(item)
      }
    } catch (error) {
      console.error('GPS validation failed:', error)
    }
  }
  return results
}

function applyDateRange() {
  const now = new Date()

  switch (filters.dateRange) {
    case 'today':
      filters.startDate = startOfDay(now).toISOString()
      filters.endDate = endOfDay(now).toISOString()
      break
    case 'yesterday':
      const yesterday = subDays(now, 1)
      filters.startDate = startOfDay(yesterday).toISOString()
      filters.endDate = endOfDay(yesterday).toISOString()
      break
    case 'last7days':
      filters.startDate = startOfDay(subDays(now, 7)).toISOString()
      filters.endDate = endOfDay(now).toISOString()
      break
    case 'last30days':
      filters.startDate = startOfDay(subDays(now, 30)).toISOString()
      filters.endDate = endOfDay(now).toISOString()
      break
  }

  loadTouchpoints()
}

function resetFilters() {
  Object.assign(filters, {
    dateRange: '',
    startDate: '',
    endDate: '',
    caravanId: '',
    status: '',
    type: '',
    gpsStatus: '',
    hasPhoto: ''
  })
  loadTouchpoints()
}

function formatDate(date: string) {
  return format(new Date(date), 'MMM d, yyyy')
}

function getStatusClass(status: string) {
  switch (status) {
    case 'Completed':
      return 'bg-green-100 text-green-800'
    case 'Interested':
      return 'bg-blue-100 text-blue-800'
    case 'Undecided':
      return 'bg-yellow-100 text-yellow-800'
    case 'Not Interested':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function openModal(touchpoint: Touchpoint) {
  selectedTouchpoint.value = touchpoint
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/touchpoints/TouchpointsListTab.vue
git commit -m "feat(touchpoints): add list tab with filters, GPS validation, and photo display"
```

---

### Task 11: Touchpoints Analytics Tab

**Files:**
- Create: `imu-web-vue/src/views/touchpoints/TouchpointsAnalyticsTab.vue`

- [ ] **Step 1: Write analytics tab component**

```vue
<template>
  <div class="space-y-6">
    <!-- Period selector -->
    <div class="bg-white rounded-lg shadow p-4">
      <div class="flex flex-wrap items-center gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Period</label>
          <select v-model="period" @change="loadAnalytics" class="form-select">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        <div v-if="period === 'custom'" class="flex gap-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Start</label>
            <input v-model="customStartDate" type="date" class="form-input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">End</label>
            <input v-model="customEndDate" type="date" class="form-input" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Caravan</label>
          <select v-model="selectedCaravanId" @change="loadAnalytics" class="form-select">
            <option value="">All Caravans</option>
            <option v-for="caravan in caravans" :key="caravan.id" :value="caravan.id">
              {{ caravan.first_name }} {{ caravan.last_name }}
            </option>
          </select>
        </div>

        <div class="ml-auto">
          <button @click="loadAnalytics" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Refresh
          </button>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-4 text-gray-500">Loading analytics...</p>
    </div>

    <div v-else-if="analytics">
      <!-- Summary cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Total Touchpoints</div>
          <div class="mt-2 text-3xl font-semibold text-gray-900">{{ analytics.summary.total }}</div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Completed</div>
          <div class="mt-2 text-3xl font-semibold text-green-600">{{ analytics.summary.completed }}</div>
          <div class="mt-1 text-sm text-gray-500">
            {{ Math.round((analytics.summary.completed / analytics.summary.total) * 100) || 0 }}% rate
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Conversion Rate</div>
          <div class="mt-2 text-3xl font-semibold text-blue-600">
            {{ analytics.summary.conversionRate }}%
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Avg. Time</div>
          <div class="mt-2 text-3xl font-semibold text-gray-900">
            {{ analytics.summary.avgTime }}m
          </div>
        </div>
      </div>

      <!-- Conversion funnel -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
        <div class="space-y-3">
          <div v-for="(i, index) in 7" :key="i">
            <div class="flex items-center justify-between text-sm mb-1">
              <span class="font-medium">Touchpoint {{ i }}</span>
              <span class="text-gray-500">
                {{ analytics.funnel[`touchpoint${i}`]?.converted || 0 }} / {{ analytics.funnel[`touchpoint${i}`]?.total || 0 }}
                ({{ Math.round(analytics.funnel[`touchpoint${i}`]?.rate || 0) }}%)
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-4">
              <div
                class="bg-blue-600 h-4 rounded-full transition-all"
                :style="{ width: `${analytics.funnel[`touchpoint${i}`]?.rate || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Trends chart -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Touchpoints Trend</h3>
        <div class="h-64">
          <canvas ref="trendsChart"></canvas>
        </div>
      </div>

      <!-- Caravan performance -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Caravan Performance</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caravan</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Time</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="perf in analytics.caravanPerformance" :key="perf.caravanId">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ perf.caravanName }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ perf.total }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ perf.completed }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ Math.round(perf.rate) }}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ perf.avgTime }}m</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Status distribution -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
        <div class="h-64">
          <canvas ref="statusChart"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { useTouchpointsStore } from '@/stores/touchpoints'
import { useUsersStore } from '@/stores/users'
import type { TouchpointAnalytics, AnalyticsFilters } from '@/lib/types'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const touchpointsStore = useTouchpointsStore()
const usersStore = useUsersStore()

const loading = ref(true)
const analytics = ref<TouchpointAnalytics | null>(null)
const caravans = ref<any[]>([])
const period = ref('month')
const customStartDate = ref('')
const customEndDate = ref('')
const selectedCaravanId = ref('')

const trendsChart = ref<HTMLCanvasElement | null>(null)
const statusChart = ref<HTMLCanvasElement | null>(null)
let trendsChartInstance: Chart | null = null
let statusChartInstance: Chart | null = null

onMounted(async () => {
  await loadCaravans()
  await loadAnalytics()
})

async function loadCaravans() {
  try {
    const result = await usersStore.fetchUsers({ role: 'field_agent' })
    caravans.value = result || []
  } catch (error) {
    console.error('Failed to load caravans:', error)
  }
}

async function loadAnalytics() {
  loading.value = true

  try {
    const filters: AnalyticsFilters = {}

    const now = new Date()
    switch (period.value) {
      case 'today':
        filters.startDate = startOfDay(now).toISOString()
        filters.endDate = endOfDay(now).toISOString()
        break
      case 'week':
        filters.startDate = startOfWeek(now).toISOString()
        filters.endDate = endOfWeek(now).toISOString()
        break
      case 'month':
        filters.startDate = startOfMonth(now).toISOString()
        filters.endDate = endOfMonth(now).toISOString()
        break
      case 'custom':
        if (customStartDate.value) filters.startDate = new Date(customStartDate.value).toISOString()
        if (customEndDate.value) filters.endDate = new Date(customEndDate.value).toISOString()
        break
    }

    if (selectedCaravanId.value) {
      filters.caravanIds = [selectedCaravanId.value]
    }

    analytics.value = await touchpointsStore.fetchAnalytics(filters)

    await nextTick()
    renderCharts()
  } catch (error) {
    console.error('Failed to load analytics:', error)
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  // Destroy existing charts
  if (trendsChartInstance) {
    trendsChartInstance.destroy()
  }
  if (statusChartInstance) {
    statusChartInstance.destroy()
  }

  if (!analytics.value) return

  // Trends chart
  if (trendsChart.value) {
    trendsChartInstance = new Chart(trendsChart.value, {
      type: 'line',
      data: {
        labels: analytics.value.trends.map(t => t.date),
        datasets: [
          {
            label: 'Total',
            data: analytics.value.trends.map(t => t.count),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.1
          },
          {
            label: 'Completed',
            data: analytics.value.trends.map(t => t.completed),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    })
  }

  // Status chart
  if (statusChart.value) {
    statusChartInstance = new Chart(statusChart.value, {
      type: 'pie',
      data: {
        labels: analytics.value.statusDistribution.map(s => s.status),
        datasets: [{
          data: analytics.value.statusDistribution.map(s => s.count),
          backgroundColor: [
            'rgb(34, 197, 94)',
            'rgb(59, 130, 246)',
            'rgb(234, 179, 8)',
            'rgb(239, 68, 68)'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    })
  }
}
</script>
```

- [ ] **Step 2: Install Chart.js**

Run: `cd imu-web-vue && pnpm add chart.js`
Expected: Chart.js installed successfully

- [ ] **Step 3: Commit**

```bash
git add imu-web-vue/src/views/touchpoints/TouchpointsAnalyticsTab.vue imu-web-vue/package.json imu-web-vue/pnpm-lock.yaml
git commit -m "feat(touchpoints): add analytics tab with charts, funnel, and performance metrics"
```

---

### Task 12: Touchpoints Reports Tab (Basic Implementation)

**Files:**
- Create: `imu-web-vue/src/views/touchpoints/TouchpointsReportsTab.vue`

- [ ] **Step 1: Write reports tab component (basic - standard reports only)**

```vue
<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold text-gray-900">Reports</h2>

    <!-- Standard Reports -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Standard Reports</h3>
      <div class="space-y-4">
        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <h4 class="font-medium">Daily Touchpoints Summary</h4>
            <p class="text-sm text-gray-500">Summary of all touchpoints for a specific date</p>
          </div>
          <div class="flex gap-2">
            <select v-model="dailyReportDate" class="form-select">
              <option value="">Select Date</option>
              <option v-for="date in recentDates" :key="date" :value="date">{{ formatDate(date) }}</option>
            </select>
            <button
              @click="generateStandardReport('daily-summary')"
              :disabled="!dailyReportDate"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <h4 class="font-medium">Weekly Caravan Performance</h4>
            <p class="text-sm text-gray-500">Performance metrics by caravan for a week</p>
          </div>
          <div class="flex gap-2">
            <select v-model="weeklyReportStart" class="form-select">
              <option value="">Select Week</option>
              <option v-for="week in recentWeeks" :key="week.start" :value="week.start">
                {{ formatDate(week.start) }} - {{ formatDate(week.end) }}
              </option>
            </select>
            <button
              @click="generateStandardReport('weekly-performance')"
              :disabled="!weeklyReportStart"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <h4 class="font-medium">Monthly Conversion Funnel</h4>
            <p class="text-sm text-gray-500">Conversion funnel analysis for a month</p>
          </div>
          <div class="flex gap-2">
            <select v-model="monthlyReportMonth" class="form-select">
              <option value="">Select Month</option>
              <option v-for="month in recentMonths" :key="month" :value="month">{{ formatMonth(month) }}</option>
            </select>
            <button
              @click="generateStandardReport('monthly-funnel')"
              :disabled="!monthlyReportMonth"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Data -->
    <div class="bg-white rounded-lg shadow p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Export Data</h3>
      <div class="flex items-center gap-4">
        <select v-model="exportFormat" class="form-select">
          <option value="csv">CSV</option>
          <option value="excel">Excel</option>
        </select>
        <label class="flex items-center gap-2">
          <input v-model="includePhotos" type="checkbox" class="form-checkbox" />
          <span class="text-sm">Include Photos (ZIP)</span>
        </label>
        <button
          @click="exportData"
          class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Export All Data
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { useTouchpointsStore } from '@/stores/touchpoints'
import type { ReportFormat } from '@/lib/types'

const touchpointsStore = useTouchpointsStore()

const dailyReportDate = ref('')
const weeklyReportStart = ref('')
const monthlyReportMonth = ref('')
const exportFormat = ref<'csv' | 'excel'>('csv')
const includePhotos = ref(false)

const recentDates = ref<string[]>([])
const recentWeeks = ref<{ start: string; end: string }[]>([])
const recentMonths = ref<string[]>([])

onMounted(() => {
  const now = new Date()

  // Generate recent dates
  for (let i = 0; i < 14; i++) {
    const date = subDays(now, i)
    recentDates.value.push(date.toISOString().split('T')[0])
  }

  // Generate recent weeks
  for (let i = 0; i < 8; i++) {
    const date = subDays(now, i * 7)
    recentWeeks.value.push({
      start: startOfWeek(date).toISOString().split('T')[0],
      end: endOfWeek(date).toISOString().split('T')[0]
    })
  }

  // Generate recent months
  for (let i = 0; i < 6; i++) {
    const date = subMonths(now, i)
    recentMonths.value.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
})

async function generateStandardReport(reportType: string) {
  try {
    const options: ReportFormat = {
      format: exportFormat.value,
      includePhotos: includePhotos.value
    }

    if (reportType === 'daily-summary' && dailyReportDate.value) {
      await touchpointsStore.generateStandardReport('daily-summary', options)
    } else if (reportType === 'weekly-performance' && weeklyReportStart.value) {
      await touchpointsStore.generateStandardReport('weekly-performance', options)
    } else if (reportType === 'monthly-funnel' && monthlyReportMonth.value) {
      await touchpointsStore.generateStandardReport('monthly-funnel', options)
    }
  } catch (error) {
    console.error('Failed to generate report:', error)
    alert('Failed to generate report. Please try again.')
  }
}

async function exportData() {
  try {
    const options: ReportFormat = {
      format: includePhotos.value ? 'zip' : exportFormat.value,
      includePhotos: includePhotos.value
    }

    await touchpointsStore.generateStandardReport('all-data', options)
  } catch (error) {
    console.error('Failed to export data:', error)
    alert('Failed to export data. Please try again.')
  }
}

function formatDate(date: string) {
  return format(new Date(date), 'MMM d, yyyy')
}

function formatMonth(month: string) {
  const [year, monthNum] = month.split('-')
  const date = new Date(parseInt(year), parseInt(monthNum) - 1)
  return format(date, 'MMMM yyyy')
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/touchpoints/TouchpointsReportsTab.vue
git commit -m "feat(touchpoints): add reports tab with standard reports and export functionality"
```

---

## PHASE 2: ADVANCED SEARCH & FILTERING

### Task 13: Backend Search Endpoints

**Files:**
- Create: `backend/src/routes/search.ts`
- Modify: `backend/src/index.ts:360` - Register search routes

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/routes/search.test.ts
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { searchRouter } from '../../src/routes/search'

describe('Search API', () => {
  const app = new Hono()
  app.route('/api/search', searchRouter)

  it('should perform full-text search on clients', async () => {
    const response = await app.request('/api/search/full-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'clients',
        query: 'John',
        filters: {}
      })
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('results')
    expect(data).toHaveProperty('totalCount')
  })

  it('should save and retrieve saved searches', async () => {
    const saveResponse = await app.request('/api/search/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Search',
        entity: 'clients',
        query: 'test',
        filters: {}
      })
    })

    expect(saveResponse.status).toBe(200)
    const saved = await saveResponse.json()
    expect(saved).toHaveProperty('id')

    const listResponse = await app.request('/api/search/saved')
    expect(listResponse.status).toBe(200)
    const data = await listResponse.json()
    expect(data.savedSearches).toBeInstanceOf(Array)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm test search`
Expected: FAIL with "searchRouter not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/routes/search.ts
import { Hono } from 'hono'
import { pool } from '../db'

export const searchRouter = new Hono()

interface FullTextSearchRequest {
  entity: 'clients' | 'touchpoints' | 'users' | 'caravans' | 'itineraries' | 'approvals'
  query: string
  filters?: Record<string, any>
}

// Full-text search endpoint
searchRouter.post('/full-text', async (c) => {
  const { entity, query, filters = {} } = await c.req.json<FullTextSearchRequest>()

  try {
    let sql = ''
    let params: any[] = []
    let countSql = ''
    let countParams: any[] = []

    switch (entity) {
      case 'clients':
        sql = `
          SELECT
            c.id, c.first_name, c.last_name, c.client_type, c.market_type, c.pension_type,
            c.email, c.phone_number, c.address, c.municipality, c.province,
            ts_rank_cd(textsearch, to_tsquery('english', $1)) as rank
          FROM clients c,
            to_tsvector('english',
              coalesce(c.first_name, '') || ' ' ||
              coalesce(c.last_name, '') || ' ' ||
              coalesce(c.email, '') || ' ' ||
              coalesce(c.phone_number, '') || ' ' ||
              coalesce(c.address, '')
            ) textsearch
          WHERE to_tsquery('english', $1) @@ textsearch
        `

        countSql = `
          SELECT COUNT(DISTINCT c.id)
          FROM clients c,
            to_tsvector('english',
              coalesce(c.first_name, '') || ' ' ||
              coalesce(c.last_name, '') || ' ' ||
              coalesce(c.email, '') || ' ' ||
              coalesce(c.phone_number, '') || ' ' ||
              coalesce(c.address, '')
            ) textsearch
          WHERE to_tsquery('english', $1) @@ textsearch
        `

        params = [query.split(' ').join(' & ')]
        countParams = [query.split(' ').join(' & ')]

        // Apply filters
        if (filters.clientType) {
          sql += ` AND c.client_type = $${params.length + 1}`
          countSql += ` AND c.client_type = $${countParams.length + 1}`
          params.push(filters.clientType)
          countParams.push(filters.clientType)
        }

        sql += ' ORDER BY rank DESC LIMIT 50'
        break

      case 'touchpoints':
        sql = `
          SELECT
            t.id, t.touchpoint_number, t.type, t.status, t.created_at,
            c.first_name || ' ' || c.last_name as client_name,
            u.first_name || ' ' || u.last_name as caravan_name
          FROM touchpoints t
          LEFT JOIN clients c ON t.client_id = c.id
          LEFT JOIN users u ON t.user_id = u.id
          WHERE
            c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR
            (c.first_name || ' ' || c.last_name) ILIKE $1
          ORDER BY t.created_at DESC
          LIMIT 50
        `
        countSql = `
          SELECT COUNT(DISTINCT t.id)
          FROM touchpoints t
          LEFT JOIN clients c ON t.client_id = c.id
          WHERE
            c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR
            (c.first_name || ' ' || c.last_name) ILIKE $1
        `
        params = [`%${query}%`]
        countParams = [`%${query}%`]
        break

      case 'users':
        sql = `
          SELECT id, first_name, last_name, email, role, agency
          FROM users
          WHERE
            first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR
            (first_name || ' ' || last_name) ILIKE $1
          ORDER BY created_at DESC
          LIMIT 50
        `
        countSql = `
          SELECT COUNT(*)
          FROM users
          WHERE
            first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR
            (first_name || ' ' || last_name) ILIKE $1
        `
        params = [`%${query}%`]
        countParams = [`%${query}%`]
        break

      default:
        return c.json({ error: 'Invalid entity type' }, 400)
    }

    const [resultsResult, countResult] = await Promise.all([
      pool.query(sql, params),
      pool.query(countSql, countParams)
    ])

    return c.json({
      results: resultsResult.rows,
      totalCount: parseInt(countResult.rows[0].count)
    })
  } catch (error) {
    console.error('Search error:', error)
    return c.json({ error: 'Search failed' }, 500)
  }
})

// Get saved searches
searchRouter.get('/saved', async (c) => {
  const userId = c.get('userId') // From auth middleware

  try {
    const result = await pool.query(
      'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )

    return c.json({ savedSearches: result.rows })
  } catch (error) {
    console.error('Failed to load saved searches:', error)
    return c.json({ error: 'Failed to load saved searches' }, 500)
  }
})

// Save search
searchRouter.post('/saved', async (c) => {
  const userId = c.get('userId')
  const { name, entity, query, filters } = await c.req.json()

  try {
    const result = await pool.query(
      `INSERT INTO saved_searches (user_id, name, entity, query, filters)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, name, entity, query, JSON.stringify(filters)]
    )

    return c.json({ id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to save search:', error)
    return c.json({ error: 'Failed to save search' }, 500)
  }
})

// Delete saved search
searchRouter.delete('/saved/:id', async (c) => {
  const searchId = c.req.param('id')
  const userId = c.get('userId')

  try {
    await pool.query(
      'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2',
      [searchId, userId]
    )

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to delete saved search:', error)
    return c.json({ error: 'Failed to delete saved search' }, 500)
  }
})
```

- [ ] **Step 4: Create saved_searches table migration**

```sql
-- backend/src/migrations/037_create_saved_searches_table.sql
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_entity ON saved_searches(entity);
```

- [ ] **Step 5: Register route in backend/src/index.ts**

```typescript
import { searchRouter } from './routes/search'

app.route('/api/search', searchRouter)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pnpm test search`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/search.ts backend/src/migrations/037_create_saved_searches_table.sql backend/src/index.ts backend/test/routes/search.test.ts
git commit -m "feat(search): add full-text search and saved searches endpoints"
```

---

### Task 14: Frontend Search Store

**Files:**
- Create: `imu-web-vue/src/stores/search.ts`

- [ ] **Step 1: Write search store**

```typescript
// imu-web-vue/src/stores/search.ts
import { ref } from 'vue'
import { defineStore } from 'pinia'
import apiClient from '@/lib/api-client'

export interface SavedSearch {
  id: string
  name: string
  entity: string
  query: string
  filters: Record<string, any>
  created_at: string
}

export interface SearchResult {
  results: any[]
  totalCount: number
}

export const useSearchStore = defineStore('search', () => {
  const searchResults = ref<SearchResult | null>(null)
  const savedSearches = ref<SavedSearch[]>([])
  const recentSearches = ref<string[]>([])
  const loading = ref(false)

  async function fullTextSearch(entity: string, query: string, filters: Record<string, any> = {}) {
    loading.value = true

    try {
      const response = await apiClient.post('/search/full-text', {
        entity,
        query,
        filters
      })

      searchResults.value = response.data

      // Add to recent searches
      if (query && !recentSearches.value.includes(query)) {
        recentSearches.value.unshift(query)
        if (recentSearches.value.length > 10) {
          recentSearches.value = recentSearches.value.slice(0, 10)
        }
        // Persist to localStorage
        localStorage.setItem('recentSearches', JSON.stringify(recentSearches.value))
      }

      return searchResults.value
    } catch (error) {
      console.error('Search failed:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function saveSearch(name: string, entity: string, query: string, filters: Record<string, any> = {}) {
    try {
      const response = await apiClient.post('/search/saved', {
        name,
        entity,
        query,
        filters
      })

      await loadSavedSearches()
      return response.data
    } catch (error) {
      console.error('Failed to save search:', error)
      throw error
    }
  }

  async function loadSavedSearches() {
    try {
      const response = await apiClient.get('/search/saved')
      savedSearches.value = response.data.savedSearches || []
      return savedSearches.value
    } catch (error) {
      console.error('Failed to load saved searches:', error)
      throw error
    }
  }

  async function deleteSearch(searchId: string) {
    try {
      await apiClient.delete(`/search/saved/${searchId}`)
      savedSearches.value = savedSearches.value.filter(s => s.id !== searchId)
    } catch (error) {
      console.error('Failed to delete search:', error)
      throw error
    }
  }

  function loadRecentSearches() {
    const stored = localStorage.getItem('recentSearches')
    if (stored) {
      recentSearches.value = JSON.parse(stored)
    }
  }

  function clearRecentSearches() {
    recentSearches.value = []
    localStorage.removeItem('recentSearches')
  }

  return {
    searchResults,
    savedSearches,
    recentSearches,
    loading,
    fullTextSearch,
    saveSearch,
    loadSavedSearches,
    deleteSearch,
    loadRecentSearches,
    clearRecentSearches
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/stores/search.ts
git commit -m "feat(search): add search store with full-text search and saved searches"
```

---

### Task 15: Advanced Search View

**Files:**
- Create: `imu-web-vue/src/views/search/AdvancedSearchView.vue`
- Modify: `imu-web-vue/src/router/index.ts:120` - Add route

- [ ] **Step 1: Write advanced search view**

```vue
<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white border-b">
      <div class="px-6 py-4">
        <h1 class="text-2xl font-semibold text-gray-900">Advanced Search</h1>
        <p class="text-sm text-gray-500 mt-1">Search across all entities with powerful filters</p>
      </div>
    </header>

    <main class="p-6">
      <div class="max-w-6xl mx-auto">
        <!-- Search input -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <div class="flex gap-4">
            <div class="flex-1">
              <input
                v-model="searchQuery"
                @keyup.enter="performSearch"
                type="text"
                placeholder="Search clients, touchpoints, users..."
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select v-model="selectedEntity" class="form-select">
              <option value="clients">Clients</option>
              <option value="touchpoints">Touchpoints</option>
              <option value="users">Users</option>
            </select>
            <button
              @click="performSearch"
              :disabled="!searchQuery || searchStore.loading"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {{ searchStore.loading ? 'Searching...' : 'Search' }}
            </button>
          </div>

          <!-- Recent searches -->
          <div v-if="searchStore.recentSearches.length > 0" class="mt-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500">Recent searches:</span>
              <button @click="searchStore.clearRecentSearches()" class="text-sm text-blue-600 hover:underline">
                Clear
              </button>
            </div>
            <div class="flex flex-wrap gap-2 mt-2">
              <button
                v-for="recent in searchStore.recentSearches"
                :key="recent"
                @click="searchQuery = recent; performSearch()"
                class="px-3 py-1 text-sm bg-gray-100 rounded-full hover:bg-gray-200"
              >
                {{ recent }}
              </button>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h3 class="font-medium mb-4">Filters</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Entity-specific filters -->
            <template v-if="selectedEntity === 'clients'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Client Type</label>
                <select v-model="filters.clientType" class="form-select">
                  <option value="">All Types</option>
                  <option value="POTENTIAL">Potential</option>
                  <option value="EXISTING">Existing</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Market Type</label>
                <select v-model="filters.marketType" class="form-select">
                  <option value="">All Markets</option>
                  <option value="RETAIL">Retail</option>
                  <option value="WHOLESALE">Wholesale</option>
                </select>
              </div>
            </template>

            <template v-if="selectedEntity === 'touchpoints'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select v-model="filters.status" class="form-select">
                  <option value="">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Interested">Interested</option>
                  <option value="Undecided">Undecided</option>
                  <option value="Not Interested">Not Interested</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select v-model="filters.type" class="form-select">
                  <option value="">All Types</option>
                  <option value="Visit">Visit</option>
                  <option value="Call">Call</option>
                </select>
              </div>
            </template>

            <template v-if="selectedEntity === 'users'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select v-model="filters.role" class="form-select">
                  <option value="">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="field_agent">Field Agent</option>
                  <option value="area_manager">Area Manager</option>
                </select>
              </div>
            </template>

            <div class="flex items-end">
              <button
                v-if="hasActiveFilters"
                @click="clearFilters"
                class="w-full px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <!-- Saved searches -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-medium">Saved Searches</h3>
            <button
              v-if="searchQuery && searchStore.searchResults"
              @click="showSaveDialog = true"
              class="text-sm text-blue-600 hover:underline"
            >
              Save Current Search
            </button>
          </div>

          <div v-if="searchStore.savedSearches.length === 0" class="text-center py-8 text-gray-500">
            No saved searches yet. Save a search to quickly access it later.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="saved in searchStore.savedSearches"
              :key="saved.id"
              class="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
            >
              <div>
                <div class="font-medium">{{ saved.name }}</div>
                <div class="text-sm text-gray-500">{{ saved.entity }} · "{{ saved.query }}"</div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="runSavedSearch(saved)"
                  class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Run
                </button>
                <button
                  @click="deleteSavedSearch(saved.id)"
                  class="px-3 py-1 text-sm text-gray-600 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Search results -->
        <div v-if="searchStore.searchResults" class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h3 class="font-medium">Search Results</h3>
            <p class="text-sm text-gray-500">
              Found {{ searchStore.searchResults.totalCount }} result(s)
            </p>
          </div>

          <div class="divide-y">
            <div
              v-for="result in searchStore.searchResults.results"
              :key="result.id"
              class="px-6 py-4 hover:bg-gray-50"
            >
              <!-- Client result -->
              <template v-if="selectedEntity === 'clients'">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ result.first_name }} {{ result.last_name }}</div>
                    <div class="text-sm text-gray-500">
                      {{ result.client_type }} · {{ result.market_type }}
                    </div>
                    <div v-if="result.email" class="text-sm text-gray-500">{{ result.email }}</div>
                  </div>
                  <router-link
                    :to="`/clients/${result.id}`"
                    class="px-4 py-2 text-blue-600 hover:underline"
                  >
                    View →
                  </router-link>
                </div>
              </template>

              <!-- Touchpoint result -->
              <template v-else-if="selectedEntity === 'touchpoints'">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ result.client_name }}</div>
                    <div class="text-sm text-gray-500">
                      Touchpoint #{{ result.touchpoint_number }} · {{ result.type }}
                    </div>
                    <div class="text-sm text-gray-500">
                      Status: <span :class="getStatusClass(result.status)">{{ result.status }}</span>
                    </div>
                  </div>
                  <router-link
                    :to="`/touchpoints/${result.id}`"
                    class="px-4 py-2 text-blue-600 hover:underline"
                  >
                    View →
                  </router-link>
                </div>
              </template>

              <!-- User result -->
              <template v-else-if="selectedEntity === 'users'">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ result.first_name }} {{ result.last_name }}</div>
                    <div class="text-sm text-gray-500">{{ result.role }}</div>
                    <div v-if="result.email" class="text-sm text-gray-500">{{ result.email }}</div>
                  </div>
                  <router-link
                    :to="`/users/${result.id}`"
                    class="px-4 py-2 text-blue-600 hover:underline"
                  >
                    View →
                  </router-link>
                </div>
              </template>
            </div>
          </div>

          <div v-if="searchStore.searchResults.results.length === 0" class="px-6 py-12 text-center text-gray-500">
            No results found. Try adjusting your search or filters.
          </div>
        </div>
      </div>
    </main>

    <!-- Save search dialog -->
    <div v-if="showSaveDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-semibold mb-4">Save Search</h3>
        <input
          v-model="saveSearchName"
          type="text"
          placeholder="Search name..."
          class="w-full px-4 py-2 border rounded-lg mb-4"
          @keyup.enter="saveCurrentSearch"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="showSaveDialog = false; saveSearchName = ''"
            class="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            @click="saveCurrentSearch"
            :disabled="!saveSearchName"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useSearchStore } from '@/stores/search'

const searchStore = useSearchStore()

const searchQuery = ref('')
const selectedEntity = ref('clients')
const filters = reactive<Record<string, string>>({})
const showSaveDialog = ref(false)
const saveSearchName = ref('')

const hasActiveFilters = computed(() => {
  return Object.values(filters).some(v => v !== '')
})

onMounted(() => {
  searchStore.loadRecentSearches()
  searchStore.loadSavedSearches()
})

async function performSearch() {
  if (!searchQuery.value.trim()) return

  await searchStore.fullTextSearch(selectedEntity.value, searchQuery.value, filters)
}

function clearFilters() {
  Object.keys(filters).forEach(key => {
    filters[key] = ''
  })
  if (searchQuery.value) {
    performSearch()
  }
}

async function saveCurrentSearch() {
  if (!saveSearchName.value || !searchQuery.value) return

  await searchStore.saveSearch(
    saveSearchName.value,
    selectedEntity.value,
    searchQuery.value,
    { ...filters }
  )

  showSaveDialog.value = false
  saveSearchName.value = ''
}

function runSavedSearch(saved: any) {
  selectedEntity.value = saved.entity
  searchQuery.value = saved.query
  Object.assign(filters, saved.filters)
  performSearch()
}

async function deleteSavedSearch(searchId: string) {
  if (confirm('Delete this saved search?')) {
    await searchStore.deleteSearch(searchId)
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case 'Completed': return 'text-green-600'
    case 'Interested': return 'text-blue-600'
    case 'Undecided': return 'text-yellow-600'
    case 'Not Interested': return 'text-red-600'
    default: return 'text-gray-600'
  }
}
</script>
```

- [ ] **Step 2: Add route to router**

Add to `imu-web-vue/src/router/index.ts`:

```typescript
{
  path: '/search',
  name: 'search',
  component: () => import('@/views/search/AdvancedSearchView.vue'),
  meta: { requiresAuth: true }
}
```

- [ ] **Step 3: Add navigation item to sidebar**

- [ ] **Step 4: Commit**

```bash
git add imu-web-vue/src/views/search/AdvancedSearchView.vue imu-web-vue/src/router/index.ts imu-web-vue/src/components/shared/Sidebar.vue
git commit -m "feat(search): add advanced search view with filters and saved searches"
```

---

## PHASE 3: DASHBOARD ANALYTICS

### Task 16: Dashboard Store Extension

**Files:**
- Modify: `imu-web-vue/src/stores/dashboard.ts:50` - Add analytics methods

- [ ] **Step 1: Extend dashboard store**

```typescript
// Add to imu-web-vue/src/stores/dashboard.ts

import type { TouchpointAnalytics, AnalyticsFilters } from '@/lib/types'

// Add to state
const analytics = ref<TouchpointAnalytics | null>(null)
const comparePeriod = ref<string | null>(null)

// Add to actions
async function fetchAnalytics(period: string, compareWith?: string) {
  try {
    const filters: AnalyticsFilters = {}

    const now = new Date()
    switch (period) {
      case 'today':
        filters.startDate = startOfDay(now).toISOString()
        filters.endDate = endOfDay(now).toISOString()
        break
      case 'week':
        filters.startDate = startOfWeek(now).toISOString()
        filters.endDate = endOfWeek(now).toISOString()
        break
      case 'month':
        filters.startDate = startOfMonth(now).toISOString()
        filters.endDate = endOfMonth(now).toISOString()
        break
    }

    const response = await apiClient.get(`/touchpoints/analytics`, { params: filters })
    analytics.value = response.data

    if (compareWith) {
      // Fetch comparison period data
      comparePeriod.value = compareWith
      // ... comparison logic
    }

    return analytics.value
  } catch (error) {
    console.error('Failed to fetch dashboard analytics:', error)
    throw error
  }
}

async function fetchTrends(period: string, granularity: 'daily' | 'weekly' | 'monthly') {
  // Implementation for trend data
  const filters: AnalyticsFilters = {}
  // ... period logic
  return await touchpointsStore.fetchAnalytics(filters)
}

async function fetchConversionFunnels(period: string, groupBy?: string) {
  // Implementation for funnel data
  const filters: AnalyticsFilters = {}
  // ... period logic
  return await touchpointsStore.fetchAnalytics(filters)
}

async function fetchCaravanRankings(period: string, metrics: string[] = ['total', 'completed', 'rate']) {
  const filters: AnalyticsFilters = {}
  // ... period logic
  const analytics = await touchpointsStore.fetchAnalytics(filters)
  return analytics.caravanPerformance
}

// Export new actions
return {
  // ... existing exports
  analytics,
  comparePeriod,
  fetchAnalytics,
  fetchTrends,
  fetchConversionFunnels,
  fetchCaravanRankings
}
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/stores/dashboard.ts
git commit -m "feat(dashboard): extend store with analytics methods"
```

---

### Task 17: KPI Card Component

**Files:**
- Create: `imu-web-vue/src/components/dashboard/KPICard.vue`

- [ ] **Step 1: Write KPI card component**

```vue
<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium text-gray-500">{{ title }}</div>
        <div class="mt-2 text-3xl font-semibold" :class="valueClass">{{ formattedValue }}</div>
        <div v-if="showTrend && trend !== null" class="mt-1 flex items-center text-sm">
          <span v-if="trend > 0" class="text-green-600">↑ {{ trend }}%</span>
          <span v-else-if="trend < 0" class="text-red-600">↓ {{ Math.abs(trend) }}%</span>
          <span v-else class="text-gray-500">— 0%</span>
          <span class="text-gray-500 ml-1">vs. {{ compareLabel }}</span>
        </div>
      </div>
      <div v-if="icon" class="text-gray-400">
        <component :is="icon" class="w-8 h-8" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'

const props = defineProps<{
  title: string
  value: number | string
  format?: 'number' | 'percentage' | 'currency' | 'duration'
  trend?: number | null
  compareLabel?: string
  showTrend?: boolean
  icon?: Component
}>()

const formattedValue = computed(() => {
  const val = typeof props.value === 'number' ? props.value : 0

  switch (props.format) {
    case 'percentage':
      return `${val}%`
    case 'currency':
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val)
    case 'duration':
      return `${val}m`
    default:
      return new Intl.NumberFormat().format(val)
  }
})

const valueClass = computed(() => {
  if (typeof props.value !== 'number') return 'text-gray-900'

  if (props.format === 'percentage') {
    if (props.value >= 70) return 'text-green-600'
    if (props.value >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  return 'text-gray-900'
})
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/dashboard/KPICard.vue
git commit -m "feat(dashboard): add KPI card component with trend indicators"
```

---

### Task 18: Trend Chart Component

**Files:**
- Create: `imu-web-vue/src/components/dashboard/TrendChart.vue`

- [ ] **Step 1: Write trend chart component**

```vue
<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
      <select v-if="periodOptions" :value="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)" class="form-select text-sm">
        <option v-for="option in periodOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    <div class="h-64">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { Chart, registerables, type ChartData, type ChartOptions } from 'chart.js'

Chart.register(...registerables)

const props = defineProps<{
  title: string
  data: ChartData
  options?: ChartOptions
  modelValue?: string
  periodOptions?: Array<{ value: string; label: string }>
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

onMounted(async () => {
  await nextTick()
  renderChart()
})

watch(() => props.data, () => {
  if (chartInstance) {
    chartInstance.data = props.data
    chartInstance.update()
  }
}, { deep: true })

function renderChart() {
  if (!chartCanvas.value) return

  if (chartInstance) {
    chartInstance.destroy()
  }

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: props.data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: props.data.datasets.length > 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => new Intl.NumberFormat().format(value as number)
          }
        }
      },
      ...props.options
    }
  })
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/dashboard/TrendChart.vue
git commit -m "feat(dashboard): add trend chart component with Chart.js"
```

---

### Task 19: Performance Table Component

**Files:**
- Create: `imu-web-vue/src/components/dashboard/PerformanceTable.vue`

- [ ] **Step 1: Write performance table component**

```vue
<template>
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <div class="px-6 py-4 border-b">
      <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rank
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th
              v-for="column in columns"
              :key="column.key"
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="(row, index) in sortedRows"
            :key="row.id"
            class="hover:bg-gray-50"
            :class="{ 'bg-yellow-50': index === 0 }"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <span v-if="index === 0" class="text-2xl">🥇</span>
              <span v-else-if="index === 1" class="text-2xl">🥈</span>
              <span v-else-if="index === 2" class="text-2xl">🥉</span>
              <span v-else class="text-gray-500">{{ index + 1 }}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
              {{ row.name }}
            </td>
            <td
              v-for="column in columns"
              :key="column.key"
              class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
            >
              <template v-if="column.format === 'percentage'">
                {{ Math.round(row[column.key] || 0) }}%
              </template>
              <template v-else-if="column.format === 'duration'">
                {{ row[column.key] }}m
              </template>
              <template v-else>
                {{ row[column.key] }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  rows: Array<any>
  columns: Array<{
    key: string
    label: string
    format?: 'number' | 'percentage' | 'duration'
  }>
  sortBy?: string
  sortDesc?: boolean
}>()

const sortedRows = computed(() => {
  if (!props.sortBy) return props.rows

  return [...props.rows].sort((a, b) => {
    const aVal = a[props.sortBy!] || 0
    const bVal = b[props.sortBy!] || 0

    return props.sortDesc
      ? bVal - aVal
      : aVal - bVal
  })
})
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/dashboard/PerformanceTable.vue
git commit -m "feat(dashboard): add performance table component with ranking"
```

---

### Task 20: Enhanced Dashboard View

**Files:**
- Modify: `imu-web-vue/src/views/dashboard/DashboardView.vue:1` - Enhance with analytics

- [ ] **Step 1: Enhance dashboard view**

```vue
<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header with period selector -->
    <header class="bg-white border-b">
      <div class="px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p class="text-sm text-gray-500 mt-1">Overview of touchpoints, conversions, and performance</p>
          </div>
          <div class="flex items-center gap-4">
            <select v-model="selectedPeriod" @change="loadAnalytics" class="form-select">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="compareWithPrevious" type="checkbox" class="form-checkbox" />
              <span>Compare with previous</span>
            </label>
          </div>
        </div>
      </div>
    </header>

    <main class="p-6">
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-4 text-gray-500">Loading dashboard...</p>
      </div>

      <div v-else-if="analytics" class="space-y-6">
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Touchpoints"
            :value="analytics.summary.total"
            :trend="trends.total"
            compare-label="previous period"
            :show-trend="compareWithPrevious"
          />
          <KPICard
            title="Completed"
            :value="analytics.summary.completed"
            :trend="trends.completed"
            compare-label="previous period"
            :show-trend="compareWithPrevious"
          />
          <KPICard
            title="Conversion Rate"
            :value="analytics.summary.conversionRate"
            format="percentage"
            :trend="trends.conversion"
            compare-label="previous period"
            :show-trend="compareWithPrevious"
          />
          <KPICard
            title="Avg. Completion Time"
            :value="analytics.summary.avgTime"
            format="duration"
            :trend="trends.avgTime"
            compare-label="previous period"
            :show-trend="compareWithPrevious"
          />
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Trends Chart -->
          <TrendChart
            title="Touchpoints Trend"
            :data="trendChartData"
            v-model="selectedPeriod"
            :period-options="[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' }
            ]"
          />

          <!-- Status Distribution -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
            <div class="h-64">
              <canvas ref="statusChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Conversion Funnel -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
          <div class="space-y-3">
            <div v-for="(i, index) in 7" :key="i">
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="font-medium">Touchpoint {{ i }}</span>
                <span class="text-gray-500">
                  {{ analytics.funnel[`touchpoint${i}`]?.converted || 0 }} /
                  {{ analytics.funnel[`touchpoint${i}`]?.total || 0 }}
                  ({{ Math.round(analytics.funnel[`touchpoint${i}`]?.rate || 0) }}%)
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-3">
                <div
                  class="bg-blue-600 h-3 rounded-full transition-all relative"
                  :style="{ width: `${analytics.funnel[`touchpoint${i}`]?.rate || 0}%` }"
                >
                  <span
                    v-if="index > 0"
                    class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full ml-2 text-xs text-gray-500"
                  >
                    {{ calculateDropOff(index - 1, i) }}% drop-off
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Caravan Performance -->
        <PerformanceTable
          title="Caravan Performance Ranking"
          :rows="analytics.caravanPerformance.map(c => ({
            id: c.caravanId,
            name: c.caravanName,
            total: c.total,
            completed: c.completed,
            rate: c.rate,
            avgTime: c.avgTime
          }))"
          :columns="[
            { key: 'total', label: 'Total' },
            { key: 'completed', label: 'Completed' },
            { key: 'rate', label: 'Rate', format: 'percentage' },
            { key: 'avgTime', label: 'Avg Time', format: 'duration' }
          ]"
          sort-by="rate"
          :sort-desc="true"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import KPICard from '@/components/dashboard/KPICard.vue'
import TrendChart from '@/components/dashboard/TrendChart.vue'
import PerformanceTable from '@/components/dashboard/PerformanceTable.vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const dashboardStore = useDashboardStore()

const loading = ref(true)
const analytics = ref<any>(null)
const selectedPeriod = ref('month')
const compareWithPrevious = ref(false)
const previousAnalytics = ref<any>(null)

const statusChart = ref<HTMLCanvasElement | null>(null)
let statusChartInstance: Chart | null = null

// Mock trend data (would be calculated from comparison data)
const trends = computed(() => ({
  total: 12,
  completed: 8,
  conversion: 3,
  avgTime: -5
}))

const trendChartData = computed(() => ({
  labels: analytics.value?.trends?.map((t: any) => t.date) || [],
  datasets: [
    {
      label: 'Total',
      data: analytics.value?.trends?.map((t: any) => t.count) || [],
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.1
    },
    {
      label: 'Completed',
      data: analytics.value?.trends?.map((t: any) => t.completed) || [],
      borderColor: 'rgb(34, 197, 94)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      tension: 0.1
    }
  ]
}))

onMounted(async () => {
  await loadAnalytics()
})

watch([selectedPeriod, compareWithPrevious], () => {
  loadAnalytics()
})

async function loadAnalytics() {
  loading.value = true

  try {
    analytics.value = await dashboardStore.fetchAnalytics(selectedPeriod.value)

    if (compareWithPrevious.value) {
      // Fetch previous period for comparison
      // previousAnalytics.value = await dashboardStore.fetchAnalytics(previousPeriod)
    }

    await nextTick()
    renderStatusChart()
  } catch (error) {
    console.error('Failed to load dashboard analytics:', error)
  } finally {
    loading.value = false
  }
}

function renderStatusChart() {
  if (!analytics.value || !statusChart.value) return

  if (statusChartInstance) {
    statusChartInstance.destroy()
  }

  statusChartInstance = new Chart(statusChart.value, {
    type: 'pie',
    data: {
      labels: analytics.value.statusDistribution.map((s: any) => s.status),
      datasets: [{
        data: analytics.value.statusDistribution.map((s: any) => s.count),
        backgroundColor: [
          'rgb(34, 197, 94)',
          'rgb(59, 130, 246)',
          'rgb(234, 179, 8)',
          'rgb(239, 68, 68)'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right'
        }
      }
    }
  })
}

function calculateDropOff(fromIndex: number, toIndex: number) {
  const from = analytics.value?.funnel?.[`touchpoint${fromIndex}`]
  const to = analytics.value?.funnel?.[`touchpoint${toIndex}`]

  if (!from || !to || from.total === 0) return 0

  return Math.round(((from.total - to.total) / from.total) * 100)
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/views/dashboard/DashboardView.vue
git commit -m "feat(dashboard): enhance with interactive charts, KPI cards, and performance rankings"
```

---

## FINAL TASKS

### Task 21: Install Frontend Dependencies

**Files:**
- Modify: `imu-web-vue/package.json`

- [ ] **Step 1: Install required dependencies**

Run: `cd imu-web-vue && pnpm add chart.js date-fns exceljs file-saver jszip`
Expected: All packages installed successfully

- [ ] **Step 2: Commit dependency updates**

```bash
git add imu-web-vue/package.json imu-web-vue/pnpm-lock.yaml
git commit -m "chore: install frontend dependencies for analytics and exports"
```

---

### Task 22: Add Navigation Items

**Files:**
- Modify: `imu-web-vue/src/components/shared/Sidebar.vue:50` - Add menu items

- [ ] **Step 1: Add Touchpoints Center and Search to sidebar navigation**

Add menu items between Dashboard and Clients:
- Touchpoints Center (with icon)
- Advanced Search (with icon)

- [ ] **Step 2: Commit**

```bash
git add imu-web-vue/src/components/shared/Sidebar.vue
git commit -m "feat(navigation): add Touchpoints Center and Advanced Search to sidebar"
```

---

### Task 23: End-to-End Testing

**Files:**
- Create: `imu-web-vue/test/e2e/touchpoints.spec.ts`
- Create: `imu-web-vue/test/e2e/search.spec.ts`
- Create: `imu-web-vue/test/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write E2E test for Touchpoints Center**

- [ ] **Step 2: Write E2E test for Advanced Search**

- [ ] **Step 3: Write E2E test for Dashboard Analytics**

- [ ] **Step 4: Run E2E tests**

Run: `cd imu-web-vue && pnpm test:e2e`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add imu-web-vue/test/e2e/
git commit -m "test: add E2E tests for touchpoints, search, and dashboard features"
```

---

### Task 24: Documentation

**Files:**
- Create: `docs/features/touchpoints-center.md`
- Create: `docs/features/advanced-search.md`
- Create: `docs/features/dashboard-analytics.md`

- [ ] **Step 1: Write feature documentation for Touchpoints Center**

- [ ] **Step 2: Write feature documentation for Advanced Search**

- [ ] **Step 3: Write feature documentation for Dashboard Analytics**

- [ ] **Step 4: Commit**

```bash
git add docs/features/
git commit -m "docs: add feature documentation for touchpoints center, search, and analytics"
```

---

### Task 25: Final Review and Cleanup

**Files:**
- Multiple

- [ ] **Step 1: Run all tests**

Run: `cd backend && pnpm test && cd ../imu-web-vue && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Check for TypeScript errors**

Run: `cd imu-web-vue && pnpm type-check`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `cd imu-web-vue && pnpm lint`
Expected: No linting errors

- [ ] **Step 4: Verify all routes are accessible**

- [ ] **Step 5: Test GPS validation with real coordinates**

- [ ] **Step 6: Test photo upload and display**

- [ ] **Step 7: Test analytics data aggregation**

- [ ] **Step 8: Test search functionality**

- [ ] **Step 9: Test report generation**

- [ ] **Step 10: Commit any fixes**

```bash
git commit -m "fix: address issues found during final testing"
```

---

**Implementation plan complete. Ready for execution.**

**Total estimated time:** 5-7 weeks
- Phase 1 (Touchpoints): 2-3 weeks
- Phase 2 (Search): 1-2 weeks
- Phase 3 (Dashboard): 2-3 weeks
