import { Job } from 'bullmq'
import { pool } from '../../db/index.js'
import { BaseProcessor } from '../base-processor.js'
import type { BulkUploadJobData, BulkUploadJobResult, BulkUploadClientRow } from '../jobs/job-types.js'

const CHUNK_SIZE = 100

export class BulkUploadProcessor extends BaseProcessor<BulkUploadJobData, BulkUploadJobResult> {
  constructor() {
    super('bulk-upload')
  }

  protected getConcurrency(): number {
    return 2
  }

  async process(job: Job<BulkUploadJobData>): Promise<BulkUploadJobResult> {
    const { rows, userId, userRole } = job.data
    const successful: Array<BulkUploadClientRow & { id: string }> = []
    const failed: Array<BulkUploadClientRow & { error: string }> = []

    const chunks: BulkUploadClientRow[][] = []
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE))
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci]

      for (const row of chunk) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          if (userRole === 'tele' || userRole === 'caravan') {
            await client.query(
              `INSERT INTO approvals (id, type, client_id, user_id, role, reason, notes, status)
               VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, 'pending')`,
              ['client', userId, userRole, 'Bulk Client Creation Request', JSON.stringify(row)]
            )
            successful.push({ ...row, id: 'pending-approval' })
          } else {
            const result = await client.query(
              `INSERT INTO clients (
                id, first_name, last_name, middle_name, birth_date, email, phone,
                client_type, product_type, market_type, pension_type, pan,
                facebook_link, remarks, province, municipality, barangay,
                is_starred, created_by
              ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                false, $17
              ) RETURNING id`,
              [
                row.first_name,
                row.last_name,
                row.middle_name || null,
                row.birth_date || null,
                row.email || null,
                row.phone || null,
                row.client_type || 'POTENTIAL',
                row.product_type || null,
                row.market_type || null,
                row.pension_type || null,
                row.pan || null,
                row.facebook_link || null,
                row.remarks || null,
                row.province || null,
                row.municipality || null,
                row.barangay || null,
                userId,
              ]
            )
            successful.push({ ...row, id: result.rows[0].id })
          }

          await client.query('COMMIT')
        } catch (err: any) {
          await client.query('ROLLBACK')
          failed.push({ ...row, error: err.message || 'Insert failed' })
        } finally {
          client.release()
        }
      }

      await job.updateProgress(Math.floor(((ci + 1) / chunks.length) * 100))
      await job.log(JSON.stringify({
        progress: Math.floor(((ci + 1) / chunks.length) * 100),
        total: rows.length,
        current: successful.length + failed.length,
        message: `Processed chunk ${ci + 1} of ${chunks.length}`,
      }))
    }

    return { successful, failed }
  }
}

export const bulkUploadProcessor = new BulkUploadProcessor()
