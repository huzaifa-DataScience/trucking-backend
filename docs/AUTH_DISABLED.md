# Auth Temporarily Disabled (Sign-In / Sign-Up)

Sign-in and sign-up have been **temporarily disabled**. The auth endpoints still respond but return a message instead of performing login/registration.

---

## Current behavior

| Endpoint            | Response |
|---------------------|----------|
| `POST /auth/login`  | `200` with `{ "message": "Sign-in is temporarily disabled. See AUTH_DISABLED.md to re-enable." }` |
| `POST /auth/register` | `201` with `{ "message": "Sign-up is temporarily disabled. See AUTH_DISABLED.md to re-enable." }` |
| `GET /auth/profile` | `200` with `{ "message": "Auth is temporarily disabled. See AUTH_DISABLED.md to re-enable." }` |

No JWT is issued. Other API routes that previously required a token are **not** globally protected in this codebase (there is no global `JwtAuthGuard`), so they remain callable without a token unless a specific controller adds a guard.

---

## How to re-enable sign-in / sign-up

1. **Open** `src/auth/auth.controller.ts`.

2. **Re-enable `login`:**
   - Remove the line:  
     `return { message: 'Sign-in is temporarily disabled. See AUTH_DISABLED.md to re-enable.' };`
   - Uncomment the line:  
     `// return this.authService.login(dto.email, dto.password);`

3. **Re-enable `register`:**
   - Remove the line:  
     `return { message: 'Sign-up is temporarily disabled. See AUTH_DISABLED.md to re-enable.' };`
   - Uncomment the line:  
     `// return this.authService.register(dto.email, dto.password, dto.confirmPassword);`

4. **Re-enable `profile`:**
   - Remove the line:  
     `return { message: 'Auth is temporarily disabled. See AUTH_DISABLED.md to re-enable.' };`
   - Uncomment the four lines that restore the real profile logic:
     ```ts
     // if (!user) return { message: 'Not authenticated (auth disabled or no token)' };
     // const permissions = await this.authService.getPermissionsForRole(user.role);
     // return this.authService.toLoginResult(user, permissions);
     ```
   - Remove the `@Public()` decorator from the `getProfile` method if you want the profile endpoint to require a valid JWT again (so unauthenticated requests get 401).

5. **Save the file** and restart the backend. Sign-in and sign-up will work again; the frontend can call `POST /auth/login` and `POST /auth/register` as before and use the returned `access_token` for `GET /auth/profile` and other protected routes (if you add guards).

---

## Optional: remove this file

After re-enabling auth, you can delete `AUTH_DISABLED.md` if you no longer need the instructions.
