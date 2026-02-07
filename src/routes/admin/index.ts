/**
 * Admin Routes - Modular index
 * Re-exports the main admin router with all sub-routers mounted
 */

import { adminRouter } from '../admin';
import { adminAnalyticsRouter } from './analytics';
import { adminExperimentsRouter } from './experiments';
import { adminIntegrationsRouter } from './integrations';
import { adminPaywallsRouter } from './paywalls';

// Mount sub-routers onto the existing admin router
adminRouter.route('/apps/:id/analytics', adminAnalyticsRouter);
adminRouter.route('/', adminExperimentsRouter);
adminRouter.route('/', adminIntegrationsRouter);
adminRouter.route('/', adminPaywallsRouter);

export { adminRouter };
