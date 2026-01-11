/**
 * Entitlement Configuration Routes
 * Manage entitlement definitions and product mappings
 */

import { Hono } from 'hono';
import type { Env, App, Platform } from '../types';
import {
  getEntitlementDefinitions,
  getProductEntitlements,
  createEntitlementDefinition,
  createProductEntitlement,
} from '../db/queries';
import { Errors } from '../middleware/error';
import { toISOString } from '../utils/time';

type Variables = { app: App };

export const entitlementsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

/**
 * GET /v1/entitlements
 * List all entitlement definitions
 */
entitlementsRouter.get('/', async (c) => {
  const app = c.get('app');

  const definitions = await getEntitlementDefinitions(c.env.DB, app.id);
  const mappings = await getProductEntitlements(c.env.DB, app.id);

  // Group mappings by entitlement
  const entitlementProducts: Record<
    string,
    Array<{ product_id: string; platform: Platform }>
  > = {};

  for (const mapping of mappings) {
    if (!entitlementProducts[mapping.entitlement_id]) {
      entitlementProducts[mapping.entitlement_id] = [];
    }
    entitlementProducts[mapping.entitlement_id].push({
      product_id: mapping.product_id,
      platform: mapping.platform,
    });
  }

  const entitlements = definitions.map((def) => ({
    id: def.id,
    identifier: def.identifier,
    display_name: def.display_name,
    products: entitlementProducts[def.id] || [],
    created_at: toISOString(def.created_at),
  }));

  return c.json({ entitlements });
});

/**
 * POST /v1/entitlements
 * Create a new entitlement definition
 */
entitlementsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    identifier: string;
    display_name?: string;
  }>();

  if (!body.identifier) {
    throw Errors.validationError('identifier is required');
  }

  // Check if identifier already exists
  const existing = await c.env.DB.prepare(
    'SELECT id FROM entitlement_definitions WHERE app_id = ? AND identifier = ?'
  )
    .bind(app.id, body.identifier)
    .first();

  if (existing) {
    throw Errors.validationError('Entitlement identifier already exists');
  }

  const definition = await createEntitlementDefinition(
    c.env.DB,
    app.id,
    body.identifier,
    body.display_name
  );

  return c.json(
    {
      entitlement: {
        id: definition.id,
        identifier: definition.identifier,
        display_name: definition.display_name,
        products: [],
        created_at: toISOString(definition.created_at),
      },
    },
    201
  );
});

/**
 * GET /v1/entitlements/:identifier
 * Get entitlement by identifier
 */
entitlementsRouter.get('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const definition = await c.env.DB.prepare(
    'SELECT * FROM entitlement_definitions WHERE app_id = ? AND identifier = ?'
  )
    .bind(app.id, identifier)
    .first();

  if (!definition) {
    throw Errors.notFound('Entitlement');
  }

  // Get product mappings
  const mappings = await c.env.DB.prepare(
    'SELECT product_id, platform FROM product_entitlements WHERE entitlement_id = ?'
  )
    .bind(definition.id as string)
    .all<{ product_id: string; platform: Platform }>();

  return c.json({
    entitlement: {
      id: definition.id,
      identifier: definition.identifier,
      display_name: definition.display_name,
      products: mappings.results || [],
      created_at: toISOString(definition.created_at as number),
    },
  });
});

/**
 * DELETE /v1/entitlements/:identifier
 * Delete entitlement definition
 */
entitlementsRouter.delete('/:identifier', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');

  const definition = await c.env.DB.prepare(
    'SELECT id FROM entitlement_definitions WHERE app_id = ? AND identifier = ?'
  )
    .bind(app.id, identifier)
    .first<{ id: string }>();

  if (!definition) {
    throw Errors.notFound('Entitlement');
  }

  // Delete mappings first
  await c.env.DB.prepare(
    'DELETE FROM product_entitlements WHERE entitlement_id = ?'
  )
    .bind(definition.id)
    .run();

  // Delete definition
  await c.env.DB.prepare('DELETE FROM entitlement_definitions WHERE id = ?')
    .bind(definition.id)
    .run();

  return c.json({ deleted: true });
});

/**
 * POST /v1/entitlements/:identifier/products
 * Add product to entitlement
 */
entitlementsRouter.post('/:identifier/products', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const body = await c.req.json<{
    product_id: string;
    platform: Platform;
  }>();

  if (!body.product_id) {
    throw Errors.validationError('product_id is required');
  }

  if (!body.platform || !['ios', 'android', 'stripe'].includes(body.platform)) {
    throw Errors.validationError('platform must be ios, android, or stripe');
  }

  // Get entitlement
  const definition = await c.env.DB.prepare(
    'SELECT id FROM entitlement_definitions WHERE app_id = ? AND identifier = ?'
  )
    .bind(app.id, identifier)
    .first<{ id: string }>();

  if (!definition) {
    throw Errors.notFound('Entitlement');
  }

  // Check if mapping already exists
  const existing = await c.env.DB.prepare(
    `SELECT id FROM product_entitlements
     WHERE app_id = ? AND product_id = ? AND platform = ? AND entitlement_id = ?`
  )
    .bind(app.id, body.product_id, body.platform, definition.id)
    .first();

  if (existing) {
    throw Errors.validationError('Product mapping already exists');
  }

  // Create mapping
  const mapping = await createProductEntitlement(
    c.env.DB,
    app.id,
    body.product_id,
    body.platform,
    definition.id
  );

  return c.json(
    {
      product_entitlement: {
        id: mapping.id,
        product_id: mapping.product_id,
        platform: mapping.platform,
        entitlement_identifier: identifier,
        created_at: toISOString(mapping.created_at),
      },
    },
    201
  );
});

/**
 * DELETE /v1/entitlements/:identifier/products/:product_id
 * Remove product from entitlement
 */
entitlementsRouter.delete('/:identifier/products/:product_id', async (c) => {
  const app = c.get('app');
  const identifier = c.req.param('identifier');
  const productId = c.req.param('product_id');
  const platform = c.req.query('platform') as Platform | undefined;

  // Get entitlement
  const definition = await c.env.DB.prepare(
    'SELECT id FROM entitlement_definitions WHERE app_id = ? AND identifier = ?'
  )
    .bind(app.id, identifier)
    .first<{ id: string }>();

  if (!definition) {
    throw Errors.notFound('Entitlement');
  }

  // Delete mapping(s)
  if (platform) {
    await c.env.DB.prepare(
      `DELETE FROM product_entitlements
       WHERE entitlement_id = ? AND product_id = ? AND platform = ?`
    )
      .bind(definition.id, productId, platform)
      .run();
  } else {
    await c.env.DB.prepare(
      `DELETE FROM product_entitlements
       WHERE entitlement_id = ? AND product_id = ?`
    )
      .bind(definition.id, productId)
      .run();
  }

  return c.json({ deleted: true });
});
