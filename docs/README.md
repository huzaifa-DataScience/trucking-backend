# Documentation

All project docs live in this folder. **`README.md` in the repo root** covers API setup and run commands.

## Auth & admin

| Doc | Description |
|-----|-------------|
| [AUTH.md](./AUTH.md) | Backend auth, JWT, admin guards |
| [AUTH_DISABLED.md](./AUTH_DISABLED.md) | Temporarily disable login (dev) |
| [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) | Frontend login/signup flow |
| [FRONTEND_RBAC.md](./FRONTEND_RBAC.md) | Roles & permissions |
| [CREATE_ADMIN_GUIDE.md](./CREATE_ADMIN_GUIDE.md) | Create first admin user |
| [ADMIN_PANEL_SPEC.md](./ADMIN_PANEL_SPEC.md) | Admin panel UI spec |
| [ADMIN_PANEL_BACKEND_IMPLEMENTATION.md](./ADMIN_PANEL_BACKEND_IMPLEMENTATION.md) | Admin backend implementation |
| [ADMIN_EMAIL_TEMPLATES.md](./ADMIN_EMAIL_TEMPLATES.md) | Email template admin |
| [ADMIN_OVERDUE_EMAIL_TEMPLATE.md](./ADMIN_OVERDUE_EMAIL_TEMPLATE.md) | Overdue email template |

## API & frontend guides

| Doc | Description |
|-----|-------------|
| [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md) | API endpoints for frontend |
| [BACKEND_API_SPEC.md](./BACKEND_API_SPEC.md) | API specification |
| [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md) | What the backend exposes |
| [BACKEND_VS_SPEC.md](./BACKEND_VS_SPEC.md) | Spec vs implementation |
| [BACKEND_COMPLIANCE_VERIFICATION.md](./BACKEND_COMPLIANCE_VERIFICATION.md) | Compliance checklist verification |
| [SPEC_COMPLIANCE_CHECKLIST.md](./SPEC_COMPLIANCE_CHECKLIST.md) | Frontend spec checklist |
| [FRONTEND_COMPANY_FILTER.md](./FRONTEND_COMPANY_FILTER.md) | Job/Material/Hauler `entityId` filter |
| [FRONTEND_AGING_REPORT.md](./FRONTEND_AGING_REPORT.md) | Aging report UI |
| [FRONTEND_SITELINE.md](./FRONTEND_SITELINE.md) | Siteline API for frontend |
| [FRONTEND_SITELINE_COMPANY_FILTER.md](./FRONTEND_SITELINE_COMPANY_FILTER.md) | Siteline multi-company `entityId` |
| [FRONTEND_EMAIL_TEMPLATES.md](./FRONTEND_EMAIL_TEMPLATES.md) | Email templates (frontend) |
| [FRONTEND_RECENT_CHANGES_MAR2026.md](./FRONTEND_RECENT_CHANGES_MAR2026.md) | Mar 2026 backend changes summary |

## Siteline, Clearstory, Trimble

| Doc | Description |
|-----|-------------|
| [SITELINE_SCHEMA_REFERENCE.md](./SITELINE_SCHEMA_REFERENCE.md) | Siteline GraphQL schema |
| [SITELINE_COMPANY_FILTER.md](./SITELINE_COMPANY_FILTER.md) | Backend company filter |
| [SITELINE_PM_EMAILS.md](./SITELINE_PM_EMAILS.md) | PM Monday / PJ Tuesday / gap emails |
| [frontend-siteline-api.md](./frontend-siteline-api.md) | Siteline API notes |
| [frontend-siteline-invoice-date.md](./frontend-siteline-invoice-date.md) | Invoice date |
| [frontend-clearstory-api.md](./frontend-clearstory-api.md) | Clearstory API |
| [frontend-clearstory-projects-module.md](./frontend-clearstory-projects-module.md) | Clearstory projects |
| [frontend-clearstory-tables-draft.md](./frontend-clearstory-tables-draft.md) | Clearstory tables draft |
| [frontend-clearstory-api-mock.md](./frontend-clearstory-api-mock.md) | Clearstory mock |
| [frontend-trimble-api.md](./frontend-trimble-api.md) | Trimble API |
| [pj-reporting-requirements-draft.md](./pj-reporting-requirements-draft.md) | PJ reporting draft |
| [scripts/README-SITELINE-SCHEMA.md](./scripts/README-SITELINE-SCHEMA.md) | Siteline schema scripts |
| [scripts/README-RBAC.md](./scripts/README-RBAC.md) | RBAC seed scripts |

## Deploy & database

| Doc | Description |
|-----|-------------|
| [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) | Production deploy |
| [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md) | Build & deploy (Windows) |
| [RUN_DB_MIGRATION.md](./RUN_DB_MIGRATION.md) | Database migrations |
| [RESTORE_DATABASE.md](./RESTORE_DATABASE.md) | Restore database |
| [QUICK_FIX_DB_CONNECTION.md](./QUICK_FIX_DB_CONNECTION.md) | Quick DB connection fix |
| [TROUBLESHOOT_DB_CONNECTION.md](./TROUBLESHOOT_DB_CONNECTION.md) | DB troubleshooting |

## Bidding

| Doc | Description |
|-----|-------------|
| **[BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md)** | **Single frontend handoff** — all bidding API changes (calc, attachments, cover sheet, planned company info) |
| [BIDDING_FRONTEND_CALCULATOR_HANDOFF.md](./BIDDING_FRONTEND_CALCULATOR_HANDOFF.md) | Client-calc contract (backend change history) |
| [BIDDING_BASEBID_FIELDS.md](./BIDDING_BASEBID_FIELDS.md) | Excel cell ↔ `baseBid` field map |
| [BIDDING_DATABASE_DESIGN.md](./BIDDING_DATABASE_DESIGN.md) | Bidding DB schema — reuse `Ref_*`, no duplicates |
| [BIDDING_NAMED_RANGES.md](./BIDDING_NAMED_RANGES.md) | Bidding named ranges |
