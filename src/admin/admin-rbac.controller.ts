import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role } from '../database/entities';
import { RbacService } from '../auth/rbac.service';

class PatchRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class PatchRbacDefaultsDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminRbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('rbac')
  getMatrix() {
    return this.rbac.getMatrix();
  }

  @Get('permissions')
  getCatalog() {
    return { permissions: this.rbac.catalog().permissions };
  }

  @Patch('rbac/roles/:roleName')
  async patchRole(
    @Param('roleName') roleName: string,
    @Body() body: PatchRolePermissionsDto,
  ) {
    const permissions = await this.rbac.setRolePermissions(roleName, body.permissions ?? []);
    return { role: roleName, permissions };
  }

  @Get('settings/rbac-user-defaults')
  getDefaults() {
    return this.rbac.getUserDefaults();
  }

  @Patch('settings/rbac-user-defaults')
  patchDefaults(@Body() body: PatchRbacDefaultsDto) {
    return this.rbac.setUserDefaults(body);
  }
}
