/**
 * Paywall Templates Service
 * No-code paywall management system
 */

import { generateId } from '../utils/id';

// =====================================================
// TYPES
// =====================================================

export type TemplateType = 'single' | 'multi' | 'feature_list' | 'comparison' | 'minimal';

export interface PaywallColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  success: string;
  error: string;
}

export interface PaywallButton {
  text: string;
  style: 'filled' | 'outlined' | 'text';
  cornerRadius: number;
}

export interface PaywallFeature {
  icon?: string;
  title: string;
  description?: string;
  included: boolean;
}

export interface PaywallContent {
  title: string;
  subtitle?: string;
  headerImage?: string;
  features?: PaywallFeature[];
  ctaButton: PaywallButton;
  secondaryButton?: PaywallButton;
  termsText?: string;
  restoreText?: string;
  closeButton?: boolean;
}

export interface PaywallLayout {
  style: 'fullscreen' | 'sheet' | 'card';
  headerStyle: 'image' | 'gradient' | 'solid' | 'none';
  productDisplay: 'horizontal' | 'vertical' | 'carousel';
  showBadge: boolean;
  badgeText?: string;
  animateOnLoad: boolean;
}

export interface PaywallConfig {
  colors: PaywallColors;
  content: PaywallContent;
  layout: PaywallLayout;
  customCSS?: string;
  customJS?: string;
}

export interface PaywallTemplate {
  id: string;
  appId: string;
  identifier: string;
  name: string;
  description?: string;
  templateType: TemplateType;
  config: PaywallConfig;
  offeringId?: string;
  defaultLocale: string;
  localizations?: Record<string, Partial<PaywallContent>>;
  active: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PaywallAsset {
  id: string;
  appId: string;
  templateId?: string;
  assetType: 'header_image' | 'background' | 'icon' | 'product_image';
  name: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  metadata?: {
    width?: number;
    height?: number;
    altText?: string;
  };
  createdAt: number;
}

export interface PaywallEvent {
  id: string;
  appId: string;
  templateId: string;
  subscriberId?: string;
  eventType: 'impression' | 'close' | 'purchase_started' | 'purchase_completed' | 'purchase_failed' | 'restore_started';
  offeringId?: string;
  packageId?: string;
  productId?: string;
  locale?: string;
  platform?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// =====================================================
// DEFAULT TEMPLATES
// =====================================================

export const DEFAULT_COLORS: PaywallColors = {
  primary: '#007AFF',
  secondary: '#5856D6',
  background: '#FFFFFF',
  surface: '#F2F2F7',
  text: '#000000',
  textSecondary: '#8E8E93',
  accent: '#FF9500',
  success: '#34C759',
  error: '#FF3B30',
};

export const DARK_COLORS: PaywallColors = {
  primary: '#0A84FF',
  secondary: '#5E5CE6',
  background: '#000000',
  surface: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  accent: '#FF9F0A',
  success: '#30D158',
  error: '#FF453A',
};

export function getDefaultTemplate(type: TemplateType): Partial<PaywallConfig> {
  const baseConfig: Partial<PaywallConfig> = {
    colors: DEFAULT_COLORS,
    layout: {
      style: 'fullscreen',
      headerStyle: 'gradient',
      productDisplay: 'vertical',
      showBadge: true,
      badgeText: 'MOST POPULAR',
      animateOnLoad: true,
    },
  };

  switch (type) {
    case 'single':
      return {
        ...baseConfig,
        content: {
          title: 'Unlock Premium',
          subtitle: 'Get unlimited access to all features',
          ctaButton: { text: 'Continue', style: 'filled', cornerRadius: 12 },
          termsText: 'Subscription automatically renews unless cancelled',
          restoreText: 'Restore Purchases',
          closeButton: true,
        },
      };

    case 'multi':
      return {
        ...baseConfig,
        content: {
          title: 'Choose Your Plan',
          subtitle: 'Select the plan that works best for you',
          ctaButton: { text: 'Subscribe Now', style: 'filled', cornerRadius: 12 },
          secondaryButton: { text: 'Start Free Trial', style: 'outlined', cornerRadius: 12 },
          termsText: 'Cancel anytime. Terms apply.',
          restoreText: 'Restore Purchases',
          closeButton: true,
        },
        layout: {
          ...baseConfig.layout!,
          productDisplay: 'vertical',
        },
      };

    case 'feature_list':
      return {
        ...baseConfig,
        content: {
          title: 'Go Premium',
          subtitle: 'Unlock all these amazing features',
          features: [
            { icon: '✓', title: 'Unlimited Access', description: 'No restrictions', included: true },
            { icon: '✓', title: 'No Ads', description: 'Ad-free experience', included: true },
            { icon: '✓', title: 'Offline Mode', description: 'Use without internet', included: true },
            { icon: '✓', title: 'Priority Support', description: '24/7 help', included: true },
          ],
          ctaButton: { text: 'Unlock All Features', style: 'filled', cornerRadius: 12 },
          restoreText: 'Restore Purchases',
          closeButton: true,
        },
      };

    case 'comparison':
      return {
        ...baseConfig,
        content: {
          title: 'Free vs Premium',
          subtitle: 'See what you\'re missing',
          features: [
            { icon: '📱', title: 'Basic Features', included: true },
            { icon: '🚀', title: 'Advanced Features', included: false },
            { icon: '🎨', title: 'Custom Themes', included: false },
            { icon: '☁️', title: 'Cloud Sync', included: false },
            { icon: '📊', title: 'Analytics', included: false },
          ],
          ctaButton: { text: 'Upgrade to Premium', style: 'filled', cornerRadius: 12 },
          restoreText: 'Restore Purchases',
          closeButton: true,
        },
        layout: {
          ...baseConfig.layout!,
          headerStyle: 'solid',
        },
      };

    case 'minimal':
      return {
        colors: DEFAULT_COLORS,
        content: {
          title: 'Premium',
          ctaButton: { text: 'Subscribe', style: 'filled', cornerRadius: 8 },
          closeButton: true,
        },
        layout: {
          style: 'sheet',
          headerStyle: 'none',
          productDisplay: 'horizontal',
          showBadge: false,
          animateOnLoad: false,
        },
      };

    default:
      return baseConfig;
  }
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

export async function getPaywallTemplates(
  db: D1Database,
  appId: string,
  activeOnly = true
): Promise<PaywallTemplate[]> {
  let query = 'SELECT * FROM paywall_templates WHERE app_id = ?';
  if (activeOnly) {
    query += ' AND active = 1';
  }
  query += ' ORDER BY is_default DESC, created_at DESC';

  const result = await db.prepare(query).bind(appId).all();

  return (result.results || []).map(mapRowToTemplate);
}

export async function getPaywallTemplate(
  db: D1Database,
  appId: string,
  identifier: string
): Promise<PaywallTemplate | null> {
  const result = await db
    .prepare('SELECT * FROM paywall_templates WHERE app_id = ? AND identifier = ?')
    .bind(appId, identifier)
    .first();

  return result ? mapRowToTemplate(result) : null;
}

export async function getDefaultPaywallTemplate(
  db: D1Database,
  appId: string
): Promise<PaywallTemplate | null> {
  const result = await db
    .prepare('SELECT * FROM paywall_templates WHERE app_id = ? AND is_default = 1 AND active = 1')
    .bind(appId)
    .first();

  return result ? mapRowToTemplate(result) : null;
}

export async function createPaywallTemplate(
  db: D1Database,
  appId: string,
  data: {
    identifier: string;
    name: string;
    description?: string;
    templateType: TemplateType;
    config: PaywallConfig;
    offeringId?: string;
    defaultLocale?: string;
    localizations?: Record<string, Partial<PaywallContent>>;
    isDefault?: boolean;
  }
): Promise<PaywallTemplate> {
  const id = generateId();
  const now = Date.now();

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await db
      .prepare('UPDATE paywall_templates SET is_default = 0 WHERE app_id = ?')
      .bind(appId)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO paywall_templates
       (id, app_id, identifier, name, description, template_type, config, offering_id,
        default_locale, localizations, active, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      id,
      appId,
      data.identifier,
      data.name,
      data.description || null,
      data.templateType,
      JSON.stringify(data.config),
      data.offeringId || null,
      data.defaultLocale || 'en',
      data.localizations ? JSON.stringify(data.localizations) : null,
      data.isDefault ? 1 : 0,
      now,
      now
    )
    .run();

  return {
    id,
    appId,
    identifier: data.identifier,
    name: data.name,
    description: data.description,
    templateType: data.templateType,
    config: data.config,
    offeringId: data.offeringId,
    defaultLocale: data.defaultLocale || 'en',
    localizations: data.localizations,
    active: true,
    isDefault: data.isDefault || false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updatePaywallTemplate(
  db: D1Database,
  appId: string,
  identifier: string,
  data: Partial<{
    name: string;
    description: string;
    config: PaywallConfig;
    offeringId: string;
    localizations: Record<string, Partial<PaywallContent>>;
    active: boolean;
    isDefault: boolean;
  }>
): Promise<void> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.config !== undefined) {
    updates.push('config = ?');
    params.push(JSON.stringify(data.config));
  }
  if (data.offeringId !== undefined) {
    updates.push('offering_id = ?');
    params.push(data.offeringId);
  }
  if (data.localizations !== undefined) {
    updates.push('localizations = ?');
    params.push(JSON.stringify(data.localizations));
  }
  if (data.active !== undefined) {
    updates.push('active = ?');
    params.push(data.active ? 1 : 0);
  }
  if (data.isDefault !== undefined) {
    if (data.isDefault) {
      // Unset other defaults first
      await db
        .prepare('UPDATE paywall_templates SET is_default = 0 WHERE app_id = ?')
        .bind(appId)
        .run();
    }
    updates.push('is_default = ?');
    params.push(data.isDefault ? 1 : 0);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(appId, identifier);

  await db
    .prepare(
      `UPDATE paywall_templates SET ${updates.join(', ')} WHERE app_id = ? AND identifier = ?`
    )
    .bind(...params)
    .run();
}

export async function deletePaywallTemplate(
  db: D1Database,
  appId: string,
  identifier: string
): Promise<void> {
  await db
    .prepare('DELETE FROM paywall_templates WHERE app_id = ? AND identifier = ?')
    .bind(appId, identifier)
    .run();
}

// =====================================================
// PAYWALL EVENTS
// =====================================================

export async function trackPaywallEvent(
  db: D1Database,
  event: Omit<PaywallEvent, 'id'>
): Promise<void> {
  const id = generateId();

  await db
    .prepare(
      `INSERT INTO paywall_events
       (id, app_id, template_id, subscriber_id, event_type, offering_id, package_id,
        product_id, locale, platform, metadata, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      event.appId,
      event.templateId,
      event.subscriberId || null,
      event.eventType,
      event.offeringId || null,
      event.packageId || null,
      event.productId || null,
      event.locale || null,
      event.platform || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.timestamp,
      Date.now()
    )
    .run();
}

export async function getPaywallAnalytics(
  db: D1Database,
  appId: string,
  templateId: string,
  startDate: number,
  endDate: number
): Promise<{
  impressions: number;
  closes: number;
  purchaseStarts: number;
  purchaseCompletes: number;
  purchaseFails: number;
  conversionRate: number;
  closeRate: number;
}> {
  const result = await db
    .prepare(
      `SELECT event_type, COUNT(*) as count
       FROM paywall_events
       WHERE app_id = ? AND template_id = ? AND timestamp >= ? AND timestamp <= ?
       GROUP BY event_type`
    )
    .bind(appId, templateId, startDate, endDate)
    .all<{ event_type: string; count: number }>();

  const counts: Record<string, number> = {};
  for (const row of result.results || []) {
    counts[row.event_type] = row.count;
  }

  const impressions = counts['impression'] || 0;
  const closes = counts['close'] || 0;
  const purchaseStarts = counts['purchase_started'] || 0;
  const purchaseCompletes = counts['purchase_completed'] || 0;
  const purchaseFails = counts['purchase_failed'] || 0;

  return {
    impressions,
    closes,
    purchaseStarts,
    purchaseCompletes,
    purchaseFails,
    conversionRate: impressions > 0 ? (purchaseCompletes / impressions) * 100 : 0,
    closeRate: impressions > 0 ? (closes / impressions) * 100 : 0,
  };
}

// =====================================================
// HELPERS
// =====================================================

function mapRowToTemplate(row: any): PaywallTemplate {
  return {
    id: row.id,
    appId: row.app_id,
    identifier: row.identifier,
    name: row.name,
    description: row.description,
    templateType: row.template_type,
    config: JSON.parse(row.config),
    offeringId: row.offering_id,
    defaultLocale: row.default_locale || 'en',
    localizations: row.localizations ? JSON.parse(row.localizations) : undefined,
    active: !!row.active,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =====================================================
// TEMPLATE RENDERING
// =====================================================

export function renderPaywallHTML(
  template: PaywallTemplate,
  offering: any,
  locale: string = 'en'
): string {
  const config = template.config;
  const content = template.localizations?.[locale]
    ? { ...config.content, ...template.localizations[locale] }
    : config.content;
  const colors = config.colors;
  const layout = config.layout;

  const packages = offering?.packages || [];

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --color-primary: ${colors.primary};
      --color-secondary: ${colors.secondary};
      --color-background: ${colors.background};
      --color-surface: ${colors.surface};
      --color-text: ${colors.text};
      --color-text-secondary: ${colors.textSecondary};
      --color-accent: ${colors.accent};
      --color-success: ${colors.success};
      --color-error: ${colors.error};
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-background);
      color: var(--color-text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .paywall {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 500px;
      margin: 0 auto;
      width: 100%;
      ${layout.style === 'sheet' ? 'padding-top: 20vh;' : ''}
    }

    .header {
      ${layout.headerStyle === 'gradient'
        ? `background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});`
        : layout.headerStyle === 'solid'
        ? `background: ${colors.primary};`
        : ''}
      padding: 60px 24px 40px;
      text-align: center;
      color: ${layout.headerStyle !== 'none' ? '#fff' : 'var(--color-text)'};
      position: relative;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255,255,255,0.2);
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      color: inherit;
      cursor: pointer;
      font-size: 18px;
    }

    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .header p {
      font-size: 16px;
      opacity: 0.9;
    }

    .header-image {
      width: 120px;
      height: 120px;
      object-fit: contain;
      margin-bottom: 16px;
    }

    .content {
      flex: 1;
      padding: 24px;
    }

    .features {
      margin-bottom: 24px;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--color-surface);
    }

    .feature-icon {
      width: 24px;
      text-align: center;
      font-size: 18px;
    }

    .feature-text h4 {
      font-size: 15px;
      font-weight: 600;
    }

    .feature-text p {
      font-size: 13px;
      color: var(--color-text-secondary);
    }

    .packages {
      display: flex;
      flex-direction: ${layout.productDisplay === 'horizontal' ? 'row' : 'column'};
      gap: 12px;
      margin-bottom: 24px;
    }

    .package {
      border: 2px solid var(--color-surface);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      flex: 1;
    }

    .package:hover, .package.selected {
      border-color: var(--color-primary);
      background: rgba(0, 122, 255, 0.05);
    }

    .package-badge {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-accent);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 10px;
      text-transform: uppercase;
    }

    .package-name {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .package-price {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-primary);
    }

    .package-period {
      font-size: 13px;
      color: var(--color-text-secondary);
    }

    .package-trial {
      font-size: 12px;
      color: var(--color-success);
      margin-top: 4px;
    }

    .cta-btn {
      width: 100%;
      padding: 16px;
      font-size: 17px;
      font-weight: 600;
      border: none;
      border-radius: ${content.ctaButton.cornerRadius}px;
      cursor: pointer;
      transition: all 0.2s;
      ${content.ctaButton.style === 'filled'
        ? `background: var(--color-primary); color: #fff;`
        : content.ctaButton.style === 'outlined'
        ? `background: transparent; color: var(--color-primary); border: 2px solid var(--color-primary);`
        : `background: transparent; color: var(--color-primary);`}
    }

    .cta-btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .secondary-btn {
      width: 100%;
      padding: 12px;
      font-size: 15px;
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      cursor: pointer;
      margin-top: 12px;
    }

    .footer {
      padding: 16px 24px 32px;
      text-align: center;
    }

    .terms {
      font-size: 12px;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .restore {
      font-size: 14px;
      color: var(--color-primary);
      background: none;
      border: none;
      cursor: pointer;
    }

    ${layout.animateOnLoad ? `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .paywall { animation: fadeInUp 0.4s ease-out; }
    ` : ''}

    ${config.customCSS || ''}
  </style>
</head>
<body>
  <div class="paywall" data-template-id="${template.id}">
    <div class="header">
      ${content.closeButton ? '<button class="close-btn" onclick="PayCat.close()">✕</button>' : ''}
      ${content.headerImage ? `<img src="${content.headerImage}" alt="" class="header-image">` : ''}
      <h1>${content.title}</h1>
      ${content.subtitle ? `<p>${content.subtitle}</p>` : ''}
    </div>

    <div class="content">
      ${content.features ? `
      <div class="features">
        ${content.features.map(f => `
        <div class="feature">
          <span class="feature-icon">${f.icon || (f.included ? '✓' : '✗')}</span>
          <div class="feature-text">
            <h4>${f.title}</h4>
            ${f.description ? `<p>${f.description}</p>` : ''}
          </div>
        </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="packages">
        ${packages.map((pkg: any, i: number) => `
        <div class="package ${i === 0 ? 'selected' : ''}" data-package-id="${pkg.identifier}">
          ${layout.showBadge && i === 0 ? `<span class="package-badge">${layout.badgeText || 'BEST VALUE'}</span>` : ''}
          <div class="package-name">${pkg.display_name || pkg.identifier}</div>
          <div class="package-price">${pkg.product?.price?.formatted || ''}</div>
          <div class="package-period">${getPackagePeriod(pkg.package_type)}</div>
          ${pkg.product?.trial_period ? `<div class="package-trial">Free trial included</div>` : ''}
        </div>
        `).join('')}
      </div>

      <button class="cta-btn" onclick="PayCat.purchase()">${content.ctaButton.text}</button>

      ${content.secondaryButton ? `
      <button class="secondary-btn" onclick="PayCat.startTrial()">${content.secondaryButton.text}</button>
      ` : ''}
    </div>

    <div class="footer">
      ${content.termsText ? `<p class="terms">${content.termsText}</p>` : ''}
      ${content.restoreText ? `<button class="restore" onclick="PayCat.restore()">${content.restoreText}</button>` : ''}
    </div>
  </div>

  <script>
    // PayCat Paywall SDK
    window.PayCat = {
      selectedPackage: '${packages[0]?.identifier || ''}',

      selectPackage: function(id) {
        this.selectedPackage = id;
        document.querySelectorAll('.package').forEach(el => {
          el.classList.toggle('selected', el.dataset.packageId === id);
        });
        this.trackEvent('package_selected', { package_id: id });
      },

      purchase: function() {
        this.trackEvent('purchase_started', { package_id: this.selectedPackage });
        window.parent.postMessage({ type: 'paycat_purchase', packageId: this.selectedPackage }, '*');
      },

      startTrial: function() {
        this.trackEvent('trial_started', { package_id: this.selectedPackage });
        window.parent.postMessage({ type: 'paycat_trial', packageId: this.selectedPackage }, '*');
      },

      restore: function() {
        this.trackEvent('restore_started');
        window.parent.postMessage({ type: 'paycat_restore' }, '*');
      },

      close: function() {
        this.trackEvent('close');
        window.parent.postMessage({ type: 'paycat_close' }, '*');
      },

      trackEvent: function(type, data) {
        window.parent.postMessage({ type: 'paycat_event', eventType: type, data: data }, '*');
      }
    };

    // Track impression
    PayCat.trackEvent('impression');

    // Package selection
    document.querySelectorAll('.package').forEach(el => {
      el.addEventListener('click', () => PayCat.selectPackage(el.dataset.packageId));
    });

    ${config.customJS || ''}
  </script>
</body>
</html>
  `.trim();
}

function getPackagePeriod(packageType: string): string {
  switch (packageType) {
    case 'weekly': return 'per week';
    case 'monthly': return 'per month';
    case 'annual': return 'per year';
    case 'lifetime': return 'one-time';
    default: return '';
  }
}
