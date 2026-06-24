import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Shared uploaded file metadata; bytes live on disk under UPLOAD_ROOT. */
@Entity({ name: 'App_Files' })
export class AppFile {
  @PrimaryGeneratedColumn({ name: 'FileId' })
  id!: number;

  /** Path relative to UPLOAD_ROOT (e.g. bidding/12/uuid.jpg). */
  @Column({ name: 'StoragePath', type: 'nvarchar', length: 500 })
  storagePath!: string;

  @Column({ name: 'OriginalFileName', type: 'nvarchar', length: 255 })
  originalFileName!: string;

  @Column({ name: 'MimeType', type: 'nvarchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'SizeBytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'UploadedByUserId', type: 'int', nullable: true })
  uploadedByUserId!: number | null;

  @Column({ name: 'CreatedAt', type: 'datetime2', default: () => 'SYSUTCDATETIME()' })
  createdAt!: Date;

  @Column({ name: 'IsDeleted', type: 'bit', default: false })
  isDeleted!: boolean;
}
