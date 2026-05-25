import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../database/entities';

/** Stored in App_Settings — when false, overdue PM emails are not sent (if env master is on). */
export const OVERDUE_EMAIL_SENDING_SETTING_KEY = 'overdue_email_sending_enabled';

/** When false, Siteline/Clearstory gap alert emails are not sent (if env master is on). */
export const SITELINE_CLEARSTORY_GAP_ALERT_SETTING_KEY =
  'siteline_clearstory_gap_alert_enabled';

@Injectable()
export class AppSettingsService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSettingsTable();
  }

  private async ensureSettingsTable(): Promise<void> {
    await this.repo.query(`
      IF OBJECT_ID('dbo.App_Settings', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.App_Settings (
          SettingKey nvarchar(100) NOT NULL PRIMARY KEY,
          SettingValue nvarchar(200) NOT NULL,
          UpdatedAt datetime2 NOT NULL CONSTRAINT DF_App_Settings_UpdatedAt DEFAULT SYSUTCDATETIME()
        );
      END
    `);
  }

  /** Admin/UI toggle only — default true when no row exists. */
  async getOverdueEmailSendingEnabled(): Promise<boolean> {
    const row = await this.repo.findOne({
      where: { settingKey: OVERDUE_EMAIL_SENDING_SETTING_KEY },
    });
    if (!row) return true;
    const v = row.settingValue.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  async setOverdueEmailSendingEnabled(enabled: boolean): Promise<void> {
    const value = enabled ? 'true' : 'false';
    const key = OVERDUE_EMAIL_SENDING_SETTING_KEY;
    const existing = await this.repo.findOne({ where: { settingKey: key } });
    if (existing) {
      existing.settingValue = value;
      existing.updatedAt = new Date();
      await this.repo.save(existing);
      return;
    }
    await this.repo.save(
      this.repo.create({
        settingKey: key,
        settingValue: value,
        updatedAt: new Date(),
      }),
    );
  }

  /** For admin API + dashboards: env master, DB toggle, and whether mail can actually fire. */
  async getOverdueEmailSendingStatus(): Promise<{
    envMasterEnabled: boolean;
    adminToggleEnabled: boolean;
    effectiveEnabled: boolean;
  }> {
    const envMaster = this.config.get<string>('OVERDUE_EMAIL_ENABLED', 'false') === 'true';
    const adminToggleEnabled = await this.getOverdueEmailSendingEnabled();
    return {
      envMasterEnabled: envMaster,
      adminToggleEnabled,
      effectiveEnabled: envMaster && adminToggleEnabled,
    };
  }

  async getSitelineClearstoryGapAlertEnabled(): Promise<boolean> {
    const row = await this.repo.findOne({
      where: { settingKey: SITELINE_CLEARSTORY_GAP_ALERT_SETTING_KEY },
    });
    if (!row) return true;
    const v = row.settingValue.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  async setSitelineClearstoryGapAlertEnabled(enabled: boolean): Promise<void> {
    const value = enabled ? 'true' : 'false';
    const key = SITELINE_CLEARSTORY_GAP_ALERT_SETTING_KEY;
    const existing = await this.repo.findOne({ where: { settingKey: key } });
    if (existing) {
      existing.settingValue = value;
      existing.updatedAt = new Date();
      await this.repo.save(existing);
      return;
    }
    await this.repo.save(
      this.repo.create({
        settingKey: key,
        settingValue: value,
        updatedAt: new Date(),
      }),
    );
  }

  async getSitelineClearstoryGapAlertStatus(): Promise<{
    envMasterEnabled: boolean;
    adminToggleEnabled: boolean;
    effectiveEnabled: boolean;
    recipientTo: string;
  }> {
    const envMaster =
      this.config.get<string>('SITELINE_CLEARSTORY_GAP_ALERT_ENABLED', 'true') ===
      'true';
    const adminToggleEnabled = await this.getSitelineClearstoryGapAlertEnabled();
    const recipientTo =
      this.config
        .get<string>(
          'SITELINE_CLEARSTORY_GAP_ALERT_TO',
          'joannabelle.salalila@Goelservices.com',
        )
        .trim() || 'joannabelle.salalila@Goelservices.com';
    return {
      envMasterEnabled: envMaster,
      adminToggleEnabled,
      effectiveEnabled: envMaster && adminToggleEnabled,
      recipientTo,
    };
  }
}
