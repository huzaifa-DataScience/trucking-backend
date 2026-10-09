import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';
import { MAX_COMMENT_IMAGES } from './bidding-comments';
import { BiddingAttachmentsService } from './bidding-attachments.service';
import { BiddingCommentsService } from './bidding-comments.service';
import { BiddingService } from './bidding.service';
import { TogalService } from './togal.service';
import {
  parseBidListPage,
  parseBidListPageSize,
  parseBidListSort,
  parseBidListSortDir,
} from './bid-list-page';
import { IsString, MaxLength } from 'class-validator';
import {
  CalculateBidDto,
  CreateBidDto,
  HandoffBidDto,
  LinkDuplicateDto,
  PatchBidDto,
  SetBoardStatusDto,
  SetOutcomeDto,
} from './dto/bidding.dto';

class SaveTogalScriptDto {
  @IsString()
  @MaxLength(500_000)
  body!: string;
}

@Controller('bids')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(
    private readonly bidding: BiddingService,
    private readonly attachments: BiddingAttachmentsService,
    private readonly comments: BiddingCommentsService,
    private readonly togal: TogalService,
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
    @Query('sort') sort?: string,
    @Query('sortDir') sortDir?: string,
    @Query('view') view?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: User,
  ) {
    const pageNum = parseBidListPage(page);
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
      sort: parseBidListSort(sort),
      sortDir: parseBidListSortDir(sortDir),
      view: parseViewQuery(view),
      page: pageNum,
      pageSize: pageNum != null ? parseBidListPageSize(pageSize) : undefined,
      editor: user,
      withNotes: true,
    });
  }

  /** Same payload as `GET /dashboard`. Do not use this on the Estimates list. Register before `@Get(':id')`. */
  @Get('my-plate')
  async myPlate(@CurrentUser() user: User) {
    return this.bidding.myPlate(user);
  }

  /** One instruction set for Togal chat. Register before `@Get(':id')`. */
  @Get('togal/script')
  getTogalScript(@CurrentUser() user: User) {
    return this.togal.getScript(user);
  }

  @Put('togal/script')
  saveTogalScript(@Body() dto: SaveTogalScriptDto, @CurrentUser() user: User) {
    return this.togal.saveScript(user, dto.body);
  }

  @Get('togal/status')
  togalStatus(@CurrentUser() user: User) {
    return this.togal.status(user);
  }

  @Post('togal/connect')
  togalConnect(@CurrentUser() user: User) {
    return this.togal.beginConnect(user);
  }

  @Post('togal/connect/poll')
  togalConnectPoll(@CurrentUser() user: User) {
    return this.togal.pollConnect(user);
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
    @Query('sort') sort?: string,
    @Query('sortDir') sortDir?: string,
    @Query('view') view?: string,
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
      sort: parseBidListSort(sort),
      sortDir: parseBidListSortDir(sortDir),
      view: parseViewQuery(view),
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

  /** Files on bids linked to this job. Same download paths as the bid. Register before `@Get(':id')`. */
  @Get('job/:jobId/files')
  jobFiles(@Param('jobId', ParseIntPipe) jobId: number) {
    return this.attachments.listForJob(jobId);
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

  @Post(':id/togal/load')
  async togalLoad(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    await this.bidding.assertUserCanEdit(id, user);
    const togal = await this.togal.loadBid(id);
    const bid = await this.bidding.patch(id, { process: { togal } }, user.id);
    if (togal.warning) throw new BadRequestException(togal.warning);
    return bid;
  }

  @Post(':id/togal/run-script')
  async togalRunScript(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.togal.runScript(id);
  }

  @Post(':id/togal/pull')
  async togalPull(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    await this.bidding.assertUserCanEdit(id, user);
    const files = await this.togal.pullExports(id);
    for (const file of files) {
      await this.attachments.upload(
        id,
        {
          buffer: file.bytes,
          mimetype: file.mimeType,
          originalname: file.name,
          size: file.bytes.length,
        } as Express.Multer.File,
        { label: 'takeoff', category: 'takeoff_markup', userId: user.id },
      );
    }
    return this.bidding.getDetail(id, user, { skipSpecCodes: true });
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

  /** Estimates list status dropdown (Not Started … Cancelled), mapped onto stage + outcome. */
  @Post(':id/board-status')
  async setBoardStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetBoardStatusDto,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    return this.bidding.setBoardStatus(id, dto, user?.id);
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
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'files', maxCount: 200 },
      ],
      { storage: memoryStorage() }, // ponytail: no byte cap; whole file in RAM — disk stream if Nest OOMs
    ),
  )
  async uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles()
    uploaded: { file?: Express.Multer.File[]; files?: Express.Multer.File[] },
    @Body('label') label?: string,
    @Body('category') category?: string,
    @Body('drawingCategory') drawingCategory?: string,
    @CurrentUser() user?: User,
  ) {
    await this.bidding.assertUserCanEdit(id, user);
    const incoming = [...(uploaded?.file ?? []), ...(uploaded?.files ?? [])];
    if (!incoming.length) throw new BadRequestException('No file uploaded (field name: file)');
    const saved: Awaited<ReturnType<BiddingAttachmentsService['uploadExpanded']>> = [];
    for (const file of incoming) {
      saved.push(...(await this.attachments.uploadExpanded(id, file, { label, category, drawingCategory, userId: user?.id })));
    }
    const hub = saved.some((row) => row.label === 'drawings' || row.label === 'specifications' || row.label === 'addenda');
    let togal: { sent: boolean; message: string | null } | null = null;
    if (hub) {
      try {
        const state = await this.togal.loadBid(id);
        await this.bidding.patch(id, { process: { togal: state } }, user?.id);
        togal = { sent: saved.every((row) => state.sentAttachmentIds.includes(row.id)), message: state.warning };
      } catch (e) {
        togal = {
          sent: false,
          message: e instanceof Error ? e.message : 'Togal did not take this file. It is saved on this bid.',
        };
      }
    }
    if (saved.length === 1) return { ...saved[0], togal };
    return { attachments: saved, togal };
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

function parseViewQuery(raw?: string): 'internal' | 'all' | undefined {
  const v = raw?.trim();
  if (v === 'internal' || v === 'all') return v;
  return undefined;
}

function parseTeamIdQuery(raw?: string): number | 'all' | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v === 'all') return 'all';
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
