/**
 * Offerings Routes
 * Remote configuration for products and packages
 */

import { Hono } from 'hono';
import type { Env, App } from '../types';
import {
  getOfferings,
  getOfferingByIdentifier,
  getTargetedOffering,
  createOffering,
  updateOffering,
  deleteOffering,
  createPackage,
  createProduct,
  addProductToPackage,
  removeProductFromPackage,
  getProducts,
  createTargetingRule,
  type Platform,
  type PackageType,
  type ProductType,
  type TargetingConditions,
} from '../services/offerings';
import { Errors } from '../middleware/error';

type Variables = { app: App };

export const offeringsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/offerings
 * Get all offerings or current offering based on targeting
 */
offeringsRouter.get('/', async (c) => {
  const app = c.get('app');
  const all = c.req.query('all') === 'true';

  if (all) {
    // Return all offerings (for admin/config purposes)
    const offerings = await getOfferings(c.env.DB, app.id);
    return c.json({ offerings: offerings.map(formatOffering) });
  }

  // Get targeted offering based on context
  const context = {
    appUserId: c.req.query('app_user_id'),
    country: c.req.header('CF-IPCountry') || c.req.query('country'),
    appVersion: c.req.query('app_version'),
    platform: c.req.query('platform') as Platform | undefined,
    customAttributes: parseCustomAttributes(c.req.query('attributes')),
  };

  const offering = await getTargetedOffering(c.env.DB, app.id, context);

  if (!offering) {
    return c.json({
      current_offering_id: null,
      offerings: [],
    });
  }

  return c.json({
    current_offering_id: offering.identifier,
    offerings: [formatOffering(offering)],
  });
});

/**
 * GET /v1/offerings/:identifier
 * Get offering by identifier
 */
offeringsRouter.get('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const offering = await getOfferingByIdentifier(c.env.DB, app.id, identifier);

  if (!offering) {
    throw Errors.notFound('Offering');
  }

  return c.json({ offering: formatOffering(offering) });
});

/**
 * POST /v1/offerings
 * Create a new offering
 */
offeringsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    identifier: string;
    display_name?: string;
    description?: string;
    is_current?: boolean;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.identifier) {
    throw Errors.validationError('identifier is required');
  }

  // Check if identifier already exists
  const existing = await getOfferingByIdentifier(c.env.DB, app.id, body.identifier);
  if (existing) {
    throw Errors.validationError('Offering identifier already exists');
  }

  const offering = await createOffering(c.env.DB, app.id, {
    identifier: body.identifier,
    displayName: body.display_name,
    description: body.description,
    isCurrent: body.is_current,
    metadata: body.metadata,
  });

  return c.json({ offering: formatOffering(offering) }, 201);
});

/**
 * PATCH /v1/offerings/:identifier
 * Update an offering
 */
offeringsRouter.patch('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const body = await c.req.json<{
    display_name?: string;
    description?: string;
    is_current?: boolean;
    metadata?: Record<string, unknown>;
  }>();

  const offering = await getOfferingByIdentifier(c.env.DB, app.id, identifier);
  if (!offering) {
    throw Errors.notFound('Offering');
  }

  await updateOffering(c.env.DB, offering.id, app.id, {
    displayName: body.display_name,
    description: body.description,
    isCurrent: body.is_current,
    metadata: body.metadata,
  });

  const updated = await getOfferingByIdentifier(c.env.DB, app.id, identifier);
  return c.json({ offering: formatOffering(updated!) });
});

/**
 * DELETE /v1/offerings/:identifier
 * Delete an offering
 */
offeringsRouter.delete('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const offering = await getOfferingByIdentifier(c.env.DB, app.id, identifier);
  if (!offering) {
    throw Errors.notFound('Offering');
  }

  await deleteOffering(c.env.DB, offering.id);
  return c.json({ deleted: true });
});

/**
 * POST /v1/offerings/:identifier/packages
 * Create a package within an offering
 */
offeringsRouter.post('/:identifier/packages', async (c) => {
  const app = c.get('app');
  const offeringIdentifier = c.req.param('identifier');
  const body = await c.req.json<{
    identifier: string;
    display_name?: string;
    description?: string;
    package_type: PackageType;
    position?: number;
  }>();

  if (!body.identifier) {
    throw Errors.validationError('identifier is required');
  }

  if (!body.package_type) {
    throw Errors.validationError('package_type is required');
  }

  const validPackageTypes = ['weekly', 'monthly', 'two_month', 'three_month', 'six_month', 'annual', 'lifetime', 'custom'];
  if (!validPackageTypes.includes(body.package_type)) {
    throw Errors.validationError(`package_type must be one of: ${validPackageTypes.join(', ')}`);
  }

  const offering = await getOfferingByIdentifier(c.env.DB, app.id, offeringIdentifier);
  if (!offering) {
    throw Errors.notFound('Offering');
  }

  const pkg = await createPackage(c.env.DB, offering.id, app.id, {
    identifier: body.identifier,
    displayName: body.display_name,
    description: body.description,
    packageType: body.package_type,
    position: body.position,
  });

  return c.json({ package: formatPackage(pkg) }, 201);
});

// ===== PRODUCTS =====

/**
 * GET /v1/products
 * Get all products
 */
offeringsRouter.get('/products', async (c) => {
  const app = c.get('app');
  const platform = c.req.query('platform') as Platform | undefined;

  if (platform && !['ios', 'android', 'stripe'].includes(platform)) {
    throw Errors.validationError('platform must be ios, android, or stripe');
  }

  const products = await getProducts(c.env.DB, app.id, platform);
  return c.json({ products: products.map(formatProduct) });
});

/**
 * POST /v1/products
 * Create a new product
 */
offeringsRouter.post('/products', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    store_product_id: string;
    platform: Platform;
    display_name?: string;
    description?: string;
    product_type: ProductType;
    default_price_amount?: number;
    default_price_currency?: string;
    subscription_period?: string;
    trial_period?: string;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.store_product_id) {
    throw Errors.validationError('store_product_id is required');
  }

  if (!body.platform || !['ios', 'android', 'stripe'].includes(body.platform)) {
    throw Errors.validationError('platform must be ios, android, or stripe');
  }

  if (!body.product_type || !['subscription', 'consumable', 'non_consumable'].includes(body.product_type)) {
    throw Errors.validationError('product_type must be subscription, consumable, or non_consumable');
  }

  const product = await createProduct(c.env.DB, app.id, {
    storeProductId: body.store_product_id,
    platform: body.platform,
    displayName: body.display_name,
    description: body.description,
    productType: body.product_type,
    defaultPriceAmount: body.default_price_amount,
    defaultPriceCurrency: body.default_price_currency,
    subscriptionPeriod: body.subscription_period,
    trialPeriod: body.trial_period,
    metadata: body.metadata,
  });

  return c.json({ product: formatProduct(product) }, 201);
});

/**
 * POST /v1/offerings/:identifier/packages/:packageId/products
 * Add product to package
 */
offeringsRouter.post('/:identifier/packages/:packageId/products', async (c) => {
  const app = c.get('app');
  const packageId = c.req.param('packageId');
  const body = await c.req.json<{
    product_id: string;
    position?: number;
  }>();

  if (!body.product_id) {
    throw Errors.validationError('product_id is required');
  }

  // Verify package exists and belongs to this app
  const pkg = await c.env.DB.prepare(
    'SELECT id FROM packages WHERE id = ? AND app_id = ?'
  ).bind(packageId, app.id).first();

  if (!pkg) {
    throw Errors.notFound('Package');
  }

  await addProductToPackage(c.env.DB, packageId, body.product_id, body.position);
  return c.json({ added: true }, 201);
});

/**
 * DELETE /v1/offerings/:identifier/packages/:packageId/products/:productId
 * Remove product from package
 */
offeringsRouter.delete('/:identifier/packages/:packageId/products/:productId', async (c) => {
  const app = c.get('app');
  const packageId = c.req.param('packageId');
  const productId = c.req.param('productId');

  // Verify package exists and belongs to this app
  const pkg = await c.env.DB.prepare(
    'SELECT id FROM packages WHERE id = ? AND app_id = ?'
  ).bind(packageId, app.id).first();

  if (!pkg) {
    throw Errors.notFound('Package');
  }

  await removeProductFromPackage(c.env.DB, packageId, productId);
  return c.json({ deleted: true });
});

// ===== TARGETING RULES =====

/**
 * GET /v1/offerings/targeting-rules
 * Get all targeting rules
 */
offeringsRouter.get('/targeting-rules', async (c) => {
  const app = c.get('app');

  const rules = await c.env.DB.prepare(
    'SELECT * FROM targeting_rules WHERE app_id = ? ORDER BY priority DESC'
  ).bind(app.id).all();

  return c.json({
    targeting_rules: rules.results.map((rule: any) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      offering_id: rule.offering_id,
      priority: rule.priority,
      conditions: JSON.parse(rule.conditions),
      active: rule.active === 1,
      start_at: rule.start_at ? new Date(rule.start_at).toISOString() : null,
      end_at: rule.end_at ? new Date(rule.end_at).toISOString() : null,
    })),
  });
});

/**
 * POST /v1/offerings/targeting-rules
 * Create a targeting rule
 */
offeringsRouter.post('/targeting-rules', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    name: string;
    description?: string;
    offering_identifier: string;
    priority?: number;
    conditions: TargetingConditions;
    start_at?: string;
    end_at?: string;
  }>();

  if (!body.name) {
    throw Errors.validationError('name is required');
  }

  if (!body.offering_identifier) {
    throw Errors.validationError('offering_identifier is required');
  }

  if (!body.conditions) {
    throw Errors.validationError('conditions is required');
  }

  // Get offering
  const offering = await getOfferingByIdentifier(c.env.DB, app.id, body.offering_identifier);
  if (!offering) {
    throw Errors.notFound('Offering');
  }

  const rule = await createTargetingRule(c.env.DB, app.id, offering.id, {
    name: body.name,
    description: body.description,
    priority: body.priority,
    conditions: body.conditions,
    startAt: body.start_at ? new Date(body.start_at).getTime() : undefined,
    endAt: body.end_at ? new Date(body.end_at).getTime() : undefined,
  });

  return c.json({
    targeting_rule: {
      id: rule.id,
      name: rule.name,
      offering_id: rule.offeringId,
      priority: rule.priority,
      conditions: rule.conditions,
      active: rule.active,
      start_at: rule.startAt ? new Date(rule.startAt).toISOString() : null,
      end_at: rule.endAt ? new Date(rule.endAt).toISOString() : null,
    },
  }, 201);
});

// ===== HELPER FUNCTIONS =====

function formatOffering(offering: any) {
  return {
    identifier: offering.identifier,
    display_name: offering.displayName,
    description: offering.description,
    is_current: offering.isCurrent,
    metadata: offering.metadata,
    available_packages: offering.packages.map(formatPackage),
  };
}

function formatPackage(pkg: any) {
  return {
    identifier: pkg.identifier,
    display_name: pkg.displayName,
    description: pkg.description,
    package_type: pkg.packageType,
    products: pkg.products.map(formatProduct),
  };
}

function formatProduct(product: any) {
  return {
    identifier: product.storeProductId,
    store_product_id: product.storeProductId,
    platform: product.platform,
    display_name: product.displayName,
    description: product.description,
    product_type: product.productType,
    price: product.defaultPrice
      ? {
          amount: product.defaultPrice.amount,
          currency: product.defaultPrice.currency,
        }
      : null,
    subscription_period: product.subscriptionPeriod,
    trial_period: product.trialPeriod,
    metadata: product.metadata,
  };
}

function parseCustomAttributes(attributesStr?: string): Record<string, string> | undefined {
  if (!attributesStr) return undefined;

  try {
    return JSON.parse(attributesStr);
  } catch {
    // Parse key=value,key2=value2 format
    const attrs: Record<string, string> = {};
    const pairs = attributesStr.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        attrs[key.trim()] = value.trim();
      }
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }
}
