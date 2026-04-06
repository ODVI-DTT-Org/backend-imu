/**
 * Database Schema Extraction Script
 *
 * Extracts all tables, columns, indexes, and foreign keys from the database
 * and generates a complete schema file for documentation.
 */

import { pool } from '../db/index.js';

interface TableInfo {
  tableName: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}

interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault: string;
  characterMaximumLength?: number;
}

interface IndexInfo {
  indexName: string;
  columnName?: string;
  isUnique: string;
  indexDefinition?: string;
}

interface ForeignKeyInfo {
  constraintName: string;
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
}

/**
 * Extract complete database schema
 */
export async function extractDatabaseSchema(): Promise<void> {
  const client = await pool.connect();

  try {
    console.log('-- ================================================');
    console.log('-- IMU Database Schema');
    console.log('-- Generated: ' + new Date().toISOString());
    console.log('-- ================================================\n');

    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type NOT IN ('VIEW', 'MATERIALIZED VIEW')
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(row => row.table_name);

    // Process each table
    for (const tableName of tables) {
      console.log(`-- ================================================`);
      console.log(`-- Table: ${tableName}`);
      console.log(`-- ================================================`);

      // Get columns
      const columnsResult = await client.query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = columnsResult.rows;

      // Get indexes
      const indexesResult = await client.query(`
        SELECT
          indexname,
          tablename,
          indexdef
        FROM pg_indexes
        WHERE tablename = $1
          AND schemaname = 'public'
        ORDER BY indexname
      `, [tableName]);

      const indexes = indexesResult.rows;

      // Get foreign keys
      const foreignKeysResult = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
        ORDER BY tc.constraint_name, kcu.column_name
      `, [tableName]);

      const foreignKeys = foreignKeysResult.rows;

      // Print table structure
      console.log(`CREATE TABLE IF NOT EXISTS ${tableName} (`);

      const columnDefs = columns.map(col => {
        let colDef = `  ${col.column_name} ${col.data_type}`;

        if (col.character_maximum_length) {
          colDef += `(${col.character_maximum_length})`;
        }

        if (col.is_nullable === 'NO') {
          colDef += ' NOT NULL';
        }

        if (col.column_default) {
          colDef += ` DEFAULT ${col.column_default}`;
        }

        return colDef;
      });

      // Print columns with foreign key constraints inline
      const processedFKs = new Set<string>();

      columnDefs.forEach((def, i) => {
        const fk = foreignKeys.find(fk => fk.column_name === columns[i].column_name);
        if (fk && !processedFKs.has(fk.constraint_name)) {
          processedFKs.add(fk.constraint_name);
          console.log(`${def},`);
          console.log(`  CONSTRAINT ${fk.constraint_name} REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})${i < columns.length - 1 ? ',' : ''}`);
        } else {
          console.log(`${def}${i < columns.length - 1 ? ',' : ''}`);
        }
      });

      console.log(');\n');

      // Print indexes
      if (indexes.length > 0) {
        console.log(`-- Indexes for ${tableName}`);
        indexes.forEach(idx => {
          if (idx.indexdef) {
            // Format the index definition nicely
            const cleanDef = idx.indexdef
              .replace(/CREATE INDEX.*? ON /i, 'CREATE INDEX IF NOT EXISTS ')
              .replace(/ USING.*?\(/i, ' ON ');
            console.log(cleanDef + ';');
          }
        });
        console.log('');
      }

      // Print foreign keys separately for reference
      if (foreignKeys.length > 0) {
        console.log(`-- Foreign keys for ${tableName}`);
        foreignKeys.forEach(fk => {
          console.log(`-- ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        });
        console.log('');
      }

      console.log('');
    }

    // Get materialized views
    console.log(`-- ================================================`);
    console.log(`-- Materialized Views`);
    console.log(`-- ================================================\n`);

    const matViewsResult = await client.query(`
      SELECT matviewname, definition
      FROM pg_matviews
      WHERE schemaname = 'public'
      ORDER BY matviewname
    `);

    if (matViewsResult.rows.length > 0) {
      matViewsResult.rows.forEach(row => {
        console.log(`-- Materialized View: ${row.matviewname}`);
        console.log(`CREATE MATERIALIZED VIEW IF NOT EXISTS ${row.matviewname} AS ${row.definition}`);
        console.log('');
      });
    }

    console.log('-- ================================================');
    console.log('-- End of Schema');
    console.log('-- ================================================');

  } finally {
    client.release();
  }
}

// Run extraction if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  extractDatabaseSchema().catch((error) => {
    console.error('Failed to extract database schema:', error);
    process.exit(1);
  });
}
