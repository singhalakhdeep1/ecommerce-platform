# E-Commerce Platform - API styles, search engines and PWA

## Overview
How the GraphQL, tRPC, Elasticsearch, Algolia, Meilisearch and PWA pieces are implemented and wired in. All of them run on the same models and services as the REST API, so business rules (stock, ownership, auth) are identical across styles.

## Technologies

### 1. GraphQL (`/graphql`)
**File:** `src/graphql/schema.ts`, served with `graphql-http` in `src/app.ts`.

- Types: Product (with Category and Variants), ProductPage, SearchResult, Review, User, Order (with items), Cart.
- Queries: `products(search, categoryId, featured, page, limit)`, `product(id | slug)`, `categories`, `search(q)`, `reviews(productId)`, `me`, `myOrders`, `order(id)`, `cart`.
- Mutations: `addToCart`, `updateCartItem`, `removeCartItem`, `updateProfile`.
- Auth: the same `Authorization: Bearer <jwt>` header as REST; queries that need a user return a "Sign in required" error otherwise.

```bash
curl -X POST localhost:5000/graphql -H 'Content-Type: application/json' \
  -d '{"query":"{ products(limit: 3) { total items { name price category { name } } } }"}'
```

### 2. tRPC (`/trpc`)
**File:** `src/trpc/router.ts` (type `AppRouter` for TypeScript clients), mounted with the Express adapter.

- `product.list`, `product.byId`, `product.setStock` (admin), `category.list`
- `cart.get`, `cart.add`, `cart.update`, `cart.remove`
- `order.mine`, `order.track`, `user.me`
- Inputs are zod schemas; service errors map to tRPC codes (NOT_FOUND, CONFLICT, UNAUTHORIZED...).

```bash
curl "localhost:5000/trpc/product.list?input=%7B%22limit%22%3A3%7D"
```

### 3-5. Search engines
**File:** `src/services/search/searchService.ts`; API in `src/routes/catalogTools.ts`.

| Engine | When it is used | Notes |
|---|---|---|
| PostgreSQL full-text | Always available, default and fallback | Weighted tsvector (name > tags > description) with GIN index, `websearch_to_tsquery` plus prefix matching for search-as-you-type |
| Elasticsearch | `ELASTICSEARCH_URL` set | English analyzer, fuzzy multi-match, price/stock/category filters, bulk indexing |
| Algolia | `ALGOLIA_APP_ID` + `ALGOLIA_API_KEY` set | Searchable attributes, numeric filters, custom ranking |
| Meilisearch | `MEILISEARCH_URL` set | Filterable/sortable attributes, typo tolerance |

- `GET /api/search?q=&engine=&category=&minPrice=&maxPrice=&inStock=` uses `SEARCH_ENGINE` unless `engine` is given. If an external engine fails (or its circuit breaker is open) the request is answered by PostgreSQL, with `fallbackFrom` in the response.
- Product create/update/delete, reviews (rating) and stock changes push the document to every configured external engine after commit.
- `POST /api/search/reindex` (admin) rebuilds external indexes from PostgreSQL; `GET /api/search/engines` shows health.
- Verified against Elasticsearch 8.17 (index, fuzzy search, fallback when stopped). Algolia and Meilisearch adapters are written to their current SDKs but were not run against live services.

### 6. PWA
**Files:** `frontend-test/public/sw.js`, `frontend-test/public/manifest.json`, `frontend-test/public/icons/*`

- The service worker is registered in production builds by `components/StoreProvider.tsx`.
- Cache strategy: Next.js static assets and icons cache-first; page navigations network-first with the cached page (or the home page) as offline fallback; API calls are never cached, so prices, stock and carts are always live.
- Installable manifest with 192 and 512 px icons. Service workers need HTTPS or localhost.

## Environment Variables

```env
SEARCH_ENGINE=postgres            # postgres | elasticsearch | algolia | meilisearch
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=
ALGOLIA_APP_ID=
ALGOLIA_API_KEY=
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=
```

`docker compose --profile search up` starts Elasticsearch and Meilisearch next to the API.
