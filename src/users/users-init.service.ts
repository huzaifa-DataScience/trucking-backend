import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Read count from first row of a COUNT(*) query; driver-agnostic (any column name/casing). */
function getCount(rows: unknown[]): number {
  const row = rows?.[0];
  if (row === null || row === undefined || typeof row !== 'object') return 0;
  const val = Object.values(row as Record<string, unknown>)[0];
  return Number(val ?? 0);
}

/**
 * Ensures App_Users table exists on app startup.
 * This allows login/register to work even if seed hasn't been run.
 */
@Injectable()
export class UsersInitService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureUsersTable();
  }

  private async ensureUsersTable(): Promise<void> {
    try {
      // Step 1: Create table if it doesn't exist
      await this.dataSource.query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'App_Users')
        BEGIN
          CREATE TABLE dbo.App_Users (
            Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
            Email nvarchar(255) NOT NULL UNIQUE,
            PasswordHash nvarchar(255) NOT NULL,
            Role nvarchar(50) NOT NULL DEFAULT 'user',
            Status nvarchar(50) NOT NULL DEFAULT 'pending',
            CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),
            LastLoginAt datetime2 NULL
          );
        END
      `);

      // Step 2: Add Status column if it doesn't exist (separate query to avoid parse errors)
      const statusRows = await this.dataSource.query(`
        SELECT COUNT(*) as cnt
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'Status'
      `);
      const hasStatus = getCount(statusRows) > 0;
      
      if (!hasStatus) {
        await this.dataSource.query(`
          ALTER TABLE dbo.App_Users ADD Status nvarchar(50) NOT NULL DEFAULT 'pending'
        `);
        console.log('✅ Added Status column to App_Users table');
        
        // Set existing users to 'active' (backward compatibility)
        await this.dataSource.query(`
          UPDATE dbo.App_Users SET Status = 'active'
        `);
        console.log('✅ Set existing users to active status');
      }

      // Step 3: Add LastLoginAt column if it doesn't exist
      const lastLoginRows = await this.dataSource.query(`
        SELECT COUNT(*) as cnt
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'LastLoginAt'
      `);
      const hasLastLogin = getCount(lastLoginRows) > 0;
      
      if (!hasLastLogin) {
        await this.dataSource.query(`
          ALTER TABLE dbo.App_Users ADD LastLoginAt datetime2 NULL
        `);
        console.log('✅ Added LastLoginAt column to App_Users table');
      }

      // Step 4: Ensure admin users are active (Status exists after steps 1–2)
      await this.dataSource.query(`
        UPDATE dbo.App_Users SET Status = 'active' WHERE Role = 'admin' AND (Status IS NULL OR Status != 'active')
      `);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to ensure App_Users table:', msg);
      // Don't throw - allow app to start even if table creation fails
      // (might already exist or DB permissions issue)
    }
  }
}
