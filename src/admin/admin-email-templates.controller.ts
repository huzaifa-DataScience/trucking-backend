import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { EmailTemplateService } from '../email/email-template.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { UpdateActiveEmailTemplateDto } from './dto/update-active-email-template.dto';

@Controller('admin/email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminEmailTemplatesController {
  constructor(private readonly emailTemplates: EmailTemplateService) {}

  /** List templates. If `purpose` is provided, filters to that purpose. */
  @Get()
  async list(@Query('purpose') purpose?: string) {
    return this.emailTemplates.listTemplates(purpose);
  }

  /** List known template purposes that are wired to email jobs in backend (for UI). */
  @Get('purposes')
  async purposes() {
    return { purposes: await this.emailTemplates.listKnownPurposes() };
  }

  /** Get the active template (single-active-per-purpose model). */
  @Get('active')
  async getActive(@Query('purpose') purpose: string) {
    return this.emailTemplates.getActiveTemplateByPurpose(purpose);
  }

  /** Update the active template for a purpose. Activate route is separate. */
  @Put('active')
  async updateActive(
    @Query('purpose') purpose: string,
    @Body() body: UpdateActiveEmailTemplateDto,
  ) {
    await this.emailTemplates.updateActiveTemplateByPurpose(purpose, body);
    return { message: 'Active template updated', template: await this.emailTemplates.getActiveTemplateByPurpose(purpose) };
  }

  /** Create a new template for a purpose. */
  @Post()
  async create(@Body() body: CreateEmailTemplateDto) {
    const created = await this.emailTemplates.createTemplate(body);
    return { message: 'Template created', template: created };
  }

  /** Update template (including purpose). */
  @Put(':templateKey')
  async update(
    @Param('templateKey') templateKey: string,
    @Body() body: UpdateEmailTemplateDto,
  ) {
    await this.emailTemplates.updateTemplate(templateKey, body);
    return { message: 'Template updated' };
  }

  /** Activate exactly one template for a purpose (enforces single-active pattern). */
  @Post(':templateKey/activate')
  async activate(@Param('templateKey') templateKey: string) {
    await this.emailTemplates.activateTemplate(templateKey);
    return { message: 'Template activated' };
  }

  @Delete(':templateKey')
  async remove(@Param('templateKey') templateKey: string) {
    await this.emailTemplates.deleteTemplate(templateKey);
    return { message: 'Template deleted' };
  }
}
