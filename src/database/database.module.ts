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
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const host = config.get('DB_HOST', 'localhost');
        const port = parseInt(config.get('DB_PORT', '1433'), 10);
        const username = config.get('DB_USERNAME', 'sa');
        const password = config.get('DB_PASSWORD', '');
        const database = config.get('DB_DATABASE', 'GoFormzDB');
        const encrypt = config.get('DB_ENCRYPT', 'true') === 'true';
        const trustCert = config.get('DB_TRUST_CERT', 'true') === 'true';

        console.log(`[DB Config] Connecting to ${host}:${port}, database: ${database}, user: ${username}`);

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
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
