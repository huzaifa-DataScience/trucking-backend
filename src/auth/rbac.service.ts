import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppRole } from '../database/entities';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(AppRole)
    private readonly roleRepo: Repository<AppRole>,
  ) {}

  /** Get permission names for a role (e.g. 'admin', 'user'). Used at login to fill JWT. */
  async getPermissionNamesForRole(roleName: string): Promise<string[]> {
    const role = await this.roleRepo.findOne({
      where: { name: roleName },
      relations: ['permissions'],
    });
    if (!role?.permissions?.length) return [];
    return role.permissions.map((p) => p.name);
  }
}
