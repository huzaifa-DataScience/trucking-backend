import { Controller, Get, Post } from '@nestjs/common';
import { SeedService } from './database/seed/seed.service';
import { Public } from './auth/decorators';

@Controller()
export class AppController {
  constructor(private readonly seedService: SeedService) {}

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
          kpis: 'GET /job-dashboard/kpis?startDate=&endDate=&jobId=&direction=',
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
          lateSubmission: 'GET /forensic/late-submission?startDate=&endDate=',
          efficiencyOutlier: 'GET /forensic/efficiency-outlier?startDate=&endDate=',
        },
        tickets: {
          detail: 'GET /tickets/detail/:ticketNumber',
        },
        auth: {
          login: 'POST /auth/login { "email", "password" }',
          profile: 'GET /auth/profile (Bearer token)',
          admin: 'GET /auth/admin (Admin only)',
        },
        seed: {
          seedDatabase: 'POST /seed (⚠️ Development only - seeds test data)',
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
