import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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

    const skip = (page - 1) * pageSize;
    qb.orderBy('u.createdAt', 'DESC').skip(skip).take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((u) => ({
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

  async updateUser(
    userId: number,
    updates: { role?: Role; status?: UserStatus },
    currentAdminId: number,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (
      userId === currentAdminId &&
      (updates.status === UserStatus.Inactive ||
        updates.status === UserStatus.Rejected)
    ) {
      throw new BadRequestException('Cannot deactivate or reject yourself');
    }
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.status !== undefined) {
      if (
        updates.status === UserStatus.Pending &&
        user.status !== UserStatus.Pending
      ) {
        throw new BadRequestException(
          'Cannot set status to pending for existing users',
        );
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
    if (!userIds?.length) return { successCount: 0, failedCount: 0 };
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
    });
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
    if (!userIds?.length) return { successCount: 0, failedCount: 0 };
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
    });
    let successCount = 0;
    for (const user of users) {
      if (user.id === currentAdminId) continue;
      if (user.status !== UserStatus.Rejected) {
        user.status = UserStatus.Rejected;
        await this.userRepo.save(user);
        successCount++;
      }
    }
    return { successCount, failedCount: userIds.length - successCount };
  }

  async bulkDelete(userIds: number[], currentAdminId: number) {
    if (!userIds?.length) return { successCount: 0, failedCount: 0 };
    const users = await this.userRepo.find({
      where: { id: In(userIds) },
    });
    const toDelete = users.filter((u) => u.id !== currentAdminId);
    await this.userRepo.remove(toDelete);
    return {
      successCount: toDelete.length,
      failedCount: userIds.length - toDelete.length,
    };
  }

  async getUserById(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
