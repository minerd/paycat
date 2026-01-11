/**
 * Custom Reports Service
 * Build, execute, and manage custom analytics reports
 */

import { generateId } from '../utils/id';

// Report Types
export type ReportType = 'revenue' | 'subscribers' | 'churn' | 'cohort' | 'custom';
export type ChartType = 'table' | 'line' | 'bar' | 'pie' | 'area' | 'funnel';
export type ScheduleType = 'daily' | 'weekly' | 'monthly' | null;
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

// Available Metrics
export const AVAILABLE_METRICS = [
  { id: 'revenue', name: 'Revenue', type: 'currency' },
  { id: 'mrr', name: 'MRR', type: 'currency' },
  { id: 'arr', name: 'ARR', type: 'currency' },
  { id: 'active_subscribers', name: 'Active Subscribers', type: 'number' },
  { id: 'new_subscribers', name: 'New Subscribers', type: 'number' },
  { id: 'churned_subscribers', name: 'Churned Subscribers', type: 'number' },
  { id: 'churn_rate', name: 'Churn Rate', type: 'percentage' },
  { id: 'trial_starts', name: 'Trial Starts', type: 'number' },
  { id: 'trial_conversions', name: 'Trial Conversions', type: 'number' },
  { id: 'conversion_rate', name: 'Conversion Rate', type: 'percentage' },
  { id: 'refunds', name: 'Refunds', type: 'number' },
  { id: 'refund_amount', name: 'Refund Amount', type: 'currency' },
  { id: 'ltv', name: 'Lifetime Value', type: 'currency' },
  { id: 'arpu', name: 'ARPU', type: 'currency' },
  { id: 'arppu', name: 'ARPPU', type: 'currency' },
] as const;

// Available Dimensions
export const AVAILABLE_DIMENSIONS = [
  { id: 'date', name: 'Date', type: 'date' },
  { id: 'week', name: 'Week', type: 'date' },
  { id: 'month', name: 'Month', type: 'date' },
  { id: 'platform', name: 'Platform', type: 'string' },
  { id: 'product_id', name: 'Product', type: 'string' },
  { id: 'country', name: 'Country', type: 'string' },
  { id: 'store', name: 'Store', type: 'string' },
  { id: 'subscription_status', name: 'Subscription Status', type: 'string' },
  { id: 'is_trial', name: 'Is Trial', type: 'boolean' },
  { id: 'is_sandbox', name: 'Is Sandbox', type: 'boolean' },
] as const;

// Report Configuration
export interface ReportConfig {
  metrics: string[];
  dimensions?: string[];
  filters?: ReportFilter[];
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  dateRange?: {
    start: string;
    end: string;
    relative?: string; // 'last_7d', 'last_30d', 'last_90d', 'this_month', 'last_month'
  };
  limit?: number;
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains';
  value: string | number | string[] | number[];
}

export interface ChartConfig {
  title?: string;
  xAxis?: { label: string; field: string };
  yAxis?: { label: string; field: string };
  colors?: string[];
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
}

// Report Definition
export interface CustomReport {
  id: string;
  appId: string;
  name: string;
  description?: string;
  reportType: ReportType;
  config: ReportConfig;
  chartType: ChartType;
  chartConfig?: ChartConfig;
  schedule?: ScheduleType;
  scheduleTime?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  emailRecipients?: string[];
  emailEnabled: boolean;
  active: boolean;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

// Report Execution
export interface ReportExecution {
  id: string;
  reportId: string;
  appId: string;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  resultData?: any;
  resultCount?: number;
  resultFormat?: 'json' | 'csv';
  resultFileUrl?: string;
  parameters?: Record<string, any>;
  executionTimeMs?: number;
  createdAt: number;
}

/**
 * Get all custom reports for an app
 */
export async function getCustomReports(
  db: D1Database,
  appId: string,
  activeOnly: boolean = true
): Promise<CustomReport[]> {
  const query = activeOnly
    ? `SELECT * FROM custom_reports WHERE app_id = ? AND active = 1 ORDER BY updated_at DESC`
    : `SELECT * FROM custom_reports WHERE app_id = ? ORDER BY updated_at DESC`;

  const result = await db.prepare(query).bind(appId).all();

  return (result.results || []).map(mapReportFromDB);
}

/**
 * Get a single report by ID
 */
export async function getCustomReport(
  db: D1Database,
  appId: string,
  reportId: string
): Promise<CustomReport | null> {
  const result = await db.prepare(
    `SELECT * FROM custom_reports WHERE id = ? AND app_id = ?`
  ).bind(reportId, appId).first();

  if (!result) return null;
  return mapReportFromDB(result);
}

/**
 * Create a new custom report
 */
export async function createCustomReport(
  db: D1Database,
  appId: string,
  data: {
    name: string;
    description?: string;
    reportType: ReportType;
    config: ReportConfig;
    chartType?: ChartType;
    chartConfig?: ChartConfig;
    schedule?: ScheduleType;
    scheduleTime?: string;
    emailRecipients?: string[];
    emailEnabled?: boolean;
  }
): Promise<CustomReport> {
  const id = generateId();
  const now = Date.now();

  // Calculate next run time if scheduled
  let nextRunAt: number | null = null;
  if (data.schedule && data.scheduleTime) {
    nextRunAt = calculateNextRunTime(data.schedule, data.scheduleTime);
  }

  await db.prepare(
    `INSERT INTO custom_reports (
      id, app_id, name, description, report_type, config,
      chart_type, chart_config, schedule, schedule_time, next_run_at,
      email_recipients, email_enabled, active, is_public, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
  ).bind(
    id,
    appId,
    data.name,
    data.description || null,
    data.reportType,
    JSON.stringify(data.config),
    data.chartType || 'table',
    data.chartConfig ? JSON.stringify(data.chartConfig) : null,
    data.schedule || null,
    data.scheduleTime || null,
    nextRunAt,
    data.emailRecipients ? JSON.stringify(data.emailRecipients) : null,
    data.emailEnabled ? 1 : 0,
    now,
    now
  ).run();

  return {
    id,
    appId,
    name: data.name,
    description: data.description,
    reportType: data.reportType,
    config: data.config,
    chartType: data.chartType || 'table',
    chartConfig: data.chartConfig,
    schedule: data.schedule,
    scheduleTime: data.scheduleTime,
    nextRunAt: nextRunAt || undefined,
    emailRecipients: data.emailRecipients,
    emailEnabled: data.emailEnabled ?? false,
    active: true,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a custom report
 */
export async function updateCustomReport(
  db: D1Database,
  appId: string,
  reportId: string,
  data: Partial<{
    name: string;
    description: string;
    config: ReportConfig;
    chartType: ChartType;
    chartConfig: ChartConfig;
    schedule: ScheduleType;
    scheduleTime: string;
    emailRecipients: string[];
    emailEnabled: boolean;
    active: boolean;
    isPublic: boolean;
  }>
): Promise<void> {
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.config !== undefined) {
    updates.push('config = ?');
    values.push(JSON.stringify(data.config));
  }
  if (data.chartType !== undefined) {
    updates.push('chart_type = ?');
    values.push(data.chartType);
  }
  if (data.chartConfig !== undefined) {
    updates.push('chart_config = ?');
    values.push(JSON.stringify(data.chartConfig));
  }
  if (data.schedule !== undefined) {
    updates.push('schedule = ?');
    values.push(data.schedule);
  }
  if (data.scheduleTime !== undefined) {
    updates.push('schedule_time = ?');
    values.push(data.scheduleTime);
  }
  if (data.emailRecipients !== undefined) {
    updates.push('email_recipients = ?');
    values.push(JSON.stringify(data.emailRecipients));
  }
  if (data.emailEnabled !== undefined) {
    updates.push('email_enabled = ?');
    values.push(data.emailEnabled ? 1 : 0);
  }
  if (data.active !== undefined) {
    updates.push('active = ?');
    values.push(data.active ? 1 : 0);
  }
  if (data.isPublic !== undefined) {
    updates.push('is_public = ?');
    values.push(data.isPublic ? 1 : 0);
  }

  // Recalculate next run time if schedule changed
  if (data.schedule !== undefined || data.scheduleTime !== undefined) {
    const report = await getCustomReport(db, appId, reportId);
    const schedule = data.schedule ?? report?.schedule;
    const scheduleTime = data.scheduleTime ?? report?.scheduleTime;

    if (schedule && scheduleTime) {
      updates.push('next_run_at = ?');
      values.push(calculateNextRunTime(schedule, scheduleTime));
    } else {
      updates.push('next_run_at = ?');
      values.push(null);
    }
  }

  values.push(reportId, appId);

  await db.prepare(
    `UPDATE custom_reports SET ${updates.join(', ')} WHERE id = ? AND app_id = ?`
  ).bind(...values).run();
}

/**
 * Delete a custom report
 */
export async function deleteCustomReport(
  db: D1Database,
  appId: string,
  reportId: string
): Promise<void> {
  await db.prepare(
    `DELETE FROM custom_reports WHERE id = ? AND app_id = ?`
  ).bind(reportId, appId).run();
}

/**
 * Execute a report
 */
export async function executeReport(
  db: D1Database,
  appId: string,
  report: CustomReport,
  parameters?: Record<string, any>
): Promise<ReportExecution> {
  const executionId = generateId();
  const now = Date.now();

  // Create execution record
  await db.prepare(
    `INSERT INTO report_executions (
      id, report_id, app_id, status, started_at, parameters, created_at
    ) VALUES (?, ?, ?, 'running', ?, ?, ?)`
  ).bind(
    executionId,
    report.id,
    appId,
    now,
    parameters ? JSON.stringify(parameters) : null,
    now
  ).run();

  try {
    // Execute the report query
    const startTime = Date.now();
    const result = await runReportQuery(db, appId, report.config, parameters);
    const executionTimeMs = Date.now() - startTime;

    // Update execution with results
    await db.prepare(
      `UPDATE report_executions SET
        status = 'completed',
        completed_at = ?,
        result_data = ?,
        result_count = ?,
        result_format = 'json',
        execution_time_ms = ?
       WHERE id = ?`
    ).bind(
      Date.now(),
      JSON.stringify(result.data),
      result.count,
      executionTimeMs,
      executionId
    ).run();

    // Update report last run time
    await db.prepare(
      `UPDATE custom_reports SET last_run_at = ? WHERE id = ?`
    ).bind(now, report.id).run();

    return {
      id: executionId,
      reportId: report.id,
      appId,
      status: 'completed',
      startedAt: now,
      completedAt: Date.now(),
      resultData: result.data,
      resultCount: result.count,
      resultFormat: 'json',
      executionTimeMs,
      parameters,
      createdAt: now,
    };
  } catch (error) {
    // Update execution with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.prepare(
      `UPDATE report_executions SET
        status = 'failed',
        completed_at = ?,
        error_message = ?
       WHERE id = ?`
    ).bind(Date.now(), errorMessage, executionId).run();

    return {
      id: executionId,
      reportId: report.id,
      appId,
      status: 'failed',
      startedAt: now,
      completedAt: Date.now(),
      errorMessage,
      parameters,
      createdAt: now,
    };
  }
}

/**
 * Get report executions
 */
export async function getReportExecutions(
  db: D1Database,
  reportId: string,
  limit: number = 10
): Promise<ReportExecution[]> {
  const result = await db.prepare(
    `SELECT * FROM report_executions WHERE report_id = ? ORDER BY created_at DESC LIMIT ?`
  ).bind(reportId, limit).all();

  return (result.results || []).map((row: any) => ({
    id: row.id,
    reportId: row.report_id,
    appId: row.app_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    resultData: row.result_data ? JSON.parse(row.result_data) : null,
    resultCount: row.result_count,
    resultFormat: row.result_format,
    resultFileUrl: row.result_file_url,
    parameters: row.parameters ? JSON.parse(row.parameters) : null,
    executionTimeMs: row.execution_time_ms,
    createdAt: row.created_at,
  }));
}

/**
 * Run the actual report query
 */
async function runReportQuery(
  db: D1Database,
  appId: string,
  config: ReportConfig,
  _parameters?: Record<string, any>
): Promise<{ data: any[]; count: number }> {
  // Build dynamic query based on config
  const { metrics, dimensions, filters, sortBy, dateRange, limit } = config;

  // Determine date range
  let startDate: number;
  let endDate: number = Date.now();

  if (dateRange?.relative) {
    const now = Date.now();
    switch (dateRange.relative) {
      case 'last_7d':
        startDate = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'last_30d':
        startDate = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'last_90d':
        startDate = now - 90 * 24 * 60 * 60 * 1000;
        break;
      default:
        startDate = now - 30 * 24 * 60 * 60 * 1000;
    }
  } else if (dateRange?.start && dateRange?.end) {
    startDate = new Date(dateRange.start).getTime();
    endDate = new Date(dateRange.end).getTime();
  } else {
    startDate = Date.now() - 30 * 24 * 60 * 60 * 1000; // Default 30 days
  }

  // Build metric calculations
  const metricSelects: string[] = [];
  for (const metric of metrics) {
    switch (metric) {
      case 'revenue':
        metricSelects.push('COALESCE(SUM(t.revenue_amount), 0) / 100.0 as revenue');
        break;
      case 'active_subscribers':
        metricSelects.push("COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END) as active_subscribers");
        break;
      case 'new_subscribers':
        metricSelects.push(`COUNT(DISTINCT CASE WHEN s.created_at >= ${startDate} THEN s.id END) as new_subscribers`);
        break;
      case 'churned_subscribers':
        metricSelects.push("COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN s.id END) as churned_subscribers");
        break;
      case 'trial_starts':
        metricSelects.push('COUNT(DISTINCT CASE WHEN s.is_trial = 1 THEN s.id END) as trial_starts');
        break;
      case 'refunds':
        metricSelects.push('COUNT(DISTINCT CASE WHEN t.is_refunded = 1 THEN t.id END) as refunds');
        break;
      case 'refund_amount':
        metricSelects.push('COALESCE(SUM(CASE WHEN t.is_refunded = 1 THEN t.revenue_amount END), 0) / 100.0 as refund_amount');
        break;
      default:
        // For unknown metrics, just count
        metricSelects.push(`COUNT(*) as ${metric}`);
    }
  }

  // Build dimension selects and group by
  const dimensionSelects: string[] = [];
  const groupByFields: string[] = [];

  for (const dim of (dimensions || [])) {
    switch (dim) {
      case 'date':
        dimensionSelects.push("DATE(t.purchase_date / 1000, 'unixepoch') as date");
        groupByFields.push('date');
        break;
      case 'week':
        dimensionSelects.push("STRFTIME('%Y-W%W', t.purchase_date / 1000, 'unixepoch') as week");
        groupByFields.push('week');
        break;
      case 'month':
        dimensionSelects.push("STRFTIME('%Y-%m', t.purchase_date / 1000, 'unixepoch') as month");
        groupByFields.push('month');
        break;
      case 'platform':
        dimensionSelects.push('s.platform');
        groupByFields.push('s.platform');
        break;
      case 'product_id':
        dimensionSelects.push('s.product_id');
        groupByFields.push('s.product_id');
        break;
      case 'subscription_status':
        dimensionSelects.push('s.status as subscription_status');
        groupByFields.push('s.status');
        break;
    }
  }

  // Build query
  const selectParts = [...dimensionSelects, ...metricSelects];
  const selectClause = selectParts.length > 0 ? selectParts.join(', ') : 'COUNT(*) as count';

  let query = `
    SELECT ${selectClause}
    FROM subscriptions s
    LEFT JOIN transactions t ON t.subscription_id = s.id
    WHERE s.app_id = ?
      AND s.created_at >= ?
      AND s.created_at <= ?
  `;

  const queryParams: any[] = [appId, startDate, endDate];

  // Add filters
  if (filters && filters.length > 0) {
    for (const filter of filters) {
      const { field, operator, value } = filter;
      switch (operator) {
        case 'eq':
          query += ` AND ${field} = ?`;
          queryParams.push(value);
          break;
        case 'neq':
          query += ` AND ${field} != ?`;
          queryParams.push(value);
          break;
        case 'gt':
          query += ` AND ${field} > ?`;
          queryParams.push(value);
          break;
        case 'gte':
          query += ` AND ${field} >= ?`;
          queryParams.push(value);
          break;
        case 'lt':
          query += ` AND ${field} < ?`;
          queryParams.push(value);
          break;
        case 'lte':
          query += ` AND ${field} <= ?`;
          queryParams.push(value);
          break;
        case 'in':
          if (Array.isArray(value)) {
            query += ` AND ${field} IN (${value.map(() => '?').join(', ')})`;
            queryParams.push(...value);
          }
          break;
      }
    }
  }

  // Add group by
  if (groupByFields.length > 0) {
    query += ` GROUP BY ${groupByFields.join(', ')}`;
  }

  // Add order by
  if (sortBy && sortBy.length > 0) {
    const orderParts = sortBy.map(s => `${s.field} ${s.direction.toUpperCase()}`);
    query += ` ORDER BY ${orderParts.join(', ')}`;
  } else if (groupByFields.length > 0) {
    query += ` ORDER BY ${groupByFields[0]}`;
  }

  // Add limit
  if (limit) {
    query += ` LIMIT ?`;
    queryParams.push(limit);
  }

  const result = await db.prepare(query).bind(...queryParams).all();

  return {
    data: result.results || [],
    count: result.results?.length || 0,
  };
}

/**
 * Calculate next run time for scheduled report
 */
function calculateNextRunTime(schedule: ScheduleType, scheduleTime: string): number {
  if (!schedule || !scheduleTime) return Date.now();

  const [hours, minutes] = scheduleTime.split(':').map(Number);
  const now = new Date();
  const next = new Date();

  next.setUTCHours(hours, minutes, 0, 0);

  switch (schedule) {
    case 'daily':
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;
    case 'weekly':
      // Next Monday
      const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      break;
    case 'monthly':
      // First of next month
      next.setMonth(next.getMonth() + 1, 1);
      break;
  }

  return next.getTime();
}

/**
 * Map database row to CustomReport
 */
function mapReportFromDB(row: any): CustomReport {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    description: row.description,
    reportType: row.report_type,
    config: JSON.parse(row.config),
    chartType: row.chart_type,
    chartConfig: row.chart_config ? JSON.parse(row.chart_config) : undefined,
    schedule: row.schedule,
    scheduleTime: row.schedule_time,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    emailRecipients: row.email_recipients ? JSON.parse(row.email_recipients) : undefined,
    emailEnabled: row.email_enabled === 1,
    active: row.active === 1,
    isPublic: row.is_public === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
