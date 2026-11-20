import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Db } from './core/db';
import { loadSession } from './core/auth';
import { errorHandler, language, notFoundHandler, sameOrigin } from './core/http';
import { authRoutes } from './modules/auth/auth.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { employeeRoutes } from './modules/people/employees.routes';
import { customerRoutes } from './modules/people/customers.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { stockRoutes } from './modules/stock/stock.routes';
import { supplierRoutes } from './modules/suppliers/suppliers.routes';
import { orderRoutes } from './modules/orders/orders.routes';
import { preparationRoutes } from './modules/preparation/preparation.routes';
import { deliveryRoutes } from './modules/delivery/delivery.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { returnRoutes } from './modules/returns/returns.routes';
import { reportRoutes } from './modules/reports/reports.routes';

// The path of one request (docs/technical/02-api-design.md):
// language -> same origin -> session -> route (role check, validation, transaction) -> error shape
export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.locals.db = db;
    next();
  });
  app.use(language);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(sameOrigin);
  api.use(loadSession(db));
  api.use(authRoutes());
  api.use(settingsRoutes());
  api.use(employeeRoutes());
  api.use(customerRoutes());
  api.use(notificationRoutes());
  api.use(catalogRoutes());
  api.use(stockRoutes());
  api.use(supplierRoutes());
  api.use(orderRoutes());
  api.use(preparationRoutes());
  api.use(deliveryRoutes());
  api.use(billingRoutes());
  api.use(returnRoutes());
  api.use(reportRoutes());
  api.use(notFoundHandler);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
