import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppRole, Permission, AppSetting, Office, UserLocationPing, UserSignInLocation } from '../database/entities';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RbacService } from './rbac.service';
import { FileStorageService } from '../files/file-storage.service';
import { EmailTemplateModule } from '../email/email-template.module';
import { PasswordResetService } from './password-reset.service';
import { SignInLocationService } from './sign-in-location.service';
import { OfficeService } from './office.service';
import { OfficesController } from './offices.controller';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [
    UsersModule,
    EmailTemplateModule,
    TypeOrmModule.forFeature([AppRole, Permission, AppSetting, UserSignInLocation, Office, UserLocationPing]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, RbacService, FileStorageService, PasswordResetService, SignInLocationService, OfficeService, TrackingService],
  controllers: [AuthController, OfficesController, TrackingController],
  exports: [AuthService, RbacService],
})
export class AuthModule {}
