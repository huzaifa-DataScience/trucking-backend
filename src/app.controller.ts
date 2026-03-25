import { Controller, Get, Post } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SeedService } from './database/seed/seed.service';
import { Public } from './auth/decorators';

@Controller()
export class AppController {
  constructor(
    private readonly seedService: SeedService,
    private readonly dataSource: DataSource,
  ) {}

  /** Lightweight ping to verify server is up (no DB, no auth). Use for load balancers / uptime checks. */
  @Public()
  @Get('health/ping')
  ping() {
    return { ok: true, timestamp: new Date().toISOString() };
  }

  /** Confirm we are connected to the database (no auth required). */
  @Public()
  @Get('health/db')
  async checkDatabase() {
    try {
      const result = await this.dataSource.query('SELECT 1 AS ok');
      const connected = result?.[0]?.ok === 1;
      return {
        connected,
        database: this.dataSource.options.database ?? 'unknown',
        message: connected ? 'Database connection OK' : 'Unexpected response',
      };
    } catch (err: any) {
      return {
        connected: false,
        database: (this.dataSource.options as any).database ?? 'unknown',
        message: 'Database connection failed',
        error: err?.message ?? String(err),
      };
    }
  }

  /** Tables the app expects (from TypeORM entities). */
  private readonly expectedTables = [
    'Fact_SiteTickets',
    'Fact_TicketPhotos',
    'Ref_Jobs',
    'Ref_Materials',
    'Ref_ExternalCompanies',
    'Ref_ExternalSites',
    'Ref_TruckTypes',
    'Ref_Drivers',
    'Ref_OurEntities',
    'App_Users',
    'App_Roles',
    'App_Permissions',
    'App_RolePermissions',
  ];

  /** Check which expected tables exist in the database (no auth required). */
  @Public()
  @Get('health/db-tables')
  async checkDbTables() {
    try {
      const inList = this.expectedTables.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
      const rows = await this.dataSource.query(
        `SELECT TABLE_NAME as tableName FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN (${inList})`,
      );
      const existing = (rows as { tableName: string }[]).map((r) => r.tableName);
      const missing = this.expectedTables.filter((t) => !existing.includes(t));
      return {
        database: this.dataSource.options.database ?? 'unknown',
        expectedTables: this.expectedTables,
        existing,
        missing,
        allPresent: missing.length === 0,
      };
    } catch (err: any) {
      return {
        database: (this.dataSource.options as any).database ?? 'unknown',
        error: err?.message ?? String(err),
      };
    }
  }

  @Public()
  @Get()
  getRoot() {
    return {
      message: 'Construction Logistics Reporting Dashboard API',
      version: '1.0.0',
      endpoints: {
        lookups: {
          jobs: 'GET /lookups/jobs',
          materials: 'GET /lookups/materials',
          haulers: 'GET /lookups/haulers',
          externalSites: 'GET /lookups/external-sites',
          truckTypes: 'GET /lookups/truck-types',
        },
        jobDashboard: {
          kpis: 'GET /job-dashboard/kpis?startDate=&endDate=&jobId=&entityId=&direction=',
          vendorSummary: 'GET /job-dashboard/summary/vendor',
          materialSummary: 'GET /job-dashboard/summary/material',
          tickets: 'GET /job-dashboard/tickets?page=1&pageSize=50',
          export: 'GET /job-dashboard/tickets/export',
          detail: 'GET /job-dashboard/tickets/detail/:ticketNumber',
        },
        materialDashboard: {
          kpis: 'GET /material-dashboard/kpis',
          sitesSummary: 'GET /material-dashboard/summary/sites',
          jobsSummary: 'GET /material-dashboard/summary/jobs',
          tickets: 'GET /material-dashboard/tickets',
          export: 'GET /material-dashboard/tickets/export',
          detail: 'GET /material-dashboard/tickets/detail/:ticketNumber',
        },
        haulerDashboard: {
          kpis: 'GET /hauler-dashboard/kpis',
          billableUnits: 'GET /hauler-dashboard/summary/billable-units',
          costCenter: 'GET /hauler-dashboard/summary/cost-center',
          tickets: 'GET /hauler-dashboard/tickets',
          export: 'GET /hauler-dashboard/tickets/export',
          detail: 'GET /hauler-dashboard/tickets/detail/:ticketNumber',
        },
        forensic: {
          lateSubmission: 'GET /forensic/late-submission?startDate=&endDate= (returns { lateTicketsFound, items })',
          efficiencyOutlier: 'GET /forensic/efficiency-outlier?startDate=&endDate=&jobId=&materialId=',
        },
        tickets: {
          detail: 'GET /tickets/detail/:ticketNumber',
        },
        auth: {
          login: 'POST /auth/login { "email", "password" }',
          register: 'POST /auth/register { "email", "password", "confirmPassword"? }',
          profile: 'GET /auth/profile (Bearer token)',
          admin: 'GET /auth/admin (Admin only)',
        },
        admin: {
          users: 'GET /admin/users?page=1&pageSize=25&status=&role=&search= (Admin only)',
          emailTemplatesBase:
            'GET/POST/PUT/DELETE /admin/email-templates (Admin only) with purpose selector (e.g. siteline.overdue_leadpm)',
          overdueEmailSending:
            'GET/PATCH /admin/settings/overdue-email-sending (Admin only; PATCH body { "enabled": true|false }; env OVERDUE_EMAIL_ENABLED is master)',
          smtpTestEmail:
            'POST /admin/settings/smtp-test-email (Admin only; body { "to": "you@example.com" } — verifies SMTP; does not require OVERDUE_EMAIL_ENABLED)',
        },
        seed: {
          seedDatabase: 'POST /seed (⚠️ Development only - seeds test data)',
        },
        siteline: {
          status: 'GET /siteline/status (configured? no auth)',
          company: 'GET /siteline/company',
          contracts: 'GET /siteline/contracts',
          contractsPaginated: 'GET /siteline/contracts/paginated',
          contract: 'GET /siteline/contracts/:id',
          payApp: 'GET /siteline/pay-apps/:id',
          payAppsPaginated: 'GET /siteline/pay-apps/paginated',
          agingReport: 'GET /siteline/aging-report',
          agingOverdue: 'GET /siteline/aging-overdue',
        },
        health: {
          ping: 'GET /health/ping (server up? no auth)',
          db: 'GET /health/db (confirm DB connection, no auth)',
          dbTables: 'GET /health/db-tables (check expected tables exist, no auth)',
        },
      },
    };
  }

  @Public()
  @Post('seed')
  async seedDatabase() {
    try {
      await this.seedService.seed();
      return { message: 'Database seeded successfully!' };
    } catch (error) {
      return { 
        message: 'Seed failed', 
        error: error.message 
      };
    }
  }
}
