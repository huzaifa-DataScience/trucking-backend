import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Bid,
  BidActivityLog,
  BidActivityAction,
  BidActivityArea,
  BidContent,
} from '../database/entities';
import type { PatchBidDto } from './dto/bidding.dto';

export interface BidActivityItemDto {
  id: number;
  action: BidActivityAction;
  area: BidActivityArea;
  summary: string;
  changedFields: string[];
  userId: number | null;
  userEmail: string | null;
  createdAt: string;
}

export interface BidActivitySummaryDto {
  attendeeCount: number;
  changeCount: number;
  lastActivityAt: string | null;
  lastActivityByEmail: string | null;
}

const HEADER_FIELDS = [
  'ourEntityId',
  'jobId',
  'estimateNumber',
  'bidName',
  'bidDate',
  'submitDate',
  'timeEstimate',
] as const;

const formatDate = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const scalarEqual = (a: unknown, b: unknown): boolean => {
  if (a == null && b == null) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) {
    return formatDate(a as Date) === formatDate(b as Date);
  }
  return a === b;
};

@Injectable()
export class BiddingActivityService {
  constructor(
    @InjectRepository(BidActivityLog) private readonly logRepo: Repository<BidActivityLog>,
    @InjectRepository(Bid) private readonly bidRepo: Repository<Bid>,
  ) {}

  async getSummary(bidId: number): Promise<BidActivitySummaryDto> {
    await this.requireBid(bidId);
    const rows = await this.logRepo.find({
      where: { bidId },
      relations: ['user'],
      order: { id: 'DESC' },
    });
    const userIds = new Set(rows.map((r) => r.userId).filter((id): id is number => id != null));
    const latest = rows[0];
    return {
      attendeeCount: userIds.size,
      changeCount: rows.length,
      lastActivityAt: latest?.createdAt instanceof Date ? latest.createdAt.toISOString() : null,
      lastActivityByEmail: latest?.user?.email ?? null,
    };
  }

  async listForBid(bidId: number): Promise<{
    summary: BidActivitySummaryDto;
    items: BidActivityItemDto[];
  }> {
    await this.requireBid(bidId);
    const rows = await this.logRepo.find({
      where: { bidId },
      relations: ['user'],
      order: { id: 'DESC' },
    });
    const summary = await this.buildSummaryFromRows(rows);
    return {
      summary,
      items: rows.map((r) => this.toDto(r)),
    };
  }

  async recordCreated(
    bidId: number,
    userId: number | undefined,
    estimateNumber: string,
  ): Promise<void> {
    await this.append({
      bidId,
      userId,
      action: 'created',
      area: 'bid',
      summary: `Bid created (${estimateNumber})`,
      changedFields: ['bid'],
    });
  }

  async recordDeleted(bidId: number, userId: number | undefined): Promise<void> {
    await this.append({
      bidId,
      userId,
      action: 'deleted',
      area: 'bid',
      summary: 'Bid deleted',
      changedFields: ['bid'],
    });
  }

  async recordAttachmentAdded(
    bidId: number,
    userId: number | undefined,
    fileName: string,
  ): Promise<void> {
    await this.append({
      bidId,
      userId,
      action: 'attachment_added',
      area: 'attachments',
      summary: `Attachment added: ${fileName}`,
      changedFields: ['attachments'],
    });
  }

  async recordAttachmentRemoved(
    bidId: number,
    userId: number | undefined,
    fileName: string,
  ): Promise<void> {
    await this.append({
      bidId,
      userId,
      action: 'attachment_removed',
      area: 'attachments',
      summary: `Attachment removed: ${fileName}`,
      changedFields: ['attachments'],
    });
  }

  async recordPatch(
    bidId: number,
    userId: number | undefined,
    before: Bid,
    after: Bid,
    dto: PatchBidDto,
    beforeContent: BidContent | null,
    afterContent: BidContent,
  ): Promise<void> {
    const entries: Array<{
      action: BidActivityAction;
      area: BidActivityArea;
      summary: string;
      changedFields: string[];
    }> = [];

    if (dto.status != null && before.status !== after.status) {
      if (after.status === 'submitted') {
        entries.push({
          action: 'submitted',
          area: 'status',
          summary: 'Bid submitted',
          changedFields: ['status'],
        });
      } else if (after.status === 'archived') {
        entries.push({
          action: 'archived',
          area: 'status',
          summary: 'Bid archived',
          changedFields: ['status'],
        });
      } else if (after.status === 'draft' && before.status !== 'draft') {
        entries.push({
          action: 'reopened',
          area: 'status',
          summary: `Bid reopened to draft (was ${before.status})`,
          changedFields: ['status'],
        });
      } else {
        entries.push({
          action: 'updated',
          area: 'status',
          summary: `Status changed to ${after.status}`,
          changedFields: ['status'],
        });
      }
    }

    const headerChanged: string[] = [];
    for (const key of HEADER_FIELDS) {
      if (dto[key as keyof PatchBidDto] === undefined) continue;
      const oldVal = before[key as keyof Bid];
      const newVal = after[key as keyof Bid];
      if (!scalarEqual(oldVal, newVal)) headerChanged.push(key);
    }
    if (headerChanged.length) {
      entries.push({
        action: 'updated',
        area: 'header',
        summary: `Cover sheet updated (${headerChanged.join(', ')})`,
        changedFields: headerChanged,
      });
    }

    if (dto.companyInfo !== undefined) {
      const keys = Object.keys(dto.companyInfo).map((k) => `companyInfo.${k}`);
      entries.push({
        action: 'updated',
        area: 'companyInfo',
        summary:
          keys.length > 0
            ? `Client company info updated (${keys.map((k) => k.replace('companyInfo.', '')).join(', ')})`
            : 'Client company info updated',
        changedFields: keys.length ? keys : ['companyInfo'],
      });
    }

    if (dto.baseBid !== undefined) {
      const keys = Object.keys(dto.baseBid).map((k) => `baseBid.${k}`);
      entries.push({
        action: 'updated',
        area: 'baseBid',
        summary:
          keys.length > 3
            ? `Base bid inputs updated (${keys.length} fields)`
            : `Base bid inputs updated (${keys.map((k) => k.replace('baseBid.', '')).join(', ')})`,
        changedFields: keys.length ? keys : ['baseBid'],
      });
    }

    if (dto.systems !== undefined) {
      entries.push({
        action: 'updated',
        area: 'systems',
        summary: `System rows replaced (${Array.isArray(dto.systems) ? dto.systems.length : 0} rows)`,
        changedFields: ['systems'],
      });
    }

    if (dto.computed !== undefined) {
      const keys = Object.keys(dto.computed);
      entries.push({
        action: 'updated',
        area: 'computed',
        summary:
          keys.length > 3
            ? `Calculator snapshot saved (${keys.length} computed keys)`
            : 'Calculator snapshot saved',
        changedFields: keys.length ? keys.map((k) => `computed.${k}`) : ['computed'],
      });
    }

    if (!entries.length) return;

    for (const e of entries) {
      await this.append({ bidId, userId, ...e });
    }

    void beforeContent;
    void afterContent;
  }

  private async append(opts: {
    bidId: number;
    userId?: number | null;
    action: BidActivityAction;
    area: BidActivityArea;
    summary: string;
    changedFields?: string[];
  }): Promise<void> {
    const summary = opts.summary.trim().slice(0, 500) || opts.action;
    await this.logRepo.save(
      this.logRepo.create({
        bidId: opts.bidId,
        userId: opts.userId ?? null,
        action: opts.action,
        area: opts.area,
        summary,
        changedFieldsJson: opts.changedFields?.length
          ? JSON.stringify(opts.changedFields)
          : null,
      }),
    );
  }

  private async buildSummaryFromRows(rows: BidActivityLog[]): Promise<BidActivitySummaryDto> {
    const userIds = new Set(rows.map((r) => r.userId).filter((id): id is number => id != null));
    const latest = rows[0];
    return {
      attendeeCount: userIds.size,
      changeCount: rows.length,
      lastActivityAt: latest?.createdAt instanceof Date ? latest.createdAt.toISOString() : null,
      lastActivityByEmail: latest?.user?.email ?? null,
    };
  }

  private toDto(row: BidActivityLog): BidActivityItemDto {
    let changedFields: string[] = [];
    if (row.changedFieldsJson) {
      try {
        const parsed = JSON.parse(row.changedFieldsJson);
        if (Array.isArray(parsed)) changedFields = parsed.map(String);
      } catch {
        changedFields = [];
      }
    }
    return {
      id: row.id,
      action: row.action,
      area: row.area,
      summary: row.summary,
      changedFields,
      userId: row.userId,
      userEmail: row.user?.email ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private async requireBid(bidId: number): Promise<Bid> {
    const bid = await this.bidRepo.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${bidId} not found`);
    return bid;
  }
}
