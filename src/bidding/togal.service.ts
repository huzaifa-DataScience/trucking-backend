import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { Repository } from 'typeorm';
import { Bid, BidAttachment, BidContent, Role, User } from '../database/entities';
import { BidTogalInstruction } from '../database/entities/bid-togal-instruction.entity';
import { FileStorageService } from '../files/file-storage.service';
import { parseProcess } from './process/bid-process';
import {
  fillToolArgs,
  firstUrl,
  pickTogalTool,
  TogalMcpClient,
  TogalMcpError,
  TogalTool,
  toolFiles,
  toolText,
} from './togal-mcp.client';

const ROW_ID = 1;
/** ponytail: one nvarchar(max) row. If the script grows past this, raise the cap. */
export const TOGAL_SCRIPT_MAX = 500_000;
/** ponytail: whole file is base64'd into one MCP call. Bigger sets need Togal's own uploader. */
const MAX_PUSH_BYTES = 80 * 1024 * 1024;
const HUB_LABELS = ['drawings', 'specifications', 'addenda'] as const;
function exportMime(name: string, mime: string, bytes: Buffer): string {
  if (bytes.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  const known = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/zip', 'application/x-zip-compressed'];
  if (known.includes(mime)) return mime === 'application/x-zip-compressed' ? 'application/zip' : mime;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.zip')) return 'application/zip';
  throw new BadRequestException(`${name} came back from Togal as ${mime || 'an unknown type'}`);
}

const SCRIPT_EDITORS = new Set<string>([Role.SuperAdmin, Role.Admin, Role.Captain]);

type InstructionRow = BidTogalInstruction;

@Injectable()
export class TogalService implements OnModuleInit {
  private readonly mcp = new TogalMcpClient();

  constructor(
    @InjectRepository(BidTogalInstruction)
    private readonly repo: Repository<BidTogalInstruction>,
    @InjectRepository(Bid)
    private readonly bids: Repository<Bid>,
    @InjectRepository(BidContent)
    private readonly content: Repository<BidContent>,
    @InjectRepository(BidAttachment)
    private readonly attachments: Repository<BidAttachment>,
    private readonly storage: FileStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repo.query(`
      IF OBJECT_ID('dbo.Bid_TogalInstruction', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Bid_TogalInstruction (
          Id int NOT NULL CONSTRAINT PK_Bid_TogalInstruction PRIMARY KEY,
          Body nvarchar(max) NOT NULL,
          UpdatedAt datetime2 NOT NULL CONSTRAINT DF_Bid_TogalInstruction_UpdatedAt DEFAULT SYSUTCDATETIME(),
          UpdatedByUserId int NULL,
          ClientId nvarchar(200) NULL,
          AccessToken nvarchar(max) NULL,
          AccessExpiresAt datetime2 NULL,
          DeviceCode nvarchar(max) NULL,
          DeviceUserCode nvarchar(40) NULL,
          DeviceVerificationUrl nvarchar(max) NULL,
          DeviceExpiresAt datetime2 NULL
        );
      END
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'ClientId') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD ClientId nvarchar(200) NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'AccessToken') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD AccessToken nvarchar(max) NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'AccessExpiresAt') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD AccessExpiresAt datetime2 NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'DeviceCode') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD DeviceCode nvarchar(max) NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'DeviceUserCode') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD DeviceUserCode nvarchar(40) NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'DeviceVerificationUrl') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD DeviceVerificationUrl nvarchar(max) NULL;
      IF COL_LENGTH('dbo.Bid_TogalInstruction', 'DeviceExpiresAt') IS NULL
        ALTER TABLE dbo.Bid_TogalInstruction ADD DeviceExpiresAt datetime2 NULL;
    `);
  }

  canEditScript(user: User | undefined): boolean {
    return !!user && SCRIPT_EDITORS.has(user.role);
  }

  async status(user: User | undefined): Promise<{
    connected: boolean;
    expiresAt: string | null;
    canConnect: boolean;
    pending: { verificationUrl: string; userCode: string; expiresAt: string } | null;
  }> {
    const row = await this.row();
    const expires = row.accessExpiresAt ? new Date(row.accessExpiresAt) : null;
    const connected = !!row.accessToken && !!expires && expires.getTime() > Date.now();
    const deviceExpires = row.deviceExpiresAt ? new Date(row.deviceExpiresAt) : null;
    const pending =
      !connected && row.deviceCode && row.deviceUserCode && row.deviceVerificationUrl && deviceExpires && deviceExpires.getTime() > Date.now()
        ? {
            verificationUrl: row.deviceVerificationUrl,
            userCode: row.deviceUserCode,
            expiresAt: deviceExpires.toISOString(),
          }
        : null;
    return {
      connected,
      expiresAt: connected && expires ? expires.toISOString() : null,
      canConnect: this.canEditScript(user),
      pending,
    };
  }

  async beginConnect(user: User): Promise<{
    verificationUrl: string;
    userCode: string;
    expiresAt: string;
    intervalSeconds: number;
  }> {
    this.assertConnect(user);
    const row = await this.row();
    try {
      if (!row.clientId) row.clientId = await this.mcp.registerClient();
      const device = await this.mcp.startDevice(row.clientId);
      const expires = new Date(Date.now() + device.expiresIn * 1000);
      row.deviceCode = device.deviceCode;
      row.deviceUserCode = device.userCode;
      row.deviceVerificationUrl = device.verificationUrl;
      row.deviceExpiresAt = expires;
      await this.repo.save(row);
      return {
        verificationUrl: device.verificationUrl,
        userCode: device.userCode,
        expiresAt: expires.toISOString(),
        intervalSeconds: device.interval,
      };
    } catch (e) {
      throw this.wrap(e);
    }
  }

  async pollConnect(user: User): Promise<{ connected: boolean; expiresAt: string | null }> {
    this.assertConnect(user);
    const row = await this.row();
    if (!row.clientId || !row.deviceCode) {
      throw new BadRequestException('Start Connect Togal first');
    }
    try {
      const hit = await this.mcp.pollToken(row.clientId, row.deviceCode);
      if (hit.pending) return { connected: false, expiresAt: null };
      const expires = new Date(Date.now() + hit.expiresIn * 1000);
      row.accessToken = hit.accessToken;
      row.accessExpiresAt = expires;
      row.deviceCode = null;
      row.deviceUserCode = null;
      row.deviceVerificationUrl = null;
      row.deviceExpiresAt = null;
      await this.repo.save(row);
      return { connected: true, expiresAt: expires.toISOString() };
    } catch (e) {
      throw this.wrap(e);
    }
  }

  async getScript(user: User | undefined): Promise<{
    body: string;
    updatedAt: string | null;
    canEdit: boolean;
  }> {
    const row = await this.row();
    return {
      body: row.body ?? '',
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      canEdit: this.canEditScript(user),
    };
  }

  async saveScript(user: User, body: string): Promise<{ body: string; updatedAt: string; canEdit: true }> {
    if (!this.canEditScript(user)) {
      throw new ForbiddenException('Only a captain or admin can change the Togal instruction script');
    }
    if (typeof body !== 'string') throw new BadRequestException('body must be a string');
    if (body.length > TOGAL_SCRIPT_MAX) {
      throw new BadRequestException(`Script exceeds ${TOGAL_SCRIPT_MAX} characters`);
    }
    const row = await this.row();
    row.body = body;
    row.updatedAt = new Date();
    row.updatedByUserId = user.id;
    await this.repo.save(row);
    return { body, updatedAt: row.updatedAt.toISOString(), canEdit: true };
  }

  async loadBid(bidId: number): Promise<{
    projectUrl: string | null;
    projectId: string | null;
    sentAttachmentIds: number[];
    warning: string | null;
  }> {
    const bid = await this.requireBid(bidId);
    const process = await this.processOf(bidId);
    const token = await this.token();
    const tools = await this.tools(token);
    let projectId = process.togal.projectId;
    let projectUrl = process.togal.projectUrl;
    const sent = new Set(process.togal.sentAttachmentIds);
    const warnings: string[] = [];
    try {
      if (!projectId) {
        const create = this.requireTool(tools, [['create', 'project'], ['new', 'project']], 'create a project');
        const created = await this.mcp.callTool(
          token,
          create.name,
          fillToolArgs(create, { projectName: bid.bidName || bid.estimateNumber || `Bid ${bidId}`, name: bid.bidName || `Bid ${bidId}` }),
        );
        const text = toolText(created);
        projectUrl = firstUrl(text) ?? projectUrl;
        projectId = this.idFrom(created, text);
        if (!projectId) {
          throw new BadRequestException('Togal created a project but did not return an id');
        }
      }
      const upload =
        pickTogalTool(tools, ['upload', 'drawing']) ??
        pickTogalTool(tools, ['upload', 'file']) ??
        pickTogalTool(tools, ['add', 'drawing']);
      if (!upload) throw new BadRequestException(this.missing('upload a drawing', tools));
      const rows = await this.attachments.find({ where: { bidId }, relations: ['file'] });
      for (const row of rows) {
        if (sent.has(row.id)) continue;
        const label = row.label ?? '';
        if (!(HUB_LABELS as readonly string[]).includes(label)) continue;
        const file = row.file;
        if (!file || file.isDeleted) continue;
        const bytes = await fs.readFile(this.storage.absolutePath(file.storagePath));
        if (bytes.length > MAX_PUSH_BYTES) {
          warnings.push(`${file.originalFileName} is over 80 MB, so Togal did not take it. It stays on this bid.`);
          continue;
        }
        try {
          await this.mcp.callTool(
            token,
            upload.name,
            fillToolArgs(upload, {
              projectId,
              fileName: file.originalFileName,
              mimeType: file.mimeType,
              contentBase64: bytes.toString('base64'),
            }),
          );
          sent.add(row.id);
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : `${file.originalFileName} was not sent to Togal`);
        }
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw this.wrap(e);
    }
    return { projectUrl, projectId, sentAttachmentIds: [...sent], warning: warnings[0] ?? null };
  }

  async runScript(bidId: number): Promise<{ ok: true }> {
    const process = await this.processOf(bidId);
    if (!process.togal.projectId) throw new BadRequestException('Load this bid into Togal first');
    const script = (await this.row()).body?.trim();
    if (!script) throw new BadRequestException('The Togal instruction script is empty');
    const token = await this.token();
    const tools = await this.tools(token);
    const chat =
      pickTogalTool(tools, ['chat', 'project']) ??
      pickTogalTool(tools, ['prompt']) ??
      pickTogalTool(tools, ['script']);
    if (!chat) throw new BadRequestException(this.missing('run the instruction script', tools));
    try {
      await this.mcp.callTool(
        token,
        chat.name,
        fillToolArgs(chat, { projectId: process.togal.projectId, text: script, message: script }),
      );
    } catch (e) {
      throw this.wrap(e);
    }
    return { ok: true };
  }

  async pullExports(bidId: number): Promise<Array<{ name: string; mimeType: string; bytes: Buffer }>> {
    const process = await this.processOf(bidId);
    if (!process.togal.projectId) throw new BadRequestException('Load this bid into Togal first');
    const token = await this.token();
    const tools = await this.tools(token);
    const exp = pickTogalTool(tools, ['export']) ?? pickTogalTool(tools, ['download']);
    if (!exp) throw new BadRequestException(this.missing('download an export', tools));
    try {
      const result = await this.mcp.callTool(token, exp.name, fillToolArgs(exp, { projectId: process.togal.projectId }));
      return toolFiles(result).map((file) => ({ ...file, mimeType: exportMime(file.name, file.mimeType, file.bytes) }));
    } catch (e) {
      throw this.wrap(e);
    }
  }

  private async token(): Promise<string> {
    const row = await this.row();
    const expires = row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : 0;
    if (!row.accessToken || expires <= Date.now()) {
      throw new BadRequestException('Togal is not connected. A captain has to approve the Togal login.');
    }
    return row.accessToken;
  }

  private async tools(token: string): Promise<TogalTool[]> {
    try {
      return await this.mcp.listTools(token);
    } catch (e) {
      throw this.wrap(e);
    }
  }

  private requireTool(tools: TogalTool[], tries: string[][], action: string): TogalTool {
    for (const words of tries) {
      const hit = pickTogalTool(tools, words);
      if (hit) return hit;
    }
    throw new BadRequestException(this.missing(action, tools));
  }

  private missing(action: string, tools: TogalTool[]): string {
    const names = tools.map((t) => t.name).join(', ') || 'none';
    return `Togal has no tool to ${action}. Tools: ${names}`;
  }

  private idFrom(result: unknown, text: string): string | null {
    if (result && typeof result === 'object') {
      const bag = result as Record<string, unknown>;
      for (const key of ['projectId', 'project_id', 'id']) {
        if (typeof bag[key] === 'string' && bag[key]) return bag[key] as string;
      }
    }
    const m = text.match(/\b(?:project[_\s-]?id)[:\s]+([A-Za-z0-9_-]{4,})/i);
    return m ? m[1] : null;
  }

  private async processOf(bidId: number) {
    await this.requireBid(bidId);
    const content = await this.content.findOne({ where: { bidId } });
    let raw: unknown = null;
    if (content?.processJson) {
      try {
        raw = JSON.parse(content.processJson);
      } catch {
        raw = null;
      }
    }
    return parseProcess(raw);
  }

  private async requireBid(bidId: number): Promise<Bid> {
    const bid = await this.bids.findOne({ where: { id: bidId, isDeleted: false } });
    if (!bid) throw new NotFoundException(`Bid ${bidId} not found`);
    return bid;
  }

  private assertConnect(user: User): void {
    if (!this.canEditScript(user)) {
      throw new ForbiddenException('Only a captain or admin can connect Togal');
    }
  }

  private wrap(e: unknown): Error {
    if (e instanceof TogalMcpError) {
      if (e.code === 'access_denied' || e.code === 'expired_token') {
        return new BadRequestException(e.message);
      }
      return new ServiceUnavailableException(e.message);
    }
    if (e instanceof BadRequestException || e instanceof ForbiddenException || e instanceof NotFoundException) {
      return e;
    }
    const message = e instanceof Error ? e.message : 'Togal request failed';
    return new ServiceUnavailableException(message);
  }

  private async row(): Promise<InstructionRow> {
    const existing = await this.repo.findOne({ where: { id: ROW_ID } });
    if (existing) return existing;
    return this.repo.save(this.repo.create({ id: ROW_ID, body: '', updatedAt: new Date(), updatedByUserId: null }));
  }
}
