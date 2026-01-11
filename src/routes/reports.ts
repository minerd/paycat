/**
 * Custom Reports Routes
 * Create, manage, and execute custom analytics reports
 */

import { Hono } from 'hono';
import type { Env, App } from '../types';
import {
  getCustomReports,
  getCustomReport,
  createCustomReport,
  updateCustomReport,
  deleteCustomReport,
  executeReport,
  getReportExecutions,
  AVAILABLE_METRICS,
  AVAILABLE_DIMENSIONS,
  type ReportType,
  type ChartType,
  type ScheduleType,
  type ReportConfig,
  type ChartConfig,
} from '../services/reports';
import { Errors } from '../middleware/error';

type Variables = { app: App };

export const reportsRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const VALID_REPORT_TYPES: ReportType[] = ['revenue', 'subscribers', 'churn', 'cohort', 'custom'];
const VALID_CHART_TYPES: ChartType[] = ['table', 'line', 'bar', 'pie', 'area', 'funnel'];
const VALID_SCHEDULES: (ScheduleType | 'none')[] = ['daily', 'weekly', 'monthly', 'none'];

// =====================================================
// METADATA
// =====================================================

/**
 * GET /v1/reports/metadata
 * Get available metrics and dimensions
 */
reportsRouter.get('/metadata', async (c) => {
  return c.json({
    metrics: AVAILABLE_METRICS,
    dimensions: AVAILABLE_DIMENSIONS,
    report_types: VALID_REPORT_TYPES,
    chart_types: VALID_CHART_TYPES,
    schedules: VALID_SCHEDULES.filter(s => s !== 'none'),
  });
});

// =====================================================
// REPORT CRUD
// =====================================================

/**
 * GET /v1/reports
 * List all custom reports
 */
reportsRouter.get('/', async (c) => {
  const app = c.get('app');
  const includeInactive = c.req.query('include_inactive') === 'true';

  const reports = await getCustomReports(c.env.DB, app.id, !includeInactive);

  return c.json({
    reports: reports.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      report_type: r.reportType,
      chart_type: r.chartType,
      schedule: r.schedule,
      active: r.active,
      last_run_at: r.lastRunAt ? new Date(r.lastRunAt).toISOString() : null,
      next_run_at: r.nextRunAt ? new Date(r.nextRunAt).toISOString() : null,
      created_at: new Date(r.createdAt).toISOString(),
      updated_at: new Date(r.updatedAt).toISOString(),
    })),
  });
});

/**
 * GET /v1/reports/:id
 * Get a specific report
 */
reportsRouter.get('/:id', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');

  const report = await getCustomReport(c.env.DB, app.id, reportId);

  if (!report) {
    throw Errors.notFound('Report');
  }

  return c.json({
    report: {
      id: report.id,
      name: report.name,
      description: report.description,
      report_type: report.reportType,
      config: report.config,
      chart_type: report.chartType,
      chart_config: report.chartConfig,
      schedule: report.schedule,
      schedule_time: report.scheduleTime,
      email_recipients: report.emailRecipients,
      email_enabled: report.emailEnabled,
      active: report.active,
      is_public: report.isPublic,
      last_run_at: report.lastRunAt ? new Date(report.lastRunAt).toISOString() : null,
      next_run_at: report.nextRunAt ? new Date(report.nextRunAt).toISOString() : null,
      created_at: new Date(report.createdAt).toISOString(),
      updated_at: new Date(report.updatedAt).toISOString(),
    },
  });
});

/**
 * POST /v1/reports
 * Create a new report
 */
reportsRouter.post('/', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    name: string;
    description?: string;
    report_type: ReportType;
    config: ReportConfig;
    chart_type?: ChartType;
    chart_config?: ChartConfig;
    schedule?: ScheduleType | 'none';
    schedule_time?: string;
    email_recipients?: string[];
    email_enabled?: boolean;
  }>();

  // Validate required fields
  if (!body.name) {
    throw Errors.validationError('name is required');
  }
  if (!body.report_type || !VALID_REPORT_TYPES.includes(body.report_type)) {
    throw Errors.validationError(`report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}`);
  }
  if (!body.config || !body.config.metrics || body.config.metrics.length === 0) {
    throw Errors.validationError('config.metrics is required and must have at least one metric');
  }
  if (body.chart_type && !VALID_CHART_TYPES.includes(body.chart_type)) {
    throw Errors.validationError(`chart_type must be one of: ${VALID_CHART_TYPES.join(', ')}`);
  }

  // Validate metrics
  const validMetricIds = AVAILABLE_METRICS.map(m => m.id);
  for (const metric of body.config.metrics) {
    if (!validMetricIds.includes(metric as any)) {
      throw Errors.validationError(`Invalid metric: ${metric}`);
    }
  }

  // Validate dimensions
  if (body.config.dimensions) {
    const validDimensionIds = AVAILABLE_DIMENSIONS.map(d => d.id);
    for (const dim of body.config.dimensions) {
      if (!validDimensionIds.includes(dim as any)) {
        throw Errors.validationError(`Invalid dimension: ${dim}`);
      }
    }
  }

  const report = await createCustomReport(c.env.DB, app.id, {
    name: body.name,
    description: body.description,
    reportType: body.report_type,
    config: body.config,
    chartType: body.chart_type,
    chartConfig: body.chart_config,
    schedule: body.schedule === 'none' ? null : body.schedule,
    scheduleTime: body.schedule_time,
    emailRecipients: body.email_recipients,
    emailEnabled: body.email_enabled,
  });

  return c.json({
    report: {
      id: report.id,
      name: report.name,
      report_type: report.reportType,
      created_at: new Date(report.createdAt).toISOString(),
    },
  }, 201);
});

/**
 * PATCH /v1/reports/:id
 * Update a report
 */
reportsRouter.patch('/:id', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    description?: string;
    config?: ReportConfig;
    chart_type?: ChartType;
    chart_config?: ChartConfig;
    schedule?: ScheduleType | 'none';
    schedule_time?: string;
    email_recipients?: string[];
    email_enabled?: boolean;
    active?: boolean;
    is_public?: boolean;
  }>();

  const report = await getCustomReport(c.env.DB, app.id, reportId);
  if (!report) {
    throw Errors.notFound('Report');
  }

  await updateCustomReport(c.env.DB, app.id, reportId, {
    name: body.name,
    description: body.description,
    config: body.config,
    chartType: body.chart_type,
    chartConfig: body.chart_config,
    schedule: body.schedule === 'none' ? null : body.schedule,
    scheduleTime: body.schedule_time,
    emailRecipients: body.email_recipients,
    emailEnabled: body.email_enabled,
    active: body.active,
    isPublic: body.is_public,
  });

  return c.json({ updated: true });
});

/**
 * DELETE /v1/reports/:id
 * Delete a report
 */
reportsRouter.delete('/:id', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');

  const report = await getCustomReport(c.env.DB, app.id, reportId);
  if (!report) {
    throw Errors.notFound('Report');
  }

  await deleteCustomReport(c.env.DB, app.id, reportId);

  return c.json({ deleted: true });
});

// =====================================================
// EXECUTION
// =====================================================

/**
 * POST /v1/reports/:id/execute
 * Execute a report
 */
reportsRouter.post('/:id/execute', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');
  const body = await c.req.json<{
    parameters?: Record<string, any>;
  }>().catch(() => ({ parameters: undefined }));

  const report = await getCustomReport(c.env.DB, app.id, reportId);
  if (!report) {
    throw Errors.notFound('Report');
  }

  const execution = await executeReport(c.env.DB, app.id, report, body.parameters);

  return c.json({
    execution: {
      id: execution.id,
      status: execution.status,
      started_at: execution.startedAt ? new Date(execution.startedAt).toISOString() : null,
      completed_at: execution.completedAt ? new Date(execution.completedAt).toISOString() : null,
      result_count: execution.resultCount,
      execution_time_ms: execution.executionTimeMs,
      error_message: execution.errorMessage,
      data: execution.resultData,
    },
  });
});

/**
 * GET /v1/reports/:id/executions
 * Get execution history for a report
 */
reportsRouter.get('/:id/executions', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '10', 10);

  const report = await getCustomReport(c.env.DB, app.id, reportId);
  if (!report) {
    throw Errors.notFound('Report');
  }

  const executions = await getReportExecutions(c.env.DB, reportId, limit);

  return c.json({
    executions: executions.map(e => ({
      id: e.id,
      status: e.status,
      started_at: e.startedAt ? new Date(e.startedAt).toISOString() : null,
      completed_at: e.completedAt ? new Date(e.completedAt).toISOString() : null,
      result_count: e.resultCount,
      execution_time_ms: e.executionTimeMs,
      error_message: e.errorMessage,
      created_at: new Date(e.createdAt).toISOString(),
    })),
  });
});

/**
 * GET /v1/reports/:id/executions/:executionId
 * Get a specific execution with full results
 */
reportsRouter.get('/:id/executions/:executionId', async (c) => {
  const app = c.get('app');
  const reportId = c.req.param('id');
  const executionId = c.req.param('executionId');

  const report = await getCustomReport(c.env.DB, app.id, reportId);
  if (!report) {
    throw Errors.notFound('Report');
  }

  const execution = await c.env.DB.prepare(
    `SELECT * FROM report_executions WHERE id = ? AND report_id = ?`
  ).bind(executionId, reportId).first();

  if (!execution) {
    throw Errors.notFound('Execution');
  }

  return c.json({
    execution: {
      id: execution.id,
      status: execution.status,
      started_at: execution.started_at ? new Date(execution.started_at as number).toISOString() : null,
      completed_at: execution.completed_at ? new Date(execution.completed_at as number).toISOString() : null,
      result_count: execution.result_count,
      result_format: execution.result_format,
      execution_time_ms: execution.execution_time_ms,
      error_message: execution.error_message,
      parameters: execution.parameters ? JSON.parse(execution.parameters as string) : null,
      data: execution.result_data ? JSON.parse(execution.result_data as string) : null,
      created_at: new Date(execution.created_at as number).toISOString(),
    },
  });
});

// =====================================================
// QUICK RUN (No save)
// =====================================================

/**
 * POST /v1/reports/run
 * Run a report query without saving it
 */
reportsRouter.post('/run', async (c) => {
  const app = c.get('app');
  const body = await c.req.json<{
    config: ReportConfig;
    parameters?: Record<string, any>;
  }>();

  if (!body.config || !body.config.metrics || body.config.metrics.length === 0) {
    throw Errors.validationError('config.metrics is required');
  }

  // Create a temporary report object
  const tempReport = {
    id: 'temp',
    appId: app.id,
    name: 'Quick Report',
    reportType: 'custom' as ReportType,
    config: body.config,
    chartType: 'table' as ChartType,
    emailEnabled: false,
    active: true,
    isPublic: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const execution = await executeReport(c.env.DB, app.id, tempReport, body.parameters);

  // Delete the temporary execution record
  await c.env.DB.prepare(
    `DELETE FROM report_executions WHERE id = ?`
  ).bind(execution.id).run();

  return c.json({
    result: {
      status: execution.status,
      count: execution.resultCount,
      execution_time_ms: execution.executionTimeMs,
      error: execution.errorMessage,
      data: execution.resultData,
    },
  });
});
