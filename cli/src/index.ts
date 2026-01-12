#!/usr/bin/env node
/**
 * MRRCat CLI
 * Command-line interface for managing MRRCat instances
 */

import { Command } from 'commander';
import Conf from 'conf';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

const config = new Conf({ projectName: 'mrrcat-cli' });
const program = new Command();

// API client helper
async function apiRequest(
  method: string,
  path: string,
  body?: any,
  useAdminAuth = false
): Promise<any> {
  const baseUrl = config.get('baseUrl') as string;
  const apiKey = config.get('apiKey') as string;
  const adminToken = config.get('adminToken') as string;

  if (!baseUrl) {
    throw new Error('No server configured. Run: mrrcat config set-server <url>');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (useAdminAuth) {
    if (!adminToken) {
      throw new Error('Not logged in. Run: mrrcat login');
    }
    headers['Authorization'] = `Bearer ${adminToken}`;
  } else {
    if (!apiKey) {
      throw new Error('No API key configured. Run: mrrcat config set-key <key>');
    }
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `Request failed: ${response.status}`);
  }

  return data;
}

program
  .name('mrrcat')
  .description('MRRCat CLI - Unified Payment & Subscription Management')
  .version('1.0.0');

// ========== Config Commands ==========

const configCmd = program.command('config').description('Configure CLI settings');

configCmd
  .command('set-server <url>')
  .description('Set MRRCat server URL')
  .action((url: string) => {
    config.set('baseUrl', url.replace(/\/$/, ''));
    console.log(chalk.green(`Server URL set to: ${url}`));
  });

configCmd
  .command('set-key <apiKey>')
  .description('Set API key for app operations')
  .action((apiKey: string) => {
    config.set('apiKey', apiKey);
    console.log(chalk.green('API key saved successfully'));
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const baseUrl = config.get('baseUrl') as string;
    const apiKey = config.get('apiKey') as string;
    const adminToken = config.get('adminToken') as string;

    console.log(chalk.bold('\nMRRCat CLI Configuration:\n'));
    console.log(`Server URL: ${baseUrl || chalk.gray('(not set)')}`);
    console.log(`API Key: ${apiKey ? maskString(apiKey) : chalk.gray('(not set)')}`);
    console.log(`Admin: ${adminToken ? chalk.green('Logged in') : chalk.gray('Not logged in')}`);
  });

configCmd
  .command('clear')
  .description('Clear all configuration')
  .action(() => {
    config.clear();
    console.log(chalk.yellow('Configuration cleared'));
  });

// ========== Auth Commands ==========

program
  .command('login')
  .description('Login as admin')
  .requiredOption('-e, --email <email>', 'Admin email')
  .requiredOption('-p, --password <password>', 'Admin password')
  .action(async (options) => {
    const spinner = ora('Logging in...').start();
    try {
      const baseUrl = config.get('baseUrl') as string;
      if (!baseUrl) {
        throw new Error('No server configured. Run: mrrcat config set-server <url>');
      }

      const response = await fetch(`${baseUrl}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: options.email, password: options.password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      config.set('adminToken', data.token);
      spinner.succeed(chalk.green(`Logged in as ${options.email}`));
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

program
  .command('logout')
  .description('Logout from admin')
  .action(() => {
    config.delete('adminToken');
    console.log(chalk.green('Logged out successfully'));
  });

// ========== Apps Commands ==========

const appsCmd = program.command('apps').description('Manage apps');

appsCmd
  .command('list')
  .description('List all apps')
  .action(async () => {
    const spinner = ora('Fetching apps...').start();
    try {
      const data = await apiRequest('GET', '/admin/apps', null, true);
      spinner.stop();

      if (!data.apps?.length) {
        console.log(chalk.yellow('No apps found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Name', 'API Key', 'Platforms'],
        style: { head: ['cyan'] },
      });

      for (const app of data.apps) {
        const platforms = [];
        if (app.has_apple) platforms.push('iOS');
        if (app.has_google) platforms.push('Android');
        if (app.has_stripe) platforms.push('Stripe');

        table.push([
          app.id.substring(0, 8) + '...',
          app.name,
          maskString(app.api_key),
          platforms.join(', ') || '-',
        ]);
      }

      console.log(table.toString());
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

appsCmd
  .command('create <name>')
  .description('Create a new app')
  .action(async (name: string) => {
    const spinner = ora('Creating app...').start();
    try {
      const data = await apiRequest('POST', '/admin/apps', { name }, true);
      spinner.succeed(chalk.green('App created successfully'));
      console.log(`\nApp ID: ${data.app.id}`);
      console.log(`API Key: ${chalk.yellow(data.app.api_key)}`);
      console.log(chalk.gray('\nSave this API key - it won\'t be shown again!'));
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

appsCmd
  .command('show <id>')
  .description('Show app details')
  .action(async (id: string) => {
    const spinner = ora('Fetching app...').start();
    try {
      const data = await apiRequest('GET', `/admin/apps/${id}`, null, true);
      spinner.stop();

      console.log(chalk.bold(`\n${data.app.name}`));
      console.log(`ID: ${data.app.id}`);
      console.log(`API Key: ${maskString(data.app.api_key)}`);

      if (data.app.apple_config) {
        console.log(chalk.cyan('\nApple Configuration:'));
        console.log(`  Key ID: ${data.app.apple_config.key_id}`);
        console.log(`  Issuer ID: ${data.app.apple_config.issuer_id}`);
        console.log(`  Bundle ID: ${data.app.apple_config.bundle_id}`);
      }

      if (data.app.google_config) {
        console.log(chalk.green('\nGoogle Configuration:'));
        console.log(`  Package Name: ${data.app.google_config.package_name}`);
      }

      if (data.app.stripe_config) {
        console.log(chalk.magenta('\nStripe Configuration:'));
        console.log(`  Configured: Yes`);
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// ========== Subscribers Commands ==========

const subsCmd = program.command('subscribers').description('Manage subscribers');

subsCmd
  .command('get <appUserId>')
  .description('Get subscriber information')
  .action(async (appUserId: string) => {
    const spinner = ora('Fetching subscriber...').start();
    try {
      const data = await apiRequest('GET', `/v1/subscribers/${encodeURIComponent(appUserId)}`);
      spinner.stop();

      const sub = data.subscriber;
      console.log(chalk.bold(`\nSubscriber: ${sub.original_app_user_id}`));
      console.log(`First Seen: ${sub.first_seen}`);

      if (Object.keys(sub.subscriptions || {}).length > 0) {
        console.log(chalk.cyan('\nSubscriptions:'));
        for (const [productId, subscription] of Object.entries(sub.subscriptions) as any) {
          const status = subscription.status === 'active'
            ? chalk.green(subscription.status)
            : chalk.red(subscription.status);
          console.log(`  ${productId}: ${status} (${subscription.platform})`);
          if (subscription.expires_date) {
            console.log(`    Expires: ${subscription.expires_date}`);
          }
        }
      }

      if (Object.keys(sub.entitlements || {}).length > 0) {
        console.log(chalk.yellow('\nEntitlements:'));
        for (const [id, entitlement] of Object.entries(sub.entitlements) as any) {
          const status = entitlement.is_active
            ? chalk.green('active')
            : chalk.red('inactive');
          console.log(`  ${id}: ${status}`);
        }
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

subsCmd
  .command('export <appUserId>')
  .description('Export subscriber data (GDPR)')
  .option('-f, --format <format>', 'Output format (json|csv)', 'json')
  .action(async (appUserId: string, options) => {
    const spinner = ora('Exporting data...').start();
    try {
      const data = await apiRequest(
        'GET',
        `/v1/subscribers/${encodeURIComponent(appUserId)}/export?format=${options.format}`
      );
      spinner.stop();

      if (options.format === 'json') {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(data);
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

subsCmd
  .command('delete <appUserId>')
  .description('Delete subscriber (GDPR)')
  .option('--confirm', 'Confirm deletion')
  .action(async (appUserId: string, options) => {
    if (!options.confirm) {
      console.log(chalk.yellow('Warning: This will permanently delete all subscriber data.'));
      console.log(`Run with --confirm to proceed.`);
      return;
    }

    const spinner = ora('Deleting subscriber...').start();
    try {
      await apiRequest(
        'DELETE',
        `/v1/subscribers/${encodeURIComponent(appUserId)}?confirm=true`
      );
      spinner.succeed(chalk.green('Subscriber deleted'));
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// ========== Analytics Commands ==========

const analyticsCmd = program.command('analytics').description('View analytics');

analyticsCmd
  .command('overview')
  .description('Get analytics overview')
  .option('-p, --period <period>', 'Time period (7d, 30d, 90d)', '30d')
  .action(async (options) => {
    const spinner = ora('Fetching analytics...').start();
    try {
      const data = await apiRequest('GET', `/v1/analytics/overview?period=${options.period}`);
      spinner.stop();

      console.log(chalk.bold(`\nAnalytics Overview (${data.period}):\n`));
      console.log(`MRR: ${chalk.green('$' + (data.mrr || 0).toFixed(2))}`);
      console.log(`Active Subscribers: ${chalk.cyan(data.active_subscribers || 0)}`);
      console.log(`Active Trials: ${data.active_trials || 0}`);
      console.log(`Churn Rate: ${chalk.red((data.churn_rate || 0).toFixed(2) + '%')}`);
      console.log(`New Subscribers: ${chalk.green('+' + (data.new_subscribers || 0))}`);
      console.log(`Conversions: ${data.conversions || 0}`);
      console.log(`Refunds: ${data.refunds || 0}`);

      if (data.revenue_by_platform) {
        console.log(chalk.bold('\nRevenue by Platform:'));
        for (const [platform, revenue] of Object.entries(data.revenue_by_platform) as any) {
          console.log(`  ${platform}: $${revenue.toFixed(2)}`);
        }
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

analyticsCmd
  .command('mrr')
  .description('Get MRR details')
  .action(async () => {
    const spinner = ora('Fetching MRR...').start();
    try {
      const data = await apiRequest('GET', '/v1/analytics/mrr');
      spinner.stop();

      console.log(chalk.bold('\nMonthly Recurring Revenue:\n'));
      console.log(`Total MRR: ${chalk.green('$' + data.total_mrr.toFixed(2))}`);

      if (data.products?.length) {
        const table = new Table({
          head: ['Product', 'Platform', 'MRR', 'Subscribers'],
          style: { head: ['cyan'] },
        });

        for (const p of data.products) {
          table.push([p.product_id, p.platform, '$' + p.mrr.toFixed(2), p.subscribers]);
        }

        console.log(table.toString());
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

analyticsCmd
  .command('export <type>')
  .description('Export analytics data (subscribers|transactions|revenue|events)')
  .action(async (type: string) => {
    const validTypes = ['subscribers', 'transactions', 'revenue', 'events'];
    if (!validTypes.includes(type)) {
      console.log(chalk.red(`Invalid type. Use: ${validTypes.join(', ')}`));
      return;
    }

    const spinner = ora(`Exporting ${type}...`).start();
    try {
      const baseUrl = config.get('baseUrl') as string;
      const apiKey = config.get('apiKey') as string;

      const response = await fetch(`${baseUrl}/v1/analytics/export/${type}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const csv = await response.text();
      const filename = `${type}_${Date.now()}.csv`;

      // In a real CLI, we'd write to file
      spinner.succeed(`Exported ${type}`);
      console.log(csv);
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// ========== Integrations Commands ==========

const integrationsCmd = program.command('integrations').description('Manage integrations');

integrationsCmd
  .command('list')
  .description('List all integrations')
  .action(async () => {
    const spinner = ora('Fetching integrations...').start();
    try {
      const data = await apiRequest('GET', '/v1/integrations');
      spinner.stop();

      if (!data.integrations?.length) {
        console.log(chalk.yellow('No integrations configured'));
        return;
      }

      const table = new Table({
        head: ['Name', 'Type', 'Status', 'Events'],
        style: { head: ['cyan'] },
      });

      for (const i of data.integrations) {
        table.push([
          i.name,
          i.type,
          i.enabled ? chalk.green('enabled') : chalk.red('disabled'),
          i.events.join(', '),
        ]);
      }

      console.log(table.toString());
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

integrationsCmd
  .command('test <id>')
  .description('Test an integration')
  .action(async (id: string) => {
    const spinner = ora('Testing integration...').start();
    try {
      const data = await apiRequest('POST', `/v1/integrations/${id}/test`);
      if (data.success) {
        spinner.succeed(chalk.green(data.message || 'Integration test successful'));
      } else {
        spinner.fail(chalk.red(data.error || 'Test failed'));
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// ========== Dashboard Command ==========

program
  .command('dashboard')
  .description('Show admin dashboard summary')
  .action(async () => {
    const spinner = ora('Fetching dashboard...').start();
    try {
      const data = await apiRequest('GET', '/admin/dashboard', null, true);
      spinner.stop();

      console.log(chalk.bold('\n=== MRRCat Dashboard ===\n'));
      console.log(`Apps: ${chalk.cyan(data.apps)}`);
      console.log(`Total Subscribers: ${chalk.cyan(data.total_subscribers)}`);
      console.log(`Active Subscriptions: ${chalk.green(data.active_subscriptions)}`);

      if (data.revenue_30d?.length) {
        console.log(chalk.bold('\nRevenue (30 days):'));
        for (const r of data.revenue_30d) {
          console.log(`  ${r.currency}: $${(r.total / 100).toFixed(2)}`);
        }
      }

      if (data.platform_breakdown?.length) {
        console.log(chalk.bold('\nActive by Platform:'));
        for (const p of data.platform_breakdown) {
          console.log(`  ${p.platform}: ${p.count}`);
        }
      }

      if (data.events_30d?.length) {
        console.log(chalk.bold('\nEvents (30 days):'));
        for (const e of data.events_30d) {
          console.log(`  ${e.event_type}: ${e.count}`);
        }
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// ========== Helper Functions ==========

function maskString(str: string): string {
  if (!str || str.length < 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}

// Parse and execute
program.parse();
