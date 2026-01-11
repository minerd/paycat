/**
 * Offerings Service
 * Remote configuration for products and packages
 */

import { generateId } from '../utils/id';

// Types
export interface Offering {
  id: string;
  identifier: string;
  displayName: string | null;
  description: string | null;
  isCurrent: boolean;
  metadata: Record<string, unknown>;
  packages: Package[];
}

export interface Package {
  id: string;
  identifier: string;
  displayName: string | null;
  description: string | null;
  packageType: PackageType;
  position: number;
  products: Product[];
}

export interface Product {
  id: string;
  storeProductId: string;
  platform: Platform;
  displayName: string | null;
  description: string | null;
  productType: ProductType;
  defaultPrice: {
    amount: number;
    currency: string;
  } | null;
  subscriptionPeriod: string | null;
  trialPeriod: string | null;
  metadata: Record<string, unknown>;
}

export type Platform = 'ios' | 'android' | 'stripe';
export type PackageType = 'weekly' | 'monthly' | 'two_month' | 'three_month' | 'six_month' | 'annual' | 'lifetime' | 'custom';
export type ProductType = 'subscription' | 'consumable' | 'non_consumable';

export interface TargetingContext {
  appUserId?: string;
  country?: string;
  appVersion?: string;
  platform?: Platform;
  customAttributes?: Record<string, string>;
}

export interface TargetingRule {
  id: string;
  name: string;
  offeringId: string;
  priority: number;
  conditions: TargetingConditions;
  active: boolean;
  startAt: number | null;
  endAt: number | null;
}

export interface TargetingConditions {
  countries?: string[];
  platforms?: Platform[];
  appVersionMin?: string;
  appVersionMax?: string;
  customAttributes?: Record<string, string[]>;
}

// Database row types
interface OfferingRow {
  id: string;
  app_id: string;
  identifier: string;
  display_name: string | null;
  description: string | null;
  is_current: number;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

interface PackageRow {
  id: string;
  offering_id: string;
  app_id: string;
  identifier: string;
  display_name: string | null;
  description: string | null;
  package_type: string;
  position: number;
  created_at: number;
  updated_at: number;
}

interface ProductRow {
  id: string;
  app_id: string;
  store_product_id: string;
  platform: string;
  display_name: string | null;
  description: string | null;
  product_type: string;
  default_price_amount: number | null;
  default_price_currency: string | null;
  subscription_period: string | null;
  trial_period: string | null;
  metadata: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}

interface TargetingRuleRow {
  id: string;
  app_id: string;
  offering_id: string;
  name: string;
  description: string | null;
  priority: number;
  conditions: string;
  active: number;
  start_at: number | null;
  end_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Get all offerings for an app
 */
export async function getOfferings(
  db: D1Database,
  appId: string
): Promise<Offering[]> {
  const offerings = await db
    .prepare('SELECT * FROM offerings WHERE app_id = ? ORDER BY is_current DESC, created_at DESC')
    .bind(appId)
    .all<OfferingRow>();

  const result: Offering[] = [];

  for (const offering of offerings.results) {
    const packages = await getPackagesForOffering(db, offering.id);
    result.push(mapOfferingRow(offering, packages));
  }

  return result;
}

/**
 * Get current offering for an app
 */
export async function getCurrentOffering(
  db: D1Database,
  appId: string
): Promise<Offering | null> {
  const offering = await db
    .prepare('SELECT * FROM offerings WHERE app_id = ? AND is_current = 1 LIMIT 1')
    .bind(appId)
    .first<OfferingRow>();

  if (!offering) {
    // Try to get any offering as fallback
    const fallback = await db
      .prepare('SELECT * FROM offerings WHERE app_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(appId)
      .first<OfferingRow>();

    if (!fallback) return null;

    const packages = await getPackagesForOffering(db, fallback.id);
    return mapOfferingRow(fallback, packages);
  }

  const packages = await getPackagesForOffering(db, offering.id);
  return mapOfferingRow(offering, packages);
}

/**
 * Get offering by identifier
 */
export async function getOfferingByIdentifier(
  db: D1Database,
  appId: string,
  identifier: string
): Promise<Offering | null> {
  const offering = await db
    .prepare('SELECT * FROM offerings WHERE app_id = ? AND identifier = ?')
    .bind(appId, identifier)
    .first<OfferingRow>();

  if (!offering) return null;

  const packages = await getPackagesForOffering(db, offering.id);
  return mapOfferingRow(offering, packages);
}

/**
 * Get offering based on targeting rules
 */
export async function getTargetedOffering(
  db: D1Database,
  appId: string,
  context: TargetingContext
): Promise<Offering | null> {
  const now = Date.now();

  // Get active targeting rules ordered by priority
  const rules = await db
    .prepare(`
      SELECT * FROM targeting_rules
      WHERE app_id = ? AND active = 1
      AND (start_at IS NULL OR start_at <= ?)
      AND (end_at IS NULL OR end_at > ?)
      ORDER BY priority DESC
    `)
    .bind(appId, now, now)
    .all<TargetingRuleRow>();

  // Find first matching rule
  for (const rule of rules.results) {
    const conditions = JSON.parse(rule.conditions) as TargetingConditions;

    if (matchesTargetingConditions(conditions, context)) {
      // Get the offering for this rule
      const offering = await db
        .prepare('SELECT * FROM offerings WHERE id = ?')
        .bind(rule.offering_id)
        .first<OfferingRow>();

      if (offering) {
        const packages = await getPackagesForOffering(db, offering.id);
        return mapOfferingRow(offering, packages);
      }
    }
  }

  // No matching rule, return current offering
  return getCurrentOffering(db, appId);
}

/**
 * Create a new offering
 */
export async function createOffering(
  db: D1Database,
  appId: string,
  data: {
    identifier: string;
    displayName?: string;
    description?: string;
    isCurrent?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<Offering> {
  const id = generateId();
  const now = Date.now();

  // If this is the current offering, unset others
  if (data.isCurrent) {
    await db
      .prepare('UPDATE offerings SET is_current = 0 WHERE app_id = ?')
      .bind(appId)
      .run();
  }

  await db
    .prepare(`
      INSERT INTO offerings (id, app_id, identifier, display_name, description, is_current, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      appId,
      data.identifier,
      data.displayName || null,
      data.description || null,
      data.isCurrent ? 1 : 0,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    )
    .run();

  return {
    id,
    identifier: data.identifier,
    displayName: data.displayName || null,
    description: data.description || null,
    isCurrent: data.isCurrent || false,
    metadata: data.metadata || {},
    packages: [],
  };
}

/**
 * Update an offering
 */
export async function updateOffering(
  db: D1Database,
  offeringId: string,
  appId: string,
  data: {
    displayName?: string;
    description?: string;
    isCurrent?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const now = Date.now();

  // If setting as current, unset others first
  if (data.isCurrent) {
    await db
      .prepare('UPDATE offerings SET is_current = 0 WHERE app_id = ?')
      .bind(appId)
      .run();
  }

  const updates: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (data.displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(data.displayName);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.isCurrent !== undefined) {
    updates.push('is_current = ?');
    values.push(data.isCurrent ? 1 : 0);
  }
  if (data.metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(JSON.stringify(data.metadata));
  }

  values.push(offeringId);

  await db
    .prepare(`UPDATE offerings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

/**
 * Delete an offering
 */
export async function deleteOffering(
  db: D1Database,
  offeringId: string
): Promise<void> {
  await db.prepare('DELETE FROM offerings WHERE id = ?').bind(offeringId).run();
}

/**
 * Create a package within an offering
 */
export async function createPackage(
  db: D1Database,
  offeringId: string,
  appId: string,
  data: {
    identifier: string;
    displayName?: string;
    description?: string;
    packageType: PackageType;
    position?: number;
  }
): Promise<Package> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare(`
      INSERT INTO packages (id, offering_id, app_id, identifier, display_name, description, package_type, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      offeringId,
      appId,
      data.identifier,
      data.displayName || null,
      data.description || null,
      data.packageType,
      data.position || 0,
      now,
      now
    )
    .run();

  return {
    id,
    identifier: data.identifier,
    displayName: data.displayName || null,
    description: data.description || null,
    packageType: data.packageType,
    position: data.position || 0,
    products: [],
  };
}

/**
 * Create a product
 */
export async function createProduct(
  db: D1Database,
  appId: string,
  data: {
    storeProductId: string;
    platform: Platform;
    displayName?: string;
    description?: string;
    productType: ProductType;
    defaultPriceAmount?: number;
    defaultPriceCurrency?: string;
    subscriptionPeriod?: string;
    trialPeriod?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Product> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare(`
      INSERT INTO products (id, app_id, store_product_id, platform, display_name, description, product_type, default_price_amount, default_price_currency, subscription_period, trial_period, metadata, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .bind(
      id,
      appId,
      data.storeProductId,
      data.platform,
      data.displayName || null,
      data.description || null,
      data.productType,
      data.defaultPriceAmount || null,
      data.defaultPriceCurrency || null,
      data.subscriptionPeriod || null,
      data.trialPeriod || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    )
    .run();

  return {
    id,
    storeProductId: data.storeProductId,
    platform: data.platform,
    displayName: data.displayName || null,
    description: data.description || null,
    productType: data.productType,
    defaultPrice:
      data.defaultPriceAmount && data.defaultPriceCurrency
        ? { amount: data.defaultPriceAmount, currency: data.defaultPriceCurrency }
        : null,
    subscriptionPeriod: data.subscriptionPeriod || null,
    trialPeriod: data.trialPeriod || null,
    metadata: data.metadata || {},
  };
}

/**
 * Add product to package
 */
export async function addProductToPackage(
  db: D1Database,
  packageId: string,
  productId: string,
  position?: number
): Promise<void> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare(`
      INSERT INTO package_products (id, package_id, product_id, position, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(id, packageId, productId, position || 0, now)
    .run();
}

/**
 * Remove product from package
 */
export async function removeProductFromPackage(
  db: D1Database,
  packageId: string,
  productId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM package_products WHERE package_id = ? AND product_id = ?')
    .bind(packageId, productId)
    .run();
}

/**
 * Get all products for an app
 */
export async function getProducts(
  db: D1Database,
  appId: string,
  platform?: Platform
): Promise<Product[]> {
  let query = 'SELECT * FROM products WHERE app_id = ? AND active = 1';
  const params: string[] = [appId];

  if (platform) {
    query += ' AND platform = ?';
    params.push(platform);
  }

  query += ' ORDER BY created_at DESC';

  const products = await db
    .prepare(query)
    .bind(...params)
    .all<ProductRow>();

  return products.results.map(mapProductRow);
}

/**
 * Create targeting rule
 */
export async function createTargetingRule(
  db: D1Database,
  appId: string,
  offeringId: string,
  data: {
    name: string;
    description?: string;
    priority?: number;
    conditions: TargetingConditions;
    startAt?: number;
    endAt?: number;
  }
): Promise<TargetingRule> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare(`
      INSERT INTO targeting_rules (id, app_id, offering_id, name, description, priority, conditions, active, start_at, end_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `)
    .bind(
      id,
      appId,
      offeringId,
      data.name,
      data.description || null,
      data.priority || 0,
      JSON.stringify(data.conditions),
      data.startAt || null,
      data.endAt || null,
      now,
      now
    )
    .run();

  return {
    id,
    name: data.name,
    offeringId,
    priority: data.priority || 0,
    conditions: data.conditions,
    active: true,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
  };
}

// Helper functions
async function getPackagesForOffering(
  db: D1Database,
  offeringId: string
): Promise<Package[]> {
  const packages = await db
    .prepare('SELECT * FROM packages WHERE offering_id = ? ORDER BY position ASC')
    .bind(offeringId)
    .all<PackageRow>();

  const result: Package[] = [];

  for (const pkg of packages.results) {
    const products = await getProductsForPackage(db, pkg.id);
    result.push({
      id: pkg.id,
      identifier: pkg.identifier,
      displayName: pkg.display_name,
      description: pkg.description,
      packageType: pkg.package_type as PackageType,
      position: pkg.position,
      products,
    });
  }

  return result;
}

async function getProductsForPackage(
  db: D1Database,
  packageId: string
): Promise<Product[]> {
  const rows = await db
    .prepare(`
      SELECT p.* FROM products p
      JOIN package_products pp ON p.id = pp.product_id
      WHERE pp.package_id = ? AND p.active = 1
      ORDER BY pp.position ASC
    `)
    .bind(packageId)
    .all<ProductRow>();

  return rows.results.map(mapProductRow);
}

function mapOfferingRow(row: OfferingRow, packages: Package[]): Offering {
  return {
    id: row.id,
    identifier: row.identifier,
    displayName: row.display_name,
    description: row.description,
    isCurrent: row.is_current === 1,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    packages,
  };
}

function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    storeProductId: row.store_product_id,
    platform: row.platform as Platform,
    displayName: row.display_name,
    description: row.description,
    productType: row.product_type as ProductType,
    defaultPrice:
      row.default_price_amount && row.default_price_currency
        ? { amount: row.default_price_amount, currency: row.default_price_currency }
        : null,
    subscriptionPeriod: row.subscription_period,
    trialPeriod: row.trial_period,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  };
}

function matchesTargetingConditions(
  conditions: TargetingConditions,
  context: TargetingContext
): boolean {
  // Check country
  if (conditions.countries && conditions.countries.length > 0) {
    if (!context.country || !conditions.countries.includes(context.country.toUpperCase())) {
      return false;
    }
  }

  // Check platform
  if (conditions.platforms && conditions.platforms.length > 0) {
    if (!context.platform || !conditions.platforms.includes(context.platform)) {
      return false;
    }
  }

  // Check app version (simple semver comparison)
  if (conditions.appVersionMin && context.appVersion) {
    if (compareVersions(context.appVersion, conditions.appVersionMin) < 0) {
      return false;
    }
  }

  if (conditions.appVersionMax && context.appVersion) {
    if (compareVersions(context.appVersion, conditions.appVersionMax) > 0) {
      return false;
    }
  }

  // Check custom attributes
  if (conditions.customAttributes && context.customAttributes) {
    for (const [key, allowedValues] of Object.entries(conditions.customAttributes)) {
      const userValue = context.customAttributes[key];
      if (!userValue || !allowedValues.includes(userValue)) {
        return false;
      }
    }
  }

  return true;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}
