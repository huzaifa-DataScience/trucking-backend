## Local vs. Windows Server Build & Run

This project is developed on a **Mac** and deployed to a **Windows server**. The code is the same, but you must run the **same build steps** in both places so `dist/main.js` exists for Node/PM2.

---

### 1. Build configuration (shared)

These files should be identical on **Mac and Windows**:

- `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "exclude": ["node_modules", "test", "dist", "scripts", "**/*spec.ts"]
}
```

- `package.json` scripts:

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json",
  "start": "node dist/main",
  "start:dev": "tsc -p tsconfig.build.json --watch",
  "start:debug": "node --inspect dist/main",
  "start:prod": "node dist/main",
  "seed": "ts-node src/database/seed/seed.ts",
  "add-status-columns": "ts-node scripts/add-status-columns.ts"
}
```

With this setup, **both** Mac and Windows will compile `src/main.ts` to `dist/main.js`.

---

### 2. Local development on Mac

From `/Users/apple/trucking`:

```bash
npm install

# One-time clean + build
rm -rf dist tsconfig.build.tsbuildinfo
npm run build

# Run from dist (dev or prod style)
npm run start:prod        # or: node dist/main
```

For quick edit/test cycles you can still use:

```bash
npm run start:dev   # tsc --watch (you still run node dist/main separately if needed)
```

But the simplest and most consistent way to check behavior is:

```bash
npm run build && npm run start:prod
```

---

### 3. Deployment on Windows server

On the server at `D:\Users\hahmad\trucking-backend`:

```cmd
cd D:\Users\hahmad\trucking-backend

REM Make sure code is up to date (git pull / copy from Mac)

npm install

REM Clean old output
rmdir /S /Q dist  2>nul
del tsconfig.build.tsbuildinfo  2>nul

REM Build
npm run build

REM Confirm dist/main.js exists
dir dist
```

You should see `main.js` under `dist`. Then start the backend:

```cmd
node dist\main.js
REM or via PM2:
pm2 start dist\main.js --name trucking-backend
```

Health check on the server:

```cmd
curl http://localhost:3000/health/ping
```

Expected: JSON like:

```json
{ "ok": true, "timestamp": "..." }
```

If you see an HTML 404 page, you are hitting the **frontend (Next.js)**, not this backend; make sure only the backend listens on that port, or use a different port for frontend vs backend.

---

### 4. Quick checklist when things break

1. **`dist/main.js` missing on Windows**
   - Run: `npm run build` in `D:\Users\hahmad\trucking-backend`
   - If `dist` is still empty, check `tsconfig*.json` and `package.json` match this doc.

2. **PM2 says “Script not found: dist\main.js”**
   - Build first (`npm run build`), then:  
     `pm2 start dist\main.js --name trucking-backend`

3. **`curl http://localhost:3000/health/ping` returns HTML**
   - Port 3000 is being served by **Next.js**, not Nest.
   - Either move backend to another port (e.g. 3001) or stop Next on that port.

4. **Frontend cannot reach backend**
   - Check `NEXT_PUBLIC_API_BASE_URL` in the frontend:
     - For server backend: `http://172.20.20.225:3000` (or `:3001` if you change the port).

