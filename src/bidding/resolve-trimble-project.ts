import { DataSource } from 'typeorm';

/**
 * Map bid job → StructShare/Trimble project id via JobNumber.
 * Returns null if no job, no job number, or no matching Trimble project.
 */
export async function resolveTrimbleProjectIdForJob(
  ds: DataSource,
  jobId: number | null | undefined,
): Promise<number | null> {
  if (jobId == null || !Number.isFinite(Number(jobId))) return null;
  const rows: Array<{ Id?: string | number }> = await ds.query(
    `SELECT TOP 1 p.Id
     FROM dbo.Trimble_Projects p
     INNER JOIN dbo.Ref_Jobs j ON j.JobID = @0
       AND NULLIF(LTRIM(RTRIM(j.JobNumber)), '') IS NOT NULL
       AND LTRIM(RTRIM(p.JobNumber)) = LTRIM(RTRIM(j.JobNumber))
     ORDER BY CASE WHEN p.IsActive = 1 THEN 0 ELSE 1 END, p.LastSeenAt DESC`,
    [Number(jobId)],
  );
  if (!rows.length || rows[0].Id == null) return null;
  const id = Number(rows[0].Id);
  return Number.isFinite(id) ? id : null;
}
