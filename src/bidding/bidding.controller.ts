import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';
import { MAX_BID_ATTACHMENT_BYTES } from '../files/file-storage.service';
import { UploadedMulterFile } from '../common/uploaded-multer-file.type';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingService } from './bidding.service';
import { CalculateBidDto, CreateBidDto, PatchBidDto } from './dto/bidding.dto';

@Controller('bids')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(
    private readonly bidding: BiddingService,
    private readonly attachments: BiddingAttachmentsService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('entityId') entityId?: string,
    @Query('search') search?: string,
  ) {
    return this.bidding.list({
      status,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      search,
    });
  }

  @Post()
  async create(@Body() dto: CreateBidDto, @CurrentUser() user?: User) {
    return this.bidding.create(dto, user?.id);
  }

  @Get('prefill/company-from-job/:jobId')
  async prefillCompanyFromJob(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.bidding.getCompanyInfoPrefillFromJob(jobId);
  }

  @Get(':id/activity')
  async getActivity(@Param('id', ParseIntPipe) id: number) {
    return this.bidding.getActivity(id);
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.bidding.getDetail(id);
  }

  @Patch(':id')
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchBidDto,
    @CurrentUser() user?: User,
  ) {
    return this.bidding.patch(id, dto, user?.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: User) {
    return this.bidding.remove(id, user?.id);
  }

  @Post(':id/calculate')
  async calculate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CalculateBidDto,
  ) {
    return this.bidding.calculate(id, dto);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BID_ATTACHMENT_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedMulterFile,
    @Body('label') label?: string,
    @CurrentUser() user?: User,
  ) {
    return this.attachments.upload(id, file, { label, userId: user?.id });
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id', ParseIntPipe) bidId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, mimeType, fileName } = await this.attachments.openDownload(bidId, attachmentId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(
    @Param('id', ParseIntPipe) bidId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user?: User,
  ) {
    return this.attachments.remove(bidId, attachmentId, user?.id);
  }
}
