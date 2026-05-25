import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplateService } from '../email/email-template.service';
import { ClearstoryContractComparisonService } from '../clearstory/clearstory-contract-comparison.service';
import { ClearstoryCorDataQualityService } from '../clearstory/clearstory-cor-data-quality.service';
import {
  buildCorDataQualityAlertSectionHtml,
  type CorLogRow,
} from '../clearstory/clearstory-cor-log.util';
import { SitelineAgingContract, SitelineAgingSummary } from '../database/entities';
import {
  agingCentsToDollars,
  overdueCentsFromAgingContract,
  totalAgedCentsFromAgingContract,
} from './siteline-aging-overdue.util';
import { loadAgingContractsFromLatestPerEntitySnapshots } from './siteline-aging-snapshot.util';
import { resolveLeadPmEmailFromFullName } from './siteline-pm-email.util';
import { isPmWeeklyReportIssueRow } from './siteline-weekly-portfolio-report.util';

const ENTITY_LABELS: Record<number, string> = {
  1: 'GOEL',
  2: 'GOEL DC',
  3: 'DCB',
};

export type PmWeeklyReportRow = {
  company: string;
  projectName: string;
  jobNumber: string;
  overdueDollars: number;
  totalAgedDollars: number;
  clearstoryDollars: number | null;
  sitelineDollars: number | null;
  difference: number | null;
  comparisonStatus: string;
  corTmIssueCount: number;
};

export type PmWeeklyReportContent = {
  pmEmail: string;
  leadPmName: string;
  subject: string;
  html: string;
  contractCount: number;
  corDataQualityCount: number;
  pdfFilename: string;
};

@Injectable()
export class PmWeeklyReportBuilderService {
  constructor(
    private readonly emailTemplates: EmailTemplateService,
    private readonly contractComparison: ClearstoryContractComparisonService,
    private readonly corDataQuality: ClearstoryCorDataQualityService,
    @InjectRepository(SitelineAgingSummary)
    private readonly agingSummaryRepo: Repository<SitelineAgingSummary>,
    @InjectRepository(SitelineAgingContract)
    private readonly agingContractRepo: Repository<SitelineAgingContract>,
  ) {}

  async loadContractsGroupedByPm(): Promise<Map<string, SitelineAgingContract[]>> {
    const agingRows = await loadAgingContractsFromLatestPerEntitySnapshots(
      this.agingSummaryRepo,
      this.agingContractRepo,
    );
    const byPm = new Map<string, SitelineAgingContract[]>();

    for (const row of agingRows) {
      const email = resolveLeadPmEmailFromFullName(row.leadPmEmail, row.leadPmName);
      if (!email) continue;
      const list = byPm.get(email) ?? [];
      list.push(row);
      byPm.set(email, list);
    }

    return byPm;
  }

  async buildPmReportContent(
    pmEmail: string,
    contracts: SitelineAgingContract[],
    options: { daysThreshold: number; weekEnding: string },
  ): Promise<PmWeeklyReportContent | null> {
    const corAlertRows = await this.corDataQuality.alertRowsForPm(pmEmail);
    const corTmIssuesByJob = this.corTmIssueCountByJob(corAlertRows);
    const reportRows = await this.buildRowsForPm(
      contracts,
      options.daysThreshold,
      corTmIssuesByJob,
    );

    if (!reportRows.length && !corAlertRows.length) {
      return null;
    }

    const leadPmName = contracts.find((c) => c.leadPmName)?.leadPmName ?? 'PM';
    const reportTableHtml = reportRows.length
      ? this.buildReportTableHtml(reportRows, options.daysThreshold)
      : `<p style="font-family:Arial,sans-serif;font-size:13px;color:#374151;margin:0 0 16px;">No Clearstory vs Siteline issues on your projects this week (COR / T&amp;M section below may still apply).</p>`;
    const corDataQualityTableHtml = buildCorDataQualityAlertSectionHtml(corAlertRows, (s) =>
      this.escapeHtml(s),
    );

    const { subject, html } = await this.emailTemplates.renderTemplate(
      EmailTemplateService.SITELINE_PM_WEEKLY_PURPOSE,
      {
        leadPmName,
        weekEnding: options.weekEnding,
        daysThreshold: options.daysThreshold,
        contractCount: reportRows.length,
        corDataQualityCount: corAlertRows.length,
        reportTableHtml,
        corDataQualityTableHtml,
      },
    );

    return {
      pmEmail,
      leadPmName,
      subject,
      html,
      contractCount: reportRows.length,
      corDataQualityCount: corAlertRows.length,
      pdfFilename: this.pdfFilenameForPm(leadPmName, pmEmail),
    };
  }

  private corTmIssueCountByJob(corAlertRows: CorLogRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of corAlertRows) {
      const job = row.jobNumber?.trim().toLowerCase();
      if (!job || job === '—') continue;
      map.set(job, (map.get(job) ?? 0) + 1);
    }
    return map;
  }

  private async buildRowsForPm(
    contracts: SitelineAgingContract[],
    daysThreshold: number,
    corTmIssuesByJob: Map<string, number>,
  ): Promise<PmWeeklyReportRow[]> {
    const rows: PmWeeklyReportRow[] = [];

    for (const ac of contracts) {
      const jobNumber = ac.internalProjectNumber?.trim() || ac.projectNumber?.trim() || '';
      const overdueCents = overdueCentsFromAgingContract(ac, daysThreshold);
      const totalCents = totalAgedCentsFromAgingContract(ac);
      if (totalCents <= 0) continue;

      let clearstoryDollars: number | null = null;
      let sitelineDollars: number | null = null;
      let difference: number | null = null;
      let comparisonStatus = 'no_job_number';

      if (jobNumber) {
        const cmp = await this.contractComparison.getByJobNumber(jobNumber);
        if (cmp) {
          clearstoryDollars = cmp.clearstory.approvedToProceedAndCoIssuedContractValue;
          sitelineDollars = cmp.siteline.latestTotalValue;
          difference = cmp.comparison.difference;
          comparisonStatus = cmp.comparison.status;
        } else {
          comparisonStatus = 'missing_clearstory';
        }
      }

      const projectName = ac.projectName?.trim() || jobNumber || ac.contractId;
      const jobKey = jobNumber.toLowerCase();
      const entityId = ac.entityId != null ? Math.trunc(ac.entityId) : null;
      const company =
        entityId != null && ENTITY_LABELS[entityId] ? ENTITY_LABELS[entityId] : '—';

      const corTmIssueCount = jobKey ? (corTmIssuesByJob.get(jobKey) ?? 0) : 0;
      const candidate = {
        company,
        projectName,
        jobNumber: jobNumber || '—',
        overdueDollars: agingCentsToDollars(overdueCents),
        totalAgedDollars: agingCentsToDollars(totalCents),
        clearstoryDollars,
        sitelineDollars,
        difference,
        comparisonStatus,
        corTmIssueCount,
      };
      if (!isPmWeeklyReportIssueRow(candidate)) continue;

      rows.push(candidate);
    }

    rows.sort((a, b) => b.overdueDollars - a.overdueDollars);
    return rows;
  }

  private buildReportTableHtml(rows: PmWeeklyReportRow[], daysThreshold: number): string {
    const fmt = (n: number | null) =>
      n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    const body = rows
      .map(
        (r) => `
        <tr>
          <td>${this.escapeHtml(r.company)}</td>
          <td>${this.escapeHtml(r.projectName)}</td>
          <td>${this.escapeHtml(r.jobNumber)}</td>
          <td>${fmt(r.overdueDollars)}</td>
          <td>${fmt(r.totalAgedDollars)}</td>
          <td>${fmt(r.clearstoryDollars)}</td>
          <td>${fmt(r.sitelineDollars)}</td>
          <td>${fmt(r.difference)}</td>
          <td>${this.escapeHtml(r.comparisonStatus)}</td>
          <td style="${r.corTmIssueCount > 0 ? 'color:#b91c1c;font-weight:bold;' : ''}">${
            r.corTmIssueCount > 0 ? String(r.corTmIssueCount) : '—'
          }</td>
        </tr>`,
      )
      .join('');

    return `
      <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Scroll horizontally if columns are cut off on mobile.</p>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin:0 0 16px;">
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px;min-width:1180px;width:1180px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th>Company</th>
            <th>Project</th>
            <th>Job #</th>
            <th>Overdue AR (&gt;${daysThreshold}d)</th>
            <th>Total AR</th>
            <th>Clearstory bill</th>
            <th>Siteline bill</th>
            <th>Difference</th>
            <th>Issue</th>
            <th>COR TM issues</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      </div>`;
  }

  private pdfFilenameForPm(leadPmName: string, pmEmail: string): string {
    const base = leadPmName.trim() || pmEmail.split('@')[0] || 'pm';
    const slug = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `weekly-report-${slug || 'pm'}.pdf`;
  }

  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
