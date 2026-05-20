import { Pool } from 'pg';
import type { ClientRecord, DuplicateMetadata } from './types.js';

/**
 * Database client wrapper for duplicate detection operations
 * Handles connections, queries, and updates
 */
export class DBClient {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
    });
  }

  /**
   * Get clients needing duplicate check
   * If all=true, fetch all non-deleted clients
   * Otherwise, fetch only clients without last_checked_at or updated since last check
   */
  async getClientsToCheck(all: boolean = false, limit: number = 100): Promise<ClientRecord[]> {
    const query = all
      ? `
        SELECT id, fullname, first_name, last_name, birth_date, agency_name, duplicate_metadata
        FROM clients
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $1
      `
      : `
        SELECT id, fullname, first_name, last_name, birth_date, agency_name, duplicate_metadata
        FROM clients
        WHERE deleted_at IS NULL
          AND (duplicate_metadata IS NULL OR duplicate_metadata->>'last_checked_at' IS NULL)
        ORDER BY created_at DESC
        LIMIT $1
      `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get all non-deleted clients for comparison (excluding target)
   */
  async getAllOtherClients(excludeId: string): Promise<ClientRecord[]> {
    const query = `
      SELECT id, fullname, first_name, last_name, birth_date, agency_name
      FROM clients
      WHERE deleted_at IS NULL AND id != $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [excludeId]);
    return result.rows;
  }

  /**
   * Update client's duplicate_metadata
   */
  async updateClientMetadata(
    clientId: string,
    metadata: DuplicateMetadata,
    dryRun: boolean = false
  ): Promise<void> {
    if (dryRun) {
      console.log(`[DRY RUN] Would update client ${clientId}:`, JSON.stringify(metadata, null, 2));
      return;
    }

    const query = `
      UPDATE clients
      SET duplicate_metadata = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await this.pool.query(query, [JSON.stringify(metadata), clientId]);
  }

  /**
   * Get client by ID
   */
  async getClientById(clientId: string): Promise<ClientRecord | null> {
    const query = `
      SELECT id, fullname, first_name, last_name, birth_date, agency_name, duplicate_metadata
      FROM clients
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, [clientId]);
    return result.rows[0] || null;
  }

  /**
   * Get statistics about duplicate detection
   */
  async getStatistics(): Promise<{
    total_clients: number;
    clients_with_duplicates: number;
    clients_ai_flagged: number;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE duplicate_metadata->>'is_possible_duplicate' = 'true') as clients_with_duplicates,
        COUNT(*) FILTER (WHERE duplicate_metadata->>'ai_flagged' = 'true') as clients_ai_flagged
      FROM clients
      WHERE deleted_at IS NULL
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      total_clients: parseInt(row.total_clients, 10),
      clients_with_duplicates: parseInt(row.clients_with_duplicates, 10),
      clients_ai_flagged: parseInt(row.clients_ai_flagged, 10),
    };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
