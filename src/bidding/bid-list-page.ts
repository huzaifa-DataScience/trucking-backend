/** Estimates list paging — only when `page` is on the query. No default page. */

export const BID_LIST_PAGE_SIZES = [25, 50, 100] as const;
export type BidListPageSize = (typeof BID_LIST_PAGE_SIZES)[number];

export const BID_LIST_SORTS = [
  'updated',
  'bidDate',
  'bidName',
  'estimateNumber',
  'drawingNumber',
  'dueDate',
  'estimator',
  'captain',
  'internalBidDate',
  'takeoffTurnedIn',
  'status',
  'processStage',
  'outcomeStatus',
  'workType',
  'baseBidAmount',
  'contractAmount',
  'jobStartDate',
  'companyName',
] as const;
export type BidListSort = (typeof BID_LIST_SORTS)[number];

const SORT_SET = new Set<string>(BID_LIST_SORTS);

/** `page` omitted → no envelope. Present but junk → 1. */
export function parseBidListPage(raw?: string): number | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function parseBidListPageSize(raw?: string): BidListPageSize {
  const n = Math.floor(Number(raw));
  if (n === 50 || n === 100 || n === 25) return n;
  return 25;
}

export function parseBidListSort(raw?: string): BidListSort | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  return SORT_SET.has(v) ? (v as BidListSort) : undefined;
}

export function parseBidListSortDir(raw?: string): 'ASC' | 'DESC' | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'asc') return 'ASC';
  if (v === 'desc') return 'DESC';
  return undefined;
}

/** Match today’s list when `sortDir` is omitted. */
export function defaultBidListSortDir(sort?: BidListSort): 'ASC' | 'DESC' {
  if (sort === 'updated' || sort == null) return 'DESC';
  return 'ASC';
}

export function bidListLastPage(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function bidListPageWindow(opts: { total: number; page: number; pageSize: number }): {
  page: number;
  skip: number;
  take: number;
  empty: boolean;
} {
  const last = bidListLastPage(opts.total, opts.pageSize);
  if (opts.page > last) {
    return { page: last, skip: 0, take: 0, empty: true };
  }
  return {
    page: opts.page,
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    empty: opts.total <= 0,
  };
}

export function emptyBidListStatusCounts() {
  return { all: 0, draft: 0, submitted: 0, archived: 0 };
}

export function foldBidListStatusCounts(
  rows: Array<{ status?: string; c?: string | number }>,
): { all: number; draft: number; submitted: number; archived: number } {
  const counts = emptyBidListStatusCounts();
  for (const row of rows) {
    const n = Number(row.c);
    if (!Number.isFinite(n)) continue;
    counts.all += n;
    if (row.status === 'draft') counts.draft = n;
    else if (row.status === 'submitted') counts.submitted = n;
    else if (row.status === 'archived') counts.archived = n;
  }
  return counts;
}

export function bidListNeedsProcessJoin(sort?: BidListSort): boolean {
  return (
    sort === 'drawingNumber' ||
    sort === 'dueDate' ||
    sort === 'estimator' ||
    sort === 'captain' ||
    sort === 'internalBidDate' ||
    sort === 'baseBidAmount' ||
    sort === 'contractAmount' ||
    sort === 'jobStartDate'
  );
}
