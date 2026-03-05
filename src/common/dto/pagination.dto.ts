export const DEFAULT_PAGE_SIZE = 50;

export class PaginationQueryDto {
  page?: number = 1;
  pageSize?: number = DEFAULT_PAGE_SIZE;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PagedResult<T> {
  const size = Math.min(Math.max(1, pageSize || DEFAULT_PAGE_SIZE), 100);
  const p = Math.max(1, page || 1);
  return {
    items,
    page: p,
    pageSize: size,
    total,
  };
}
