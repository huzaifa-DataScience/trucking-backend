import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { Repository } from 'typeorm';
import { Bid, BidAttachment, BidContent, Role, User } from '../database/entities';
import { BidTogalInstruction } from '../database/entities/bid-togal-instruction.entity';
import { FileStorageService } from '../files/file-storage.service';
import { UsersService } from '../users/users.service';
import { mergeProcess, parseProcess } from './process/bid-process';
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
import { folderIdForCaptain, TogalRestClient, TogalSession } from './togal-rest.client';

const ROW_ID = 1;
/** ponytail: one nvarchar(max) row. If the script grows past this, raise the cap. */
export const TOGAL_SCRIPT_MAX = 500_000;
/** Files larger than this are not sent. Bigger sets need Togal's own uploader. */
const MAX_PUSH_BYTES = 80 * 1024 * 1024;
const HUB_LABELS = ['drawings', 'specifications', 'addenda'] as const;

function sessionRejected(e: unknown): boolean {
  const message = e instanceof Error ? e.message : '';
  return /authenticate itself|unauthorized/i.test(message);
}

function pushMime(name: string, mime: string): string {
  const lower = name.toLowerCase();
  if (mime === 'image/png' || lower.endsWith('.png')) return 'image/png';
  if (mime === 'image/jpeg' || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (mime === 'image/gif' || lower.endsWith('.gif')) return 'image/gif';
  if (mime === 'image/tiff' || lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return 'application/pdf';
  if (mime.includes('zip') || lower.endsWith('.zip')) return 'application/zip';
  return mime || 'application/octet-stream';
}
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
  private readonly rest = new TogalRestClient();
  /** ponytail: one login for 6h. Togal session with remember lasts longer; re-login if a call 401s. */
  private restSessionCache: { at: number; value: TogalSession } | null = null;

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
    private readonly config: ConfigService,
    private readonly users: UsersService,
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
      let device: Awaited<ReturnType<TogalMcpClient['startDevice']>>;
      try {
        device = await this.mcp.startDevice(row.clientId);
      } catch (e) {
        // ponytail: Togal drops old client ids. One re-register, then the error stands.
        if (!(e instanceof TogalMcpError) || !/unknown oauth client/i.test(e.message)) throw e;
        row.clientId = await this.mcp.registerClient();
        device = await this.mcp.startDevice(row.clientId);
      }
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
    setId: string | null;
    organizationId: string | null;
    sentAttachmentIds: number[];
    files: { attachmentId: number; fileId: string; pageIds: string[] }[];
    warning: string | null;
  }> {
    const bid = await this.requireBid(bidId);
    const process = await this.processOf(bidId);
    const session = await this.restSession();
    let projectId = process.togal.projectId;
    let setId = process.togal.setId;
    const projectUrl = process.togal.projectUrl;
    const sent = new Set(process.togal.sentAttachmentIds);
    const files = [...process.togal.files];
    const warnings: string[] = [];
    try {
      const captainName = await this.captainFirstName(process);
      let folderId: string | null = null;
      if (captainName) {
        try {
          folderId = folderIdForCaptain(await this.rest.listFolders(session), captainName);
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : 'Togal folders could not be read');
        }
      }
      if (!projectId) {
        projectId = await this.rest.createProject(
          session,
          bid.bidName || bid.estimateNumber || `Bid ${bidId}`,
          folderId,
        );
      } else if (folderId) {
        try {
          await this.rest.moveProject(session, projectId, folderId);
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : 'Togal did not move this project into the captain folder');
        }
      }
      if (!setId) setId = await this.rest.createSet(session, projectId, 'Drawings');
      const rows = await this.attachments.find({ where: { bidId }, relations: ['file'] });
      for (const row of rows) {
        if (sent.has(row.id)) continue;
        const label = row.label ?? '';
        if (!(HUB_LABELS as readonly string[]).includes(label)) continue;
        const file = row.file;
        if (!file || file.isDeleted) continue;
        const bytes = await fs.readFile(this.storage.absolutePath(file.storagePath));
        if (bytes.length > MAX_PUSH_BYTES) {
          warnings.push(`${file.originalFileName} is over 80 MB, so Togal did not take it.`);
          continue;
        }
        try {
          const uploaded = await this.rest.uploadFile(session, {
            setId,
            mime: pushMime(file.originalFileName, file.mimeType),
            bytes,
          });
          let pageIds: string[] = [];
          try {
            pageIds = await this.rest.createPages(session, { url: uploaded.url, setId, projectId });
          } catch (e) {
            warnings.push(e instanceof Error ? e.message : `${file.originalFileName} was stored but not opened as drawings`);
          }
          files.push({ attachmentId: row.id, fileId: uploaded.id, pageIds });
          sent.add(row.id);
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : `${file.originalFileName} was not sent to Togal`);
        }
      }
    } catch (e) {
      if (sessionRejected(e)) this.restSessionCache = null;
      if (e instanceof BadRequestException || e instanceof ServiceUnavailableException) throw e;
      throw this.wrap(e);
    }
    return {
      projectUrl,
      projectId,
      setId,
      organizationId: session.organizationId,
      sentAttachmentIds: [...sent],
      files,
      warning: warnings[0] ?? null,
    };
  }

  /** Delete the Togal copy of one attachment. No-op when that file was never pushed. */
  async removePushed(bidId: number, attachmentId: number): Promise<void> {
    const process = await this.processOf(bidId);
    const hit = process.togal.files.find((file) => file.attachmentId === attachmentId);
    if (!hit) return;
    await this.withSession(async (session) => {
      for (const pageId of hit.pageIds) {
        try {
          await this.rest.deletePage(session, pageId);
        } catch (e) {
          if (sessionRejected(e)) throw e;
          /* page may already be gone */
        }
      }
      try {
        await this.rest.deleteFile(session, hit.fileId);
      } catch (e) {
        if (sessionRejected(e)) throw e;
        const message = e instanceof Error ? e.message : '';
        if (!/404|not found|can ?not find/i.test(message)) throw e;
      }
    });
    process.togal.files = process.togal.files.filter((file) => file.attachmentId !== attachmentId);
    process.togal.sentAttachmentIds = process.togal.sentAttachmentIds.filter((id) => id !== attachmentId);
    const next = mergeProcess(process, {});
    await this.content.update({ bidId }, { processJson: JSON.stringify(next) });
  }

  private async captainFirstName(process: ReturnType<typeof parseProcess>): Promise<string | null> {
    const id = process.assignment.captainUserId;
    if (id) {
      const user = await this.users.findById(id);
      const first = user?.firstName?.trim();
      if (first) return first;
    }
    const label = process.assignment.captain?.trim();
    return label ? label.split(/\s+/)[0] ?? null : null;
  }

  /** One fresh login if Togal dropped the cached session. A new login elsewhere invalidates it. */
  private async withSession<T>(run: (session: TogalSession) => Promise<T>): Promise<T> {
    try {
      return await run(await this.restSession());
    } catch (e) {
      if (!sessionRejected(e)) throw e;
      this.restSessionCache = null;
      return await run(await this.restSession());
    }
  }

  private async restSession(): Promise<TogalSession> {
    const email = this.config.get<string>('TOGAL_EMAIL', '')?.trim() ?? '';
    const password = this.config.get<string>('TOGAL_PASSWORD', '') ?? '';
    if (!email || !password) {
      throw new ServiceUnavailableException('Togal login is not configured');
    }
    if (this.restSessionCache && Date.now() - this.restSessionCache.at < 6 * 60 * 60 * 1000) {
      return this.restSessionCache.value;
    }
    try {
      const value = await this.rest.login(email, password);
      this.restSessionCache = { at: Date.now(), value };
      return value;
    } catch (e) {
      throw this.wrap(e);
    }
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
