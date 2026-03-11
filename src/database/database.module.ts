import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Driver,
  ExternalSite,
  Hauler,
  Job,
  Material,
  OurEntity,
  Photo,
  Ticket,
  TruckType,
  User,
  AppRole,
  Permission,
  SitelineContract,
  SitelinePayApp,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const host = config.get('DB_HOST', 'localhost');
        const port = parseInt(config.get('DB_PORT', '1433'), 10);
        const username = config.get('DB_USERNAME', 'sa');
        let password = config.get('DB_PASSWORD', '') ?? '';
        // In case .env quotes were kept as part of the value (would cause login to fail)
        if (password.length && (password.startsWith('"') || password.startsWith("'"))) {
          password = password.slice(1, -1);
        }
        const database = config.get('DB_DATABASE', 'GoFormzDB');
        const encrypt = config.get('DB_ENCRYPT', 'true') === 'true';
        const trustCert = config.get('DB_TRUST_CERT', 'true') === 'true';

        console.log(`[DB Config] Connecting to ${host}:${port}, database: ${database}, user: ${username}, passwordLength: ${password?.length ?? 0}`);

        return {
          type: 'mssql',
          host,
          port,
          username,
          password,
          database,
          options: {
            encrypt: encrypt,
            trustServerCertificate: trustCert,
            enableArithAbort: true,
            connectTimeout: 30000,
            requestTimeout: 30000,
          },
          connectionTimeout: 30000,
          requestTimeout: 30000,
          extra: {
            trustServerCertificate: trustCert,
          },
          entities: [
            Ticket,
            Photo,
            Job,
            Material,
            Hauler,
            ExternalSite,
            TruckType,
            Driver,
            OurEntity,
            User,
            AppRole,
            Permission,
            SitelineContract,
            SitelinePayApp,
          ],
          synchronize: false,
          logging: config.get('NODE_ENV') === 'development',
          retryAttempts: 3,
          retryDelay: 3000,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Ticket,
      Photo,
      Job,
      Material,
      Hauler,
      ExternalSite,
      TruckType,
      Driver,
      OurEntity,
      User,
      AppRole,
      Permission,
      SitelineContract,
      SitelinePayApp,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
