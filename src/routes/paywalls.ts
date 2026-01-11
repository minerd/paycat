/**
 * Paywall Templates Routes
 * No-code paywall management API
 */

import { Hono } from 'hono';
import type { Env, App } from '../types';
import {
  getPaywallTemplates,
  getPaywallTemplate,
  getDefaultPaywallTemplate,
  createPaywallTemplate,
  updatePaywallTemplate,
  deletePaywallTemplate,
  trackPaywallEvent,
  getPaywallAnalytics,
  getDefaultTemplate,
  renderPaywallHTML,
  type TemplateType,
  type PaywallConfig,
  type PaywallContent,
} from '../services/paywalls';
import { getOfferingByIdentifier, getCurrentOffering } from '../services/offerings';
import { Errors } from '../middleware/error';
import { getSubscriberByAppUserId } from '../db/queries';

type Variables = { app: App };

export const paywallsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const VALID_TEMPLATE_TYPES: TemplateType[] = ['single', 'multi', 'feature_list', 'comparison', 'minimal'];

// =====================================================
// TEMPLATE CRUD
// =====================================================

/**
 * GET /v1/paywalls
 * List all paywall templates
 */
paywallsRouter.get('/', async (c) => {
  const app = c.get('app');
  const includeInactive = c.req.query('include_inactive') === 'true';

  const templates = await getPaywallTemplates(c.env.DB, app.id, !includeInactive);

  return c.json({
    templates: templates.map((t) => ({
      id: t.id,
      identifier: t.identifier,
      name: t.name,
      description: t.description,
      template_type: t.templateType,
      offering_id: t.offeringId,
      active: t.active,
      is_default: t.isDefault,
      created_at: new Date(t.createdAt).toISOString(),
      updated_at: new Date(t.updatedAt).toISOString(),
    })),
  });
});

/**
 * GET /v1/paywalls/types
 * List available template types with previews
 */
paywallsRouter.get('/types', async (c) => {
  const types = VALID_TEMPLATE_TYPES.map((type) => ({
    type,
    name: getTypeName(type),
    description: getTypeDescription(type),
    default_config: getDefaultTemplate(type),
  }));

  return c.json({ types });
});

/**
 * GET /v1/paywalls/:identifier
 * Get paywall template by identifier
 */
paywallsRouter.get('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);

  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  return c.json({
    template: {
      id: template.id,
      identifier: template.identifier,
      name: template.name,
      description: template.description,
      template_type: template.templateType,
      config: template.config,
      offering_id: template.offeringId,
      default_locale: template.defaultLocale,
      localizations: template.localizations,
      active: template.active,
      is_default: template.isDefault,
      created_at: new Date(template.createdAt).toISOString(),
      updated_at: new Date(template.updatedAt).toISOString(),
    },
  });
});

/**
 * POST /v1/paywalls
 * Create new paywall template
 */
paywallsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    identifier: string;
    name: string;
    description?: string;
    template_type: TemplateType;
    config?: PaywallConfig;
    offering_id?: string;
    default_locale?: string;
    localizations?: Record<string, Partial<PaywallContent>>;
    is_default?: boolean;
  }>();

  if (!body.identifier) {
    throw Errors.validationError('identifier is required');
  }

  if (!body.name) {
    throw Errors.validationError('name is required');
  }

  if (!body.template_type || !VALID_TEMPLATE_TYPES.includes(body.template_type)) {
    throw Errors.validationError(`template_type must be one of: ${VALID_TEMPLATE_TYPES.join(', ')}`);
  }

  // Check if identifier already exists
  const existing = await getPaywallTemplate(c.env.DB, app.id, body.identifier);
  if (existing) {
    throw Errors.validationError('A template with this identifier already exists');
  }

  // Use provided config or default for template type
  const defaultConfig = getDefaultTemplate(body.template_type);
  const config: PaywallConfig = body.config || (defaultConfig as PaywallConfig);

  const template = await createPaywallTemplate(c.env.DB, app.id, {
    identifier: body.identifier,
    name: body.name,
    description: body.description,
    templateType: body.template_type,
    config,
    offeringId: body.offering_id,
    defaultLocale: body.default_locale,
    localizations: body.localizations,
    isDefault: body.is_default,
  });

  return c.json(
    {
      template: {
        id: template.id,
        identifier: template.identifier,
        name: template.name,
        template_type: template.templateType,
        is_default: template.isDefault,
        created_at: new Date(template.createdAt).toISOString(),
      },
    },
    201
  );
});

/**
 * PATCH /v1/paywalls/:identifier
 * Update paywall template
 */
paywallsRouter.patch('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const body = await c.req.json<{
    name?: string;
    description?: string;
    config?: PaywallConfig;
    offering_id?: string;
    localizations?: Record<string, Partial<PaywallContent>>;
    active?: boolean;
    is_default?: boolean;
  }>();

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);
  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  await updatePaywallTemplate(c.env.DB, app.id, identifier, {
    name: body.name,
    description: body.description,
    config: body.config,
    offeringId: body.offering_id,
    localizations: body.localizations,
    active: body.active,
    isDefault: body.is_default,
  });

  return c.json({ updated: true });
});

/**
 * DELETE /v1/paywalls/:identifier
 * Delete paywall template
 */
paywallsRouter.delete('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);
  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  await deletePaywallTemplate(c.env.DB, app.id, identifier);

  return c.json({ deleted: true });
});

// =====================================================
// RENDERING
// =====================================================

/**
 * GET /v1/paywalls/:identifier/render
 * Render paywall as HTML
 */
paywallsRouter.get('/:identifier/render', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const locale = c.req.query('locale') || 'en';
  const appUserId = c.req.query('app_user_id');

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);
  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  // Get offering
  let offering = null;
  if (template.offeringId) {
    // Get specific offering
    const offerings = await c.env.DB.prepare(
      `SELECT o.*,
        (SELECT json_group_array(json_object(
          'identifier', p.identifier,
          'display_name', p.display_name,
          'package_type', p.package_type,
          'product', (SELECT json_object(
            'store_product_id', pr.store_product_id,
            'display_name', pr.display_name,
            'price', json_object('amount', pr.default_price_amount / 100.0, 'currency', pr.default_price_currency),
            'trial_period', pr.trial_period
          ) FROM products pr JOIN package_products pp ON pp.product_id = pr.id WHERE pp.package_id = p.id LIMIT 1)
        )) FROM packages p WHERE p.offering_id = o.id) as packages
       FROM offerings o
       WHERE o.app_id = ? AND o.identifier = ?`
    )
      .bind(app.id, template.offeringId)
      .first();

    if (offerings) {
      offering = {
        ...offerings,
        packages: offerings.packages ? JSON.parse(offerings.packages as string) : [],
      };
    }
  } else {
    // Get current offering
    offering = await getCurrentOffering(c.env.DB, app.id);
  }

  const html = renderPaywallHTML(template, offering, locale);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

/**
 * GET /v1/paywalls/current/render
 * Render the default paywall
 */
paywallsRouter.get('/current/render', async (c) => {
  const app = c.get('app');
  const locale = c.req.query('locale') || 'en';

  const template = await getDefaultPaywallTemplate(c.env.DB, app.id);
  if (!template) {
    throw Errors.notFound('No default paywall template configured');
  }

  const offering = await getCurrentOffering(c.env.DB, app.id);
  const html = renderPaywallHTML(template, offering, locale);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
});

// =====================================================
// EVENTS & ANALYTICS
// =====================================================

/**
 * POST /v1/paywalls/:identifier/events
 * Track paywall event
 */
paywallsRouter.post('/:identifier/events', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const body = await c.req.json<{
    event_type: 'impression' | 'close' | 'purchase_started' | 'purchase_completed' | 'purchase_failed' | 'restore_started';
    app_user_id?: string;
    offering_id?: string;
    package_id?: string;
    product_id?: string;
    locale?: string;
    platform?: string;
    metadata?: Record<string, unknown>;
  }>();

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);
  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  const validEvents = ['impression', 'close', 'purchase_started', 'purchase_completed', 'purchase_failed', 'restore_started'];
  if (!body.event_type || !validEvents.includes(body.event_type)) {
    throw Errors.validationError(`event_type must be one of: ${validEvents.join(', ')}`);
  }

  // Get subscriber ID if app_user_id provided
  let subscriberId: string | undefined;
  if (body.app_user_id) {
    const subscriber = await getSubscriberByAppUserId(c.env.DB, app.id, body.app_user_id);
    subscriberId = subscriber?.id;
  }

  await trackPaywallEvent(c.env.DB, {
    appId: app.id,
    templateId: template.id,
    subscriberId,
    eventType: body.event_type,
    offeringId: body.offering_id,
    packageId: body.package_id,
    productId: body.product_id,
    locale: body.locale,
    platform: body.platform,
    metadata: body.metadata,
    timestamp: Date.now(),
  });

  return c.json({ tracked: true });
});

/**
 * GET /v1/paywalls/:identifier/analytics
 * Get paywall analytics
 */
paywallsRouter.get('/:identifier/analytics', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const period = c.req.query('period') || '30d';

  const template = await getPaywallTemplate(c.env.DB, app.id, identifier);
  if (!template) {
    throw Errors.notFound('Paywall template');
  }

  // Parse period
  let periodDays = 30;
  if (period.endsWith('d')) {
    periodDays = parseInt(period.slice(0, -1), 10);
  }

  const endDate = Date.now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  const analytics = await getPaywallAnalytics(
    c.env.DB,
    app.id,
    template.id,
    startDate,
    endDate
  );

  return c.json({
    template_id: template.id,
    template_identifier: template.identifier,
    period: `${periodDays}d`,
    ...analytics,
  });
});

// =====================================================
// HELPERS
// =====================================================

function getTypeName(type: TemplateType): string {
  const names: Record<TemplateType, string> = {
    single: 'Single Product',
    multi: 'Multi Product',
    feature_list: 'Feature List',
    comparison: 'Free vs Premium',
    minimal: 'Minimal',
  };
  return names[type];
}

function getTypeDescription(type: TemplateType): string {
  const descriptions: Record<TemplateType, string> = {
    single: 'Simple paywall with one subscription option',
    multi: 'Multiple subscription tiers displayed vertically',
    feature_list: 'Highlight premium features with icons',
    comparison: 'Side-by-side free vs premium comparison',
    minimal: 'Compact bottom sheet style paywall',
  };
  return descriptions[type];
}
