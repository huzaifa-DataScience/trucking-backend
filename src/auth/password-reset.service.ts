import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { SessionRevocationService } from '../users/session-revocation.service';
import { OutboundEmailService } from '../email/outbound-email.service';
import { UserStatus } from '../database/entities';

/** How long a reset link works. */
const TOKEN_TTL_MINUTES = 30;
/** Ignore repeat requests for the same account within this window (limits email spam). */
const RESEND_COOLDOWN_SECONDS = 60;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Forgot-password flow: emails a one-time, 30-minute link and sets the new password from it.
 * Only a SHA-256 hash of each token is stored, so the table can't be used to reset accounts.
 */
@Injectable()
export class PasswordResetService implements OnModuleInit {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly sessions: SessionRevocationService,
    private readonly email: OutboundEmailService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Auth_PasswordResetTokens', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Auth_PasswordResetTokens (
          Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
          UserId int NOT NULL,
          TokenHash nvarchar(64) NOT NULL,
          ExpiresAt datetime2 NOT NULL,
          UsedAt datetime2 NULL,
          CreatedAt datetime2 NOT NULL CONSTRAINT DF_Auth_PasswordResetTokens_CreatedAt DEFAULT SYSUTCDATETIME(),
          RequestIp nvarchar(64) NULL
        );
        CREATE UNIQUE INDEX UX_Auth_PasswordResetTokens_TokenHash ON dbo.Auth_PasswordResetTokens (TokenHash);
        CREATE INDEX IX_Auth_PasswordResetTokens_UserId ON dbo.Auth_PasswordResetTokens (UserId, CreatedAt DESC);
      END
    `);
  }

  /**
   * Always resolves the same way whether or not the email has an account, so the response
   * can't be used to find out who is registered. Problems are logged, not returned.
   */
  async requestReset(rawEmail: string, requestIp?: string): Promise<void> {
    const user = await this.usersService.findByEmail(rawEmail);
    if (!user) return;
    if (user.status === UserStatus.Rejected || user.status === UserStatus.Inactive) return;

    const recent: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS n FROM dbo.Auth_PasswordResetTokens
       WHERE UserId = @0 AND CreatedAt > DATEADD(second, -${RESEND_COOLDOWN_SECONDS}, SYSUTCDATETIME())`,
      [user.id],
    );
    if (Number(recent[0]?.n) > 0) return;

    const baseUrl = this.frontendBaseUrl();
    if (!baseUrl) {
      this.logger.error('Password reset requested but APP_PUBLIC_URL / APP_DASHBOARD_URL is not set; no email sent.');
      return;
    }
    if (!this.email.isConfigured()) {
      this.logger.error('Password reset requested but outbound email is not configured; no email sent.');
      return;
    }

    const token = randomBytes(32).toString('base64url');
    // Only one live link per account: older unused links stop working.
    await this.dataSource.query(
      `UPDATE dbo.Auth_PasswordResetTokens SET UsedAt = SYSUTCDATETIME() WHERE UserId = @0 AND UsedAt IS NULL`,
      [user.id],
    );
    await this.dataSource.query(
      `INSERT INTO dbo.Auth_PasswordResetTokens (UserId, TokenHash, ExpiresAt, RequestIp)
       VALUES (@0, @1, DATEADD(minute, ${TOKEN_TTL_MINUTES}, SYSUTCDATETIME()), @2)`,
      [user.id, sha256(token), (requestIp ?? '').slice(0, 64) || null],
    );

    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const name = user.firstName?.trim() || 'there';
    try {
      await this.email.send({
        to: user.email,
        subject: 'Reset your password',
        text:
          `Hi ${name},\n\nSomeone asked to reset the password for your account (${user.email}).\n` +
          `Set a new password here (the link works for ${TOKEN_TTL_MINUTES} minutes and only once):\n\n${link}\n\n` +
          `If you didn't ask for this, you can ignore this email. Your password won't change.`,
        html: this.emailHtml(name, user.email, link),
      });
    } catch (e) {
      this.logger.error(`Password reset email to user ${user.id} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Sets the new password if the link is valid, unused and not expired; the link is used up either way it succeeds. */
  async resetPassword(token: string, password: string): Promise<void> {
    const rows: { Id: number; UserId: number }[] = await this.dataSource.query(
      `SELECT TOP 1 Id, UserId FROM dbo.Auth_PasswordResetTokens
       WHERE TokenHash = @0 AND UsedAt IS NULL AND ExpiresAt > SYSUTCDATETIME()`,
      [sha256(token.trim())],
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    }
    const user = await this.usersService.findById(row.UserId);
    if (!user || user.status === UserStatus.Rejected || user.status === UserStatus.Inactive) {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    }
    await this.usersService.setPassword(user.id, password);
    // Everyone signed in as this user (including whoever may have the old password) is signed out.
    await this.sessions.revokeAll(user.id);
    await this.dataSource.query(
      `UPDATE dbo.Auth_PasswordResetTokens SET UsedAt = SYSUTCDATETIME() WHERE UserId = @0 AND UsedAt IS NULL`,
      [user.id],
    );
  }

  /** Frontend root for links: APP_PUBLIC_URL, else the origin of APP_DASHBOARD_URL. Never taken from the request. */
  private frontendBaseUrl(): string | null {
    const explicit = this.config.get<string>('APP_PUBLIC_URL', '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const dashboard = this.config.get<string>('APP_DASHBOARD_URL', '').trim();
    if (!dashboard) return null;
    try {
      return new URL(dashboard).origin;
    } catch {
      return null;
    }
  }

  private emailHtml(name: string, email: string, link: string): string {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#212121">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:28px">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#333333">Reset your password</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#374151">Hi ${esc(name)}, someone asked to reset the password for <strong>${esc(email)}</strong>.</p>
        <p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#1e88e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">Set a new password</a></p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280">The link works for ${TOKEN_TTL_MINUTES} minutes and only once.</p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }
}
