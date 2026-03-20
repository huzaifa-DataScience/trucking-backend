import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Admin-editable email templates (e.g. Siteline overdue lead PM alerts). */
@Entity({ name: 'App_EmailTemplates' })
export class AppEmailTemplate {
  @PrimaryColumn({ name: 'TemplateKey', type: 'nvarchar', length: 100 })
  templateKey!: string;

  // Template "purpose" (technical identifier) used to select the active template at runtime.
  // Example: "signup.pending", "password.reset", "siteline.overdue_leadpm", etc.
  @Column({ name: 'Purpose', type: 'nvarchar', length: 100, default: '' })
  purpose!: string;

  @Column({ name: 'Name', type: 'nvarchar', length: 200, nullable: true })
  name!: string | null;

  @Column({ name: 'SubjectTemplate', type: 'nvarchar', length: 500 })
  subjectTemplate!: string;

  /** HTML body; use placeholders {{leadPmName}}, {{daysThreshold}}, {{itemCount}}, {{itemsTableHtml}} */
  @Column({ name: 'BodyHtmlTemplate', type: 'text' })
  bodyHtmlTemplate!: string;

  @Column({ name: 'IsActive', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'ActivatedAt', type: 'datetime2', nullable: true })
  activatedAt!: Date | null;

  @Column({ name: 'UpdatedAt', type: 'datetime2' })
  updatedAt!: Date;
}
