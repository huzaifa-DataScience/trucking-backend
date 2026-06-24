/**
 * Run Clearstory vs Siteline contract value comparison for all projects with job numbers.
 * Writes CSV + JSON under reports/ and emails summary + CSV attachment.
 *
 *   npx ts-node scripts/run-contract-comparison-report.ts
 *   npm run contract-comparison-report
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { AppModule } from '../src/app.module';
import { ClearstoryProject } from '../src/database/entities';
import { isClearstoryProjectActive } from '../src/siteline/siteline-active-contract.util';
import {
  ClearstoryContractComparisonService,
  ClearstoryContractComparisonResult,
} from '../src/clearstory/clearstory-contract-comparison.service';

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsv(r: ClearstoryContractComparisonResult): string {
  const cs = r.clearstory.approvedCoIssuedContractValue;
  const sl = r.siteline.latestTotalValue;
  return [
    r.project.id,
    csvEscape(r.project.jobNumber),
    csvEscape(r.project.name),
    r.comparison.status,
    r.comparison.matches,
    cs,
    sl ?? '',
    r.comparison.difference ?? '',
    r.siteline.contractCount,
  ].join(',');
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const projectsRepo = app.get<Repository<ClearstoryProject>>(
      getRepositoryToken(ClearstoryProject),
    );
    const comparison = app.get(ClearstoryContractComparisonService);

    const projects = await projectsRepo.find({
      where: {},
      order: { jobNumber: 'ASC' },
    });
    const withJob = projects.filter(
      (p) => p.jobNumber?.trim() && isClearstoryProjectActive(p.archived),
    );

    console.log(
      `Comparing ${withJob.length} active Clearstory projects (non-archived, with job numbers)…`,
    );

    const results: ClearstoryContractComparisonResult[] = [];
    let i = 0;
    for (const p of withJob) {
      i += 1;
      if (i % 50 === 0) console.log(`  …${i}/${withJob.length}`);
      const row = await comparison.getByProject(p);
      results.push(row);
    }

    const counts = {
      match: 0,
      mismatch: 0,
      missing_siteline: 0,
      missing_job_number: 0,
      inactive_clearstory: 0,
      inactive_siteline: 0,
    };
    for (const r of results) {
      const k = r.comparison.status as keyof typeof counts;
      if (k in counts) counts[k] += 1;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportsDir = join(process.cwd(), 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const base = `clearstory-siteline-comparison-${stamp}`;
    const csvPath = join(reportsDir, `${base}.csv`);
    const jsonPath = join(reportsDir, `${base}.json`);

    const header =
      'clearstoryProjectId,jobNumber,projectName,status,matches,clearstoryApprovedCoIssuedUsd,sitelineLatestTotalUsd,differenceUsd,sitelineContractCount';
    const csv = [header, ...results.map(rowToCsv)].join('\n');
    writeFileSync(csvPath, csv, 'utf8');
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          projectCount: results.length,
          summary: counts,
          rows: results,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log(`Wrote ${csvPath}`);
    console.log(`Wrote ${jsonPath}`);
    console.log('Summary:', counts);

    const to =
      process.env.COMPARISON_REPORT_EMAIL_TO?.trim() ||
      process.env.OVERDUE_EMAIL_TEST_TO?.trim() ||
      process.env.SMTP_USER?.trim() ||
      '';
    if (!to) {
      console.warn('No email recipient — set COMPARISON_REPORT_EMAIL_TO or OVERDUE_EMAIL_TEST_TO');
      return;
    }

    const host = process.env.SMTP_HOST?.trim();
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/^"|"$/g, '');
    const from = process.env.OVERDUE_EMAIL_FROM?.trim() || user;
    if (!host || !user || !pass || !from) {
      console.warn('SMTP not configured — report files only.');
      return;
    }

    const mismatches = results
      .filter((r) => r.comparison.status === 'mismatch')
      .slice(0, 15)
      .map(
        (r) =>
          `<tr><td>${csvEscape(r.project.jobNumber)}</td><td>${csvEscape(r.project.name)}</td><td>$${r.clearstory.approvedCoIssuedContractValue.toLocaleString()}</td><td>${r.siteline.latestTotalValue != null ? '$' + r.siteline.latestTotalValue.toLocaleString() : '—'}</td><td>${r.comparison.difference != null ? '$' + r.comparison.difference.toLocaleString() : '—'}</td></tr>`,
      )
      .join('');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `Clearstory vs Siteline comparison (${results.length} jobs) — ${counts.match} match, ${counts.mismatch} mismatch`,
      html: `
        <p>Siteline vs Clearstory <strong>approved CO issued</strong> vs <strong>Siteline latest total value</strong>.</p>
        <ul>
          <li>Projects compared: <strong>${results.length}</strong></li>
          <li>Match: <strong>${counts.match}</strong></li>
          <li>Mismatch: <strong>${counts.mismatch}</strong></li>
          <li>Missing Siteline: <strong>${counts.missing_siteline}</strong></li>
          <li>Missing job number: <strong>${counts.missing_job_number}</strong></li>
        </ul>
        <p>Full CSV attached. JSON saved on server at <code>${jsonPath}</code>.</p>
        ${
          mismatches
            ? `<h3>Sample mismatches (up to 15)</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">
          <thead><tr><th>Job #</th><th>Project</th><th>Clearstory $</th><th>Siteline $</th><th>Diff</th></tr></thead>
          <tbody>${mismatches}</tbody>
        </table>`
            : ''
        }
      `,
      attachments: [
        {
          filename: `${base}.csv`,
          content: csv,
          contentType: 'text/csv',
        },
      ],
    });

    console.log(`Emailed report to ${to}`);
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
