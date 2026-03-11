import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  // UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
// import { RolesGuard } from '../auth/guards';
// import { Roles } from '../auth/decorators';
import { Role, UserStatus } from '../database/entities';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';

@Controller('admin/users')
// Authorization disabled for now — uncomment to require admin role:
// @UseGuards(RolesGuard)
// @Roles(Role.Admin)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  async getUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: UserStatus | 'all',
    @Query('role') role?: Role | 'all',
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() admin?: User,
  ) {
    return this.adminService.getUsers(
      {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        status, 
        role,
        search, 
        startDate,
        endDate,
      },
      admin?.id ?? 0,
    );
  }

  @Post('bulk-approve')
  async bulkApprove(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin?: User,
  ) {
    const result = await this.adminService.bulkApprove(body.userIds ?? [], admin?.id ?? 0);
    return { message: `${result.successCount} users approved`, ...result };
  }

  @Post('bulk-reject')
  async bulkReject(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin?: User,
  ) {
    const result = await this.adminService.bulkReject(body.userIds ?? [], admin?.id ?? 0);
    return { message: `${result.successCount} users rejected`, ...result };
  }

  @Delete('bulk-delete')
  async bulkDelete(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin?: User,
  ) {
    const result = await this.adminService.bulkDelete(body.userIds ?? [], admin?.id ?? 0);
    return { message: `${result.successCount} users deleted`, ...result };
  }

  @Get(':id')
  async getUserById(@Param('id', ParseIntPipe) id: number) {
    const user = await this.adminService.getUserById(id);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  @Post(':id/approve')
  async approveUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin?: User,
  ) {
    const user = await this.adminService.approveUser(id, admin?.id ?? 0);
    return {
      message: 'User approved successfully',
      user: { id: user.id, email: user.email, status: user.status, role: user.role },
    };
  }

  @Post(':id/reject')
  async rejectUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin?: User,
  ) {
    const user = await this.adminService.rejectUser(id, admin?.id ?? 0);
    return {
      message: 'User signup rejected',
      user: { id: user.id, email: user.email, status: user.status },
    };
  }

  @Patch(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updates: { role?: Role; status?: UserStatus },
    @CurrentUser() admin?: User,
  ) {
    const user = await this.adminService.updateUser(id, updates, admin?.id ?? 0);
    return {
      message: 'User updated successfully',
      user: { id: user.id, email: user.email, role: user.role, status: user.status },
    };
  }

  @Delete(':id')
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin?: User,
  ) {
    await this.adminService.deleteUser(id, admin?.id ?? 0);
    return { message: 'User deleted successfully' };
  }
}
