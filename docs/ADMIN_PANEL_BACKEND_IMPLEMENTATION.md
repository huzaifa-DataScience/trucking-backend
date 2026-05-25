# Admin Panel - Backend Implementation Guide

This document describes the **backend implementation** required to support the Admin Panel frontend (see `ADMIN_PANEL_SPEC.md`).

---

## 🔧 Required Database Changes

### 1. Add `Status` Field to User Entity

**Current:** User entity only has `role` (user/admin).

**Required:** Add `status` field to track user approval state.

**Update `src/database/entities/user.entity.ts`:**

```typescript
export enum UserStatus {
  Pending = 'pending',    // New signup, awaiting approval
  Active = 'active',      // Approved and active
  Inactive = 'inactive',  // Admin deactivated
  Rejected = 'rejected', // Signup rejected
}

@Entity('App_Users', { schema: 'dbo' })
export class User {
  // ... existing fields ...
  
  @Column({ 
    name: 'Status', 
    type: 'nvarchar', 
    length: 50, 
    default: UserStatus.Pending  // New signups default to pending
  })
  status: UserStatus;
  
  @Column({ name: 'LastLoginAt', type: 'datetime2', nullable: true })
  lastLoginAt: Date | null;
}
```

**Migration SQL (run manually or via migration):**

```sql
ALTER TABLE dbo.App_Users
ADD Status nvarchar(50) NOT NULL DEFAULT 'pending';

ALTER TABLE dbo.App_Users
ADD LastLoginAt datetime2 NULL;
```

**Update seed:** Set admin user status to `'active'`:

```typescript
await this.usersService.create({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  role: Role.Admin,
  status: UserStatus.Active, // Admin is active by default
});
```

---

## 📡 Admin Endpoints Implementation

### Module Structure

Create `src/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

**Add to `src/app.module.ts`:**

```typescript
imports: [
  // ... existing modules ...
  AdminModule,
]
```

---

### Service: `src/admin/admin.service.ts`

```typescript
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus, Role } from '../database/entities';

export interface AdminUsersQuery {
  page?: number;
  pageSize?: number;
  status?: UserStatus | 'all';
  role?: Role | 'all';
  search?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getUsers(query: AdminUsersQuery, currentAdminId: number) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 25);
    
    const qb = this.userRepo.createQueryBuilder('u');
    
    // Filters
    if (query.status && query.status !== 'all') {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    
    if (query.role && query.role !== 'all') {
      qb.andWhere('u.role = :role', { role: query.role });
    }
    
    if (query.search) {
      qb.andWhere('u.email LIKE :search', { search: `%${query.search}%` });
    }
    
    if (query.startDate) {
      qb.andWhere('u.createdAt >= :startDate', { startDate: query.startDate });
    }
    
    if (query.endDate) {
      qb.andWhere('u.createdAt <= :endDate', { endDate: query.endDate });
    }
    
    // Pagination
    const skip = (page - 1) * pageSize;
    qb.skip(skip).take(pageSize);
    
    // Sort
    qb.orderBy('u.createdAt', 'DESC');
    
    const [items, total] = await qb.getManyAndCount();
    
    return {
      items: items.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      page,
      pageSize,
      total,
    };
  }

  async approveUser(userId: number, currentAdminId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    if (user.status === UserStatus.Active) {
      throw new BadRequestException('User is already active');
    }
    
    user.status = UserStatus.Active;
    return this.userRepo.save(user);
  }

  async rejectUser(userId: number, currentAdminId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    if (user.status === UserStatus.Rejected) {
      throw new BadRequestException('User is already rejected');
    }
    
    user.status = UserStatus.Rejected;
    return this.userRepo.save(user);
  }

  async updateUser(userId: number, updates: { role?: Role; status?: UserStatus }, currentAdminId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    // Prevent self-deletion/deactivation
    if (userId === currentAdminId && (updates.status === UserStatus.Inactive || updates.status === UserStatus.Rejected)) {
      throw new BadRequestException('Cannot deactivate or reject yourself');
    }
    
    if (updates.role !== undefined) {
      user.role = updates.role;
    }
    
    if (updates.status !== undefined) {
      // Validation: cannot set status to pending if user was previously active/rejected
      if (updates.status === UserStatus.Pending && user.status !== UserStatus.Pending) {
        throw new BadRequestException('Cannot set status to pending for existing users');
      }
      user.status = updates.status;
    }
    
    return this.userRepo.save(user);
  }

  async deleteUser(userId: number, currentAdminId: number): Promise<void> {
    if (userId === currentAdminId) {
      throw new BadRequestException('Cannot delete yourself');
    }
    
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    
    await this.userRepo.remove(user);
  }

  async bulkApprove(userIds: number[], currentAdminId: number) {
    const users = await this.userRepo.findByIds(userIds);
    let successCount = 0;
    
    for (const user of users) {
      if (user.status !== UserStatus.Active) {
        user.status = UserStatus.Active;
        await this.userRepo.save(user);
        successCount++;
      }
    }
    
    return { successCount, failedCount: userIds.length - successCount };
  }

  async bulkReject(userIds: number[], currentAdminId: number) {
    const users = await this.userRepo.findByIds(userIds);
    let successCount = 0;
    
    for (const user of users) {
      if (user.id === currentAdminId) continue; // Skip self
      if (user.status !== UserStatus.Rejected) {
        user.status = UserStatus.Rejected;
        await this.userRepo.save(user);
        successCount++;
      }
    }
    
    return { successCount, failedCount: userIds.length - successCount };
  }

  async bulkDelete(userIds: number[], currentAdminId: number) {
    const users = await this.userRepo.findByIds(userIds);
    const toDelete = users.filter(u => u.id !== currentAdminId);
    
    await this.userRepo.remove(toDelete);
    
    return { 
      successCount: toDelete.length, 
      failedCount: userIds.length - toDelete.length 
    };
  }

  async getUserById(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
```

---

### Controller: `src/admin/admin.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { Role, UserStatus } from '../database/entities';
import { CurrentUser } from '../auth/decorators';
import { User } from '../database/entities';

@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(Role.Admin)
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
    @CurrentUser() admin: User,
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
      admin.id,
    );
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
    @CurrentUser() admin: User,
  ) {
    const user = await this.adminService.approveUser(id, admin.id);
    return {
      message: 'User approved successfully',
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        role: user.role,
      },
    };
  }

  @Post(':id/reject')
  async rejectUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: User,
  ) {
    const user = await this.adminService.rejectUser(id, admin.id);
    return {
      message: 'User signup rejected',
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
      },
    };
  }

  @Patch(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() updates: { role?: Role; status?: UserStatus },
    @CurrentUser() admin: User,
  ) {
    const user = await this.adminService.updateUser(id, updates, admin.id);
    return {
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }

  @Delete(':id')
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: User,
  ) {
    await this.adminService.deleteUser(id, admin.id);
    return { message: 'User deleted successfully' };
  }

  @Post('bulk-approve')
  async bulkApprove(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin: User,
  ) {
    const result = await this.adminService.bulkApprove(body.userIds, admin.id);
    return {
      message: `${result.successCount} users approved`,
      ...result,
    };
  }

  @Post('bulk-reject')
  async bulkReject(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin: User,
  ) {
    const result = await this.adminService.bulkReject(body.userIds, admin.id);
    return {
      message: `${result.successCount} users rejected`,
      ...result,
    };
  }

  @Delete('bulk-delete')
  async bulkDelete(
    @Body() body: { userIds: number[] },
    @CurrentUser() admin: User,
  ) {
    const result = await this.adminService.bulkDelete(body.userIds, admin.id);
    return {
      message: `${result.successCount} users deleted`,
      ...result,
    };
  }
}
```

---

## 🔐 Update Auth Service

### Modify Login to Check Status

**Update `src/auth/auth.service.ts`:**

```typescript
async login(email: string, password: string): Promise<{ access_token: string; user: LoginResult }> {
  const user = await this.usersService.findByEmail(email);
  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }
  
  // Check if user is approved/active
  if (user.status !== UserStatus.Active) {
    throw new UnauthorizedException('Your account is pending approval or has been deactivated');
  }
  
  const valid = await this.usersService.validatePassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedException('Invalid email or password');
  }
  
  // Update last login
  user.lastLoginAt = new Date();
  await this.usersService.updateLastLogin(user.id);
  
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const access_token = await this.jwtService.signAsync(payload);
  return {
    access_token,
    user: this.toLoginResult(user),
  };
}
```

**Add to `src/users/users.service.ts`:**

```typescript
async updateLastLogin(userId: number): Promise<void> {
  await this.userRepo.update(userId, { lastLoginAt: new Date() });
}
```

---

## 📝 Update Register to Set Status

**Update `src/auth/auth.service.ts` register method:**

```typescript
async register(email: string, password: string, confirmPassword?: string): Promise<{ access_token: string; user: LoginResult }> {
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new BadRequestException('Password and confirmPassword do not match');
  }
  const existing = await this.usersService.findByEmail(email);
  if (existing) {
    throw new ConflictException('An account with this email already exists');
  }
  
  // New signups default to 'pending' status
  const user = await this.usersService.create({ 
    email, 
    password, 
    role: undefined, // defaults to Role.User
    status: UserStatus.Pending, // New signups need approval
  });
  
  // Don't return token - user needs approval first
  // Or return token but frontend checks status and shows "pending approval" message
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const access_token = await this.jwtService.signAsync(payload);
  return {
    access_token,
    user: this.toLoginResult(user),
  };
}
```

**Update `src/users/users.service.ts` create method:**

```typescript
async create(data: { 
  email: string; 
  password: string; 
  role?: Role;
  status?: UserStatus;
}): Promise<User> {
  const email = data.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = this.userRepo.create({
    email,
    passwordHash,
    role: data.role ?? Role.User,
    status: data.status ?? UserStatus.Pending, // Default to pending
  });
  return this.userRepo.save(user);
}
```

---

## ✅ Summary

**Backend Changes Required:**

1. ✅ Add `status` and `lastLoginAt` fields to User entity
2. ✅ Create `AdminModule`, `AdminService`, `AdminController`
3. ✅ Implement all admin endpoints (list, approve, reject, update, delete, bulk)
4. ✅ Update login to check `status === 'active'`
5. ✅ Update register to set `status = 'pending'`
6. ✅ Update seed to set admin status to `'active'`

**Security:**
- All admin endpoints use `@Roles(Role.Admin)` guard
- Prevent self-deletion/deactivation
- Validate status transitions

**Testing:**
- Test approve/reject workflow
- Test bulk operations
- Test login with pending/rejected users (should fail)
- Test admin-only access (non-admin gets 403)
