import { QueryTypes, Sequelize } from 'sequelize';
import { sequelize as primary } from '../../config/database';
import { AppError } from '../../utils/appError';

export interface IndexDefinition {
  tableName: string;
  indexName: string;
  columns: string[];
  isUnique?: boolean;
  /** Optional partial-index predicate, e.g. "status = 'pending'". Admin input: validated below. */
  where?: string;
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_PREDICATE = /^[a-z0-9_ =<>'!.,()]+$/i;

/**
 * Index management for PostgreSQL. The e-commerce indexes themselves are created by migration
 * 002-indexes-and-search; this service reports which indexes exist and how often they are used,
 * and lets an admin add/drop/rebuild one without downtime (CONCURRENTLY).
 */
export class DatabaseIndexingService {
  constructor(private readonly db: Sequelize = primary) {}

  async listIndexes(tableName?: string) {
    return this.db.query<{ table: string; index: string; definition: string; scans: string; sizeBytes: string }>(
      `SELECT i.tablename AS "table", i.indexname AS "index", i.indexdef AS "definition",
              COALESCE(s.idx_scan, 0) AS "scans", pg_relation_size(quote_ident(i.indexname)::regclass) AS "sizeBytes"
         FROM pg_indexes i
         LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname AND s.schemaname = i.schemaname
        WHERE i.schemaname = 'public' ${tableName ? 'AND i.tablename = :tableName' : ''}
        ORDER BY i.tablename, i.indexname`,
      { type: QueryTypes.SELECT, replacements: { tableName } },
    ).then((rows) => rows.map((r) => ({ ...r, scans: Number(r.scans), sizeBytes: Number(r.sizeBytes) })));
  }

  /** Indexes never used since statistics were reset (candidates for removal), excluding PK/unique ones. */
  async unusedIndexes() {
    const all = await this.listIndexes();
    return all.filter((i) => i.scans === 0 && !/UNIQUE INDEX/i.test(i.definition) && !i.index.endsWith('_pkey'));
  }

  async createIndex(def: IndexDefinition): Promise<void> {
    for (const name of [def.tableName, def.indexName, ...def.columns]) {
      if (!IDENT.test(name)) throw AppError.badRequest(`Invalid identifier: ${name}`);
    }
    if (def.where && !SAFE_PREDICATE.test(def.where)) throw AppError.badRequest('Invalid partial index predicate');
    await this.db.query(
      `CREATE ${def.isUnique ? 'UNIQUE ' : ''}INDEX CONCURRENTLY IF NOT EXISTS ${def.indexName} ON ${def.tableName} (${def.columns.join(', ')})${def.where ? ` WHERE ${def.where}` : ''}`,
    );
  }

  async dropIndex(indexName: string): Promise<void> {
    if (!IDENT.test(indexName)) throw AppError.badRequest(`Invalid identifier: ${indexName}`);
    if (indexName.endsWith('_pkey')) throw AppError.badRequest('Primary key indexes cannot be dropped');
    await this.db.query(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
  }

  async rebuildIndexes(tableName: string): Promise<void> {
    if (!IDENT.test(tableName)) throw AppError.badRequest(`Invalid identifier: ${tableName}`);
    await this.db.query(`REINDEX TABLE CONCURRENTLY ${tableName}`);
  }
}

export const indexing = new DatabaseIndexingService();
