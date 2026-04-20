import { Module } from '@nestjs/common';
import { ClearstoryMockController } from './clearstory-mock.controller';
import { ClearstoryMockService } from './clearstory-mock.service';

@Module({
  controllers: [ClearstoryMockController],
  providers: [ClearstoryMockService],
})
export class ClearstoryMockModule {}

