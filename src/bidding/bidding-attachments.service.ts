import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ReadStream } from 'fs';
import { Bid, BidAttachment, AppFile } from '../database/entities';
import { BiddingActivityService } from './bidding-activity.service';
import {
  ALLOWED_UPLOAD_MIMES,
  FileStorageService,
  MAX_BID_ATTACHMENTS_PER_BID,
} from '../files/file-storage.service';
import { ATTACHMENT_CATEGORIES, DRAWING_CATEGORIES, resolveAttachmentCategory } from './process/bid-process';
import { readZipEntries } from './zip-entries';

export interface BidAttachmentDto {
  id: number;
  fileId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  label: string | null;
  category: string | null;
  drawingCategory: string | null;
  sortOrder: number;
  downloadPath: string;
  createdAt: string;
}

@Injectable()
export class BiddingAttachmentsService {
  constructor(
    @InjectRepository(Bid) private readonly bidRepo: Repository<Bid>,
    @InjectRepository(BidAttachment) private readonly attachmentRepo: Repository<BidAttachment>,
    @InjectRepository(AppFile) private readonly fileRepo: Repository<AppFile>,
    private readonly storage: FileStorageService,
    private readonly activity: BiddingActivityService,
  ) {}

  async listForJob(jobId: number): Promise<Array<BidAttachmentDto & { bidId: number; bidName: string | null; estimateNumber: string | null }>> {
    const bids = await this.bidRepo.find({
      where: { jobId, isDeleted: false },
      select: { id: true, bidName: true, estimateNumber: true },
    });
    if (bids.length === 0) return [];
    const byId = new Map(bids.map((b) => [b.id, b]));
    const rows = await this.attachmentRepo.find({
      where: { bidId: In(bids.map((b) => b.id)) },
      relations: ['file'],
      order: { id: 'DESC' },
    });
    return rows
      .filter((r) => r.file && !r.file.isDeleted)
      .map((r) => {
        const bid = byId.get(r.bidId);
        return {
          ...this.toDto(r),
          bidId: r.bidId,
          bidName: bid?.bidName ?? null,
          estimateNumber: bid?.estimateNumber ?? null,
        };
      });
  }

  async listForBid(bidId: number, opts?: { skipExistCheck?: boolean }): Promise<BidAttachmentDto[]> {
    if (!opts?.skipExistCheck) await this.requireBid(bidId);
    const rows = await this.attachmentRepo.find({
      where: { bidId },
      relations: ['file'],
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return rows
      .filter((r) => r.file && !r.file.isDeleted)
      .map((r) => this.toDto(r));
  }

  async upload(
    bidId: number,
    file: Express.Multer.File,
    opts: { label?: string; category?: string; drawingCategory?: string; userId?: number; skipActivity?: boolean },
  ): Promise<BidAttachmentDto> {
    const [one] = await this.uploadExpanded(bidId, file, opts);
    return one;
  }

  /**
   * A drawings/specs/addenda zip becomes one attachment per file inside it,
   * named with the folder path. Any other upload stays one file.
   */
  async uploadExpanded(
    bidId: number,
    file: Express.Multer.File,
    opts: { label?: string; category?: string; drawingCategory?: string; userId?: number; skipActivity?: boolean },
  ): Promise<BidAttachmentDto[]> {
    const label = opts.label?.trim() || '';
    const expand = label === 'drawings' || label === 'specifications' || label === 'addenda';
    const zip = expand && this.looksLikeZip(file) ? readZipEntries(file.buffer) : [];
    const pieces = zip
      .map((entry) => {
        const mimeType = this.mimeFromName(entry.name);
        if (!mimeType || entry.bytes.length === 0) return null;
        return { buffer: entry.bytes, originalname: entry.name, mimetype: mimeType };
      })
      .filter((piece): piece is { buffer: Buffer; originalname: string; mimetype: string } => !!piece);
    if (pieces.length === 0) {
      return [await this.storeOne(bidId, file, opts)];
    }
    const out: BidAttachmentDto[] = [];
    for (const piece of pieces) {
      out.push(await this.storeOne(bidId, { ...file, buffer: piece.buffer, originalname: piece.originalname, mimetype: piece.mimetype, size: piece.buffer.length }, opts));
    }
    return out;
  }

  private async storeOne(
    bidId: number,
    file: Express.Multer.File,
    opts: { label?: string; category?: string; drawingCategory?: string; userId?: number; skipActivity?: boolean },
  ): Promise<BidAttachmentDto> {
    const bid = await this.requireBid(bidId);
    if (bid.status === 'archived') {
      throw new ConflictException(`Bid ${bidId} is archived; cannot upload attachments`);
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded (field name: file)');
    }
    const mimeType = file.mimetype?.trim() || '';
    if (!ALLOWED_UPLOAD_MIMES[mimeType]) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType || 'unknown'}. Allowed: JPEG, PNG, WebP, PDF, Word (.doc/.docx), ZIP`,
      );
    }
    if (opts.category != null && !(ATTACHMENT_CATEGORIES as readonly string[]).includes(opts.category)) {
      throw new BadRequestException(`Invalid category: ${opts.category}`);
    }
    if (opts.drawingCategory != null && !(DRAWING_CATEGORIES as readonly string[]).includes(opts.drawingCategory)) {
      throw new BadRequestException(`Invalid drawingCategory: ${opts.drawingCategory}`);
    }
    const count = await this.attachmentRepo.count({ where: { bidId } });
    if (count >= MAX_BID_ATTACHMENTS_PER_BID) {
      throw new BadRequestException(`Maximum ${MAX_BID_ATTACHMENTS_PER_BID} attachments per bid`);
    }

    const originalName = this.sanitizeOriginalName(file.originalname);
    const { storagePath, sizeBytes } = await this.storage.writeBidFile(
      bidId,
      file.buffer,
      originalName,
      mimeType,
    );

    const appFile = await this.fileRepo.save(
      this.fileRepo.create({
        storagePath,
        originalFileName: originalName,
        mimeType,
        sizeBytes,
        uploadedByUserId: opts.userId ?? null,
        isDeleted: false,
      }),
    );

    const attachment = await this.attachmentRepo.save(
      this.attachmentRepo.create({
        bidId,
        fileId: appFile.id,
        label: opts.label?.trim() || null,
        category: resolveAttachmentCategory(opts.category, opts.label),
        drawingCategory: opts.drawingCategory ?? null,
        sortOrder: count,
      }),
    );
    attachment.file = appFile;
    const dto = this.toDto(attachment);
    if (!opts.skipActivity) await this.activity.recordAttachmentAdded(bidId, opts.userId, originalName);
    return dto;
  }

  /** Move an attachment between category/drawingCategory buckets, or edit its label. */
  async update(
    bidId: number,
    attachmentId: number,
    patch: { label?: string | null; category?: string | null; drawingCategory?: string | null },
  ): Promise<BidAttachmentDto> {
    const bid = await this.requireBid(bidId);
    if (bid.status === 'archived') {
      throw new ConflictException(`Bid ${bidId} is archived; cannot edit attachments`);
    }
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, bidId }, relations: ['file'] });
    if (!attachment?.file) {
      throw new NotFoundException(`Attachment ${attachmentId} not found for bid ${bidId}`);
    }
    if (patch.category !== undefined) {
      if (patch.category != null && !(ATTACHMENT_CATEGORIES as readonly string[]).includes(patch.category)) {
        throw new BadRequestException(`Invalid category: ${patch.category}`);
      }
      attachment.category = patch.category;
    }
    if (patch.drawingCategory !== undefined) {
      if (
        patch.drawingCategory != null &&
        !(DRAWING_CATEGORIES as readonly string[]).includes(patch.drawingCategory)
      ) {
        throw new BadRequestException(`Invalid drawingCategory: ${patch.drawingCategory}`);
      }
      attachment.drawingCategory = patch.drawingCategory;
    }
    if (patch.label !== undefined) attachment.label = patch.label?.trim() || null;
    await this.attachmentRepo.save(attachment);
    return this.toDto(attachment);
  }

  async openDownload(
    bidId: number,
    attachmentId: number,
  ): Promise<{ stream: ReadStream; mimeType: string; fileName: string }> {
    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, bidId },
      relations: ['file'],
    });
    if (!attachment?.file || attachment.file.isDeleted) {
      throw new NotFoundException(`Attachment ${attachmentId} not found for bid ${bidId}`);
    }
    return {
      stream: this.storage.openReadStream(attachment.file.storagePath),
      mimeType: attachment.file.mimeType,
      fileName: attachment.file.originalFileName,
    };
  }

  async remove(bidId: number, attachmentId: number, userId?: number): Promise<{ ok: true }> {
    const bid = await this.requireBid(bidId);
    if (bid.status === 'archived') {
      throw new ConflictException(`Bid ${bidId} is archived; cannot delete attachments`);
    }

    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, bidId },
      relations: ['file'],
    });
    if (!attachment?.file) {
      throw new NotFoundException(`Attachment ${attachmentId} not found for bid ${bidId}`);
    }

    const fileName = attachment.file.originalFileName;

    await this.storage.deleteFile(attachment.file.storagePath);
    attachment.file.isDeleted = true;
    await this.fileRepo.save(attachment.file);
    await this.attachmentRepo.remove(attachment);
    await this.activity.recordAttachmentRemoved(bidId, userId, fileName);
    return { ok: true };
  }

  private async requireBid(bidId: number): Promise<Bid> {
    const bid = await this.bidRepo.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${bidId} not found`);
    return bid;
  }

  private toDto(row: BidAttachment): BidAttachmentDto {
    const f = row.file;
    return {
      id: row.id,
      fileId: f.id,
      fileName: f.originalFileName,
      mimeType: f.mimeType,
      sizeBytes: Number(f.sizeBytes),
      label: row.label,
      category: resolveAttachmentCategory(row.category, row.label),
      drawingCategory: row.drawingCategory,
      sortOrder: row.sortOrder,
      downloadPath: `/bids/${row.bidId}/attachments/${row.id}/download`,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private looksLikeZip(file: Express.Multer.File): boolean {
    const mime = file.mimetype?.trim() || '';
    return mime === 'application/zip' || mime === 'application/x-zip-compressed' || /\.zip$/i.test(file.originalname || '');
  }

  private mimeFromName(name: string): string | null {
    const ext = name.match(/(\.[a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
    if (!ext) return null;
    for (const [mime, known] of Object.entries(ALLOWED_UPLOAD_MIMES)) {
      if (known === ext) return mime;
    }
    return null;
  }

  /** Keep folder/file.pdf. Drop .. and a leading slash. */
  private sanitizeOriginalName(name: string): string {
    const parts = (name || 'upload')
      .split(/[/\\]+/)
      .map((part) => part.trim())
      .filter((part) => part && part !== '.' && part !== '..');
    return parts.join('/').slice(0, 255) || 'upload';
  }
}
