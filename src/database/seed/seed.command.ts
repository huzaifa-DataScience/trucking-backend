import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

async function runSeed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const seedService = app.select(SeedModule).get(SeedService);
  
  try {
    await seedService.seed();
    console.log('✅ Seed completed successfully!');
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    await app.close();
    process.exit(1);
  }
}

runSeed();
