import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Role, UserStatus } from '../database/entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

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
      status: data.status ?? UserStatus.Pending, // New signups default to pending
    });
    return this.userRepo.save(user);
  }

  async validatePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.userRepo.update(userId, { lastLoginAt: new Date() });
  }
}
