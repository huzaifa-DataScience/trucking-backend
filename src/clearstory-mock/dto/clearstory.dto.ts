export type ClearstoryStatusBucket = 'APPROVED' | 'ATP' | 'IN_REVIEW' | 'PLACEHOLDER' | 'VOID';
export type ClearstoryCoType = 'TM_TAG' | 'DETAILED_CO' | 'LUMP_SUM_CO';
export type ClearstoryBallInCourt = 'OWNER' | 'CUSTOMER' | 'INTERNAL' | 'UNKNOWN';

export type ClearstoryProjectDto = {
  id: number;
  jobNumber: string;
  name: string;
  office: string | null;
  region: string | null;
  division: string | null;
  customerName: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  baseContractValue: number;
};

export type ClearstoryCoNoteDto = {
  id: number;
  createdAt: string; // ISO
  author: string;
  body: string;
};

export type ClearstoryCoLineItemDto = {
  category: 'LABOR' | 'MATERIAL' | 'EQUIPMENT' | 'OTHER';
  description: string;
  qty: number;
  unit: string | null;
  unitCost: number | null;
  amount: number;
  laborHours?: number | null;
  laborRole?: string | null;
};

export type ClearstoryVoidLogDto = {
  voidedAt: string; // ISO
  reason: string;
  breadcrumbs: string[];
};

export type ClearstoryCorDto = {
  id: number;
  issueNumber: string;
  type: ClearstoryCoType;
  statusBucket: ClearstoryStatusBucket;
  stage: string | null;
  ballInCourt: ClearstoryBallInCourt;
  latestVersion: { version: number; grandTotal: number };
  updatedAt: string; // ISO
  notes: ClearstoryCoNoteDto[];
  voidLog?: ClearstoryVoidLogDto | null;
  lineItems?: ClearstoryCoLineItemDto[];
};

export type ClearstoryProjectSummaryDto = {
  project: ClearstoryProjectDto;
  totals: {
    approved: number;
    atp: number;
    inReview: number;
    placeholder: number;
    void: number;
  };
  revisedContractValue: number;
  reconciliation: {
    redFlag: boolean;
    clearstory: number;
    siteline: number | null;
    foundation: number | null;
    lastCheckedAt: string; // ISO
    notes: string[];
  };
};

export type ClearstoryTaskDto = {
  id: string;
  type: 'RECONCILIATION_MISMATCH' | 'OVERDUE_COR' | 'STALE_DISCREPANCY';
  severity: 'RED_FLAG' | 'WARN' | 'INFO';
  title: string;
  projectJobNumber: string | null;
  ageDays: number;
  detail: string;
};

