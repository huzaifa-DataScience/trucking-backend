"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const typeorm_1 = require("typeorm");
const app_module_1 = require("../src/app.module");
async function run() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    const dataSource = app.get(typeorm_1.DataSource);
    try {
        const statusRows = await dataSource.query(`
      SELECT COUNT(*) as cnt
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'Status'
    `);
        const statusCount = Number(Object.values(statusRows[0] ?? {})[0] ?? 0);
        if (statusCount === 0) {
            await dataSource.query(`
        ALTER TABLE dbo.App_Users ADD Status nvarchar(50) NOT NULL DEFAULT 'pending'
      `);
            console.log('Added Status column.');
            await dataSource.query(`UPDATE dbo.App_Users SET Status = 'active'`);
            console.log('Set existing users to active.');
        }
        else {
            console.log('Status column already exists.');
        }
        const lastLoginRows = await dataSource.query(`
      SELECT COUNT(*) as cnt
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.App_Users') AND name = 'LastLoginAt'
    `);
        const lastLoginCount = Number(Object.values(lastLoginRows[0] ?? {})[0] ?? 0);
        if (lastLoginCount === 0) {
            await dataSource.query(`
        ALTER TABLE dbo.App_Users ADD LastLoginAt datetime2 NULL
      `);
            console.log('Added LastLoginAt column.');
        }
        else {
            console.log('LastLoginAt column already exists.');
        }
        await dataSource.query(`
      UPDATE dbo.App_Users SET Status = 'active' WHERE Role = 'admin' AND (Status IS NULL OR Status != 'active')
    `);
        console.log('Admins set to active.');
        console.log('Migration done.');
    }
    finally {
        await app.close();
    }
    process.exit(0);
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=add-status-columns.js.map