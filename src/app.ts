import { createExpressMiddleware } from '@trpc/server/adapters/express';
import cors from 'cors';
import express, { Express } from 'express';
import { createHandler } from 'graphql-http/lib/use/express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { sequelize } from './config/database';
import { umzug } from './db/umzug';
import { openApiDocument } from './docs/openapi';
import { context as graphqlContext, rootValue, schema } from './graphql/schema';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiRateLimit } from './middleware/rateLimit';
import { requestContext } from './middleware/requestContext';
import analyticsRoutes from './routes/analytics';
import authRoutes from './routes/auth';
import cartRoutes from './routes/cart';
import { searchRouter, shippingRouter, taxRouter } from './routes/catalogTools';
import categoryRoutes from './routes/categories';
import discountRoutes from './routes/discounts';
import experimentRoutes from './routes/experiments';
import integrationRoutes from './routes/integrations';
import marketingRoutes from './routes/marketing';
import orderRoutes, { checkoutRouter } from './routes/orders';
import paymentRoutes from './routes/payments';
import productRoutes from './routes/products';
import reviewRoutes from './routes/reviews';
import subscriptionRoutes from './routes/subscriptions';
import systemRoutes from './routes/system';
import webhookRoutes from './routes/webhooks';
import wishlistRoutes from './routes/wishlist';
import { registry } from './services/metrics';
import { appRouter, createContext } from './trpc/router';
import { asyncHandler } from './utils/asyncHandler';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind a load balancer / ingress, req.ip must come from X-Forwarded-For for rate limits and fraud rules.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');

  app.use(requestContext);
  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles on /api-docs only.
      contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", 'https:'], imgSrc: ["'self'", 'data:', 'https:'] } },
    }),
  );
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Token', 'X-Session-Id', 'Idempotency-Key', 'X-Correlation-Id'],
      exposedHeaders: ['X-Cart-Token', 'X-Correlation-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'Retry-After', 'Idempotent-Replayed'],
    }),
  );
  // Keep the raw bytes for webhook signature checks (Stripe, inbound integrations).
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => void ((req as express.Request).rawBody = Buffer.from(buf)) }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  /* Probes and metrics (no rate limit) */
  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const db = await sequelize.authenticate().then(() => 'connected', () => 'disconnected');
      res.status(db === 'connected' ? 200 : 503).json({ status: db === 'connected' ? 'OK' : 'DEGRADED', database: db, timestamp: new Date() });
    }),
  );
  app.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const pending = await umzug.pending().then((p) => p.map((m) => m.name), () => ['unknown']);
      res.status(pending.length ? 503 : 200).json({ ready: pending.length === 0, pendingMigrations: pending });
    }),
  );
  app.get(
    '/metrics',
    asyncHandler(async (_req, res) => {
      res.setHeader('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    }),
  );

  /* API docs */
  const docs = () => openApiDocument(process.env.PUBLIC_API_URL ?? `http://localhost:${env.port}`);
  app.get('/api-docs.json', (_req, res) => void res.json(docs()));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(docs()));

  /* GraphQL and tRPC */
  app.all('/graphql', apiRateLimit, createHandler({ schema, rootValue, context: (req) => graphqlContext(req.raw as express.Request) as never }));
  app.use('/trpc', apiRateLimit, createExpressMiddleware({ router: appRouter, createContext }));

  /* REST */
  app.use('/api', apiRateLimit);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/wishlist', wishlistRoutes);
  app.use('/api/discounts', discountRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/experiments', experimentRoutes);
  app.use('/api/marketing', marketingRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/search', searchRouter);
  app.use('/api/shipping', shippingRouter);
  app.use('/api/tax', taxRouter);
  app.use('/api/system', systemRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
