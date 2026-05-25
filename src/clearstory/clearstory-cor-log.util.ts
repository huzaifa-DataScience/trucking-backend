import { ClearstoryCor } from '../database/entities';
import { displayTmTagNumber } from './clearstory-cor-fields.util';
import {
  IN_REVIEW_TM_TAG_ERROR_MESSAGE,
  isInReviewWithTmTagViolation,
} from './clearstory-cor-data-quality.util';

/** PJ weekly COR report: split rows by Clearstory `Status` only (not stage). */
export type CorLogBucket = 'approved_co_issued' | 'approved_to_proceed';

export type CorLogRow = {
  corNumber: string;
  corDate: string;
  tmTagNumber: string;
  customerCoNumber: string;
  customerReferenceNumber: string;
  jobNumber: string;
  title: string;
  requestedAmount: number | null;
  approvedCoIssuedAmount: number | null;
  daysInReview: number | null;
  status: string;
  stage: string;
  responsibleParty: string;
};

function normStatus(status: string | null | undefined): string {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

/**
 * PJ's two tables map 1:1 to Clearstory COR `Status`:
 * - approved_co_issued → "Approved CO Issued" table
 * - approved_to_proceed → "Approved To Proceed" table
 * Other statuses (in_review, placeholder, void, …) are excluded from this report.
 */
export function corLogBucket(status: string | null | undefined): CorLogBucket | null {
  const s = normStatus(status);
  if (s === 'approved_co_issued') return 'approved_co_issued';
  if (s === 'approved_to_proceed') return 'approved_to_proceed';
  return null;
}

export function displayCorStatus(status: string | null | undefined): string {
  const s = normStatus(status);
  if (s === 'approved_co_issued') return 'Approved CO Issued';
  if (s === 'approved_to_proceed') return 'Approved To Proceed';
  if (s === 'in_review') return 'In Review';
  if (s === 'placeholder') return 'Placeholder';
  if (s === 'draft') return 'Draft';
  return status?.trim() || '—';
}

export function displayCorStage(stage: string | null | undefined): string {
  const s = normStatus(stage);
  if (s === 'approved_to_proceed') return 'Approved to proceed';
  if (s === 'in_review') return 'In review';
  if (s === 'placeholder') return 'Placeholder';
  return stage?.trim() || '—';
}

function formatDate(d: Date | null | undefined): string {
  if (!d || !Number.isFinite(d.getTime())) return '';
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  return `${m}/${day}/${y}`;
}

function dec(v: string | null | undefined): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysInReviewFromCor(cor: ClearstoryCor): number | null {
  const fromApi = cor.daysInReview;
  if (fromApi != null && String(fromApi).trim() !== '') {
    const n = Number(fromApi);
    if (Number.isFinite(n)) return n;
  }
  const anchor = cor.dateSubmitted ?? cor.createdAt;
  if (!anchor) return null;
  const start = new Date(anchor);
  if (!Number.isFinite(start.getTime())) return null;
  const end = cor.coIssueDate ?? new Date();
  const ms = new Date(end).getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function mapCorToLogRow(cor: ClearstoryCor, hideApprovedAmount: boolean): CorLogRow {
  const corDate = cor.coIssueDate ?? cor.dateSubmitted ?? cor.createdAt;
  const hideApproved = hideApprovedAmount || isInReviewWithTmTagViolation(cor);
  return {
    corNumber: cor.corNumber?.trim() || '—',
    corDate: formatDate(corDate),
    tmTagNumber: displayTmTagNumber(cor),
    customerCoNumber: cor.customerCoNumber?.trim() || '',
    customerReferenceNumber: cor.customerReferenceNumber?.trim() || '',
    jobNumber: cor.jobNumber?.trim() || '',
    title: cor.title?.trim() || '',
    requestedAmount: dec(cor.requestedAmount),
    approvedCoIssuedAmount: hideApproved ? null : dec(cor.approvedCoIssuedAmount),
    daysInReview: daysInReviewFromCor(cor),
    status: displayCorStatus(cor.status),
    stage: displayCorStage(cor.stage),
    responsibleParty: cor.ballInCourt?.trim() || '',
  };
}

export function sortCorLogRows(rows: CorLogRow[]): CorLogRow[] {
  return [...rows].sort((a, b) => {
    const j = a.jobNumber.localeCompare(b.jobNumber);
    if (j !== 0) return j;
    return a.corNumber.localeCompare(b.corNumber, undefined, { numeric: true });
  });
}

export function buildCorDataQualityAlertSectionHtml(
  rows: CorLogRow[],
  escapeHtml: (s: string) => string,
): string {
  if (!rows.length) return '';

  const body = rows
    .map(
      (r) => `
        <tr style="background:#fef2f2;">
          <td>${escapeHtml(r.corNumber)}</td>
          <td>${escapeHtml(r.jobNumber)}</td>
          <td>${escapeHtml(r.tmTagNumber)}</td>
          <td>${escapeHtml(r.status)}</td>
          <td>${escapeHtml(r.stage)}</td>
          <td>${escapeHtml(IN_REVIEW_TM_TAG_ERROR_MESSAGE)}</td>
        </tr>`,
    )
    .join('');

  return `
    <h3 style="font-family:Arial,sans-serif;margin:24px 0 8px;color:#b91c1c;">
      Action required — In Review with T&amp;M tags (${rows.length})
    </h3>
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#374151;margin:0 0 10px;">
      These CORs have <strong>Status = In Review</strong> and a value in <strong>TmTagNumbers</strong>.
      That combination is invalid — please update the COR in Clearstory.
    </p>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin:0 0 16px;">
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-size:12px;min-width:900px;width:900px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th>COR Number</th>
          <th>My Job Number</th>
          <th>TM Tag Number</th>
          <th>Status</th>
          <th>Stage</th>
          <th>Issue</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    </div>`;
}
