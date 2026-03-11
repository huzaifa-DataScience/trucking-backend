import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UsersService } from './users.service';
import { UsersInitService } from './users-init.service';

@Module({
  imports: [DatabaseModule],
  providers: [UsersService, UsersInitService],
  exports: [UsersService],
})
export class UsersModule {}
