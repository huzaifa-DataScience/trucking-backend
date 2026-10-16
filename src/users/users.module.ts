import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UsersService } from './users.service';
import { UsersInitService } from './users-init.service';
import { SessionRevocationService } from './session-revocation.service';

@Module({
  imports: [DatabaseModule],
  providers: [UsersService, UsersInitService, SessionRevocationService],
  exports: [UsersService, SessionRevocationService],
})
export class UsersModule {}
