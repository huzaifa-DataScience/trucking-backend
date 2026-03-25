import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../database/entities';
import { AppSettingsService } from './app-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
