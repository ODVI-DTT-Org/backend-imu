import { describe, it, expect } from 'vitest'
import { QUEUE_NAMES, BulkJobType } from './job-types.js'
import type { BulkUploadJobData, BulkUploadJobResult, BulkUploadClientRow } from './job-types.js'

describe('job-types', () => {
  it('QUEUE_NAMES includes BULK_UPLOAD', () => {
    expect(QUEUE_NAMES.BULK_UPLOAD).toBe('bulk-upload')
  })

  it('BulkJobType includes BULK_UPLOAD_CLIENTS', () => {
    expect(BulkJobType.BULK_UPLOAD_CLIENTS).toBe('bulk_upload_clients')
  })

  it('BulkUploadJobData shape is correct', () => {
    const data: BulkUploadJobData = {
      userId: 'user-1',
      userRole: 'admin',
      rows: [{
        last_name: 'dela Cruz',
        first_name: 'Juan',
        pension_type: 'Retiree',
        _originalRow: { name: 'dela Cruz, Juan', pension_type: 'Retiree' },
        _rowNumber: 2,
      }]
    }
    expect(data.rows[0].last_name).toBe('dela Cruz')
  })

  it('BulkUploadJobResult shape is correct', () => {
    const result: BulkUploadJobResult = {
      successful: [{ last_name: 'dela Cruz', first_name: 'Juan', pension_type: 'Retiree', id: 'abc-123', _originalRow: {}, _rowNumber: 2 }],
      failed: [{ last_name: 'San Pedro', first_name: 'Maria', pension_type: 'Survivor', error: 'DB error', _originalRow: {}, _rowNumber: 3 }]
    }
    expect(result.successful[0].id).toBe('abc-123')
  })
})
