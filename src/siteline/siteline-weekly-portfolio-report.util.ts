import { Repository } from 'typeorm';
import { SitelineAgingContract, SitelineContract } from '../database/entities';
import { ClearstoryContractComparisonService } from '../clearstory/clearstory-contract-comparison.service';
import {
  agingCentsToDollars,
  overdueCentsFromAgingContract,
  totalAgedCentsFromAgingContract,
} from './siteline-aging-overdue.util';
import {
  isInactiveComparisonStatus,
  isInactiveSitelineAgingRow,
} from './siteline-aging-inactive.util';

export type PortfolioReportRow = {
  leadPmName: string;
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

/** PM weekly comparison table: only dollar mismatches (not match, missing, or COR-only rows). */
export function isPmWeeklyReportIssueRow(row: { comparisonStatus: string }): boolean {
  return row.comparisonStatus === 'mismatch';
}

export function escapeHtmlForReport(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildPortfolioReportRows(
  contracts: SitelineAgingContract[],
  daysThreshold: number,
  contractComparison: ClearstoryContractComparisonService,
  sitelineContractRepo: Repository<SitelineContract>,
  corTmIssuesByJob: Map<string, number>,
  leadPmNameForRow: (ac: SitelineAgingContract) => string,
): Promise<PortfolioReportRow[]> {
  const rows: PortfolioReportRow[] = [];

  for (const ac of contracts) {
    const jobNumber = ac.internalProjectNumber?.trim() || ac.projectNumber?.trim() || '';
    const overdueCents = overdueCentsFromAgingContract(ac, daysThreshold);
    const totalCents = totalAgedCentsFromAgingContract(ac);
    if (totalCents <= 0) continue;

    if (await isInactiveSitelineAgingRow(sitelineContractRepo, ac)) {
      continue;
    }

    let clearstoryDollars: number | null = null;
    let sitelineDollars: number | null = null;
    let difference: number | null = null;
    let comparisonStatus = 'no_job_number';

    if (jobNumber) {
      const cmp = await contractComparison.getByJobNumber(jobNumber);
      if (cmp) {
        if (isInactiveComparisonStatus(cmp.comparison.status)) {
          continue;
        }
        clearstoryDollars = cmp.clearstory.approvedCoIssuedContractValue;
        sitelineDollars = cmp.siteline.latestTotalValue;
        difference = cmp.comparison.difference;
        comparisonStatus = cmp.comparison.status;
      } else {
        comparisonStatus = 'missing_clearstory';
      }
      if (sitelineDollars == null) {
        sitelineDollars = await contractComparison.resolveSitelineBillDollars({
          contractId: ac.contractId,
          jobNumber,
        });
      }
    } else if (ac.contractId) {
      sitelineDollars = await contractComparison.resolveSitelineBillDollars({
        contractId: ac.contractId,
      });
    }

    const projectName = ac.projectName?.trim() || jobNumber || ac.contractId;
    const jobKey = jobNumber.toLowerCase();

    rows.push({
      leadPmName: leadPmNameForRow(ac),
      projectName,
      jobNumber: jobNumber || '—',
      overdueDollars: agingCentsToDollars(overdueCents),
      totalAgedDollars: agingCentsToDollars(totalCents),
      clearstoryDollars,
      sitelineDollars,
      difference,
      comparisonStatus,
      corTmIssueCount: jobKey ? (corTmIssuesByJob.get(jobKey) ?? 0) : 0,
    });
  }

  rows.sort((a, b) => b.overdueDollars - a.overdueDollars);
  return rows;
}

export function buildPortfolioReportTableHtml(
  rows: PortfolioReportRow[],
  daysThreshold: number,
  options: { showLeadPm: boolean },
): string {
  const fmt = (n: number | null) =>
    n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const esc = escapeHtmlForReport;

  const body = rows
    .map(
      (r) => `
        <tr>
          ${options.showLeadPm ? `<td>${esc(r.leadPmName)}</td>` : ''}
          <td>${esc(r.projectName)}</td>
          <td>${esc(r.jobNumber)}</td>
          <td>${fmt(r.overdueDollars)}</td>
          <td>${fmt(r.totalAgedDollars)}</td>
          <td>${fmt(r.clearstoryDollars)}</td>
          <td>${fmt(r.sitelineDollars)}</td>
          <td>${fmt(r.difference)}</td>
          <td>${esc(r.comparisonStatus)}</td>
          <td style="${r.corTmIssueCount > 0 ? 'color:#b91c1c;font-weight:bold;' : ''}">${
            r.corTmIssueCount > 0 ? String(r.corTmIssueCount) : '—'
          }</td>
        </tr>`,
    )
    .join('');

  const minWidth = options.showLeadPm ? 1180 : 1040;

  return `
    <h3 style="font-family:Arial,sans-serif;margin:18px 0 8px;">PM portfolio — AR &amp; Clearstory vs Siteline</h3>
    <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Same projects sent to lead PMs this week. Scroll horizontally on mobile.</p>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin:0 0 20px;">
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;min-width:${minWidth}px;">
      <thead>
        <tr style="background:#f3f4f6;">
          ${options.showLeadPm ? '<th>Lead PM</th>' : ''}
          <th>Project</th>
          <th>Job #</th>
          <th>Overdue AR (&gt;${daysThreshold}d)</th>
          <th>Total AR</th>
          <th>Clearstory Contract Value</th>
          <th>Siteline Contract Value</th>
          <th>Difference</th>
          <th>Compare</th>
          <th>COR TM issues</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    </div>`;
}
