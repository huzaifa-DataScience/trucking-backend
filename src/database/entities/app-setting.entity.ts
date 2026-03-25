import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Generic key/value settings for admin-togglable behavior (see AppSettingsService). */
@Entity({ name: 'App_Settings' })
export class AppSetting {
  @PrimaryColumn({ name: 'SettingKey', type: 'nvarchar', length: 100 })
  settingKey!: string;

  @Column({ name: 'SettingValue', type: 'nvarchar', length: 200 })
  settingValue!: string;

  @Column({ name: 'UpdatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  updatedAt!: Date;
}
