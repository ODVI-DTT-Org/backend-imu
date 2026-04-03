# IMU Admin Platform Enhancements Design

**Date:** 2026-03-27
**Project:** IMU (Itinerary Manager - Uniformed)
**Scope:** Touchpoints Enhancements, Advanced Search, Dashboard Analytics
**Status:** ✅ APPROVED
**Implementation Order:** Touchpoints → Search → Analytics

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Implementation Order](#implementation-order)
3. [Phase 1: Touchpoints Enhancements](#phase-1-touchpoints-enhancements)
4. [Phase 2: Advanced Search & Filtering](#phase-2-advanced-search--filtering)
5. [Phase 3: Dashboard Analytics](#phase-3-dashboard-analytics)
6. [Technical Architecture](#technical-architecture)
7. [Data Flow & APIs](#data-flow--apis)
8. [Component Structure](#component-structure)
9. [Testing Strategy](#testing-strategy)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

This design covers three independent feature areas to enhance the IMU admin platform:

1. **Touchpoints Enhancements**: Photo verification, GPS location validation, comprehensive analytics, and reporting capabilities
2. **Advanced Search & Filtering**: Full-text search, multi-criteria filters, saved searches across all entities
3. **Dashboard Analytics**: Charts, trends, conversion funnels, and performance metrics

**Primary Goals**: Improve operational efficiency (staff) AND provide better business insights (management) equally.

**Implementation Approach**: Sequential - build one feature area completely before moving to the next for highest quality.

---

## Implementation Order

```
Phase 1: Touchpoints Enhancements (2-3 weeks)
  ↓
Phase 2: Advanced Search & Filtering (1-2 weeks)
  ↓
Phase 3: Dashboard Analytics (2-3 weeks)
```

**Rationale**: Sequential approach allows us to learn from each implementation and apply lessons learned to subsequent phases.

---

## Phase 1: Touchpoints Enhancements

### Overview

Create a **Dedicated Touchpoints Center** with three tabs: List (enhanced with photos, GPS status), Analytics (charts, funnels, metrics), and Reports (standard, custom, export).

### Key Features

**Photo Display (Verification Focus)**
- Toggle switch: "Show photos only" displays grid of touchpoint photos
- Photo grid shows: client name, date, photo thumbnail, GPS status badge
- Click photo to open modal with full-size image and details
- Filter to show only touchpoints with/without photos

**GPS Location Validation**
- Distance calculation between touchpoint and client location
- Visual badges: ✅ On-site (<50m), ⚠️ Near (50-200m), ❌ Off-site (>200m)
- Hover/click shows: actual distance, coordinates, map link
- Filter by GPS status to identify problematic visits

**Touchpoints Analytics**
- **Completion Tracking**: Touchpoint completion rates by caravan, time period, client type
- **Conversion Funnel**: Track client progression through 7-touchpoint sequence
- **Performance Metrics**: Caravan performance (visits per day, completion time, GPS compliance)

**Touchpoints Reporting**
- **Standard Reports**: Daily touchpoints summary, weekly caravan performance, monthly conversion funnel
- **Custom Report Builder**: Named, saved reports with custom filter combinations
- **Export Capabilities**: CSV, PDF, Excel, ZIP (with photos)
- **Share & Schedule**: Generate shareable links (7-day expiry). **Note**: Email scheduling requires job queue infrastructure - defer to Phase 4. Phase 1 includes manual report generation only.

### Navigation & Access

**New Navigation Item:**
- Add "Touchpoints Center" to main sidebar navigation (between "Dashboard" and "Clients")
- Existing TouchpointsListView remains but adds "View in Center" button

**Route Structure:**
```
/touchpoints-center
├── /list (default) - Enhanced list with photos, GPS status
├── /analytics - Charts, funnels, metrics
└── /reports - Standard, custom, and export
```

### List Tab Design

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Touchpoints Center - List Tab                               │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Date Range] [Caravan] [Status] [Type] [Location]  │
│ View: [List] [Photo Grid] [Map View]                        │
├─────────────────────────────────────────────────────────────┤
│ Touchpoint Cards/Rows with:                                 │
│ - Photo thumbnail (clickable for modal)                       │
│ - Client info & touchpoint details                            │
│ - GPS status badge with distance                              │
│ - Status badge (Interested/Undecided/Not Interested/Completed) │
│ Pagination + Bulk Actions                                     │
└─────────────────────────────────────────────────────────────┘
```

**View Modes:**
- **List View**: Traditional table with photo thumbnails inline
- **Photo Grid**: Large photo cards optimized for verification workflow
- **Map View**: Touchpoints plotted on map (future enhancement)

**Enhanced Filters:**
- Date range picker (Today, Yesterday, Last 7 days, Last 30 days, Custom)
- Caravan dropdown (multi-select)
- Status: Interested, Undecided, Not Interested, Completed
- Type: Visit, Call
- GPS Status: On-site, Near, Off-site

### Analytics Tab Design

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Touchpoints Center - Analytics Tab                           │
├─────────────────────────────────────────────────────────────┤
│ Period: [Today] [This Week] [This Month] [Custom Range]    │
│ Granularity: [Daily] [Weekly] [Monthly]                     │
├─────────────────────────────────────────────────────────────┤
│ SUMMARY CARDS                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Total TP  │ │Completed │ │Conversion│ │Avg Time  │ │
│ │ 1,234    │ │ 1,120    │ │ 45%      │ │ 23min    │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│ CONVERSION FUNNEL                                           │
│ Touchpoint 1 ████████████████░░░░░ 85% █ 1,050            │
│ Touchpoint 2 ████████████████░░░░░ 78% █ 967               │
│ Touchpoint 3 ████████████░░░░░░░░░ 65% █ 806               │
│ ...                                                          │
├─────────────────────────────────────────────────────────────┤
│ PERFORMANCE CHARTS                                           │
│ [Line Chart: Touchpoints per Day]                           │
│ [Bar Chart: Completion by Caravan]                          │
│ [Pie Chart: Status Distribution]                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
**Real-time Updates**
- Auto-refresh every 30 seconds (configurable) for basic implementation
- **Future enhancement**: Leverage existing EventSource pattern from `/api/audit-logs/stream` for real-time analytics updates
- For Phase 1, use polling to maintain simplicity and consistency with existing patterns
- Filter by caravan, client type, date range, touchpoint type
- Export charts as PNG/PDF
- Drill down to individual touchpoints

### Reports Tab Design

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Touchpoints Center - Reports Tab                             │
├─────────────────────────────────────────────────────────────┤
│ [Standard Reports] [Custom Reports] [Export Data]           │
├─────────────────────────────────────────────────────────────┤
│ STANDARD REPORTS                                             │
│ 📊 Daily Touchpoints Summary [Generate] [Schedule]         │
│ 📈 Weekly Caravan Performance [Generate] [Schedule]        │
│ 📉 Monthly Conversion Funnel [Generate] [Schedule]         │
├─────────────────────────────────────────────────────────────┤
│ CUSTOM REPORT BUILDER                                        │
│ Report Name: [Enter name...]                                 │
│ Filters: Date, Caravans, Client Types, Types, Status, GPS   │
│ Output: [Table] [Summary Stats] [Chart]                     │
│ [Save Report] [Generate & Preview]                           │
├─────────────────────────────────────────────────────────────┤
│ SAVED CUSTOM REPORTS                                         │
│ My Weekly Review [Run] [Edit] [×]                            │
│ Q1 Performance by Caravan [Run] [Edit] [×]                  │
└─────────────────────────────────────────────────────────────┘
```

**Export Capabilities:**
- CSV: Raw touchpoint data for external analysis
- PDF: Formatted reports with branding, charts, summaries
- Excel: Multiple sheets (summary, detailed data, analytics)
- ZIP: Include photos as downloadable files

---

## Phase 2: Advanced Search & Filtering

### Overview

Implement comprehensive search functionality across all entities with full-text search, multi-criteria filters, and saved searches.

### Key Features

**Full-Text Search**
- **Phase 2 Approach**: Use existing simple search pattern with client-side filtering
- Search across primary fields: names, emails, phone numbers
- Future enhancement: Add PostgreSQL GIN indexes for true full-text search (Phase 4)
- Autocomplete suggestions based on existing data
- Search result highlighting in display
- Recent searches history

**Rationale**: Existing pattern uses `LIKE` queries with client-side filtering. True full-text search requires database migrations and GIN indexes, which should be a separate phase to avoid scope creep.

**Advanced Filters**
- Multi-select filters for all entity attributes
- Date range pickers with presets
- Numeric range sliders
- Boolean operators (AND/OR/NOT)
- Filter combinations saved as "Views"

**Saved Searches**
- Name and save frequently-used search configurations
- Quick access from sidebar or dropdown
- Share saved searches with other users
- Auto-save recent searches

### Entity Coverage

**Advanced Search For:**
- Clients (name, email, phone, address, PSGC, municipality)
- Touchpoints (client, caravan, date, type, status, GPS)
- Users (name, email, role, agency)
- Caravans (name, status, agency)
- Itineraries (date, caravan, clients)
- Approvals (client, status, type, date)

### Search UI Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Advanced Search                                         │
├─────────────────────────────────────────────────────────────┤
│ Entity: [Clients ▼]                                         │
├─────────────────────────────────────────────────────────────┤
│ Search: [Full-text search input...]                         │
│                                                             │
│ Filters:                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Name: [________] Email: [________]                       │ │
│ │ Created: [Start Date] - [End Date]                      │ │
│ │ Client Type: [▼ Multi-select]                           │ │
│ │ PSGC Region: [▼ Multi-select]                           │ │
│ │ Status: [▼ Multi-select]                                 │ │
│ │ [+ Add Filter]                                            │ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Saved Searches: [My Daily Review] [Q1 Performance] [+]   │
│                                                             │
│ [Search] [Save as...] [Reset]                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Dashboard Analytics

### Overview

Enhance the existing dashboard with interactive charts, trend analysis, conversion funnels, and performance metrics.

### Key Features

**Interactive Charts**
- Line charts for trends (touchpoints per day, conversion over time)
- Bar charts for comparisons (caravan performance, client type breakdown)
- Pie charts for distribution (status, types, sources)
- Funnel charts for conversion analysis
- Heatmaps for geographic performance

**Trend Analysis**
- Time period comparisons (this week vs last week, this month vs last month)
- Growth rate calculations
- Moving averages for trend smoothing
- Predictive indicators (up/down arrows, percentage change)

**Conversion Funnels**
- 7-touchpoint sequence visualization
- Drop-off rate analysis at each stage
- Drill-down to see which clients dropped
- Funnel comparison by caravan, client type, time period

**Performance Metrics**
- Caravan ranking tables
- KPI dashboards with targets
- Benchmark comparisons
- Performance distribution charts

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard                                                   │
├─────────────────────────────────────────────────────────────┤
│ Period: [Last 7 Days] [Compare: Previous Period]           │
├─────────────────────────────────────────────────────────────┤
│ KEY METRICS                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Total TP  │ │Completed │ │Conversion│ │Avg Time  │ │
│ │ 1,234    │ │ 1,120    │ │ 45%      │ │ 23min    │ │
│ │ ↑12%     │ │ ↑8%      │ │ ↑3%      │ │ ↓5%      │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│ CHARTS                                                      │
│ [Line Chart: Touchpoints Trend] [Bar Chart: By Caravan]  │
│ [Funnel Chart: Conversion] [Pie Chart: Status Distribution]│
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Backend API Enhancements

**New Analytics Endpoints:**
```typescript
GET /api/touchpoints/analytics
  Query: { startDate, endDate, caravanIds, clientTypes, touchpointTypes, status, gpsStatus }
  Returns: {
    summary: { total, completed, conversionRate, avgTime },
    funnel: { touchpoint1: { total, converted, rate }, ...touchpoint7 },
    trends: { date: string, count: number, completed: number }[],
    caravanPerformance: { caravanId, caravanName, total, completed, rate, avgTime, gpsCompliance }[],
    statusDistribution: { status: string, count: number, percentage: number }[]
  }
```

**Note:** Single aggregated endpoint following existing `/api/audit-logs/stats` pattern for efficiency.

**New Search Endpoints:**
```typescript
POST /api/search/full-text
  Body: { entity, query, filters }
  Returns: { results, highlights, totalCount }

GET /api/search/saved
  Returns: { savedSearches[] }

POST /api/search/saved
  Body: { name, entity, query, filters }
  Returns: { searchId }
```

**New Reports Endpoints:**
```typescript
GET /api/touchpoints/reports/standard/:reportType
POST /api/touchpoints/reports/custom
GET /api/touchpoints/reports/custom/:reportId
GET /api/touchpoints/reports/custom/:reportId/run
```

**GPS Validation Response Type:**
```typescript
interface GPSValidationResponse {
  touchpointId: string
  clientLocation: {
    lat: number
    lng: number
    address: string
  }
  touchpointLocation: {
    lat: number
    lng: number
    address: string
  }
  distance: number
  status: 'onsite' | 'near' | 'offsite'
  mapUrl: string
}
```

### Database Considerations

**Indexes for Performance:**
- Full-text search indexes on text fields
- Composite indexes on filter combinations
- Materialized views for analytics aggregations
- Partitioning for large datasets

**Caching Strategy:**
- Analytics data cached for 5 minutes
- Search results cached for 2 minutes
- Report configurations in database
- Photo thumbnails cached in browser

---

## Component Structure

### New Components to Create

**Touchpoints Center:**
- `TouchpointsCenterView.vue` - Main container with tabs
- `TouchpointsListTab.vue` - Enhanced list with photos, GPS
- `TouchpointsAnalyticsTab.vue` - Charts and metrics
- `TouchpointsReportsTab.vue` - Reports interface
- `PhotoGrid.vue` - Photo verification grid
- `GPSBadge.vue` - Location status badge
- `FunnelChart.vue` - Conversion funnel visualization
- `ReportBuilder.vue` - Custom report configuration
- `ReportPreview.vue` - Report preview modal

**Advanced Search:**
- `AdvancedSearch.vue` - Unified search interface
- `SearchFilters.vue` - Dynamic filter builder
- `SavedSearches.vue` - Saved search management
- `SearchResults.vue` - Enhanced results display

**Dashboard Analytics:**
- `AnalyticsChart.vue` - Reusable chart wrapper
- `TrendChart.vue` - Line chart with comparisons
- `FunnelChart.vue` - Conversion funnel display
- `KPICard.vue` - Metric card with trend indicator
- `PerformanceTable.vue` - Ranked performance data

### Store Extensions

**Touchpoints Store Extensions:**
```typescript
async fetchAnalytics(filters)
async fetchFunnel(filters)
async fetchTrends(filters)
async fetchCaravanPerformance(filters)
async fetchStatusDistribution(filters)
async generateStandardReport(reportType, options)
async saveCustomReport(config)
async runCustomReport(reportId)
async exportTouchpoints(filters, format)
```

**Search Store:**
```typescript
async fullTextSearch(entity, query, filters)
async saveSearch(name, config)
async loadSavedSearches()
async deleteSearch(searchId)
```

**Dashboard Store Extensions:**
```typescript
async fetchAnalytics(period, compareWith)
async fetchTrends(period, granularity)
async fetchConversionFunnels(period, groupBy)
async fetchCaravanRankings(period, metrics)
```

---

## Data Flow & APIs

### GPS Validation Flow

```
User views touchpoint → Frontend calls GPS validation API
                                     ↓
                              Backend calculates distance
                              (Haversine formula)
                                     ↓
                              Return: { distance, status, coordinates }
                                     ↓
Frontend displays badge and shows distance on hover/click
```

### Analytics Data Flow

```
User changes period/granularity → Frontend fetches analytics
                                     ↓
                              Backend aggregates from database
                              (with caching layer)
                                     ↓
                              Return: { summary, funnel, trends, charts }
                                     ↓
Frontend updates charts (auto-refresh every 30s)
```

### Custom Report Flow

```
User builds report → Save configuration → Name report
                                       ↓
                              Saved to database + localStorage
                                       ↓
User runs report → Load config → Fetch data → Generate preview
                                       ↓
User exports → Generate file (CSV/PDF/Excel) → Download
```

---

## Testing Strategy

### Unit Tests

**GPS Validation:**
- Distance calculation accuracy (within 1m)
- Status threshold correctness (<50m = on-site)
- Coordinate parsing and formatting

**Analytics:**
- Aggregation logic correctness
- Funnel calculation accuracy
- Trend computation precision
- Percentage calculations

**Search:**
- Full-text search ranking
- Filter combination logic
- Saved search serialization

### Integration Tests

**API Endpoints:**
- Analytics endpoints return correct data
- Search endpoints handle complex filters
- Report generation produces valid files
- GPS validation returns accurate distances

### E2E Tests

**Touchpoints Verification:**
- Complete workflow: view → filter → verify GPS → export
- Photo grid loading and modal display
- GPS filtering and distance display

**Analytics Dashboard:**
- Dashboard loads with all charts
- Period changes update data correctly
- Export functionality works

**Custom Reports:**
- Create → save → run → download workflow
- Scheduled reports generate correctly
- Share links work with expiration

### Performance Tests

- Load 500+ touchpoints in photo grid
- Generate report with 10,000+ records
- Dashboard renders with full year of data
- Search returns results within 2 seconds

---

## Success Criteria

### Touchpoints Enhancements

**Photo Verification:**
- ✅ Managers can view all touchpoint photos in grid or list view
- ✅ Photos load quickly (thumbnails < 2s, full-size < 5s)
- ✅ Click photo to open modal with full-size image and details
- ✅ Filter to show only touchpoints with/without photos

**GPS Location Validation:**
- ✅ Distance calculated between touchpoint and client location
- ✅ Visual badges: ✅ On-site (<50m), ⚠️ Near (50-200m), ❌ Off-site (>200m)
- ✅ Hover/click shows exact distance and coordinates
- ✅ Filter by GPS status to identify problematic visits
- ✅ Export touchpoints with GPS validation status

**Analytics Dashboard:**
- ✅ Summary cards show accurate totals for selected period
- ✅ Conversion funnel displays 7-stage progression
- ✅ Performance charts render correctly for all filter combinations
- ✅ Auto-refresh works without page reload
- ✅ Export charts as PNG/PDF for presentations

**Reporting:**
- ✅ Standard reports generate correctly (daily, weekly, monthly)
- ✅ Custom report builder saves and loads configurations
- ✅ Export to CSV/PDF/Excel produces properly formatted files
- ✅ Share links work with expiration and password protection
- ⏸️ Scheduled reports - Deferred to Phase 4 (requires job queue infrastructure)

### Advanced Search

**Full-Text Search:**
- ✅ Search across all entity fields works correctly
- ✅ Fuzzy matching and autocomplete suggestions appear
- ✅ Search results are ranked by relevance
- ✅ Recent searches history maintained

**Advanced Filters:**
- ✅ Multi-select filters work for all attributes
- ✅ Date range pickers include presets
- ✅ Boolean operators (AND/OR/NOT) work correctly
- ✅ Filter combinations update results in real-time

**Saved Searches:**
- ✅ Users can save and name search configurations
- ✅ Saved searches accessible from sidebar/dropdown
- ✅ Share saved searches with other users
- ✅ Auto-save recent searches

### Dashboard Analytics

**Interactive Charts:**
- ✅ Line charts display trends correctly
- ✅ Bar charts show comparisons accurately
- ✅ Pie charts display distributions properly
- ✅ Funnel charts visualize conversion clearly
- ✅ Charts are responsive on all screen sizes

**Trend Analysis:**
- ✅ Period comparisons work (this week vs last week)
- ✅ Growth rates calculate correctly
- ✅ Moving averages smooth trends
- ✅ Predictive indicators show direction

**Performance Metrics:**
- ✅ Caravan ranking tables sort correctly
- ✅ KPI dashboards display targets vs actuals
- ✅ Benchmark comparisons are accurate
- ✅ Performance distributions calculate correctly

### Performance Targets

- ✅ Analytics dashboard loads in < 3 seconds
- ✅ Photo grid handles 500+ touchpoints
- ✅ Report generation completes in < 10 seconds
- ✅ Export handles 10,000+ records
- ✅ Search returns results in < 2 seconds

---

## Implementation Notes

### Dependencies

**Frontend Libraries:**
- `chart.js` or `recharts` for analytics visualizations
- `jspdf` for PDF generation
- `file-saver` for file downloads
- `date-fns` for date manipulation
- `exceljs` for Excel export (multiple sheets support)
- `jszip` for ZIP file creation (photo export)

**Backend Libraries:**
- `pdfkit` or `puppeteer` for PDF generation
- `exceljs` (server-side) for Excel export alternative
- `archiver` or `archiver-jszip` for ZIP creation

**Backend:**
- No new database dependencies
- Use existing `pg` for queries
- Use existing `pool` for connections

### Migration Strategy

**Phase 1 - Touchpoints:**
- Create new Touchpoints Center views
- Add analytics and reports endpoints
- Extend touchpoints store
- Add navigation item
- Keep existing views as-is initially

**Phase 2 - Search:**
- Create unified search interface
- Add search endpoints
- Implement simple search with LIKE queries
- Add saved searches functionality
- **Note**: Full-text search with GIN indexes deferred to Phase 4

**Phase 3 - Dashboard:**
- Enhance existing dashboard
- Add interactive charts
- Implement trend analysis
- Add conversion funnels

### Rollout Plan

**Week 1-2:** Touchpoints Center (List tab)
**Week 3:** Touchpoints Center (Analytics + Reports tabs)
**Week 4:** Advanced Search implementation
**Week 5:** Dashboard Analytics enhancement
**Week 6:** Testing, refinement, documentation

---

## Implementation Notes

### Photo Storage Mechanism

**Existing Infrastructure:**
- Backend has `/api/upload` route with categories: `touchpoint_photo`, `audio`, `document`
- Touchpoints table has `photo_url` field for storing file paths
- Upload route returns file URL that is stored in database

**Photo Display Strategy:**
- Use existing `photo_url` field from touchpoints table
- Display thumbnails using optimized image serving (can use existing upload route)
- Photo modal loads full-size image from stored URL
- No database migration required for photo display

**GPS Coordinate Fields:**
- Touchpoints table has: `time_in_gps_lat`, `time_in_gps_lng`, `time_in_gps_address`
- Touchpoints table has: `time_out_gps_lat`, `time_out_gps_lng`, `time_out_gps_address`
- Client locations from: `clients.latitude`, `clients.longitude`
- Calculate distance using Haversine formula between coordinates

### Role Terminology

**Clarification:**
- Spec uses "caravan" for consistency with existing UI labels
- Database uses `role = 'field_agent'` for caravan users
- Both terms refer to the same user type
- Touchpoints API accepts both terms for compatibility

---

**Design complete and ready for implementation planning.**
