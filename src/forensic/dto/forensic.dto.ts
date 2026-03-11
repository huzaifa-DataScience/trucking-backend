/** Late Submission Audit: ticket entered >24h after ticket date */
export class LateSubmissionRowDto {
  ticketNumber: string;
  ticketDate: string; // e.g. "Jan 1st" style or ISO date
  systemEntryDate: string; // System Timestamp (CreatedAt)
  lagTime: string; // e.g. "+4 Days" (highlight red in UI)
  signedBy: string | null; // Supervisor / Signed By
  jobName: string;
  haulerCompanyName: string;
}

/** Response for Late Submission Audit: KPI + grid */
export class LateSubmissionAuditResponseDto {
  lateTicketsFound: number;
  items: LateSubmissionRowDto[];
}

/** Efficiency Outlier: peer group = Date + Job + Material + Destination */
export class EfficiencyOutlierRowDto {
  date: string;
  jobName: string;
  route: string; // "Material Name → Destination Site"
  truckNumber: string;
  haulerName: string;
  totalTickets: number;
  workDuration: string; // "H:MM" or "HH:MM" between first and last ticket
  myAvgCycle: number; // minutes per trip for this truck (Duration / (TicketCount - 1))
  fleetBenchmark: number; // average cycle time (min/trip) of all trucks in peer group (excl. single-load)
  status: 'Green' | 'RED' | 'Single Load'; // RED = "SLOW (>15%)", Single Load = grey
  statusLabel: string; // "Within 15%", "SLOW (>15%)", "Single Load"
}
