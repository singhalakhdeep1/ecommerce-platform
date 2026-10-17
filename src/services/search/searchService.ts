import { Client as ElasticClient } from '@elastic/elasticsearch';
import algoliasearch, { SearchIndex } from 'algoliasearch';
import { MeiliSearch } from 'meilisearch';
import { QueryTypes } from 'sequelize';
import { env } from '../../config/env';
import { sequelize } from '../../config/database';
import { Category, Product } from '../../models';
import { logger } from '../../utils/logger';
import { resilience } from '../errorHandling/errorHandlingService';

export type EngineName = 'postgres' | 'elasticsearch' | 'algolia' | 'meilisearch';

export interface SearchDocument {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  stock: number;
  rating: number;
  tags: string[];
  category: string | null;
  categoryId: string | null;
  image: string | null;
  featured: boolean;
}

export interface SearchQuery {
  q: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  engine: EngineName;
  total: number;
  hits: Array<SearchDocument & { score?: number }>;
  tookMs: number;
  fallbackFrom?: EngineName;
}

interface Engine {
  name: EngineName;
  index(docs: SearchDocument[]): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<Omit<SearchResult, 'engine' | 'tookMs'>>;
  reset(): Promise<void>;
  ping(): Promise<boolean>;
}

const INDEX = 'products';

/* ---------------- PostgreSQL full-text search (always available) ---------------- */

const postgresEngine: Engine = {
  name: 'postgres',
  async index() {
    /* the tsvector is maintained by a trigger (migration 002) */
  },
  async remove() {},
  async reset() {},
  async ping() {
    return true;
  },
  async search(query) {
    const filters: string[] = ['p.published = TRUE'];
    const replacements: Record<string, unknown> = { q: query.q, limit: query.limit ?? 20, offset: query.offset ?? 0 };
    // Whole-word matches (websearch syntax), prefix matches for search-as-you-type ("hea" -> headphones), or a name substring.
    const prefix = query.q
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((t) => `${t}:*`)
      .join(' & ');
    replacements.prefix = prefix || 'a:*';
    replacements.like = `%${query.q.trim().replace(/[%_\\]/g, '\\$&')}%`;
    if (query.q.trim()) {
      filters.push(`(p.search_vector @@ websearch_to_tsquery('english', :q) OR p.search_vector @@ to_tsquery('simple', :prefix) OR p.name ILIKE :like)`);
    }
    if (query.categoryId) {
      filters.push('(p.category_id = :categoryId OR c.parent_id = :categoryId)');
      replacements.categoryId = query.categoryId;
    }
    if (query.minPrice !== undefined) {
      filters.push('p.price >= :minPrice');
      replacements.minPrice = query.minPrice;
    }
    if (query.maxPrice !== undefined) {
      filters.push('p.price <= :maxPrice');
      replacements.maxPrice = query.maxPrice;
    }
    if (query.inStock) filters.push('p.stock > 0');
    const where = filters.join(' AND ');
    const rows = await sequelize.query<SearchDocument & { score: number; total: string }>(
      `SELECT p.id, p.name, p.slug, p.description, p.price::float AS price, p.stock, p.rating::float AS rating, p.tags,
              c.name AS category, p.category_id AS "categoryId", p.images[1] AS image, p.featured,
              ${query.q.trim() ? `ts_rank(p.search_vector, websearch_to_tsquery('english', :q)) + 0.5 * ts_rank(p.search_vector, to_tsquery('simple', :prefix))` : '0'} AS score,
              COUNT(*) OVER() AS total
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where}
        ORDER BY score DESC, p.featured DESC, p.created_at DESC
        LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements },
    );
    return { total: rows.length ? Number(rows[0].total) : 0, hits: rows.map(({ total: _t, ...hit }) => hit) };
  },
};

/* ---------------- Elasticsearch ---------------- */

function elasticEngine(): Engine | null {
  if (!env.search.elasticsearchUrl) return null;
  const client = new ElasticClient({
    node: env.search.elasticsearchUrl,
    auth: env.search.elasticsearchUser ? { username: env.search.elasticsearchUser, password: env.search.elasticsearchPassword } : undefined,
    requestTimeout: 10_000,
  });
  const ensureIndex = async () => {
    if (await client.indices.exists({ index: INDEX })) return;
    await client.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          name: { type: 'text', analyzer: 'english', fields: { keyword: { type: 'keyword' } } },
          description: { type: 'text', analyzer: 'english' },
          tags: { type: 'keyword' },
          category: { type: 'keyword' },
          categoryId: { type: 'keyword' },
          price: { type: 'scaled_float', scaling_factor: 100 },
          stock: { type: 'integer' },
          rating: { type: 'float' },
          featured: { type: 'boolean' },
        },
      },
    });
  };
  return {
    name: 'elasticsearch',
    async index(docs) {
      if (!docs.length) return;
      await ensureIndex();
      const operations = docs.flatMap((d) => [{ index: { _index: INDEX, _id: d.id } }, d]);
      const result = await client.bulk({ operations, refresh: 'wait_for' });
      if (result.errors) throw new Error('Elasticsearch bulk indexing reported errors');
    },
    async remove(id) {
      await client.delete({ index: INDEX, id, refresh: 'wait_for' }).catch((e: { meta?: { statusCode?: number } }) => {
        if (e?.meta?.statusCode !== 404) throw e;
      });
    },
    async reset() {
      await client.indices.delete({ index: INDEX }, { ignore: [404] });
      await ensureIndex();
    },
    async ping() {
      return client.ping().then(() => true, () => false);
    },
    async search(query) {
      const filter: object[] = [];
      if (query.categoryId) filter.push({ term: { categoryId: query.categoryId } });
      if (query.minPrice !== undefined || query.maxPrice !== undefined) filter.push({ range: { price: { gte: query.minPrice, lte: query.maxPrice } } });
      if (query.inStock) filter.push({ range: { stock: { gt: 0 } } });
      const result = await client.search<SearchDocument>({
        index: INDEX,
        from: query.offset ?? 0,
        size: query.limit ?? 20,
        query: {
          bool: {
            must: query.q.trim()
              ? [{ multi_match: { query: query.q, fields: ['name^3', 'tags^2', 'category', 'description'], fuzziness: 'AUTO' } }]
              : [{ match_all: {} }],
            filter,
          },
        },
      });
      const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
      return { total, hits: result.hits.hits.map((h) => ({ ...(h._source as SearchDocument), score: h._score ?? undefined })) };
    },
  };
}

/* ---------------- Algolia ---------------- */

function algoliaEngine(): Engine | null {
  if (!env.search.algoliaAppId || !env.search.algoliaApiKey) return null;
  const index: SearchIndex = algoliasearch(env.search.algoliaAppId, env.search.algoliaApiKey).initIndex(INDEX);
  let configured = false;
  const configure = async () => {
    if (configured) return;
    await index.setSettings({
      searchableAttributes: ['name', 'tags', 'category', 'description'],
      attributesForFaceting: ['filterOnly(categoryId)'],
      customRanking: ['desc(featured)', 'desc(rating)'],
      numericAttributesForFiltering: ['price', 'stock'],
    }).wait();
    configured = true;
  };
  return {
    name: 'algolia',
    async index(docs) {
      if (!docs.length) return;
      await configure();
      await index.saveObjects(docs.map((d) => ({ ...d, objectID: d.id }))).wait();
    },
    async remove(id) {
      await index.deleteObject(id).wait();
    },
    async reset() {
      await index.clearObjects().wait();
      configured = false;
    },
    async ping() {
      return index.getSettings().then(() => true, () => false);
    },
    async search(query) {
      const numeric: string[] = [];
      if (query.minPrice !== undefined) numeric.push(`price >= ${query.minPrice}`);
      if (query.maxPrice !== undefined) numeric.push(`price <= ${query.maxPrice}`);
      if (query.inStock) numeric.push('stock > 0');
      const limit = query.limit ?? 20;
      const result = await index.search<SearchDocument>(query.q, {
        hitsPerPage: limit,
        page: Math.floor((query.offset ?? 0) / limit),
        numericFilters: numeric,
        filters: query.categoryId ? `categoryId:${query.categoryId}` : undefined,
      });
      return { total: result.nbHits ?? 0, hits: result.hits.map(({ objectID: _o, _highlightResult: _h, ...doc }) => doc as SearchDocument) };
    },
  };
}

/* ---------------- Meilisearch ---------------- */

function meiliEngine(): Engine | null {
  if (!env.search.meilisearchUrl) return null;
  const client = new MeiliSearch({ host: env.search.meilisearchUrl, apiKey: env.search.meilisearchApiKey || undefined });
  const index = client.index<SearchDocument>(INDEX);
  let configured = false;
  const configure = async () => {
    if (configured) return;
    const task = await index.updateSettings({
      searchableAttributes: ['name', 'tags', 'category', 'description'],
      filterableAttributes: ['categoryId', 'price', 'stock'],
      sortableAttributes: ['price', 'rating'],
    });
    await client.waitForTask(task.taskUid);
    configured = true;
  };
  return {
    name: 'meilisearch',
    async index(docs) {
      if (!docs.length) return;
      await configure();
      const task = await index.addDocuments(docs, { primaryKey: 'id' });
      await client.waitForTask(task.taskUid);
    },
    async remove(id) {
      const task = await index.deleteDocument(id);
      await client.waitForTask(task.taskUid);
    },
    async reset() {
      const task = await index.deleteAllDocuments();
      await client.waitForTask(task.taskUid);
    },
    async ping() {
      return client.isHealthy();
    },
    async search(query) {
      const filter: string[] = [];
      if (query.categoryId) filter.push(`categoryId = "${query.categoryId.replace(/"/g, '')}"`);
      if (query.minPrice !== undefined) filter.push(`price >= ${query.minPrice}`);
      if (query.maxPrice !== undefined) filter.push(`price <= ${query.maxPrice}`);
      if (query.inStock) filter.push('stock > 0');
      const result = await index.search(query.q, { limit: query.limit ?? 20, offset: query.offset ?? 0, filter });
      return { total: result.estimatedTotalHits ?? result.hits.length, hits: result.hits };
    },
  };
}

/* ---------------- Facade ---------------- */

const engines = new Map<EngineName, Engine>();
engines.set('postgres', postgresEngine);
for (const factory of [elasticEngine, algoliaEngine, meiliEngine]) {
  const engine = factory();
  if (engine) engines.set(engine.name, engine);
}

/** SEARCH_ENGINE picks the default engine; it must be configured, else PostgreSQL is used. */
export function defaultEngine(): EngineName {
  const wanted = (process.env.SEARCH_ENGINE ?? 'postgres') as EngineName;
  return engines.has(wanted) ? wanted : 'postgres';
}

export function configuredEngines(): EngineName[] {
  return [...engines.keys()];
}

export async function toDocument(product: Product): Promise<SearchDocument> {
  const category = product.categoryId ? await Category.findByPk(product.categoryId, { attributes: ['name'] }) : null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
    rating: Number(product.rating),
    tags: product.tags,
    category: category?.name ?? null,
    categoryId: product.categoryId,
    image: product.images[0] ?? null,
    featured: product.featured,
  };
}

/**
 * Search with the requested engine. If an external engine fails (or its circuit is open) the
 * request is answered by PostgreSQL full-text search instead of failing.
 */
export async function search(query: SearchQuery, engineName: EngineName = defaultEngine()): Promise<SearchResult> {
  const engine = engines.get(engineName) ?? postgresEngine;
  const started = Date.now();
  if (engine.name === 'postgres') {
    const result = await postgresEngine.search(query);
    return { engine: 'postgres', tookMs: Date.now() - started, ...result };
  }
  try {
    const result = await resilience(`search:${engine.name}`, { retryCount: 1, timeoutDuration: 5_000 }).executeWithResilience(() => engine.search(query));
    return { engine: engine.name, tookMs: Date.now() - started, ...result };
  } catch (error) {
    logger.warn(`Search engine ${engine.name} failed, falling back to PostgreSQL`, { error: error instanceof Error ? error.message : String(error) });
    const result = await postgresEngine.search(query);
    return { engine: 'postgres', fallbackFrom: engine.name, tookMs: Date.now() - started, ...result };
  }
}

/** Pushes product changes to every external engine. Called after the database commit. */
export async function syncProduct(product: Product | null, deletedId?: string): Promise<void> {
  const external = [...engines.values()].filter((e) => e.name !== 'postgres');
  if (!external.length) return;
  const doc = product && product.published ? await toDocument(product) : null;
  await Promise.all(
    external.map(async (engine) => {
      try {
        if (doc) await engine.index([doc]);
        else await engine.remove(deletedId ?? product!.id);
      } catch (error) {
        logger.warn(`Could not sync product to ${engine.name}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }),
  );
}

/** Full rebuild of one or all external indexes from PostgreSQL (POST /api/search/reindex). */
export async function reindex(only?: EngineName): Promise<Record<string, number | string>> {
  const products = await Product.findAll({ where: { published: true } });
  const docs = await Promise.all(products.map(toDocument));
  const report: Record<string, number | string> = {};
  for (const engine of engines.values()) {
    if (engine.name === 'postgres' || (only && engine.name !== only)) continue;
    try {
      await engine.reset();
      for (let i = 0; i < docs.length; i += 500) await engine.index(docs.slice(i, i + 500));
      report[engine.name] = docs.length;
    } catch (error) {
      report[engine.name] = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return report;
}

export async function engineStatus(): Promise<Array<{ engine: EngineName; healthy: boolean; default: boolean }>> {
  const def = defaultEngine();
  return Promise.all([...engines.values()].map(async (e) => ({ engine: e.name, healthy: await e.ping().catch(() => false), default: e.name === def })));
}
