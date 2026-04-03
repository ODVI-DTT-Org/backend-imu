# Error Handling System Design

> **Date:** 2026-04-02
> **Status:** Approved
> **Author:** AI Agent
> **Type:** Error handling infrastructure

---

## Overview

Build a comprehensive error handling system that provides detailed error information for debugging while displaying simple, consistent error messages to users across all platforms.

**Key Features:**
- Rich backend error responses with requestId, timestamp, path, details, suggestions
- Async database logging for all errors
- Simple, consistent error display across Vue web admin and Flutter mobile
- Error codes and request IDs for support reference
- Admin dashboard for viewing and resolving errors

**Display Philosophy:**
- **Backend:** Captures everything (stack traces, details, suggestions)
- **Frontend:** Shows simple, actionable errors (message, code, request ID)
- **Admin:** Full error details and resolution workflow

---

## Backend Design

### Error Response Format

```typescript
{
  success: false,
  requestId: string,           // UUID for tracing
  timestamp: string,            // ISO 8601
  code: string,                 // Error code
  message: string,              // User-friendly message
  path: string,                 // Endpoint path
  method: string,               // HTTP method
  details: object,              // Additional context
  errors: Array<{               // Validation errors
    field: string,
    message: string,
    value?: any
  }>,
  suggestions: Array<string>,   // Resolution steps
  documentationUrl?: string,    // Link to docs
  stack?: string                // Dev mode only
}
```

### Error Classes

**File:** `backend/src/errors/index.ts`

```typescript
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
  }

  // Fluent methods
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
      suggestions: this.suggestions,
      documentationUrl: this.documentationUrl,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    }
  }
}

// Specific error types
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 422)
  }

  addFieldError(field: string, message: string, value?: any) {
    if (!this.details.errors) this.details.errors = []
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

### Error Code Registry

**File:** `backend/src/errors/codes.ts`

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

### Error Suggestions Engine

**File:** `backend/src/errors/suggestions.ts`

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
}

export function getSuggestions(code: string): string[] {
  return ErrorSuggestions[code] || [
    'An error occurred',
    'Try again',
    'Contact support if the problem persists',
  ]
}
```

### Error Middleware

**File:** `backend/src/middleware/errorHandler.ts`

```typescript
import { v4 as uuidv4 } from 'uuid'
import { Context } from 'hono'
import { AppError } from '../errors/index.js'
import { errorLogger } from '../services/errorLogger.js'
import { getSuggestions } from '../errors/suggestions.js'

export const errorHandler = async (c: Context, next: Next) => {
  // Generate request ID at start
  const requestId = uuidv4()
  c.set('requestId', requestId)

  try {
    await next()
  } catch (error) {
    const timestamp = new Date().toISOString()
    const path = c.req.path
    const method = c.req.method

    // Handle AppError
    if (error instanceof AppError) {
      const errorResponse = {
        ...error.toJSON(),
        requestId,
        timestamp,
        path,
        method,
        suggestions: error.suggestions.length > 0
          ? error.suggestions
          : getSuggestions(error.code),
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
      }).catch(console.error) // Don't throw if logging fails

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

    // Log to database
    errorLogger.log(new AppError(error.message, 'INTERNAL_ERROR', 500), {
      requestId,
      timestamp,
      path,
      method,
      stack: error.stack,
    }).catch(console.error)

    return c.json(internalError, 500)
  }
}
```

### Error Logging Service

**File:** `backend/src/services/errorLogger.ts`

```typescript
import { pool } from '../db/index.js'

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
      // Log to console if database logging fails
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

### Error Logs Database Table

**Migration:** `backend/migrations/YYYY-MM-DD-error-logs.sql`

```sql
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_code ON error_logs(code);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_request_id ON error_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_dashboard ON error_logs(timestamp DESC, resolved);
```

### Route Usage Example

**Before:**
```typescript
users.post('/', async (c) => {
  const data = await c.req.json()
  // Manual validation
  if (!data.email) {
    return c.json({ message: 'Email is required' }, 422)
  }
  // Manual error handling
  try {
    const user = await db.query('INSERT INTO users...', [data.email])
    return c.json(user)
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return c.json({ message: 'Email already exists' }, 409)
    }
    return c.json({ message: 'Failed to create user' }, 500)
  }
})
```

**After:**
```typescript
import { ValidationError, ConflictError, DatabaseError } from '../errors/index.js'

users.post('/', async (c) => {
  const data = await c.req.json()

  // Use error class
  if (!data.email) {
    throw new ValidationError('Email is required')
      .addFieldError('email', 'Email is required')
  }

  // Let middleware handle database errors
  const user = await db.query('INSERT INTO users...', [data.email])
  return c.json(user)
}) // Middleware catches and formats errors
```

---

## Frontend Design (Both Platforms)

### Display Philosophy

**Consistent Simple Display:**
```
┌─────────────────────────────────────┐
│ ⚠️  Invalid email format             │
│ Code: VALIDATION_ERROR | ID: a1b2c3d4│
│                            [Close]  │
└─────────────────────────────────────┘
```

**What shows:**
- User-friendly message
- Error code (for support reference)
- Short request ID (first 8 chars)

**What's hidden:**
- Field details (show inline in forms instead)
- Stack traces (dev console only)
- Suggestions (in documentation, not UI)
- Technical details

---

## Vue Web Admin

### Toast Component (Simplified)

**File:** `imu-web-vue/src/components/ui/Toast.vue`

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

### API Client

**File:** `imu-web-vue/src/lib/api-client.ts`

```typescript
export class ApiError extends Error {
  requestId?: string
  code?: string
  timestamp?: string

  constructor(data: any, public status: number) {
    super(data.message || 'An error occurred')
    this.name = 'ApiError'
    this.requestId = data.requestId
    this.code = data.code
    this.timestamp = data.timestamp
  }
}

export class ApiClient {
  async request<T>(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new ApiError(errorData, response.status)
    }

    return response.json()
  }
}
```

### useErrorHandler Composable

**File:** `imu-web-vue/src/composables/useErrorHandler.ts`

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

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('Error:', error)
    }
  }

  return { handle }
}
```

### Validation Errors - Inline Display

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
    // Handle validation errors inline
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

---

## Flutter Mobile

### Error Model

**File:** `mobile/imu_flutter/lib/models/error_model.dart`

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

### Error Display (SnackBar)

**File:** `mobile/imu_flutter/lib/services/error_service.dart`

```dart
class ErrorService {
  static void showError(BuildContext context, AppError error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error.message),
            SizedBox(height: 4),
            Text(
              'Code: ${error.code} | ID: ${error.shortRequestId}',
              style: TextStyle(
                fontSize: 11,
                color: Colors.white70,
              ),
            ),
          ],
        ),
        backgroundColor: Colors.red.shade700,
        duration: Duration(seconds: 5),
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
        duration: Duration(seconds: 3),
      ),
    );
  }
}
```

### API Service Error Handling

**File:** `mobile/imu_flutter/lib/services/api_service.dart`

```dart
class ApiService {
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
}
```

### Validation Errors - Inline Display

```dart
class ClientFormScreen extends StatefulWidget {
  @override
  State<ClientFormScreen> createState() => _ClientFormScreenState();
}

class _ClientFormScreenState extends State<ClientFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final Map<String, String> _fieldErrors = {};

  Future<void> _submit() async {
    setState(() => _fieldErrors.clear());

    try {
      final apiService = ref.read(apiServiceProvider);
      await apiService.post('/clients', {
        'email': _emailController.text,
      });

      ErrorService.showSuccess(context, 'Client created');
      Navigator.pop(context);
    } on AppError catch (error) {
      if (error.code == 'VALIDATION_ERROR') {
        setState(() {
          // Parse field errors from error.details
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
      appBar: AppBar(title: Text('New Client')),
      body: Form(
        key: _formKey,
        child: ListView(
          children: [
            TextFormField(
              controller: _emailController,
              decoration: InputDecoration(
                labelText: 'Email',
                errorText: _fieldErrors['email'],
              ),
            ),
            ElevatedButton(
              onPressed: _submit,
              child: Text('Create Client'),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## Error Documentation

### Error Codes Reference

**Generated file:** `docs/feature-analysis/backend/error-codes.md`

```markdown
# Error Codes Reference

Generated from error definitions. Do not edit manually.

## VALIDATION_ERROR
**Status:** 422
**Description:** Request validation failed

**Common Causes:**
- Missing required fields
- Invalid field formats
- Constraint violations

**User Message:** "Please check your input and try again"

**Suggestions:**
- Check that all required fields are included
- Verify field formats (email, dates, etc.)

## UNAUTHORIZED
**Status:** 401
**Description:** Authentication required

**Common Causes:**
- Not logged in
- Session expired
- Invalid token

**User Message:** "Please log in to continue"

**Suggestions:**
- Log in to your account
- Your session may have expired

## FORBIDDEN
**Status:** 403
**Description:** Insufficient permissions

**Common Causes:**
- Trying to access resource without permission
- Role doesn't have required access

**User Message:** "You don't have permission to do this"

**Suggestions:**
- Contact your administrator
- Check your account permissions

## NOT_FOUND
**Status:** 404
**Description:** Resource not found

**Common Causes:**
- Incorrect ID
- Resource was deleted
- Wrong endpoint

**User Message:** "The requested item was not found"

**Suggestions:**
- Verify the ID is correct
- It may have been deleted

## DATABASE_ERROR
**Status:** 500
**Description:** Database operation failed

**Common Causes:**
- Temporary database issue
- Connection problem

**User Message:** "A database error occurred. Please try again."

**Suggestions:**
- Try again in a few moments
- Contact support if it persists
```

### Documentation Generator Script

**File:** `backend/src/scripts/generate-error-docs.ts`

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
  markdown += 'Generated from error definitions. Do not edit manually.\n\n'

  for (const [key, code] of Object.entries(ErrorCodes)) {
    markdown += `## ${code}\n`
    markdown += `**Code:** \`${code}\`\n`
    markdown += `**User Message:** "${userMessages[code] || 'An error occurred'}"\n\n`
    markdown += `**Suggestions:**\n`
    for (const suggestion of ErrorSuggestions[code] || []) {
      markdown += `- ${suggestion}\n`
    }
    markdown += '\n'
  }

  writeFileSync('docs/error-codes.md', markdown)
  console.log('Error documentation generated')
}

generateDocs()
```

---

## Admin Dashboard

### Error Logs Page

**New file:** `imu-web-vue/src/views/admin/ErrorLogsView.vue`

```vue
<template>
  <div class="error-logs-page">
    <div class="page-header">
      <h1>Error Logs</h1>
      <div class="filters">
        <select v-model="filters.code">
          <option value="">All Codes</option>
          <option v-for="code in errorCodes" :key="code" :value="code">
            {{ code }}
          </option>
        </select>
        <select v-model="filters.resolved">
          <option value="">All Status</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
        <button @click="loadLogs">Refresh</button>
      </div>
    </div>

    <table class="error-logs-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Code</th>
          <th>Message</th>
          <th>User</th>
          <th>Path</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id" :class="{ resolved: log.resolved }">
          <td>{{ formatTime(log.timestamp) }}</td>
          <td><code>{{ log.code }}</code></td>
          <td>{{ log.message }}</td>
          <td>{{ log.user_email || '-' }}</td>
          <td><code>{{ log.method }} {{ log.path }}</code></td>
          <td>{{ log.resolved ? '✓ Resolved' : 'Open' }}</td>
          <td>
            <button @click="viewDetails(log)">View</button>
            <button v-if="!log.resolved" @click="resolveLog(log)">
              Resolve
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Error Details Modal -->
    <Modal v-if="selectedLog" @close="selectedLog = null">
      <div class="error-details">
        <h2>Error Details</h2>
        <dl>
          <dt>Request ID</dt>
          <dd><code>{{ selectedLog.request_id }}</code></dd>
          <dt>Time</dt>
          <dd>{{ formatTime(selectedLog.timestamp) }}</dt>
          <dt>Code</dt>
          <dd><code>{{ selectedLog.code }}</code></dd>
          <dt>Message</dt>
          <dd>{{ selectedLog.message }}</dd>
          <dt>Endpoint</dt>
          <dd><code>{{ selectedLog.method }} {{ selectedLog.path }}</code></dd>
          <dt>User</dt>
          <dd>{{ selectedLog.user_email || '-' }}</dd>
          <dt>IP Address</dt>
          <dd>{{ selectedLog.ip_address || '-' }}</dd>
        </dl>
        <div v-if="selectedLog.errors" class="field-errors">
          <h3>Field Errors</h3>
          <ul>
            <li v-for="err in selectedLog.errors" :key="err.field">
              <strong>{{ err.field }}</strong>: {{ err.message }}
            </li>
          </ul>
        </div>
        <div v-if="selectedLog.suggestions?.length" class="suggestions">
          <h3>Suggestions</h3>
          <ul>
            <li v-for="s in selectedLog.suggestions" :key="s">{{ s }}</li>
          </ul>
        </div>
        <div v-if="selectedLog.stack_trace" class="stack-trace">
          <h3>Stack Trace</h3>
          <pre>{{ selectedLog.stack_trace }}</pre>
        </div>
        <div v-if="selectedLog.resolved" class="resolution">
          <h3>Resolution</h3>
          <p>Resolved by {{ selectedLog.resolved_by_name }} at {{ formatTime(selectedLog.resolved_at) }}</p>
          <p>{{ selectedLog.resolution_notes }}</p>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiClient } from '@/lib/api-client'

const logs = ref([])
const selectedLog = ref(null)
const filters = ref({ code: '', resolved: '' })
const errorCodes = Object.keys(ErrorCodes)

const loadLogs = async () => {
  const params = new URLSearchParams()
  if (filters.value.code) params.set('code', filters.value.code)
  if (filters.value.resolved) params.set('resolved', filters.value.resolved)

  logs.value = await apiClient.get(`/admin/error-logs?${params}`)
}

const viewDetails = (log) => {
  selectedLog.value = log
}

const resolveLog = async (log) => {
  const notes = prompt('Resolution notes:')
  if (notes) {
    await apiClient.patch(`/admin/error-logs/${log.id}/resolve`, { notes })
    loadLogs()
  }
}

onMounted(() => {
  loadLogs()
})
</script>
```

### Error Stats Dashboard

```vue
<template>
  <div class="error-stats">
    <h2>Error Statistics</h2>
    <div class="stats-cards">
      <div class="stat-card">
        <h3>Total Errors</h3>
        <p class="value">{{ stats.total }}</p>
      </div>
      <div class="stat-card">
        <h3>Unresolved</h3>
        <p class="value error">{{ stats.unresolved }}</p>
      </div>
      <div class="stat-card">
        <h3>This Week</h3>
        <p class="value">{{ stats.thisWeek }}</p>
      </div>
    </div>
    <h3>Errors by Code</h3>
    <table class="by-code-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Count</th>
          <th>Unresolved</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in stats.byCode" :key="item.code">
          <td><code>{{ item.code }}</code></td>
          <td>{{ item.count }}</td>
          <td>{{ item.unresolved }}</td>
          <td>{{ item.trend }}%</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

### Admin Routes

**New file:** `backend/src/routes/error-logs.ts`

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const errorLogs = new Hono()

// Get all error logs (paginated, filtered)
errorLogs.get('/', authMiddleware, requireAdmin, async (c) => {
  const { code, resolved, limit = 50, offset = 0 } = c.req.query()

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

---

## Implementation Phases

### Phase 1: Backend Foundation (2-3 days)

**Tasks:**
1. Create error classes (`backend/src/errors/index.ts`)
   - AppError base class
   - ValidationError, NotFoundError, etc.
   - Fluent methods for adding details

2. Create error codes registry (`backend/src/errors/codes.ts`)

3. Create error suggestions engine (`backend/src/errors/suggestions.ts`)

4. Create error logging service (`backend/src/services/errorLogger.ts`)
   - Async database logging
   - Query methods for admin

5. Create error logs migration
   - Run migration to create error_logs table

6. Create error middleware (`backend/src/middleware/errorHandler.ts`)
   - Request ID generation
   - Error formatting
   - Async database logging

7. Update existing routes
   - Replace manual error handling with error classes
   - Remove try-catch blocks (middleware handles)

**Deliverable:** Backend returns consistent, detailed error responses and logs to database

**Testing:**
- Verify error responses include all fields
- Verify database logging works (async, non-blocking)
- Verify requestId is consistent
- Test different error types

---

### Phase 2: Vue Frontend (1 day)

**Tasks:**
1. Update Toast component
   - Add error code and request ID display

2. Update useToast composable
   - Support passing ApiError

3. Update API client
   - Parse full error response
   - Create ApiError class

4. Update useErrorHandler composable
   - Show toasts with error details

5. Update forms with inline validation errors
   - Show field errors inline, not in toast

6. Update existing components
   - Replace error handling with new pattern

**Deliverable:** Vue admin shows consistent error toasts with code + request ID

**Testing:**
- Verify toasts show error code and request ID
- Verify validation errors show inline
- Verify console logs in dev mode
- Test different error scenarios

---

### Phase 3: Flutter Mobile (1 day)

**Tasks:**
1. Create AppError model (`mobile/imu_flutter/lib/models/error_model.dart`)

2. Create ErrorService (`mobile/imu_flutter/lib/services/error_service.dart`)
   - showError method with SnackBar
   - showSuccess method

3. Update API service
   - Parse error response
   - Throw AppError on 4xx/5xx

4. Update forms with inline validation errors
   - Show field errors in FormField

5. Update existing screens
   - Replace error handling with ErrorService

**Deliverable:** Flutter app shows consistent error snackbars with code + request ID

**Testing:**
- Verify snackbars show error code and request ID
- Verify validation errors show inline
- Test different error scenarios
- Verify consistent display with Vue

---

### Phase 4: Admin & Documentation (1 day)

**Tasks:**
1. Create error logs admin routes
   - GET /api/admin/error-logs
   - GET /api/admin/error-logs/:id
   - PATCH /api/admin/error-logs/:id/resolve
   - GET /api/admin/error-logs/stats

2. Create error logs admin page (Vue)
   - List all errors with filters
   - View error details modal
   - Mark as resolved with notes
   - Search by request ID

3. Create error stats dashboard
   - Total errors, unresolved count
   - Errors by code
   - Trend indicators

4. Create error documentation generator script
   - Parse error codes
   - Generate Markdown docs
   - Run on build/manual

5. Generate initial error documentation

**Deliverable:** Admin can view, search, and resolve errors; Complete error docs

**Testing:**
- Verify admin page loads and filters work
- Test error resolution workflow
- Verify stats are accurate
- Review generated documentation

---

### Phase 5: Testing & Refinement (1 day)

**Tasks:**
1. End-to-end testing
   - Test error flows from backend to both frontends
   - Verify requestId consistency
   - Test async logging doesn't block

2. Performance testing
   - Verify async logging doesn't slow responses
   - Check database query performance

3. Documentation review
   - Review error codes documentation
   - Verify all codes are documented

4. Refinement
   - Fix any issues found
   - Adjust error messages
   - Add missing error codes

**Deliverable:** Fully tested and documented error handling system

---

## Success Criteria

- [ ] All backend errors return consistent format with requestId, timestamp, code, message, details, suggestions
- [ ] All errors logged to database asynchronously (non-blocking)
- [ ] Vue admin shows error toasts with code + request ID
- [ ] Flutter app shows error snackbars with code + request ID
- [ ] Both platforms show validation errors inline
- [ ] Admin can view, search, and resolve errors via dashboard
- [ ] Error codes documented with user messages and suggestions
- [ ] Request IDs are consistent across logs and responses
- [ ] Development mode includes stack traces
- [ ] Async logging doesn't block responses (<10ms overhead)

---

## Related Files

### Backend
- `backend/src/errors/index.ts` - Error classes
- `backend/src/errors/codes.ts` - Error code registry
- `backend/src/errors/suggestions.ts` - Suggestion engine
- `backend/src/middleware/errorHandler.ts` - Error middleware
- `backend/src/services/errorLogger.ts` - Database logging service
- `backend/src/routes/error-logs.ts` - Admin routes
- `backend/migrations/YYYY-MM-DD-error-logs.sql` - Database table

### Vue Frontend
- `imu-web-vue/src/lib/api-client.ts` - API client with error parsing
- `imu-web-vue/src/composables/useToast.ts` - Toast composable
- `imu-web-vue/src/composables/useErrorHandler.ts` - Error handler
- `imu-web-vue/src/components/ui/Toast.vue` - Toast component
- `imu-web-vue/src/views/admin/ErrorLogsView.vue` - Admin page

### Flutter Mobile
- `mobile/imu_flutter/lib/models/error_model.dart` - Error model
- `mobile/imu_flutter/lib/services/error_service.dart` - Error display service
- `mobile/imu_flutter/lib/services/api_service.dart` - API service

### Documentation
- `docs/feature-analysis/backend/error-codes.md` - Error reference (generated)
- `backend/src/scripts/generate-error-docs.ts` - Documentation generator

---

## Risk Assessment

**Risk Level:** Low

**Potential Issues:**
1. **Database logging overhead** - Mitigated by async, fire-and-forget pattern
2. **Large error_logs table** - Mitigated by indexes and periodic cleanup
3. **Breaking existing error handling** - Mitigated by gradual migration
4. **Inconsistent usage across routes** - Mitigated by middleware enforcement

**Rollback Plan:**
- Remove error middleware
- Routes continue working (errors return as JSON)
- Frontend shows generic error message
- Database logging is optional (errors still returned to client)

---

## Future Enhancements

1. **Error aggregation** - Group similar errors for analysis
2. **Error alerts** - Notify admins of critical errors
3. **Automatic resolution** - Auto-resolve known transient errors
4. **Error trends** - Track error rates over time
5. **User feedback** - Allow users to report errors with context
6. **Error replay** - Replay requests for debugging
