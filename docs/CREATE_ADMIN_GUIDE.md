# How to Create Admin Users

Since signups default to `pending` status and need approval, you need **direct methods** to create admin users. Here are all the ways:

---

## Method 1: Via Seed (Recommended for First Admin)

**Current:** Seed already creates the first admin.

**Run seed:**
```bash
npm run seed
# OR
POST /seed
```

**Creates:**
- Email: `admin@example.com`
- Password: `Admin123!`
- Role: `admin`
- Status: `active` (after you update seed to set status)

**Note:** After implementing the status field, update seed to set `status: UserStatus.Active` for the admin.

---

## Method 2: Direct SQL (Quick & Simple)

**Connect to your SQL Server database and run:**

```sql
-- Hash password: "YourPassword123!" (use bcrypt online tool or Node.js)
-- Example hash (DO NOT USE THIS - generate your own):
-- $2b$10$YourBcryptHashHere...

INSERT INTO dbo.App_Users (Email, PasswordHash, Role, Status, CreatedAt)
VALUES (
  'admin@yourcompany.com',
  '$2b$10$YourBcryptHashHere...',  -- Replace with actual bcrypt hash
  'admin',
  'active',
  GETUTCDATE()
);
```

**To generate bcrypt hash:**
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YourPassword123!', 10).then(h => console.log(h))"
```

---

## Method 3: NestJS CLI Command (Best Practice)

Create a CLI command to create admins from terminal.

**Create `src/admin/commands/create-admin.command.ts`:**

```typescript
import { Command, CommandRunner } from 'nest-commander';
import { UsersService } from '../../users/users.service';
import { Role, UserStatus } from '../../database/entities';

@Command({ name: 'create-admin', arguments: '<email> <password>' })
export class CreateAdminCommand extends CommandRunner {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [email, password] = passedParams;
    
    if (!email || !password) {
      console.error('Usage: npm run create-admin <email> <password>');
      process.exit(1);
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      console.error(`User ${email} already exists!`);
      process.exit(1);
    }

    const user = await this.usersService.create({
      email,
      password,
      role: Role.Admin,
      status: UserStatus.Active,
    });

    console.log(`✅ Admin created successfully!`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status}`);
  }
}
```

**Register in `src/admin/admin.module.ts`:**

```typescript
import { CreateAdminCommand } from './commands/create-admin.command';

@Module({
  // ... existing code ...
  providers: [AdminService, CreateAdminCommand],
})
export class AdminModule {}
```

**Add to `package.json`:**

```json
{
  "scripts": {
    "create-admin": "nest start -- --command create-admin"
  }
}
```

**Usage:**
```bash
npm run create-admin admin@company.com "SecurePassword123!"
```

---

## Method 4: One-Time Setup Endpoint (For First Admin Only)

Create a special endpoint that only works if **no admins exist yet**.

**Add to `src/auth/auth.controller.ts`:**

```typescript
@Public()
@Post('setup-admin')
async setupAdmin(@Body() dto: { email: string; password: string }) {
  return this.authService.setupFirstAdmin(dto.email, dto.password);
}
```

**Add to `src/auth/auth.service.ts`:**

```typescript
async setupFirstAdmin(email: string, password: string) {
  // Check if any admin exists
  const existingAdmin = await this.usersService.findByRole(Role.Admin);
  if (existingAdmin.length > 0) {
    throw new ForbiddenException('Admin setup is only allowed when no admins exist');
  }

  const user = await this.usersService.create({
    email,
    password,
    role: Role.Admin,
    status: UserStatus.Active,
  });

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const access_token = await this.jwtService.signAsync(payload);
  
  return {
    access_token,
    user: this.toLoginResult(user),
    message: 'First admin created successfully',
  };
}
```

**Add to `src/users/users.service.ts`:**

```typescript
async findByRole(role: Role): Promise<User[]> {
  return this.userRepo.find({ where: { role } });
}
```

**Usage (only works if no admins exist):**
```bash
POST /auth/setup-admin
{
  "email": "admin@company.com",
  "password": "SecurePassword123!"
}
```

**Security:** This endpoint becomes useless once first admin exists (good for security).

---

## Method 5: Via Admin Panel (After First Admin Exists)

Once you have **one admin**, that admin can create more admins via the admin panel:

1. Login as admin
2. Go to `/admin/users`
3. Click `[Create User]` button (add this to admin panel)
4. Fill form: Email, Password, Role = Admin, Status = Active
5. Save

**Add to admin panel spec:**
- `POST /admin/users` endpoint for creating users
- Admin can set role and status during creation

---

## Method 6: Promote Existing User to Admin

If you have an active user, promote them to admin:

**Via Admin Panel:**
1. Login as admin
2. Find user in `/admin/users`
3. Click `[Edit]`
4. Change Role: `user` → `admin`
5. Save

**Via SQL:**
```sql
UPDATE dbo.App_Users
SET Role = 'admin'
WHERE Email = 'existinguser@company.com';
```

---

## 📋 Recommended Workflow

### For Development:
1. **First time:** Use seed (`npm run seed`) → creates `admin@example.com`
2. **Additional admins:** Use CLI command (`npm run create-admin`)

### For Production:
1. **First admin:** Use setup endpoint (`POST /auth/setup-admin`) **once**
2. **Additional admins:** Use admin panel (after first admin exists)
3. **Emergency:** Use direct SQL (if admin panel is down)

---

## 🔒 Security Notes

1. **Setup endpoint:** Only works when no admins exist (one-time use)
2. **CLI command:** Requires server access (secure)
3. **Admin panel:** Requires existing admin (most secure for ongoing use)
4. **Direct SQL:** Use only in emergencies (bypasses all validation)

**Best Practice:** Use admin panel for creating admins after initial setup.

---

## ✅ Quick Reference

| Method | When to Use | Security Level |
|--------|-------------|----------------|
| Seed | Development, first admin | ⭐⭐ |
| Setup Endpoint | Production, first admin only | ⭐⭐⭐ |
| CLI Command | Development, server access | ⭐⭐⭐ |
| Admin Panel | After first admin exists | ⭐⭐⭐⭐ |
| Direct SQL | Emergency only | ⭐ |

---

## 🚀 Implementation Priority

1. ✅ **Seed** (already works) - Update to set `status: 'active'`
2. ✅ **Admin Panel** (after implementing admin endpoints) - Add "Create User" feature
3. ⚠️ **CLI Command** (optional) - Nice to have for devs
4. ⚠️ **Setup Endpoint** (optional) - Good for production first-time setup
