import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppEmailTemplate } from '../database/entities';
import { EmailTemplateService } from './email-template.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppEmailTemplate])],
  providers: [EmailTemplateService],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
