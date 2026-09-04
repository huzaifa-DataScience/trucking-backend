import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RbacService } from './rbac.service';
import { User, UserStatus } from '../database/entities';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  ALLOWED_AVATAR_MIMES,
  FileStorageService,
  MAX_AVATAR_BYTES,
} from '../files/file-storage.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
  ) {}

  async register(
    email: string,
    password: string,
    confirmPassword?: string,
  ): Promise<{ access_token: string; user: LoginResult; message?: string }> {
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new BadRequestException('Password and confirmPassword do not match');
    }
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    // When REQUIRE_SIGNUP_APPROVAL=false, new users can log in immediately (status=active).
    // When true (default), new users need admin approval (status=pending).
    const requireApproval = this.config.get<string>('REQUIRE_SIGNUP_APPROVAL', 'true') === 'true';
    const defaults = await this.rbacService.getUserDefaults();
    const user = await this.usersService.create({
      email,
      password,
      role: defaults.role as User['role'],
      status: requireApproval ? UserStatus.Pending : UserStatus.Active,
    });

    const permissions = await this.rbacService.getPermissionNamesForRole(user.role);
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, permissions };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: this.toLoginResult(user, permissions),
      message: requireApproval
        ? 'Account created successfully. Your account is pending admin approval.'
        : 'Account created successfully. You can log in now.',
    };
  }

  async login(email: string, password: string): Promise<{ access_token: string; user: LoginResult }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    
    // Check if user is approved/active - block login for pending/rejected/inactive users
    if (user.status !== UserStatus.Active) {
      if (user.status === UserStatus.Pending) {
        throw new UnauthorizedException('Your account is pending admin approval. Please wait for approval before logging in.');
      } else if (user.status === UserStatus.Rejected) {
        throw new UnauthorizedException('Your account signup was rejected. Please contact an administrator.');
      } else if (user.status === UserStatus.Inactive) {
        throw new UnauthorizedException('Your account has been deactivated. Please contact an administrator.');
      }
      throw new UnauthorizedException('Your account is not active. Please contact an administrator.');
    }
    
    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    const permissions = await this.rbacService.getPermissionNamesForRole(user.role);
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, permissions };
    const access_token = await this.jwtService.signAsync(payload);
    return {
      access_token,
      user: this.toLoginResult(user, permissions),
    };
  }

  /** Used by GET /auth/profile to include permissions in response. */
  async getPermissionsForRole(roleName: string): Promise<string[]> {
    return this.rbacService.getPermissionNamesForRole(roleName);
  }

  toLoginResult(user: User, permissions?: string[]): LoginResult {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      permissions: permissions ?? [],
      avatarUrl: user.avatarPath ? `/auth/avatar/${user.id}` : null,
    };
  }

  async uploadAvatar(userId: number, file?: Express.Multer.File): Promise<LoginResult> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded (field name: file)');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeException(`Image exceeds ${MAX_AVATAR_BYTES} bytes`);
    }
    const mimeType = file.mimetype?.trim() || '';
    if (!ALLOWED_AVATAR_MIMES[mimeType]) {
      throw new BadRequestException(
        `Unsupported image type: ${mimeType || 'unknown'}. Allowed: JPEG, PNG, WebP`,
      );
    }

    const previousPath = user.avatarPath;
    const { storagePath } = await this.storage.writeAvatarFile(
      userId,
      file.buffer,
      file.originalname,
      mimeType,
    );
    await this.usersService.setAvatarPath(userId, storagePath);
    if (previousPath) {
      await this.storage.deleteFile(previousPath);
    }

    const permissions = await this.getPermissionsForRole(user.role);
    return this.toLoginResult({ ...user, avatarPath: storagePath }, permissions);
  }

  async deleteAvatar(userId: number): Promise<LoginResult> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.avatarPath) {
      await this.storage.deleteFile(user.avatarPath);
      await this.usersService.setAvatarPath(userId, null);
    }
    const permissions = await this.getPermissionsForRole(user.role);
    return this.toLoginResult({ ...user, avatarPath: null }, permissions);
  }

  async getAvatarPath(userId: number): Promise<string | null> {
    const user = await this.usersService.findById(userId);
    return user?.avatarPath ?? null;
  }

  openAvatarStream(relativePath: string) {
    return this.storage.openReadStream(relativePath);
  }
}

export interface LoginResult {
  id: number;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  avatarUrl: string | null;
}
