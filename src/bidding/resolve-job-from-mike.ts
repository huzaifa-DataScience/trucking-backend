import { DataSource } from 'typeorm';
import { resolveTrimbleProjectIdForJob } from './resolve-trimble-project';

export type JobLinkStatus =
  | 'auto_linked'
  | 'already_set'
  | 'not_found'
  | 'no_hint';

export type JobLinkResult = {
  status: JobLinkStatus;
  jobId: number | null;
  trimbleProjectId: number | null;
  matchedJobNumber: string | null;
  /** Human message for Specs banner / toast */
  message: string;
};

/** Pull 4–6 digit job-number candidates from Mike metadata fields. */
export function extractJobNumberCandidates(
  ...texts: Array<string | number | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    if (t == null) continue;
    const s = String(t).trim();
    if (!s) continue;
    if (/^\d{4,6}$/.test(s)) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
      continue;
    }
    for (const m of s.matchAll(/\b(\d{4,6})\b/g)) {
      const n = m[1];
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * Resolve Ref_Jobs by JobNumber (exact, trimmed).
 * Prefer active jobs when duplicates exist.
 */
export async function resolveJobIdByJobNumber(
  ds: DataSource,
  jobNumber: string,
): Promise<{ jobId: number; jobNumber: string } | null> {
  const jn = String(jobNumber || '').trim();
  if (!jn) return null;
  const rows: Array<{ JobId?: number; JobNumber?: string }> = await ds.query(
    `SELECT TOP 1 j.JobID AS JobId, j.JobNumber
     FROM dbo.Ref_Jobs j
     WHERE NULLIF(LTRIM(RTRIM(j.JobNumber)), '') IS NOT NULL
       AND LTRIM(RTRIM(j.JobNumber)) = @0
     ORDER BY CASE WHEN j.IsActive = 1 THEN 0 ELSE 1 END, j.JobID DESC`,
    [jn],
  );
  if (!rows.length || rows[0].JobId == null) return null;
  const jobId = Number(rows[0].JobId);
  if (!Number.isFinite(jobId)) return null;
  return { jobId, jobNumber: String(rows[0].JobNumber || jn).trim() };
}

/**
 * If bid already has jobId → already_set.
 * Else try Mike hints → auto_linked or not_found / no_hint.
 * Does not write the bid — caller persists jobId / trimbleProjectId.
 */
export async function planJobLinkFromMikeHints(
  ds: DataSource,
  current: { jobId: number | null; trimbleProjectId: number | null },
  hints: { jobNumberHint?: string | null; projectLabel?: string | null },
): Promise<JobLinkResult> {
  if (current.jobId != null) {
    const trimble =
      current.trimbleProjectId ??
      (await resolveTrimbleProjectIdForJob(ds, current.jobId));
    return {
      status: 'already_set',
      jobId: current.jobId,
      trimbleProjectId: trimble,
      matchedJobNumber: null,
      message: 'Job already set on this bid.',
    };
  }

  const candidates = extractJobNumberCandidates(hints.jobNumberHint, hints.projectLabel);
  if (!candidates.length) {
    return {
      status: 'no_hint',
      jobId: null,
      trimbleProjectId: null,
      matchedJobNumber: null,
      message:
        'Could not read a job number from the Mike file. Please select a Job on the bid so Received can load.',
    };
  }

  for (const jn of candidates) {
    const hit = await resolveJobIdByJobNumber(ds, jn);
    if (!hit) continue;
    const trimble = await resolveTrimbleProjectIdForJob(ds, hit.jobId);
    return {
      status: 'auto_linked',
      jobId: hit.jobId,
      trimbleProjectId: trimble,
      matchedJobNumber: hit.jobNumber,
      message: trimble
        ? `Job ${hit.jobNumber} linked from Mike file — Received will load from Trimble.`
        : `Job ${hit.jobNumber} linked from Mike file, but no Trimble project matched this job number.`,
    };
  }

  return {
    status: 'not_found',
    jobId: null,
    trimbleProjectId: null,
    matchedJobNumber: candidates[0] || null,
    message: `Mike file mentions job ${candidates[0]}, but it was not found in Jobs. Please select a Job on the bid.`,
  };
}
