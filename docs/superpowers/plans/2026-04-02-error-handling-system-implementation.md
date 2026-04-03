# Error Handling System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive error handling system with detailed backend responses, async database logging, and consistent simple error display across Vue web admin and Flutter mobile app.

**Architecture:** Backend error classes generate rich error responses with requestId, timestamp, code, message, suggestions. Error middleware catches all errors, logs to database asynchronously, and returns formatted response. Frontend (Vue/Flutter) displays simple errors (message + code + request ID) in toasts/snackbars. Admin dashboard views and resolves logged errors.

**Tech Stack:** Hono (backend), PostgreSQL (error_logs table), Vue 3 + TypeScript (web admin), Flutter + Dart (mobile), UUID generation, async database logging

---

## File Structure

**Backend (New Files):**
```
backend/src/errors/
  index.ts           # Error classes (AppError, ValidationError, NotFoundError, etc.)
  codes.ts           # Error code registry
  suggestions.ts     # Suggestion mappings
backend/src/middleware/
  errorHandler.ts    # Error handling middleware
backend/src/services/
  errorLogger.ts     # Database logging service
backend/src/routes/
  error-logs.ts      # Admin error log routes
backend/migrations/
  YYYY-MM-DD-error-logs.sql  # Database table creation
backend/src/scripts/
  generate-error-docs.ts     # Documentation generator
```

**Backend (Modified Files):**
```
backend/src/routes/*.ts       # Update to use new error classes
backend/src/index.ts          # Add error middleware
```

**Vue Frontend (New Files):**
```
imu-web-vue/src/views/admin/
  ErrorLogsView.vue           # Admin error logs page
```

**Vue Frontend (Modified Files):**
```
imu-web-vue/src/lib/
  api-client.ts               # Parse full error response
imu-web-vue/src/composables/
  useToast.ts                 # Add error support
  useErrorHandler.ts          # Update to use new format
imu-web-vue/src/components/ui/
  Toast.vue                   # Show error code + request ID
```

**Flutter Mobile (New Files):**
```
mobile/imu_flutter/lib/models/
  error_model.dart            # AppError model
mobile/imu_flutter/lib/services/
  error_service.dart          # Error display service
```

**Flutter Mobile (Modified Files):**
```
mobile/imu_flutter/lib/services/
  api_service.dart            # Parse error response
```

---

## Phase 1: Backend Foundation

### Task 1: Create Error Code Registry

**Files:**
- Create: `backend/src/errors/codes.ts`

```typescript
export const ErrorCodes = {
  // Validation (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Authentication (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',

  // Resources (4xx)
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Rate Limiting (4xx)
  RATE_LIMITED: 'RATE_LIMITED',

  // Server (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
```

### Task 2: Create Error Suggestions Engine

**Files:**
- Create: `backend/src/errors/suggestions.ts`

```typescript
export const ErrorSuggestions: Record<string, string[]> = {
  VALIDATION_ERROR: [
    'Check that all required fields are included',
    'Verify field formats (email, dates, etc.)',
    'See documentation for required fields',
  ],
  UNAUTHORIZED: [
    'You need to log in to access this resource',
    'Your session may have expired',
    'Try logging in again',
  ],
  FORBIDDEN: [
    'You don\'t have permission to perform this action',
    'Contact your administrator if you believe this is an error',
  ],
  NOT_FOUND: [
    'The requested resource was not found',
    'Verify the ID is correct',
    'It may have been deleted',
  ],
  DATABASE_ERROR: [
    'This may be a temporary database issue',
    'Try again in a few moments',
    'Contact support if the problem persists',
  ],
  RATE_LIMITED: [
    'You\'ve made too many requests',
    'Please wait before trying again',
    'Contact support if you need higher limits',
  ],
  INTERNAL_ERROR: [
    'An unexpected error occurred',
    'Try again',
    'Contact support if the problem persists',
  ],
}

export function getSuggestions(code: string): string[] {
  return ErrorSuggestions[code] || [
    'An error occurred',
    'Try again',
    'Contact support if the problem persists',
  ]
}
```

### Task 3: Create Error Classes

**Files:**
- Create: `backend/src/errors/index.ts`

```typescript
import { getSuggestions } from './suggestions.js'

export class AppError extends Error {
  code: string
  statusCode: number
  details: Record<string, any>
  suggestions: string[]
  documentationUrl?: string

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = {}
    this.suggestions = []
    Error.captureStackTrace(this, this.constructor)
  }

  addDetail(key: string, value: any): this {
    this.details[key] = value
    return this
  }

  addSuggestion(text: string): this {
    this.suggestions.push(text)
    return this
  }

  setDocumentation(url: string): this {
    this.documentationUrl = url
    return this
  }

  toJSON() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      details: this.details,
      suggestions: this.suggestions.length > 0 ? this.suggestions : getSuggestions(this.code),
      documentationUrl: this.documentationUrl,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 422)
  }

  addFieldError(field: string, message: string, value?: any): this {
    if (!this.details.errors) {
      this.details.errors = []
    }
    this.details.errors.push({ field, message, value })
    return this
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.addSuggestion(`Verify the ${resource} exists`)
    this.addSuggestion('Check the ID for typos')
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class AuthorizationError extends AppError {
  constructor(action: string) {
    super(`You don't have permission to ${action}`, 'FORBIDDEN', 403)
  }
}

export class ConflictError extends AppError {
  constructor(resource: string) {
    super(`${resource} already exists`, 'CONFLICT', 409)
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests', 'RATE_LIMITED', 429)
    if (retryAfter) {
      this.addDetail('retryAfter', retryAfter)
      this.addSuggestion(`Try again in ${retryAfter} seconds`)
    }
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500)
    this.addSuggestion('This may be a temporary issue')
    this.addSuggestion('Try again in a few moments')
    this.addSuggestion('Contact support if it persists')
    if (originalError) {
      this.addDetail('originalError', originalError.message)
    }
  }
}
```

### Task 4: Create Error Logging Service

**Files:**
- Create: `backend/src/services/errorLogger.ts`

```typescript
import { pool } from '../db/index.js'

interface ErrorContext {
  requestId: string
  timestamp: string
  path: string
  method: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  stack?: string
}

export class ErrorLogger {
  async log(error: AppError, context: ErrorContext): Promise<void> {
    // Async, non-blocking - don't await
    pool.query(
      `INSERT INTO error_logs (
        request_id, timestamp, code, message, status_code,
        path, method, user_id, ip_address, user_agent,
        details, errors, stack_trace, suggestions, documentation_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        context.requestId,
        context.timestamp,
        error.code,
        error.message,
        error.statusCode,
        context.path,
        context.method,
        context.userId || null,
        context.ipAddress || null,
        context.userAgent || null,
        JSON.stringify(error.details),
        error.details.errors ? JSON.stringify(error.details.errors) : null,
        context.stack || null,
        error.suggestions,
        error.documentationUrl || null,
      ]
    ).catch((err) => {
      console.error('Failed to log error:', err)
    })
  }

  async findByRequestId(requestId: string) {
    const result = await pool.query(
      'SELECT * FROM error_logs WHERE request_id = $1',
      [requestId]
    )
    return result.rows[0] || null
  }

  async findUnresolved(limit: number = 50) {
    const result = await pool.query(
      `SELECT * FROM error_logs
       WHERE resolved = false
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    )
    return result.rows
  }

  async markResolved(id: string, userId: string, notes: string) {
    await pool.query(
      `UPDATE error_logs
       SET resolved = true, resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE id = $3`,
      [userId, notes, id]
    )
  }

  async getErrorStats(startDate: Date) {
    const result = await pool.query(
      `SELECT
         code,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE resolved = false) as unresolved
       FROM error_logs
       WHERE timestamp >= $1
       GROUP BY code
       ORDER BY count DESC`,
      [startDate]
    )
    return result.rows
  }
}

export const errorLogger = new ErrorLogger()
```

### Task 5: Create Error Logs Database Migration

**Files:**
- Create: `backend/migrations/2026-04-02-error-logs.sql`

```sql
-- Create error_logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(36) UNIQUE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Error details
  code VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status_code INTEGER NOT NULL,

  -- Request info
  path VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  user_id UUID REFERENCES users(id),
  ip_address INET,
  user_agent TEXT,

  -- Error details
  details JSONB,
  errors JSONB,
  stack_trace TEXT,

  -- Suggestions
  suggestions TEXT[],
  documentation_url VARCHAR(500),

  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_dashboard ON error_logs(timestamp DESC, resolved);
```

### Task 6: Run Error Logs Migration

**Files:**
- Modify: Database (run migration)

Run the migration:
```bash
cd backend
psql $DATABASE_URL < migrations/2026-04-02-error-logs.sql
```

Expected output: Table and indexes created successfully

### Task 7: Create Error Middleware

**Files:**
- Create: `backend/src/middleware/errorHandler.ts`

```typescript
import { v4 as uuidv4 } from 'uuid'
import type { Context, Next } from 'hono'
import { AppError } from '../errors/index.js'
import { errorLogger } from '../services/errorLogger.js'
import { getSuggestions } from '../errors/suggestions.js'

export const errorHandler = async (c: Context, next: Next) => {
  const requestId = uuidv4()
  c.set('requestId', requestId)

  try {
    await next()
  } catch (error) {
    const timestamp = new Date().toISOString()
    const path = c.req.path
    const method = c.req.method

    if (error instanceof AppError) {
      const errorResponse = {
        ...error.toJSON(),
        requestId,
        timestamp,
        path,
        method,
      }

      // Log to database (async, non-blocking)
      errorLogger.log(error, {
        requestId,
        timestamp,
        path,
        method,
        userId: c.get('userId'),
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent'),
      })

      return c.json(errorResponse, error.statusCode)
    }

    // Handle unknown errors
    const internalError = {
      success: false,
      requestId,
      timestamp,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      path,
      method,
      suggestions: getSuggestions('INTERNAL_ERROR'),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }

    errorLogger.log(new AppError(error.message, 'INTERNAL_ERROR', 500), {
      requestId,
      timestamp,
      path,
      method,
      stack: error.stack,
    })

    return c.json(internalError, 500)
  }
}
```

### Task 8: Add Error Middleware to Main App

**Files:**
- Modify: `backend/src/index.ts`

Add the error middleware to the app:

```typescript
import { errorHandler } from './middleware/errorHandler.js'

// Apply error middleware to all routes
app.use('*', errorHandler)
```

Position: Add after other middleware, before routes

### Task 9: Update a Route to Use New Error Classes (Example)

**Files:**
- Modify: `backend/src/routes/users.ts` (or any existing route)

Example updating users route:

Before:
```typescript
users.get('/:id', async (c) => {
  const { id } = c.req.param()
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])

  if (result.rows.length === 0) {
    return c.json({ message: 'User not found' }, 404)
  }

  return c.json(result.rows[0])
})
```

After:
```typescript
import { NotFoundError } from '../errors/index.js'

users.get('/:id', async (c) => {
  const { id } = c.req.param()
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])

  if (result.rows.length === 0) {
    throw new NotFoundError('User')
  }

  return c.json(result.rows[0])
})
```

### Task 10: Test Backend Error Response

**Test:** Verify error responses include all fields

Run: Start backend server and make a request to a non-existent user

```bash
curl http://localhost:4000/api/users/00000000-0000-0000-0000-000000000000
```

Expected response:
```json
{
  "success": false,
  "requestId": "...",
  "timestamp": "2026-04-02T...",
  "code": "NOT_FOUND",
  "message": "User not found",
  "path": "/api/users/...",
  "method": "GET",
  "details": {},
  "suggestions": ["Verify the User exists", "Check the ID for typos"]
}
```

Verify:
- [ ] requestId is present and unique
- [ ] timestamp is present
- [ ] code matches error type
- [ ] message is user-friendly
- [ ] path and method are correct
- [ ] suggestions are included
- [ ] Entry created in error_logs table

### Task 11: Commit Backend Foundation

**Files:**
- Commit: All backend error handling files

```bash
git add backend/src/errors/ backend/src/middleware/errorHandler.ts backend/src/services/errorLogger.ts backend/migrations/
git commit -m "feat: add backend error handling foundation

- Add error classes (AppError, ValidationError, NotFoundError, etc.)
- Add error code registry and suggestion engine
- Add error logging service with async database logging
- Add error middleware for consistent error responses
- Add error_logs database table with indexes
- Update sample route to use new error classes

Error responses now include: requestId, timestamp, code, message, path, method, details, suggestions"
```

---

## Phase 2: Vue Frontend

### Task 12: Update API Client to Parse Full Error Response

**Files:**
- Modify: `imu-web-vue/src/lib/api-client.ts`

Add ApiError class with full error parsing:

```typescript
export class ApiError extends Error {
  requestId?: string
  timestamp?: string
  code?: string
  path?: string
  method?: string
  details?: Record<string, any>
  errors?: Array<{ field: string; message: string; value?: any }>
  suggestions?: string[]
  documentationUrl?: string
  stack?: string

  constructor(data: any, public status: number) {
    super(data.message || 'An error occurred')
    this.name = 'ApiError'
    this.requestId = data.requestId
    this.timestamp = data.timestamp
    this.code = data.code
    this.path = data.path
    this.method = data.method
    this.details = data.details
    this.errors = data.errors
    this.suggestions = data.suggestions
    this.documentationUrl = data.documentationUrl
    this.stack = import.meta.env.DEV ? data.stack : undefined
  }
}
```

### Task 13: Update Toast Component to Show Error Code and Request ID

**Files:**
- Modify: `imu-web-vue/src/components/ui/Toast.vue`

Add meta display for error code and request ID:

```vue
<template>
  <div class="toast" :class="`toast-${type}`">
    <component :is="icon" class="toast-icon" />
    <div class="toast-content">
      <h4 v-if="title">{{ title }}</h4>
      <p>{{ message }}</p>
      <div v-if="error" class="toast-meta">
        <span class="error-code">Code: {{ error.code }}</span>
        <span class="request-id">ID: {{ shortRequestId }}</span>
      </div>
    </div>
    <button @click="close" class="close-btn">
      <XMarkIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  type: 'success' | 'error' | 'info'
  title?: string
  message: string
  error?: ApiError
  duration?: number
}>()

const emit = defineEmits<{
  close: []
}>()

const icon = computed(() => {
  switch (props.type) {
    case 'success': return CheckCircleIcon
    case 'error': return ExclamationTriangleIcon
    case 'info': return InformationIcon
  }
})

const shortRequestId = computed(() => {
  return props.error?.requestId ? props.error.requestId.slice(0, 8) : ''
})

const close = () => emit('close')
</script>

<style scoped>
.toast-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  opacity: 0.8;
}

.error-code {
  background: rgba(0,0,0,0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.request-id {
  font-family: monospace;
}
</style>
```

### Task 14: Update useToast Composable to Support Error Parameter

**Files:**
- Modify: `imu-web-vue/src/composables/useToast.ts`

Add error parameter to showError:

```typescript
import { ref } from 'vue'
import type { ApiError } from '@/lib/api-client'

const toasts = ref<Array<{
  id: number
  type: 'success' | 'error' | 'info'
  title?: string
  message: string
  error?: ApiError
  duration: number
}>>([])

export function useToast() {
  const showError = (message: string, error?: ApiError) => {
    const toast = {
      id: Date.now(),
      type: 'error' as const,
      message,
      error,
      duration: 8000, // Longer for errors
    }
    toasts.value.push(toast)
    setTimeout(() => removeToast(toast.id), toast.duration)
    return toast.id
  }

  const showSuccess = (message: string, duration: number = 3000) => {
    const toast = {
      id: Date.now(),
      type: 'success' as const,
      message,
      duration,
    }
    toasts.value.push(toast)
    setTimeout(() => removeToast(toast.id), toast.duration)
    return toast.id
  }

  const showInfo = (message: string, duration: number = 5000) => {
    const toast = {
      id: Date.now(),
      type: 'info' as const,
      message,
      duration,
    }
    toasts.value.push(toast)
    setTimeout(() => removeToast(toast.id), toast.duration)
    return toast.id
  }

  const removeToast = (id: number) => {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts,
    showError,
    showSuccess,
    showInfo,
    removeToast,
  }
}
```

### Task 15: Update useErrorHandler Composable

**Files:**
- Modify: `imu-web-vue/src/composables/useErrorHandler.ts`

Update to pass full error to toast:

```typescript
import { useToast } from './useToast'
import type { ApiError } from '@/lib/api-client'

export function useErrorHandler() {
  const toast = useToast()

  const handle = (error: ApiError | Error) => {
    if (error instanceof ApiError) {
      toast.showError(error.message, error)
    } else {
      toast.showError('An unexpected error occurred')
    }

    if (import.meta.env.DEV) {
      console.error('Error:', error)
    }
  }

  return { handle }
}
```

### Task 16: Update a Form to Show Validation Errors Inline

**Files:**
- Modify: Any form component (e.g., `imu-web-vue/src/views/users/UserFormView.vue`)

Add inline validation error display:

```vue
<template>
  <form @submit.prevent="submit">
    <div class="form-field">
      <label>Email</label>
      <input v-model="form.email" type="email" />
      <span v-if="errors.email" class="field-error">
        {{ errors.email }}
      </span>
    </div>
    <button type="submit">Submit</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { apiClient } from '@/lib/api-client'

const errorHandler = useErrorHandler()
const form = ref({ email: '' })
const errors = ref<Record<string, string>>({})

const submit = async () => {
  try {
    await apiClient.post('/users', form.value)
    toast.showSuccess('User created')
  } catch (error: any) {
    if (error.code === 'VALIDATION_ERROR' && error.details?.errors) {
      error.details.errors.forEach((e: any) => {
        errors.value[e.field] = e.message
      })
    } else {
      errorHandler.handle(error)
    }
  }
}
</script>

<style scoped>
.field-error {
  color: #dc2626;
  font-size: 12px;
  margin-top: 4px;
  display: block;
}
</style>
```

### Task 17: Test Vue Error Display

**Test:** Verify error toasts show code + request ID

1. Start Vue dev server
2. Trigger an error (e.g., submit form with invalid data)
3. Verify toast shows:
   - [ ] User-friendly message
   - [ ] Error code (e.g., VALIDATION_ERROR)
   - [ ] Request ID (first 8 chars)
4. Verify validation errors show inline in form

### Task 18: Commit Vue Frontend Changes

**Files:**
- Commit: All Vue frontend error handling files

```bash
git add imu-web-vue/src/lib/api-client.ts imu-web-vue/src/composables/ imu-web-vue/src/components/ui/Toast.vue
git commit -m "feat: add error handling to Vue frontend

- Update API client to parse full error response
- Update toast to show error code and request ID
- Update useToast to support error parameter
- Update useErrorHandler to show detailed toasts
- Add inline validation error display to forms

Error toasts now show: message, error code, request ID
Validation errors show inline in form fields"
```

---

## Phase 3: Flutter Mobile

### Task 19: Create AppError Model

**Files:**
- Create: `mobile/imu_flutter/lib/models/error_model.dart`

```dart
class AppError {
  final String requestId;
  final String timestamp;
  final String code;
  final String message;

  AppError({
    required this.requestId,
    required this.timestamp,
    required this.code,
    required this.message,
  });

  factory AppError.fromJson(Map<String, dynamic> json) {
    return AppError(
      requestId: json['requestId'] ?? '',
      timestamp: json['timestamp'] ?? '',
      code: json['code'] ?? 'UNKNOWN_ERROR',
      message: json['message'] ?? 'An error occurred',
    );
  }

  String get shortRequestId => requestId.substring(0, 8);
}
```

### Task 20: Create Error Service

**Files:**
- Create: `mobile/imu_flutter/lib/services/error_service.dart`

```dart
import 'package:flutter/material.dart';

class ErrorService {
  static void showError(BuildContext context, AppError error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error.message),
            const SizedBox(height: 4),
            Text(
              'Code: ${error.code} | ID: ${error.shortRequestId}',
              style: const TextStyle(
                fontSize: 11,
                color: Colors.white70,
              ),
            ),
          ],
        ),
        backgroundColor: Colors.red.shade700,
        duration: const Duration(seconds: 5),
        action: SnackBarAction(
          label: 'Close',
          textColor: Colors.white,
          onPressed: () {
            ScaffoldMessenger.of(context).hideCurrentSnackBar();
          },
        ),
      ),
    );
  }

  static void showSuccess(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green.shade700,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  static void showInfo(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.blue.shade700,
        duration: const Duration(seconds: 4),
      ),
    );
  }
}
```

### Task 21: Update API Service to Parse Errors

**Files:**
- Modify: `mobile/imu_flutter/lib/services/api_service.dart`

Update to parse AppError from response:

```dart
import 'dart:convert';
import '../models/error_model.dart';

class ApiService {
  // ... existing code ...

  Future<T> request<T>(
    String method,
    String path, {
    dynamic body,
    Map<String, dynamic>? query,
  }) async {
    try {
      final response = await _makeRequest(method, path, body, query);

      if (response.statusCode >= 400) {
        final errorData = json.decode(response.body);
        throw AppError.fromJson(errorData);
      }

      return _parseResponse<T>(response);
    } on AppError {
      rethrow;
    } on SocketException catch (e) {
      throw AppError(
        requestId: _generateRequestId(),
        timestamp: DateTime.now().toIso8601String(),
        code: 'NETWORK_ERROR',
        message: 'No internet connection',
      );
    } catch (e) {
      throw AppError(
        requestId: _generateRequestId(),
        timestamp: DateTime.now().toIso8601String(),
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
      );
    }
  }

  String _generateRequestId() {
    return DateTime.now().millisecondsSinceEpoch.toString();
  }
}
```

### Task 22: Update a Flutter Screen to Use Error Service

**Files:**
- Modify: Any screen with API calls (e.g., `mobile/imu_flutter/lib/features/clients/screens/client_form_screen.dart`)

Update to use ErrorService:

```dart
import 'package:flutter/material.dart';
import '../../../services/error_service.dart';
import '../../../services/api_service.dart';

class ClientFormScreen extends StatefulWidget {
  @override
  State<ClientFormScreen> createState() => _ClientFormScreenState();
}

class _ClientFormScreenState extends State<ClientFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final Map<String, String> _fieldErrors = {};
  final apiService = ApiService();

  Future<void> _submit() async {
    setState(() => _fieldErrors.clear());

    try {
      await apiService.post('/clients', {
        'email': _emailController.text,
      });

      ErrorService.showSuccess(context, 'Client created');
      Navigator.pop(context);
    } on AppError catch (error) {
      if (error.code == 'VALIDATION_ERROR') {
        // Parse field errors from error.details
        setState(() {
          _fieldErrors['email'] = 'Invalid email format';
        });
      } else {
        ErrorService.showError(context, error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Client')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: 'Email',
                errorText: _fieldErrors['email'],
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _submit,
              child: const Text('Create Client'),
            ),
          ],
        ),
      ),
    );
  }
}
```

### Task 23: Test Flutter Error Display

**Test:** Verify error snackbars show code + request ID

1. Start Flutter app
2. Navigate to a form
3. Submit with invalid data
4. Verify SnackBar shows:
   - [ ] User-friendly message
   - [ ] Error code (e.g., VALIDATION_ERROR)
   - [ ] Request ID (first 8 chars)
5. Verify validation errors show inline in form fields

### Task 24: Commit Flutter Mobile Changes

**Files:**
- Commit: All Flutter mobile error handling files

```bash
git add mobile/imu_flutter/lib/models/error_model.dart mobile/imu_flutter/lib/services/error_service.dart mobile/imu_flutter/lib/services/api_service.dart
git commit -m "feat: add error handling to Flutter mobile

- Add AppError model with code, message, requestId
- Add ErrorService for showing error snackbars
- Update API service to parse error responses
- Update sample screen to use ErrorService
- Add inline validation error display to forms

Error snackbars now show: message, error code, request ID
Validation errors show inline in form fields"
```

---

## Phase 4: Admin Dashboard

### Task 25: Create Error Logs Admin Routes

**Files:**
- Create: `backend/src/routes/error-logs.ts`

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { pool } from '../db/index.js'

const errorLogs = new Hono()

// Get all error logs (paginated, filtered)
errorLogs.get('/', authMiddleware, requireAdmin, async (c) => {
  const { code, resolved, limit = '50', offset = '0' } = c.req.query()

  let query = 'SELECT * FROM error_logs WHERE 1=1'
  const params: any[] = []

  if (code) {
    params.push(code)
    query += ` AND code = $${params.length}`
  }

  if (resolved !== undefined) {
    params.push(resolved === 'true')
    query += ` AND resolved = $${params.length}`
  }

  params.push(limit, offset)
  query += ` ORDER BY timestamp DESC LIMIT $${params.length} OFFSET $${params.length + 1}`

  const result = await pool.query(query, params)
  return c.json(result.rows)
})

// Get error by ID
errorLogs.get('/:id', authMiddleware, requireAdmin, async (c) => {
  const { id } = c.req.param()
  const result = await pool.query(
    'SELECT * FROM error_logs WHERE id = $1',
    [id]
  )
  return c.json(result.rows[0])
})

// Get error by request ID
errorLogs.get('/request/:requestId', authMiddleware, requireAdmin, async (c) => {
  const { requestId } = c.req.param()
  const result = await pool.query(
    'SELECT * FROM error_logs WHERE request_id = $1',
    [requestId]
  )
  return c.json(result.rows[0])
})

// Mark as resolved
errorLogs.patch('/:id/resolve', authMiddleware, requireAdmin, async (c) => {
  const { id } = c.req.param()
  const { notes } = await c.req.json()
  const userId = c.get('userId')

  await pool.query(
    `UPDATE error_logs
     SET resolved = true, resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
     WHERE id = $3`,
    [userId, notes, id]
  )

  return c.json({ success: true })
})

// Get error statistics
errorLogs.get('/stats/summary', authMiddleware, requireAdmin, async (c) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } = c.req.query()

  const result = await pool.query(
    `SELECT
       code,
       COUNT(*) as count,
       COUNT(*) FILTER (WHERE resolved = false) as unresolved
     FROM error_logs
     WHERE timestamp >= $1
     GROUP BY code
     ORDER BY count DESC`,
    [startDate]
  )

  return c.json(result.rows)
})

export default errorLogs
```

### Task 26: Register Error Logs Routes in Main App

**Files:**
- Modify: `backend/src/index.ts`

Add error logs routes:

```typescript
import errorLogsRoutes from './routes/error-logs.js'

app.route('/error-logs', errorLogsRoutes)
```

### Task 27: Create Error Logs Admin Page Component

**Files:**
- Create: `imu-web-vue/src/views/admin/ErrorLogsView.vue`

```vue
<template>
  <div class="error-logs-page p-6">
    <div class="page-header flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Error Logs</h1>
      <div class="filters flex gap-4">
        <select v-model="filters.code" class="border rounded px-3 py-2">
          <option value="">All Codes</option>
          <option v-for="code in errorCodes" :key="code" :value="code">
            {{ code }}
          </option>
        </select>
        <select v-model="filters.resolved" class="border rounded px-3 py-2">
          <option value="">All Status</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
        <button @click="loadLogs" class="bg-blue-500 text-white px-4 py-2 rounded">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-8">Loading...</div>

    <table v-else class="w-full border-collapse">
      <thead>
        <tr class="bg-gray-100">
          <th class="border p-2 text-left">Time</th>
          <th class="border p-2 text-left">Code</th>
          <th class="border p-2 text-left">Message</th>
          <th class="border p-2 text-left">User</th>
          <th class="border p-2 text-left">Path</th>
          <th class="border p-2 text-left">Status</th>
          <th class="border p-2 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id" :class="{ 'bg-green-50': log.resolved }">
          <td class="border p-2">{{ formatTime(log.timestamp) }}</td>
          <td class="border p-2"><code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ log.code }}</code></td>
          <td class="border p-2">{{ log.message }}</td>
          <td class="border p-2">{{ log.user_email || '-' }}</td>
          <td class="border p-2"><code class="text-xs">{{ log.method }} {{ log.path }}</code></td>
          <td class="border p-2">{{ log.resolved ? '✓ Resolved' : 'Open' }}</td>
          <td class="border p-2">
            <button @click="viewDetails(log)" class="text-blue-500 mr-2">View</button>
            <button v-if="!log.resolved" @click="resolveLog(log)" class="text-green-500">
              Resolve
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Error Details Modal -->
    <div v-if="selectedLog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" @click.self="selectedLog = null">
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
        <h2 class="text-xl font-bold mb-4">Error Details</h2>
        <dl class="space-y-2">
          <div class="bg-gray-50 p-2 rounded">
            <dt class="font-semibold">Request ID</dt>
            <dd><code class="text-sm bg-gray-200 px-2 py-1 rounded">{{ selectedLog.request_id }}</code></dd>
          </div>
          <dt class="font-semibold">Time</dt>
          <dd>{{ formatTime(selectedLog.timestamp) }}</dd>
          <dt class="font-semibold">Code</dt>
          <dd><code>{{ selectedLog.code }}</code></dd>
          <dt class="font-semibold">Message</dt>
          <dd>{{ selectedLog.message }}</dd>
          <dt class="font-semibold">Endpoint</dt>
          <dd><code>{{ selectedLog.method }} {{ selectedLog.path }}</code></dd>
          <dt class="font-semibold">User</dt>
          <dd>{{ selectedLog.user_email || '-' }}</dd>
        </dl>
        <div v-if="selectedLog.errors" class="mt-4">
          <h3 class="font-semibold mb-2">Field Errors</h3>
          <ul class="list-disc pl-5">
            <li v-for="err in selectedLog.errors" :key="err.field">
              <strong>{{ err.field }}</strong>: {{ err.message }}
            </li>
          </ul>
        </div>
        <div v-if="selectedLog.suggestions?.length" class="mt-4">
          <h3 class="font-semibold mb-2">Suggestions</h3>
          <ul class="list-disc pl-5">
            <li v-for="s in selectedLog.suggestions" :key="s">{{ s }}</li>
          </ul>
        </div>
        <div v-if="selectedLog.stack_trace" class="mt-4">
          <h3 class="font-semibold mb-2">Stack Trace</h3>
          <pre class="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">{{ selectedLog.stack_trace }}</pre>
        </div>
        <div v-if="selectedLog.resolved" class="mt-4 bg-green-50 p-3 rounded">
          <h3 class="font-semibold mb-1">Resolution</h3>
          <p>Resolved by {{ selectedLog.resolved_by_name }} at {{ formatTime(selectedLog.resolved_at) }}</p>
          <p class="text-gray-600">{{ selectedLog.resolution_notes }}</p>
        </div>
        <button @click="selectedLog = null" class="mt-4 bg-gray-200 px-4 py-2 rounded">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiClient } from '@/lib/api-client'

const logs = ref([])
const selectedLog = ref(null)
const loading = ref(false)
const filters = ref({ code: '', resolved: '' })

const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DATABASE_ERROR',
  'INTERNAL_ERROR',
]

const loadLogs = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (filters.value.code) params.set('code', filters.value.code)
    if (filters.value.resolved) params.set('resolved', filters.value.resolved)

    logs.value = await apiClient.get(`/error-logs?${params}`)
  } finally {
    loading.value = false
  }
}

const viewDetails = (log: any) => {
  selectedLog.value = log
}

const resolveLog = async (log: any) => {
  const notes = prompt('Resolution notes:')
  if (notes) {
    await apiClient.patch(`/error-logs/${log.id}/resolve`, { notes })
    loadLogs()
  }
}

const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

onMounted(() => {
  loadLogs()
})
</script>
```

### Task 28: Add Error Logs Route to Router

**Files:**
- Modify: `imu-web-vue/src/router/index.ts`

Add error logs route:

```typescript
{
  path: '/admin/error-logs',
  name: 'admin-error-logs',
  component: () => import('@/views/admin/ErrorLogsView.vue'),
  meta: { requiresAuth: true, requiresRole: 'admin' }
}
```

### Task 29: Test Admin Dashboard

**Test:** Verify admin error logs page works

1. Navigate to `/admin/error-logs`
2. Verify:
   - [ ] Page loads and shows error logs
   - [ ] Filters work (by code, resolved status)
   - [ ] Can view error details
   - [ ] Can mark errors as resolved
   - [ ] Refresh button works

### Task 30: Commit Admin Dashboard

**Files:**
- Commit: Admin dashboard files

```bash
git add backend/src/routes/error-logs.ts imu-web-vue/src/views/admin/ErrorLogsView.vue
git commit -m "feat: add error logs admin dashboard

- Add error logs admin routes (list, view, resolve, stats)
- Add error logs admin page with filters and details modal
- Add error resolution workflow with notes
- Add error logs route to Vue router

Admin can now view, search, and resolve errors"
```

---

## Phase 5: Documentation & Testing

### Task 31: Create Error Documentation Generator Script

**Files:**
- Create: `backend/src/scripts/generate-error-docs.ts`

```typescript
import { ErrorCodes } from '../errors/codes.js'
import { ErrorSuggestions } from '../errors/suggestions.js'
import { writeFileSync } from 'fs'

const userMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Please check your input and try again',
  UNAUTHORIZED: 'Please log in to continue',
  FORBIDDEN: "You don't have permission to do this",
  NOT_FOUND: 'The requested item was not found',
  DATABASE_ERROR: 'A database error occurred. Please try again.',
  INTERNAL_ERROR: 'An unexpected error occurred',
}

function generateDocs() {
  let markdown = '# Error Codes Reference\n\n'
  markdown += 'Generated from error definitions. Last updated: ' + new Date().toISOString() + '\n\n'

  for (const [key, code] of Object.entries(ErrorCodes)) {
    markdown += `## ${code}\n`
    markdown += `**Status:** 4xx/5xx (varies)\n`
    markdown += `**User Message:** "${userMessages[code] || 'An error occurred'}"\n\n`
    markdown += `**Suggestions:**\n`
    for (const suggestion of ErrorSuggestions[code] || []) {
      markdown += `- ${suggestion}\n`
    }
    markdown += '\n'
  }

  writeFileSync('docs/feature-analysis/backend/error-codes.md', markdown)
  console.log('✅ Error documentation generated: docs/feature-analysis/backend/error-codes.md')
}

generateDocs()
```

### Task 32: Generate Error Documentation

**Files:**
- Run: Documentation generator

```bash
cd backend
npx tsx scripts/generate-error-docs.ts
```

Expected output:
```
✅ Error documentation generated: docs/feature-analysis/backend/error-codes.md
```

### Task 33: Add Error Docs Generator to package.json Scripts

**Files:**
- Modify: `backend/package.json`

Add script:

```json
{
  "scripts": {
    "generate-error-docs": "tsx scripts/generate-error-docs.ts"
  }
}
```

### Task 34: End-to-End Testing

**Test:** Complete error flow test

1. **Backend:**
   - Make request to non-existent resource
   - Verify error response format
   - Check error_logs table has entry

2. **Vue Frontend:**
   - Trigger validation error
   - Verify toast shows code + request ID
   - Verify inline field errors

3. **Flutter Mobile:**
   - Trigger validation error
   - Verify snackbar shows code + request ID
   - Verify inline field errors

4. **Admin:**
   - View error in admin dashboard
   - Mark as resolved with notes
   - Verify resolution recorded

### Task 35: Performance Testing

**Test:** Verify async logging doesn't block responses

1. Make 100 concurrent requests to erroring endpoint
2. Measure response times (all should be <100ms)
3. Check error_logs table has 100 entries
4. Verify no duplicate request IDs

### Task 36: Final Documentation Update

**Files:**
- Update: `docs/feature-analysis/backend/error-codes.md` (if needed)

Add any missing error codes or update suggestions.

### Task 37: Final Commit

**Files:**
- Commit: All remaining files

```bash
git add backend/src/scripts/generate-error-docs.ts backend/package.json docs/feature-analysis/backend/error-codes.md
git commit -m "feat: add error documentation generator

- Add error documentation generator script
- Generate initial error codes documentation
- Add generate-error-docs script to package.json
- Complete end-to-end and performance testing

Error handling system fully implemented and tested"
```

---

## Success Criteria Checklist

Verify all criteria are met:

- [ ] All backend errors return consistent format with requestId, timestamp, code, message, details, suggestions
- [ ] All errors logged to error_logs table asynchronously
- [ ] Vue admin shows error toasts with code + request ID
- [ ] Flutter app shows error snackbars with code + request ID
- [ ] Both platforms show validation errors inline in forms
- [ ] Admin can view, search, and resolve errors via dashboard
- [ ] Error codes documented in docs/feature-analysis/backend/error-codes.md
- [ ] Request IDs are unique and consistent across logs and responses
- [ ] Development mode includes stack traces in responses
- [ ] Async logging adds <10ms overhead to responses

---

## Testing Commands

**Backend:**
```bash
# Test error response format
curl http://localhost:4000/api/users/invalid-id

# Check error_logs table
psql $DATABASE_URL -c "SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT 5"

# Run error docs generator
cd backend && npm run generate-error-docs
```

**Vue Frontend:**
```bash
# Start dev server
cd imu-web-vue && pnpm dev

# Navigate to app and trigger errors
```

**Flutter Mobile:**
```bash
# Run app
cd mobile/imu_flutter && flutter run

# Navigate to forms and trigger errors
```

---

## Notes

- **Error codes** are defined in `backend/src/errors/codes.ts`
- **Suggestions** are defined in `backend/src/errors/suggestions.ts`
- **Database logging** is async and non-blocking - failures don't affect responses
- **Validation errors** should show inline in forms, not in toasts/snackbars
- **Request IDs** should be included in support tickets for debugging
- **Stack traces** only included in development mode
