import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Bid, BidComment, BidCommentAttachment, BidCommentMention, User, UserStatus } from '../database/entities';
import { isAdminPanelRole } from '../database/entities/user.entity';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingService } from './bidding.service';
import { NOTIFICATION_LIMIT } from './process/bid-plate';
import { cleanPersonName, userDisplayName } from '../database/entities/user.entity';
import {
  COMMENT_IMAGE_MIMES,
  MAX_COMMENT_IMAGES,
  commentAuthor,
  commentBody,
  isCommentImageMime,
  mentionHandles,
  mentionPerson,
  mentionQueryMatch,
  mentionTokens,
  parseMentionIds,
  resolveMentionIds,
} from './bidding-comments';

export type BidCommentDto = {
  id: number;
  bidId: number;
  body: string | null;
  createdAt: string;
  updatedAt: string | null;
  authorUserId: number;
  authorName: string;
  authorEmail: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  attachments: {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    downloadPath: string;
  }[];
  mentions: {
    userId: number;
    firstName: string | null;
    lastName: string | null;
    name: string;
    email: string;
  }[];
};

@Injectable()
export class BiddingCommentsService implements OnModuleInit {
  private readonly logger = new Logger(BiddingCommentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly bidding: BiddingService,
    private readonly attachments: BiddingAttachmentsService,
    @InjectRepository(Bid) private readonly bidRepo: Repository<Bid>,
    @InjectRepository(BidComment) private readonly commentRepo: Repository<BidComment>,
    @InjectRepository(BidCommentAttachment)
    private readonly linkRepo: Repository<BidCommentAttachment>,
    @InjectRepository(BidCommentMention) private readonly mentionRepo: Repository<BidCommentMention>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const file of ['add-bid-comments.sql', 'add-bid-comment-mentions.sql']) {
      const full = join(process.cwd(), 'scripts/sql', file);
      if (!existsSync(full)) continue;
      try {
        const raw = readFileSync(full, 'utf8');
        const batches = raw.split(/\bGO\b/i).map((s) => s.trim()).filter(Boolean);
        for (const batch of batches) await this.dataSource.query(batch);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Bid comments DDL ${file} skipped: ${msg}`);
      }
    }
  }

  async mentionUsers(q?: string): Promise<
    {
      id: number;
      email: string;
      handle: string;
      firstName: string | null;
      lastName: string | null;
      name: string;
    }[]
  > {
    const users = await this.activeUsers();
    const handles = mentionHandles(users);
    const needle = (q ?? '').trim();
    return users
      .filter((u) => mentionQueryMatch(u, handles.get(u.id) ?? u.email, needle))
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        email: u.email,
        handle: handles.get(u.id) ?? u.email,
        firstName: cleanPersonName(u.firstName),
        lastName: cleanPersonName(u.lastName),
        name: userDisplayName(u),
      }));
  }

  async unreadMentions(userId: number): Promise<
    { bidId: number; commentId: number; title: string; body: string | null; at: string }[]
  > {
    const rows = await this.mentionRepo.find({
      where: { userId, readAt: IsNull() },
      relations: ['comment', 'comment.user', 'comment.bid'],
      order: { commentId: 'DESC' },
      take: NOTIFICATION_LIMIT,
    });
    return rows
      .filter((r) => r.comment && !r.comment.deletedAt)
      .map((r) => {
        const who = userDisplayName(r.comment.user);
        const preview = (r.comment.body ?? '').trim().slice(0, 140) || 'Mentioned you in a comment';
        return {
          bidId: r.comment.bidId,
          commentId: r.commentId,
          title: `${who} mentioned you`,
          body: preview,
          at: r.comment.createdAt instanceof Date ? r.comment.createdAt.toISOString() : String(r.comment.createdAt),
        };
      });
  }

  async list(bidId: number, reader?: User): Promise<{ items: BidCommentDto[] }> {
    await this.requireBid(bidId);
    const rows = await this.commentRepo.find({
      where: { bidId, deletedAt: IsNull() },
      relations: [
        'user',
        'mentions',
        'mentions.user',
        'commentAttachments',
        'commentAttachments.attachment',
        'commentAttachments.attachment.file',
      ],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (reader?.id && rows.length) {
      const mine = await this.mentionRepo.find({
        where: { userId: reader.id, readAt: IsNull(), commentId: In(rows.map((r) => r.id)) },
      });
      if (mine.length) {
        const now = new Date();
        for (const m of mine) m.readAt = now;
        await this.mentionRepo.save(mine);
      }
    }
    return { items: rows.map((r) => this.toDto(r)) };
  }

  async create(
    bidId: number,
    user: User,
    rawBody: unknown,
    files: Express.Multer.File[] | undefined,
    rawMentionIds?: unknown,
  ): Promise<BidCommentDto> {
    const bid = await this.requireBid(bidId);
    if (bid.status === 'archived') throw new ForbiddenException('Archived bid — comments are read-only');
    await this.bidding.assertUserCanEdit(bidId, user);

    const body = commentBody(rawBody);
    const uploads = (files ?? []).filter((f) => f?.buffer?.length);
    if (!body && !uploads.length) throw new BadRequestException('body or files required');
    if (uploads.length > MAX_COMMENT_IMAGES) {
      throw new BadRequestException(`max ${MAX_COMMENT_IMAGES} images`);
    }
    for (const f of uploads) {
      const mime = f.mimetype?.trim() || '';
      if (!isCommentImageMime(mime)) {
        throw new BadRequestException(`images only: ${COMMENT_IMAGE_MIMES.join(', ')}`);
      }
    }

    const saved = await this.commentRepo.save(
      this.commentRepo.create({
        bidId,
        userId: user.id,
        body,
        createdAt: new Date(),
        updatedAt: null,
        deletedAt: null,
      }),
    );

    for (const f of uploads) {
      const att = await this.attachments.upload(bidId, f, {
        label: 'comment-image',
        userId: user.id,
        skipActivity: true,
      });
      await this.linkRepo.save(this.linkRepo.create({ commentId: saved.id, attachmentId: att.id }));
    }

    const directory = await this.activeUsers();
    const mentioned = resolveMentionIds(
      directory,
      mentionTokens(body),
      parseMentionIds(rawMentionIds),
      user.id,
    );
    for (const userId of mentioned) {
      await this.mentionRepo.save(this.mentionRepo.create({ commentId: saved.id, userId, readAt: null }));
    }

    return this.getOne(bidId, saved.id);
  }

  async remove(bidId: number, commentId: number, user: User): Promise<{ ok: true }> {
    const bid = await this.requireBid(bidId);
    if (bid.status === 'archived') throw new ForbiddenException('Archived bid — comments are read-only');
    const row = await this.commentRepo.findOne({ where: { id: commentId, bidId, deletedAt: IsNull() } });
    if (!row) throw new NotFoundException('comment not found');
    if (row.userId !== user.id && !isAdminPanelRole(user.role)) {
      throw new ForbiddenException('Only the author or an admin can delete this comment');
    }
    row.deletedAt = new Date();
    await this.commentRepo.save(row);
    return { ok: true };
  }

  private async getOne(bidId: number, commentId: number): Promise<BidCommentDto> {
    const row = await this.commentRepo.findOne({
      where: { id: commentId, bidId, deletedAt: IsNull() },
      relations: [
        'user',
        'mentions',
        'mentions.user',
        'commentAttachments',
        'commentAttachments.attachment',
        'commentAttachments.attachment.file',
      ],
    });
    if (!row) throw new NotFoundException('comment not found');
    return this.toDto(row);
  }

  private async activeUsers(): Promise<User[]> {
    return this.userRepo.find({
      where: { status: UserStatus.Active },
      order: { email: 'ASC' },
    });
  }

  private async requireBid(bidId: number): Promise<Bid> {
    const bid = await this.bidRepo.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${bidId} not found`);
    return bid;
  }

  private toDto(row: BidComment): BidCommentDto {
    const links = (row.commentAttachments ?? []).filter((l) => l.attachment?.file && !l.attachment.file.isDeleted);
    return {
      id: row.id,
      bidId: row.bidId,
      body: row.body,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      ...commentAuthor(row.user ?? null),
      mentions: (row.mentions ?? []).filter((m) => m.user).map((m) => mentionPerson(m.user)),
      attachments: links.map((l) => {
        const a = l.attachment;
        const f = a.file;
        return {
          id: a.id,
          fileName: f.originalFileName,
          mimeType: f.mimeType,
          sizeBytes: Number(f.sizeBytes),
          downloadPath: `/bids/${row.bidId}/attachments/${a.id}/download`,
        };
      }),
    };
  }
}
