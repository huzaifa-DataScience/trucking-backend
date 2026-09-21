import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';
import { MAX_BID_ATTACHMENT_BYTES } from '../files/file-storage.service';
import { MAX_COMMENT_IMAGES } from './bidding-comments';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingCommentsService } from './bidding-comments.service';
import { BiddingService } from './bidding.service';
import {
  CalculateBidDto,
  CreateBidDto,
  HandoffBidDto,
  LinkDuplicateDto,
  PatchBidDto,
  SetOutcomeDto,
} from './dto/bidding.dto';

@Controller('bids')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(
    private readonly bidding: BiddingService,
    private readonly attachments: BiddingAttachmentsService,
    private readonly comments: BiddingCommentsService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('entityId') entityId?: string,
    @Query('search') search?: string,
    @Query('processStage') processStage?: string,
    @Query('workType') workType?: string,
    @Query('outcome') outcome?: string,
    @Query('ownerProjectNumber') ownerProjectNumber?: string,
    @Query('mechanicalEngineerProjectNumber') mechanicalEngineerProjectNumber?: string,
    @Query('teamId') teamId?: string,
    @Query('bidDateFrom') bidDateFrom?: string,
    @Query('bidDateTo') bidDateTo?: string,
    @Query('submitDateFrom') submitDateFrom?: string,
    @Query('submitDateTo') submitDateTo?: string,
    @Query('clientCompanyName') clientCompanyName?: string,
    @CurrentUser() user?: User,
  ) {
    return this.bidding.list({
      status,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      search,
      processStage,
      workType,
      outcome,
      ownerProjectNumber,
      mechanicalEngineerProjectNumber,
      teamId: parseTeamIdQuery(teamId),
      bidDateFrom,
      bidDateTo,
      submitDateFrom,
      submitDateTo,
      clientCompanyName,
      editor: user,
    });
  }

  /** Same payload as `GET /dashboard`. Do not use this on the Estimates list. Register before `@Get(':id')`. */
  @Get('my-plate')
  async myPlate(@CurrentUser() user: User) {
    return this.bidding.myPlate(user);
  }

  /** Same filters as `GET /bids`. Register before `@Get(':id')`. */
  @Get('export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportList(
    @Res({ passthrough: true }) res: Response,
    @Query('status') status?: string,
    @Query('entityId') entityId?: string,
    @Query('search') search?: string,
    @Query('processStage') processStage?: string,
    @Query('workType') workType?: string,
    @Query('outcome') outcome?: string,
    @Query('ownerProjectNumber') ownerProjectNumber?: string,
    @Query('mechanicalEngineerProjectNumber') mechanicalEngineerProjectNumber?: string,
    @Query('teamId') teamId?: string,
    @Query('bidDateFrom') bidDateFrom?: string,
    @Query('bidDateTo') bidDateTo?: string,
    @Query('submitDateFrom') submitDateFrom?: string,
    @Query('submitDateTo') submitDateTo?: string,
    @Query('clientCompanyName') clientCompanyName?: string,
    @CurrentUser() user?: User,
  ) {
    const buffer = await this.bidding.exportList({
      status,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      search,
      processStage,
      workType,
      outcome,
      ownerProjectNumber,
      mechanicalEngineerProjectNumber,
      teamId: parseTeamIdQuery(teamId),
      bidDateFrom,
      bidDateTo,
      submitDateFrom,
      submitDateTo,
      clientCompanyName,
      editor: user,
    });
    res.setHeader('Content-Disposition', 'attachment; filename="bids.xlsx"');
    return new StreamableFile(buffer);
  }

  @Post()
  async create(@Body() dto: CreateBidDto, @CurrentUser() user?: User) {
    return this.bidding.create(dto, user?.id, user);
  }

  @Get('prefill/company-from-job/:jobId')
  async prefillCompanyFromJob(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.bidding.getCompanyInfoPrefillFromJob(jobId);
  }

  @Get(':id/activity')
  async getActivity(@Param('id', ParseIntPipe) id: number) {
    return this.bidding.getActivity(id);
  }

  @Get(':id/comments')
  async listComments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: User) {
    return this.comments.list(id, user);
  }

  @Post(':id/comments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_COMMENT_IMAGES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BID_ATTACHMENT_BYTES },
    }),
  )
  async createComment(
    @Param('id', ParseIntPipe) id: number,
    @Body('body') body: unknown,
    @Body('mentionUserIds') mentionUserIds: unknown,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: User,
  ) {
    return this.comments.create(id, user, body, files, mentionUserIds);
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: User,
  ) {
    return this.comments.remove(id, commentId, user);
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: User) {
    return this.bidding.getDetail(id, user, { skipSpecCodes: true });
  }

  @Patch(':id')
  async patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchBidDto,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.bidding.patch(id, dto, user?.id);
  }

  @Post(':id/link-duplicate')
  async linkDuplicate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkDuplicateDto,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.bidding.linkDuplicate(id, dto.keepBidId, dto.notes, user?.id);
  }

  @Post(':id/handoff')
  async handoff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandoffBidDto,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.bidding.handoff(id, dto, user?.id);
  }

  @Post(':id/outcome')
  async setOutcome(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetOutcomeDto,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.bidding.setOutcome(id, dto, user?.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: User) {
    await this.bidding.assertUserCanEdit(id, user);
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
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label?: string,
    @Body('category') category?: string,
    @Body('drawingCategory') drawingCategory?: string,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.attachments.upload(id, file, { label, category, drawingCategory, userId: user?.id });
  }

  @Patch(':id/attachments/:attachmentId')
  async updateAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Body('label') label: string | null | undefined,
    @Body('category') category: string | null | undefined,
    @Body('drawingCategory') drawingCategory: string | null | undefined,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.attachments.update(id, attachmentId, { label, category, drawingCategory });
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
    await this.bidding.assertUserCanEdit(bidId, user);
    return this.attachments.remove(bidId, attachmentId, user?.id);
  }
}

function parseTeamIdQuery(raw?: string): number | 'all' | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v === 'all') return 'all';
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
