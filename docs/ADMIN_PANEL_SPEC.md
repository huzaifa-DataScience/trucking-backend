# Admin Panel Specification

This document describes the **Admin Panel** for managing users, approving/rejecting signups, and system administration. This is a **frontend implementation guide** based on industry best practices and the existing authentication system.

---

## 🎯 Overview

The Admin Panel is a **protected admin-only section** of the dashboard that allows administrators to:

1. **Manage Users**: View, approve/reject signups, edit user details, change roles, activate/deactivate accounts
2. **Monitor Activity**: View user activity logs, login history
3. **System Settings**: Manage system-wide settings (future expansion)

**Access Control:**
- Only users with `role === 'admin'` can access admin panel routes
- All admin endpoints require JWT authentication + admin role
- Frontend should check `user.role === 'admin'` before rendering admin UI

---

## 📋 Page Structure

### Route: `/admin` (or `/admin/users`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Admin Panel Header                              │
│  [Users] [Activity Log] [Settings] [Logout]    │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  Filters & Search Bar                            │
│  [Search: ____] [Status: All ▼] [Role: All ▼]   │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  User Management Table                          │
│  [Checkbox] Email | Role | Status | Actions     │
│  ☐ user@... | user | Pending | [Approve][Reject]│
│  ☐ admin@... | admin | Active | [Edit][Deactivate]│
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  Pagination: [<] 1 2 3 [>]                      │
└─────────────────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization

### Frontend Route Protection

**Before rendering admin panel:**
1. Check if user is authenticated (has valid JWT)
2. Call `GET /auth/profile` to get current user
3. Verify `user.role === 'admin'`
4. If not admin → redirect to dashboard with error message
5. If admin → render admin panel

**Example (React/Next.js):**
```tsx
// Admin layout guard
const { user } = useAuth();
if (!user || user.role !== 'admin') {
  redirect('/dashboard');
  return null;
}
```

---

## 📊 Page 1: User Management

### 1.1 User List Table

**Columns:**

| Column | Field | Description | Sortable |
|--------|-------|-------------|----------|
| ☐ | `selected` | Checkbox for bulk actions | - |
| Email | `email` | User email address | ✅ |
| Role | `role` | `user` or `admin` (badge) | ✅ |
| Status | `status` | `pending`, `active`, `inactive`, `rejected` | ✅ |
| Created At | `createdAt` | Registration date (e.g., "Jan 15, 2024") | ✅ |
| Last Login | `lastLoginAt` | Last login timestamp (optional) | ✅ |
| Actions | - | Action buttons (see below) | - |

**Status Badges:**
- 🟡 **Pending**: New signup awaiting approval (default for new registrations)
- 🟢 **Active**: Approved and active user
- 🔴 **Rejected**: Signup was rejected by admin
- ⚫ **Inactive**: Admin deactivated the account

**Action Buttons (per row):**
- **Pending users**: `[Approve]` `[Reject]` `[View Details]`
- **Active users**: `[Edit]` `[Deactivate]` `[View Details]`
- **Inactive users**: `[Activate]` `[Edit]` `[View Details]`
- **Rejected users**: `[Approve]` `[Delete]` `[View Details]`

### 1.2 Filters & Search

**Filter Bar (above table):**

```
[Search: _______________] [Status: All ▼] [Role: All ▼] [Date Range: ___ to ___] [Clear Filters]
```

**Filters:**
- **Search**: Text input → filters by email (real-time)
- **Status**: Dropdown → `All`, `Pending`, `Active`, `Inactive`, `Rejected`
- **Role**: Dropdown → `All`, `User`, `Admin`
- **Date Range**: Date picker → filter by `createdAt` (optional)

**Behavior:**
- Filters apply immediately (no "Apply" button needed)
- Multiple filters can be combined
- "Clear Filters" resets all filters

### 1.3 Bulk Actions

**When rows are selected:**
- Show bulk action bar: `[Approve Selected] [Reject Selected] [Delete Selected]`
- Bulk actions apply to all selected users
- Show confirmation modal before bulk delete

### 1.4 Pagination

- **Page size**: 25 users per page (default)
- **Controls**: `[< Previous] [1] [2] [3] ... [Next >]`
- **Info**: "Showing 1-25 of 150 users"

---

## 🔧 Page 2: User Detail Modal

**Trigger:** Click `[View Details]` or click email in table

**Modal Content:**

```
┌─────────────────────────────────────────┐
│  User Details                    [×]    │
├─────────────────────────────────────────┤
│  Email: user@example.com               │
│  Role: [User ▼]                         │
│  Status: [Active ▼]                     │
│  Created: Jan 15, 2024                  │
│  Last Login: Jan 20, 2024 10:30 AM     │
│                                         │
│  [Save Changes] [Cancel]               │
└─────────────────────────────────────────┘
```

**Editable Fields:**
- **Role**: Dropdown (`user` / `admin`)
- **Status**: Dropdown (`pending` / `active` / `inactive` / `rejected`)

**Read-only Fields:**
- Email (cannot be changed)
- Created At
- Last Login At (if available)

**Actions:**
- `[Save Changes]` → Updates user via API
- `[Cancel]` → Closes modal without saving

---

## 📡 API Endpoints (Backend Required)

### Base URL
All admin endpoints: `/admin/users` (or `/admin` prefix)

**Authentication:** All endpoints require `Authorization: Bearer <token>` header and admin role.

---

### 1. Get Users List

```
GET /admin/users?page=1&pageSize=25&status=all&role=all&search=&startDate=&endDate=
```

**Query Parameters:**
- `page` (number, default: 1)
- `pageSize` (number, default: 25, max: 100)
- `status` (`all` | `pending` | `active` | `inactive` | `rejected`)
- `role` (`all` | `user` | `admin`)
- `search` (string, filters by email)
- `startDate` (YYYY-MM-DD, optional)
- `endDate` (YYYY-MM-DD, optional)

**Response:**
```json
{
  "items": [
    {
      "id": 1,
      "email": "user@example.com",
      "role": "user",
      "status": "pending",
      "createdAt": "2024-01-15T10:00:00Z",
      "lastLoginAt": null
    },
    {
      "id": 2,
      "email": "admin@example.com",
      "role": "admin",
      "status": "active",
      "createdAt": "2024-01-10T08:00:00Z",
      "lastLoginAt": "2024-01-20T10:30:00Z"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 150
}
```

---

### 2. Approve User (Signup)

```
POST /admin/users/:id/approve
```

**Response:**
```json
{
  "message": "User approved successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "status": "active",
    "role": "user"
  }
}
```

**Behavior:**
- Changes user `status` from `pending` → `active`
- User can now login (if status was blocking login)

---

### 3. Reject User (Signup)

```
POST /admin/users/:id/reject
```

**Response:**
```json
{
  "message": "User signup rejected",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "status": "rejected"
  }
}
```

**Behavior:**
- Changes user `status` from `pending` → `rejected`
- Rejected users cannot login

---

### 4. Update User

```
PATCH /admin/users/:id
Content-Type: application/json

{
  "role": "admin",
  "status": "active"
}
```

**Response:**
```json
{
  "message": "User updated successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "admin",
    "status": "active"
  }
}
```

**Allowed Fields:**
- `role` (`user` | `admin`)
- `status` (`pending` | `active` | `inactive` | `rejected`)

**Validation:**
- Cannot change email
- Cannot set status to `pending` if user was previously `active` or `rejected` (use `approve` endpoint instead)

---

### 5. Delete User

```
DELETE /admin/users/:id
```

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Behavior:**
- Permanently deletes user from database
- Show confirmation modal before deletion
- Cannot delete yourself (current admin user)

---

### 6. Bulk Actions

```
POST /admin/users/bulk-approve
Content-Type: application/json

{
  "userIds": [1, 2, 3]
}
```

```
POST /admin/users/bulk-reject
Content-Type: application/json

{
  "userIds": [4, 5, 6]
}
```

```
DELETE /admin/users/bulk-delete
Content-Type: application/json

{
  "userIds": [7, 8, 9]
}
```

**Response:**
```json
{
  "message": "3 users approved",
  "successCount": 3,
  "failedCount": 0
}
```

---

### 7. Get User Details

```
GET /admin/users/:id
```

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "user",
  "status": "pending",
  "createdAt": "2024-01-15T10:00:00Z",
  "lastLoginAt": null
}
```

---

## 🎨 UI/UX Best Practices

### Table Design

**Styling:**
- Clean, minimal design with clear borders
- Alternating row colors (zebra striping) for readability
- Hover effect on rows
- Selected rows highlighted (blue background)
- Status badges with color coding (see above)

**Responsive:**
- On mobile: Stack columns vertically or use card layout
- Horizontal scroll for table on small screens

### Filter UX

**Real-time Filtering:**
- Search input updates table as user types (debounced, ~300ms delay)
- Dropdown filters apply immediately on selection
- Show active filter count badge: `[Filters: 3]`

**Filter State:**
- Persist filter state in URL query params (e.g., `?status=pending&role=user`)
- Allows bookmarking filtered views
- Browser back/forward works with filters

### Action Buttons

**Button Styles:**
- Primary actions (Approve): Green button
- Destructive actions (Reject, Delete): Red button
- Secondary actions (Edit, View): Gray/outline button
- Disabled state for invalid actions

**Confirmation Modals:**
- Show confirmation for destructive actions (Reject, Delete, Deactivate)
- Modal: `"Are you sure you want to reject user@example.com?"` `[Cancel] [Confirm]`

### Loading States

- Show skeleton loader while fetching users
- Disable buttons during API calls
- Show toast notification on success/error

**Toast Messages:**
- Success: `"User approved successfully"` (green)
- Error: `"Failed to approve user"` (red)
- Info: `"3 users approved"` (blue)

### Empty States

**No users found:**
```
┌─────────────────────────────┐
│  No users found             │
│  Try adjusting your filters │
└─────────────────────────────┘
```

**No pending users:**
```
┌─────────────────────────────┐
│  All users are approved     │
│  No pending signups         │
└─────────────────────────────┘
```

---

## 🔒 Security Considerations

### Frontend

1. **Route Protection:**
   - Check `user.role === 'admin'` before rendering admin routes
   - Redirect non-admins to dashboard

2. **API Calls:**
   - Always include `Authorization: Bearer <token>` header
   - Handle 403 Forbidden (not admin) → redirect to dashboard
   - Handle 401 Unauthorized (expired token) → redirect to login

3. **Confirmation Modals:**
   - Always confirm destructive actions (delete, reject)
   - Show user email in confirmation message

4. **Error Handling:**
   - Display user-friendly error messages
   - Log errors for debugging
   - Don't expose sensitive backend errors to users

### Backend (Notes for Backend Team)

1. **Role Guard:**
   - All `/admin/*` endpoints must use `@Roles(Role.Admin)` guard
   - Return 403 if non-admin tries to access

2. **Validation:**
   - Validate `role` values (`user` | `admin` only)
   - Validate `status` transitions (e.g., cannot go from `rejected` → `pending`)
   - Prevent self-deletion (admin cannot delete themselves)

3. **Audit Logging:**
   - Log all admin actions (who approved/rejected/deleted whom)
   - Store action timestamp and admin user ID

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Full table with all columns visible
- Side-by-side filters
- Modal for user details

### Tablet (768px - 1024px)
- Table with horizontal scroll if needed
- Stacked filters
- Modal for user details

### Mobile (< 768px)
- Card layout instead of table
- Each user = one card with key info
- Full-screen modal for details
- Bottom sheet for filters

---

## 🚀 Implementation Checklist

### Phase 1: Basic User List
- [ ] Create `/admin/users` route (protected)
- [ ] Implement user list table with columns
- [ ] Add pagination
- [ ] Call `GET /admin/users` API

### Phase 2: Filters & Search
- [ ] Add search input (email filter)
- [ ] Add status dropdown filter
- [ ] Add role dropdown filter
- [ ] Implement filter state in URL params
- [ ] Real-time filtering (debounced search)

### Phase 3: Actions
- [ ] Approve button → `POST /admin/users/:id/approve`
- [ ] Reject button → `POST /admin/users/:id/reject`
- [ ] Edit button → Open modal → `PATCH /admin/users/:id`
- [ ] Delete button → Confirm → `DELETE /admin/users/:id`
- [ ] View Details button → Open modal → `GET /admin/users/:id`

### Phase 4: Bulk Actions
- [ ] Row selection checkboxes
- [ ] Bulk approve → `POST /admin/users/bulk-approve`
- [ ] Bulk reject → `POST /admin/users/bulk-reject`
- [ ] Bulk delete → `DELETE /admin/users/bulk-delete`

### Phase 5: Polish
- [ ] Loading states (skeletons)
- [ ] Toast notifications
- [ ] Empty states
- [ ] Error handling
- [ ] Responsive design
- [ ] Confirmation modals

---

## 📝 TypeScript Types (Frontend)

```typescript
// User status enum
export type UserStatus = 'pending' | 'active' | 'inactive' | 'rejected';

// User role enum
export type UserRole = 'user' | 'admin';

// User interface
export interface AdminUser {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string; // ISO datetime
  lastLoginAt: string | null; // ISO datetime or null
}

// Paginated response
export interface AdminUsersResponse {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
}

// Filters
export interface UserFilters {
  page?: number;
  pageSize?: number;
  status?: UserStatus | 'all';
  role?: UserRole | 'all';
  search?: string;
  startDate?: string;
  endDate?: string;
}

// Update user payload
export interface UpdateUserPayload {
  role?: UserRole;
  status?: UserStatus;
}
```

---

## 🎯 Future Enhancements (Optional)

1. **Activity Log Page:**
   - View user login history
   - View admin actions (who approved/rejected whom)
   - Filter by date range, user, action type

2. **Email Notifications:**
   - Send email to user when approved/rejected
   - Customizable email templates

3. **User Import/Export:**
   - Export user list to CSV/Excel
   - Bulk import users from CSV

4. **Advanced Permissions:**
   - Granular permissions (not just admin/user)
   - Permission groups

5. **System Settings:**
   - Toggle signup approval requirement
   - Configure default user role
   - Email verification settings

---

## 📚 References

- **Backend API Guide:** See `FRONTEND_API_GUIDE.md` for general API patterns
- **Authentication:** See `FRONTEND_AUTH.md` for login/signup flow
- **Backend Auth:** See `AUTH.md` for admin routes and guards

---

## ✅ Summary

This admin panel provides a **complete user management system** with:
- ✅ User list with filters and search
- ✅ Approve/reject signups workflow
- ✅ Edit user roles and status
- ✅ Bulk operations
- ✅ Responsive design
- ✅ Security best practices

**Next Steps:**
1. Backend team implements the admin endpoints (see API section above)
2. Frontend team implements the UI following this spec
3. Test approval/rejection workflow end-to-end
