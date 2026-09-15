/**
 * One-off: create or promote a user to super_admin, active status.
 * Usage: npx ts-node scripts/create-super-admin.ts <email> [password]
 * If the user already exists, role/status are updated and the password is left untouched
 * unless a password argument is given.
 */
import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { Role, UserStatus } from '../src/database/entities';

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/create-super-admin.ts <email> [password]');
    process.exit(1);
  }
  const providedPassword = process.argv[3];
  const generatedPassword = crypto.randomBytes(9).toString('base64url');
  const password = providedPassword ?? generatedPassword;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const usersService = app.get(UsersService);

  try {
    const existing = await usersService.findByEmail(email);
    if (existing) {
      existing.role = Role.SuperAdmin;
      existing.status = UserStatus.Active;
      if (providedPassword) {
        const bcrypt = await import('bcrypt');
        existing.passwordHash = await bcrypt.hash(providedPassword, 10);
      }
      await usersService['userRepo'].save(existing);
      console.log(`Updated existing user "${email}" to super_admin (active).`);
      if (providedPassword) console.log('Password updated.');
    } else {
      await usersService.create({
        email,
        password,
        role: Role.SuperAdmin,
        status: UserStatus.Active,
      });
      console.log(`Created super_admin user "${email}".`);
      if (!providedPassword) {
        console.log(`Generated password: ${password}`);
        console.log('Please log in and change this password.');
      }
    }
  } finally {
    await app.close();
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
