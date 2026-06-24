import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClearstoryCor, ClearstoryProject, SitelineContract } from '../database/entities';
import {
  isClearstoryProjectActive,
  isSitelineContractActive,
} from '../siteline/siteline-active-contract.util';
import {
  jobNumberLookupVariants,
  jobNumbersEquivalent,
  normalizeJobNumberKey,
} from '../common/job-number-match.util';
import {
  resolveSitelineBillDollars as resolveSitelineBillDollarsFromDb,
  sitelineLatestTotalValueToDollars,
} from '../siteline/siteline-contract-bill.util';

type Bucket = 'APPROVED' | 'ATP' | 'IN_REVIEW' | 'PLACEHOLDER' | 'VOID';

export type ContractComparisonStatus =
  | 'match'
  | 'mismatch'
  | 'missing_siteline'
  | 'missing_job_number'
  | 'inactive_clearstory'
  | 'inactive_siteline';

export interface ClearstoryContractWebsiteSummary {
  originalContractValue: number;
  totalApprovedCoIssued: number;
  totalApprovedToProceed: number;
  approvedCoIssuedContractValue: number;
  approvedToProceedAndCoIssuedContractValue: number;
  totalInReview: number;
  totalPlaceholder: number;
  pendingContractValue: number;
  totalVoid: number;
}

export interface SitelineContractComparisonMatch {
  id: string;
  projectNumber: string | null;
  internalProjectNumber: string | null;
  projectName: string | null;
  contractNumber: string | null;
  latestTotalValueRaw: string | null;
  latestTotalValue: number | null;
}

export interface ClearstoryContractComparisonResult {
  project: {
    id: number;
    jobNumber: string | null;
    name: string | null;
    baseContractValue: number;
  };
  clearstory: ClearstoryContractWebsiteSummary;
  siteline: {
    contractCount: number;
    latestTotalValueRaw: number | null;
    latestTotalValue: number | null;
    matchedContracts: SitelineContractComparisonMatch[];
  };
  comparison: {
    status: ContractComparisonStatus;
    matches: boolean | null;
    difference: number | null;
    tolerance: number;
    lastCheckedAt: string;
  };
}

function bucketFromStatus(status: string | null | undefined): Bucket {
  const s = String(status ?? '').toLowerCase();
  if (s === 'approved_co_issued') return 'APPROVED';
  if (s === 'approved_to_proceed') return 'ATP';
  if (s === 'in_review') return 'IN_REVIEW';
  if (s === 'placeholder') return 'PLACEHOLDER';
  if (s === 'rejected' || s === 'void') return 'VOID';
  if (s === 'draft') return 'IN_REVIEW';
  return 'IN_REVIEW';
}

function decToNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class ClearstoryContractComparisonService {
  private static readonly TOLERANCE_DOLLARS = 0.01;

  constructor(
    @InjectRepository(ClearstoryProject)
    private readonly projects: Repository<ClearstoryProject>,
    @InjectRepository(ClearstoryCor)
    private readonly cors: Repository<ClearstoryCor>,
    @InjectRepository(SitelineContract)
    private readonly sitelineContracts: Repository<SitelineContract>,
  ) {}

  async getByProjectId(projectId: number): Promise<ClearstoryContractComparisonResult | null> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) return null;
    return this.getByProject(project);
  }

  async getByJobNumber(jobNumber: string): Promise<ClearstoryContractComparisonResult | null> {
    const job = jobNumber.trim();
    if (!job) return null;

    const project = await this.findProjectByJobNumber(job);
    if (!project) return null;
    return this.getByProject(project);
  }

  /**
   * Resolve a Clearstory project from a Siteline-style job number.
   * Matches exact JobNumber, leading-zero variants (9920 ↔ 09920), and suffixed
   * Clearstory values (12201 - 02 ↔ 12201).
   */
  private async findProjectByJobNumber(job: string): Promise<ClearstoryProject | null> {
    const matches: ClearstoryProject[] = [];
    const seen = new Set<number>();
    const add = (project: ClearstoryProject | null | undefined): void => {
      if (project && !seen.has(project.id)) {
        seen.add(project.id);
        matches.push(project);
      }
    };

    for (const variant of jobNumberLookupVariants(job)) {
      add(await this.projects.findOne({ where: { jobNumber: variant } }));
    }

    const normalized = normalizeJobNumberKey(job);
    if (normalized) {
      const prefixCandidates = await this.projects
        .createQueryBuilder('p')
        .where('p.jobNumber LIKE :s', { s: `${normalized}%` })
        .orWhere('p.jobNumber LIKE :z', { z: `${job}%` })
        .getMany();
      for (const p of prefixCandidates) {
        if (jobNumbersEquivalent(job, p.jobNumber ?? '')) add(p);
      }
    }

    if (!matches.length) return null;
    return matches.find((p) => isClearstoryProjectActive(p.archived)) ?? matches[0];
  }

  /** Siteline bill for PM reports when Clearstory row is missing or comparison has no Siteline match. */
  resolveSitelineBillDollars(opts: {
    contractId?: string | null;
    jobNumber?: string;
  }): Promise<number | null> {
    return resolveSitelineBillDollarsFromDb(this.sitelineContracts, opts);
  }

  async getByProject(project: ClearstoryProject): Promise<ClearstoryContractComparisonResult> {
    const cors = await this.cors.find({ where: { projectId: project.id } });
    return this.buildComparison(project, cors);
  }

  private async buildComparison(
    project: ClearstoryProject,
    cors: ClearstoryCor[],
  ): Promise<ClearstoryContractComparisonResult> {
    const clearstory = this.buildWebsiteSummary(project, cors);
    const jobNumber = project.jobNumber?.trim() || null;
    const checkedAt = new Date().toISOString();
    const inactiveComparison = (
      status: Extract<ContractComparisonStatus, 'inactive_clearstory' | 'inactive_siteline'>,
    ) => ({
      project: {
        id: project.id,
        jobNumber: project.jobNumber ?? null,
        name: project.name ?? null,
        baseContractValue: clearstory.originalContractValue,
      },
      clearstory,
      siteline: {
        contractCount: 0,
        latestTotalValueRaw: null,
        latestTotalValue: null,
        matchedContracts: [],
      },
      comparison: {
        status,
        matches: null,
        difference: null,
        tolerance: ClearstoryContractComparisonService.TOLERANCE_DOLLARS,
        lastCheckedAt: checkedAt,
      },
    });

    if (!isClearstoryProjectActive(project.archived)) {
      return inactiveComparison('inactive_clearstory');
    }

    if (!jobNumber) {
      return {
        project: {
          id: project.id,
          jobNumber: project.jobNumber ?? null,
          name: project.name ?? null,
          baseContractValue: clearstory.originalContractValue,
        },
        clearstory,
        siteline: {
          contractCount: 0,
          latestTotalValueRaw: null,
          latestTotalValue: null,
          matchedContracts: [],
        },
        comparison: {
          status: 'missing_job_number',
          matches: null,
          difference: null,
          tolerance: ClearstoryContractComparisonService.TOLERANCE_DOLLARS,
          lastCheckedAt: checkedAt,
        },
      };
    }

    const sitelineMatches = await this.sitelineContracts.find({
      where: [{ internalProjectNumber: jobNumber }, { projectNumber: jobNumber }],
      order: { lastSyncedAt: 'DESC' },
    });

    const deduped = Array.from(new Map(sitelineMatches.map((c) => [c.id, c])).values());
    const activeSiteline = deduped.filter((c) => isSitelineContractActive(c.status));
    if (deduped.length > 0 && activeSiteline.length === 0) {
      return inactiveComparison('inactive_siteline');
    }

    const matchedContracts: SitelineContractComparisonMatch[] = activeSiteline.map((c) => ({
      id: c.id,
      projectNumber: c.projectNumber ?? null,
      internalProjectNumber: c.internalProjectNumber ?? null,
      projectName: c.projectName ?? null,
      contractNumber: c.contractNumber ?? null,
      latestTotalValueRaw: c.latestTotalValue ?? null,
      latestTotalValue: sitelineLatestTotalValueToDollars(c.latestTotalValue),
    }));

    const latestTotalValueRaw = matchedContracts.reduce((sum, c) => {
      const n = Number(c.latestTotalValueRaw ?? 0);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const latestTotalValue =
      matchedContracts.length > 0 ? roundMoney(latestTotalValueRaw / 100) : null;

    // PM reporting / Siteline reconciliation: CO issued only (no approved-to-proceed).
    const clearstoryValue = clearstory.approvedCoIssuedContractValue;
    const difference =
      latestTotalValue == null ? null : roundMoney(clearstoryValue - latestTotalValue);
    const matches =
      difference == null
        ? null
        : Math.abs(difference) <= ClearstoryContractComparisonService.TOLERANCE_DOLLARS;

    return {
      project: {
        id: project.id,
        jobNumber: project.jobNumber ?? null,
        name: project.name ?? null,
        baseContractValue: clearstory.originalContractValue,
      },
      clearstory,
      siteline: {
        contractCount: matchedContracts.length,
        latestTotalValueRaw: matchedContracts.length > 0 ? latestTotalValueRaw : null,
        latestTotalValue,
        matchedContracts,
      },
      comparison: {
        status:
          matchedContracts.length === 0 ? 'missing_siteline' : matches ? 'match' : 'mismatch',
        matches,
        difference,
        tolerance: ClearstoryContractComparisonService.TOLERANCE_DOLLARS,
        lastCheckedAt: checkedAt,
      },
    };
  }

  private buildWebsiteSummary(
    project: ClearstoryProject,
    cors: ClearstoryCor[],
  ): ClearstoryContractWebsiteSummary {
    let totalApprovedCoIssued = 0;
    let totalApprovedToProceed = 0;
    let totalInReview = 0;
    let totalPlaceholder = 0;
    let totalVoid = 0;

    for (const co of cors) {
      const bucket = bucketFromStatus(co.status);
      if (bucket === 'APPROVED') {
        totalApprovedCoIssued += decToNumber(co.approvedCoIssuedAmount);
      } else if (bucket === 'ATP') {
        totalApprovedToProceed += decToNumber(co.approvedToProceedAmount);
      } else if (bucket === 'IN_REVIEW') {
        totalInReview += decToNumber(co.inReviewAmount);
      } else if (bucket === 'PLACEHOLDER') {
        totalPlaceholder += decToNumber(co.totalAmount ?? co.requestedAmount);
      } else if (bucket === 'VOID') {
        totalVoid += decToNumber(co.voidAmount);
      }
    }

    const originalContractValue = decToNumber(project.baseContractValue);
    const approvedCoIssuedContractValue = roundMoney(
      originalContractValue + totalApprovedCoIssued,
    );
    const approvedToProceedAndCoIssuedContractValue = roundMoney(
      approvedCoIssuedContractValue + totalApprovedToProceed,
    );
    const pendingContractValue = roundMoney(
      approvedCoIssuedContractValue + totalInReview + totalPlaceholder,
    );

    return {
      originalContractValue: roundMoney(originalContractValue),
      totalApprovedCoIssued: roundMoney(totalApprovedCoIssued),
      totalApprovedToProceed: roundMoney(totalApprovedToProceed),
      approvedCoIssuedContractValue,
      approvedToProceedAndCoIssuedContractValue,
      totalInReview: roundMoney(totalInReview),
      totalPlaceholder: roundMoney(totalPlaceholder),
      pendingContractValue,
      totalVoid: roundMoney(totalVoid),
    };
  }
}
