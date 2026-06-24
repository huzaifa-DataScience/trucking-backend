import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReadStream } from 'fs';
import { Bid, BidAttachment, AppFile } from '../database/entities';
import { BiddingActivityService } from './bidding-activity.service';
import {
  ALLOWED_UPLOAD_MIMES,
  FileStorageService,
  MAX_BID_ATTACHMENT_BYTES,
  MAX_BID_ATTACHMENTS_PER_BID,
} from '../files/file-storage.service';

export interface BidAttachmentDto {
  id: number;
  fileId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  label: string | null;
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

  async listForBid(bidId: number): Promise<BidAttachmentDto[]> {
    await this.requireBid(bidId);
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
    opts: { label?: string; userId?: number },
  ): Promise<BidAttachmentDto> {
    const bid = await this.requireBid(bidId);
    if (bid.status !== 'draft') {
      throw new ConflictException(`Bid ${bidId} is ${bid.status}; reopen to draft before uploading attachments`);
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded (field name: file)');
    }
    if (file.size > MAX_BID_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException(`File exceeds ${MAX_BID_ATTACHMENT_BYTES} bytes`);
    }
    const mimeType = file.mimetype?.trim() || '';
    if (!ALLOWED_UPLOAD_MIMES[mimeType]) {
      throw new BadRequestException(
        `Unsupported file type: ${mimeType || 'unknown'}. Allowed: JPEG, PNG, WebP, PDF`,
      );
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
        sortOrder: count,
      }),
    );
    attachment.file = appFile;
    const dto = this.toDto(attachment);
    await this.activity.recordAttachmentAdded(bidId, opts.userId, originalName);
    return dto;
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
    if (bid.status !== 'draft') {
      throw new ConflictException(`Bid ${bidId} is ${bid.status}; reopen to draft before deleting attachments`);
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
      sortOrder: row.sortOrder,
      downloadPath: `/bids/${row.bidId}/attachments/${row.id}/download`,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private sanitizeOriginalName(name: string): string {
    const base = (name || 'upload').replace(/[/\\]/g, '_').trim();
    return base.slice(0, 200) || 'upload';
  }
}
