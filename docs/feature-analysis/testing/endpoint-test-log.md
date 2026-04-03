# API Endpoint Test Log

**Test Date:** Wed, Mar 18, 2026 5:26:54 AM
**Backend URL:** http://localhost:3000

---

## Test Summary

| Category | Endpoints | Passed | Failed | Status |
|----------|----------|-------|--------|--------|
| Health | 1 | 1 | 0 | ✅ Complete |
| Auth | 8 | 8 | 0 | ✅ Complete |
| Users | 3 | 3 | 0 | ✅ Complete |
| Clients | 9 | 9 | 0 | ✅ Complete |
| Caravans | 6 | 6 | 0 | ✅ Complete |
| Agencies | 6 | 6 | 0 | ✅ Complete |
| Touchpoints | 7 | 7 | 0 | ✅ Complete |
| Itineraries | 7 | 7 | 0 | ✅ Complete |
| Groups | 7 | 7 | 0 | ✅ Complete |
| Targets | 5 | 5 | 0 | ✅ Complete |
| Attendance | 4 | 4 | 0 | ✅ Complete |
| Approvals | 11 | 11 | 0 | ✅ Complete |
| My-Day | 2 | 2 | 0 | ✅ Complete |
| Profile | 2 | 2 | 0 | ✅ Complete |
| Dashboard | 2 | 2 | 0 | ✅ Complete |
| Upload | 2 | 2 | 0 | ✅ Complete |
| Reports | 8 | 8 | 0 | ✅ Complete |
| **TOTAL** | **90** | **90** | **0** | **100% ✅** |

---

## Detailed Test Results

### 1. Health

**Health Check**
**Endpoint:** `GET /health`
```json
{
  "status": "ok",
  "timestamp": "2026-03-17T21:26:53.812Z",
  "database": "connected",
  "version": "1.0.0"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 2. Auth

**Register Admin User**
**Endpoint:** `POST /auth/register`
```json
{
  "user": {
    "id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
    "email": "admin.1773782812765@imu.test",
    "first_name": "Admin",
    "last_name": "TestUser",
    "role": "admin"
  }
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Register Staff User**
**Endpoint:** `POST /auth/register`
```json
{
  "user": {
    "id": "6e209958-6f75-4df1-bd31-98acd264903f",
    "email": "staff.1773782812765@imu.test",
    "first_name": "Staff",
    "last_name": "TestUser",
    "role": "staff"
  }
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Register Field Agent**
**Endpoint:** `POST /auth/register`
```json
{
  "user": {
    "id": "a5b3c217-57ad-4065-b4bb-21b09c1c4b74",
    "email": "fieldagent.1773782812765@imu.test",
    "first_name": "Field",
    "last_name": "Agent",
    "role": "field_agent"
  }
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Login as Admin**
**Endpoint:** `POST /auth/login`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDllNGU0YS1lYTE0LTQ4N2UtOTJhNS0zMmQwNDczYjY5NTkiLCJlbWFpbCI6ImFkbWluLjE3NzM3ODI4MTI3NjVAaW11LnRlc3QiLCJmaXJzdF9uYW1lIjoiQWRtaW4iLCJsYXN0X25hbWUiOiJUZXN0VXNlciIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3Mzc4MjgxMywiZXhwIjoxNzczODY5MjEzfQ.dBgIzfa7cHpKTUIVLh-lACopG-SedUMb8ojgFmCGMSY",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDllNGU0YS1lYTE0LTQ4N2UtOTJhNS0zMmQwNDczYjY5NTkiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3Mzc4...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Current User**
**Endpoint:** `GET /auth/me`
```json
{
  "user": {
    "id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
    "email": "admin.1773782812765@imu.test",
    "first_name": "Admin",
    "last_name": "TestUser",
    "role": "admin",
    "created_at": "2026-03-17T21:26:53.761Z"
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Refresh Token**
**Endpoint:** `POST /auth/refresh`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDllNGU0YS1lYTE0LTQ4N2UtOTJhNS0zMmQwNDczYjY5NTkiLCJlbWFpbCI6ImFkbWluLjE3NzM3ODI4MTI3NjVAaW11LnRlc3QiLCJmaXJzdF9uYW1lIjoiQWRtaW4iLCJsYXN0X25hbWUiOiJUZXN0VXNlciIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3Mzc4MjgxMywiZXhwIjoxNzczODY5MjEzfQ.dBgIzfa7cHpKTUIVLh-lACopG-SedUMb8ojgFmCGMSY",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDllNGU0YS1lYTE0LTQ4N2UtOTJhNS0zMmQwNDczYjY5NTkiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3Mzc4...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Invalid Login**
**Endpoint:** `POST /auth/login`
```json
{
  "message": "Invalid credentials"
}
```
**Status:** 401 ✅
**Result:** ✅ PASS

---
**Forgot Password**
**Endpoint:** `POST /auth/forgot-password`
```json
{
  "message": "If the email exists, a reset link has been sent",
  "_dev_reset_url": "http://localhost:4002/reset-password?token=8f9337138fcc3c6dc11e2715effd03e00f421cf629fb5a5f54b3028f8b1c14bd&email=admin.1773782812765%40imu.test"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 3. Users

**List Users**
**Endpoint:** `GET /users?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "fe6883da-059c-4078-9d02-1f8dc211340b",
      "email": "caravan2.1773782812765@imu.test",
      "name": "Maria Santos",
      "first_name": "Maria",
      "last_name": "Santos",
      "role": "field_agent",
      "phone": "+63 918 765 4321",
      "avatar": null,
      "created": "2026-03-17T21:26:54.194Z",
      "updated": "2026-03-17T21:26:54.194Z"
    },
    {
      "id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "email": "caravan1.1773782812765@imu.test",...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get User by ID**
**Endpoint:** `GET /users/6e209958-6f75-4df1-bd31-98acd264903f`
```json
{
  "id": "6e209958-6f75-4df1-bd31-98acd264903f",
  "email": "staff.1773782812765@imu.test",
  "name": "Staff TestUser",
  "first_name": "Staff",
  "last_name": "TestUser",
  "role": "staff",
  "phone": null,
  "avatar": null,
  "created": "2026-03-17T21:26:53.887Z",
  "updated": "2026-03-17T21:26:53.887Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update User**
**Endpoint:** `PUT /users/6e209958-6f75-4df1-bd31-98acd264903f`
```json
{
  "id": "6e209958-6f75-4df1-bd31-98acd264903f",
  "email": "staff.1773782812765@imu.test",
  "name": "Staff Updated TestUser",
  "first_name": "Staff Updated",
  "last_name": "TestUser",
  "role": "staff",
  "phone": null,
  "avatar": null,
  "created": "2026-03-17T21:26:53.887Z",
  "updated": "2026-03-17T21:26:54.640Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 4. Clients

**Create Client - Retiree (Existing)**
**Endpoint:** `POST /clients`
```json
{
  "id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "first_name": "Roberto",
  "last_name": "Reyes",
  "middle_name": "Cruz",
  "birth_date": null,
  "email": "roberto.reyes@email.com",
  "phone": "+63 919 111 2222",
  "agency_name": null,
  "department": null,
  "position": null,
  "employment_status": null,
  "payroll_date": null,
  "tenure": null,
  "client_type": "EXISTING",
  "product_type": "Pension Loan",
  "market_type": "Retiree",
  "pension_type": "PNP Pension",
  "pan": null,
  "faceb...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Client - Potential**
**Endpoint:** `POST /clients`
```json
{
  "id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
  "first_name": "Elena",
  "last_name": "Garcia",
  "middle_name": "Santos",
  "birth_date": null,
  "email": "elena.garcia@email.com",
  "phone": "+63 920 333 4444",
  "agency_name": null,
  "department": null,
  "position": null,
  "employment_status": null,
  "payroll_date": null,
  "tenure": null,
  "client_type": "POTENTIAL",
  "product_type": "Emergency Loan",
  "market_type": "Active Service",
  "pension_type": "BFP Pension",
  "pan": null...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Client - For Deletion**
**Endpoint:** `POST /clients`
```json
{
  "id": "414a43e0-ab25-4794-98c6-07a81be8597b",
  "first_name": "Fernando",
  "last_name": "Cruz",
  "middle_name": null,
  "birth_date": null,
  "email": "fernando.1773782812765@email.com",
  "phone": "+63 921 555 6666",
  "agency_name": null,
  "department": null,
  "position": null,
  "employment_status": null,
  "payroll_date": null,
  "tenure": null,
  "client_type": "POTENTIAL",
  "product_type": null,
  "market_type": null,
  "pension_type": null,
  "pan": null,
  "facebook_link": null,...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Clients**
**Endpoint:** `GET /clients?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "414a43e0-ab25-4794-98c6-07a81be8597b",
      "first_name": "Fernando",
      "last_name": "Cruz",
      "middle_name": null,
      "birth_date": null,
      "email": "fernando.1773782812765@email.com",
      "phone": "+63 921 555 6666",
      "agency_name": null,
      "department": null,
      "position": null,
      "employment_status": null,
      "payroll_date": null,
      "tenure": null,
      "client_type": "POTENTIAL",
      "product_type": null,
      "...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Search Clients**
**Endpoint:** `GET /clients?search=Roberto`
```json
{
  "items": [
    {
      "id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "first_name": "Roberto",
      "last_name": "Reyes",
      "middle_name": "Cruz",
      "birth_date": null,
      "email": "roberto.reyes@email.com",
      "phone": "+63 919 111 2222",
      "agency_name": null,
      "department": null,
      "position": null,
      "employment_status": null,
      "payroll_date": null,
      "tenure": null,
      "client_type": "EXISTING",
      "product_type": "Pension Loan",
     ...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Filter Clients by Type**
**Endpoint:** `GET /clients?client_type=POTENTIAL`
```json
{
  "items": [
    {
      "id": "414a43e0-ab25-4794-98c6-07a81be8597b",
      "first_name": "Fernando",
      "last_name": "Cruz",
      "middle_name": null,
      "birth_date": null,
      "email": "fernando.1773782812765@email.com",
      "phone": "+63 921 555 6666",
      "agency_name": null,
      "department": null,
      "position": null,
      "employment_status": null,
      "payroll_date": null,
      "tenure": null,
      "client_type": "POTENTIAL",
      "product_type": null,
      "...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Client by ID**
**Endpoint:** `GET /clients/dd49c5f1-6f25-48de-a5c8-ac54232b897b`
```json
{
  "id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "first_name": "Roberto",
  "last_name": "Reyes",
  "middle_name": "Cruz",
  "birth_date": null,
  "email": "roberto.reyes@email.com",
  "phone": "+63 919 111 2222",
  "agency_name": null,
  "department": null,
  "position": null,
  "employment_status": null,
  "payroll_date": null,
  "tenure": null,
  "client_type": "EXISTING",
  "product_type": "Pension Loan",
  "market_type": "Retiree",
  "pension_type": "PNP Pension",
  "pan": null,
  "faceb...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Client - Change Type**
**Endpoint:** `PUT /clients/57212108-78c6-4940-aa30-f2c50bc55fe6`
```json
{
  "id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
  "first_name": "Elena",
  "last_name": "Garcia",
  "middle_name": "Santos",
  "birth_date": null,
  "email": "elena.garcia@email.com",
  "phone": "+63 920 333 4444",
  "agency_name": null,
  "department": null,
  "position": null,
  "employment_status": null,
  "payroll_date": null,
  "tenure": null,
  "client_type": "EXISTING",
  "product_type": "Emergency Loan",
  "market_type": "Active Service",
  "pension_type": "BFP Pension",
  "pan": null,...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Client**
**Endpoint:** `DELETE /clients/414a43e0-ab25-4794-98c6-07a81be8597b`
```json
{
  "message": "Client deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 5. Caravans

**Create Caravan - Metro Manila North**
**Endpoint:** `POST /caravans`
```json
{
  "id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "user_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "name": "Juan Dela Cruz",
  "email": "caravan1.1773782812765@imu.test",
  "phone": "+63 917 123 4567",
  "assigned_area": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.181Z",
  "updated": "2026-03-17T21:26:54.181Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Caravan - Quezon City**
**Endpoint:** `POST /caravans`
```json
{
  "id": "fe6883da-059c-4078-9d02-1f8dc211340b",
  "user_id": "fe6883da-059c-4078-9d02-1f8dc211340b",
  "name": "Maria Santos",
  "email": "caravan2.1773782812765@imu.test",
  "phone": "+63 918 765 4321",
  "assigned_area": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.194Z",
  "updated": "2026-03-17T21:26:54.194Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Caravans**
**Endpoint:** `GET /caravans?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "fe6883da-059c-4078-9d02-1f8dc211340b",
      "user_id": "fe6883da-059c-4078-9d02-1f8dc211340b",
      "name": "Maria Santos",
      "email": "caravan2.1773782812765@imu.test",
      "phone": "+63 918 765 4321",
      "assigned_area": "Quezon City",
      "agency_id": null,
      "status": "active",
      "created": "2026-03-17T21:26:54.194Z",
      "updated": "2026-03-17T21:26:54.194Z",
      "expand": {}
    },
    {
      "id": "5635d907-7ecd-4171-8d54-b4d143f...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Caravan by ID**
**Endpoint:** `GET /caravans/5635d907-7ecd-4171-8d54-b4d143ff9c10`
```json
{
  "id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "user_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "name": "Juan Dela Cruz",
  "email": "caravan1.1773782812765@imu.test",
  "phone": "+63 917 123 4567",
  "assigned_area": "Metro Manila - North",
  "agency_id": null,
  "status": "active",
  "created": "2026-03-17T21:26:54.181Z",
  "updated": "2026-03-17T21:26:54.181Z",
  "expand": {}
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Caravan - Change Area**
**Endpoint:** `PUT /caravans/5635d907-7ecd-4171-8d54-b4d143ff9c10`
```json
{
  "id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "user_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "name": "Juan Dela Cruz Updated",
  "email": "caravan1.1773782812765@imu.test",
  "phone": "+63 917 123 4567",
  "assigned_area": "Metro Manila - Updated Area",
  "agency_id": null,
  "status": "active",
  "created": "2026-03-17T21:26:54.181Z",
  "updated": "2026-03-17T21:26:54.727Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Caravan**
**Endpoint:** `DELETE /caravans/fe6883da-059c-4078-9d02-1f8dc211340b`
```json
{
  "message": "Caravan deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 6. Agencies

**Create Agency - PNP Retirement**
**Endpoint:** `POST /agencies`
```json
{
  "id": "b44bf578-c026-463e-bb1c-0c66221eaf4e",
  "name": "PNP Retirement and Benefits Administration Service",
  "code": "PNP-1773782812765",
  "address": "Camp Crame, Quezon City",
  "region": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.143Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Agency - BFP**
**Endpoint:** `POST /agencies`
```json
{
  "id": "a617b7cc-c5dd-4671-b109-042e339c3f42",
  "name": "Bureau of Fire Protection",
  "code": "BFP-1773782812765",
  "address": "Quezon City, Metro Manila",
  "region": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.153Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Agencies**
**Endpoint:** `GET /agencies?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "6ad70ffa-0e7c-4813-8665-1baee8f2fbed",
      "name": "Bureau of Fire Protection",
      "code": "BFP-1773780437035",
      "address": "Quezon City, Metro Manila",
      "region": "",
      "status": "active",
      "created": "2026-03-17T20:47:19.700Z"
    },
    {
      "id": "7a35277b-082f-4ac5-8e7f-96fa950dd017",
      "name": "Bureau of Fire Protection",
      "code": "BFP-1773782688971",
      "address": "Quezon City, Metro Manila",
      "region": "",
    ...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Agency by ID**
**Endpoint:** `GET /agencies/b44bf578-c026-463e-bb1c-0c66221eaf4e`
```json
{
  "id": "b44bf578-c026-463e-bb1c-0c66221eaf4e",
  "name": "PNP Retirement and Benefits Administration Service",
  "code": "PNP-1773782812765",
  "address": "Camp Crame, Quezon City",
  "region": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.143Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Agency - Change Contact**
**Endpoint:** `PUT /agencies/b44bf578-c026-463e-bb1c-0c66221eaf4e`
```json
{
  "id": "b44bf578-c026-463e-bb1c-0c66221eaf4e",
  "name": "PNP Retirement Service Updated",
  "code": "PNP-1773782812765",
  "address": "Camp Crame, Quezon City",
  "region": "",
  "status": "active",
  "created": "2026-03-17T21:26:54.143Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Agency - With Clients (Expected to Fail)**
**Endpoint:** `DELETE /agencies/a617b7cc-c5dd-4671-b109-042e339c3f42`
```json
{
  "message": "Cannot delete agency with associated clients"
}
```
**Status:** 400 ✅
**Result:** ✅ PASS

---

### 7. Touchpoints

**Create Touchpoint - 1st Visit**
**Endpoint:** `POST /touchpoints`
```json
{
  "id": "1e8033fe-1692-4fe1-b27e-0e3c91e1c459",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": null,
  "touchpoint_number": 1,
  "type": "Visit",
  "date": "2026-03-16T16:00:00.000Z",
  "address": null,
  "time_arrival": null,
  "time_departure": null,
  "odometer_arrival": null,
  "odometer_departure": null,
  "reason": "New Client",
  "next_visit_date": null,
  "notes": "Initial visit to discuss pension loan options",
  "photo_url": null,
  "audio_url": null,
  "latit...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Touchpoint - 2nd Call**
**Endpoint:** `POST /touchpoints`
```json
{
  "id": "9b711509-c5e5-4b53-a1ad-bbca6d7b2ecf",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": null,
  "touchpoint_number": 2,
  "type": "Call",
  "date": "2026-03-17T16:00:00.000Z",
  "address": null,
  "time_arrival": null,
  "time_departure": null,
  "odometer_arrival": null,
  "odometer_departure": null,
  "reason": "Follow-up",
  "next_visit_date": null,
  "notes": "Follow-up call scheduled",
  "photo_url": null,
  "audio_url": null,
  "latitude": null,
  "longitud...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Touchpoints**
**Endpoint:** `GET /touchpoints?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "9b711509-c5e5-4b53-a1ad-bbca6d7b2ecf",
      "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "caravan_id": null,
      "touchpoint_number": 2,
      "type": "Call",
      "date": "2026-03-17T16:00:00.000Z",
      "address": null,
      "time_arrival": null,
      "time_departure": null,
      "odometer_arrival": null,
      "odometer_departure": null,
      "reason": "Follow-up",
      "next_visit_date": null,
      "notes": "Follow-up call scheduled"...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Filter Touchpoints by Client**
**Endpoint:** `GET /touchpoints?client_id=dd49c5f1-6f25-48de-a5c8-ac54232b897b`
```json
{
  "items": [
    {
      "id": "9b711509-c5e5-4b53-a1ad-bbca6d7b2ecf",
      "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "caravan_id": null,
      "touchpoint_number": 2,
      "type": "Call",
      "date": "2026-03-17T16:00:00.000Z",
      "address": null,
      "time_arrival": null,
      "time_departure": null,
      "odometer_arrival": null,
      "odometer_departure": null,
      "reason": "Follow-up",
      "next_visit_date": null,
      "notes": "Follow-up call scheduled"...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Touchpoint by ID**
**Endpoint:** `GET /touchpoints/1e8033fe-1692-4fe1-b27e-0e3c91e1c459`
```json
{
  "id": "1e8033fe-1692-4fe1-b27e-0e3c91e1c459",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": null,
  "touchpoint_number": 1,
  "type": "Visit",
  "date": "2026-03-16T16:00:00.000Z",
  "address": null,
  "time_arrival": null,
  "time_departure": null,
  "odometer_arrival": null,
  "odometer_departure": null,
  "reason": "New Client",
  "next_visit_date": null,
  "notes": "Initial visit to discuss pension loan options",
  "photo_url": null,
  "audio_url": null,
  "latit...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Touchpoint - Add Notes**
**Endpoint:** `PUT /touchpoints/1e8033fe-1692-4fe1-b27e-0e3c91e1c459`
```json
{
  "id": "1e8033fe-1692-4fe1-b27e-0e3c91e1c459",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": null,
  "touchpoint_number": 1,
  "type": "Visit",
  "date": "2026-03-16T16:00:00.000Z",
  "address": null,
  "time_arrival": null,
  "time_departure": null,
  "odometer_arrival": null,
  "odometer_departure": null,
  "reason": "New Client",
  "next_visit_date": null,
  "notes": "Client agreed to proceed with loan application",
  "photo_url": null,
  "audio_url": null,
  "lati...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Touchpoint**
**Endpoint:** `DELETE /touchpoints/9b711509-c5e5-4b53-a1ad-bbca6d7b2ecf`
```json
{
  "message": "Touchpoint deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 8. Itineraries

**Create Itinerary - Today**
**Endpoint:** `POST /itineraries`
```json
{
  "id": "9e31021b-7c58-49cf-80ee-59284cb4a36c",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "scheduled_date": "2026-03-16T16:00:00.000Z",
  "scheduled_time": "09:00:00",
  "status": "pending",
  "priority": "high",
  "notes": "First visit of the day",
  "is_recurring": false,
  "created": "2026-03-17T21:26:54.325Z",
  "updated": "2026-03-17T21:26:54.325Z",
  "created_by": "349e4e4a-ea14-487e-92a5-32d0473b6959"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Itinerary - Tomorrow**
**Endpoint:** `POST /itineraries`
```json
{
  "id": "468a8c86-4aa6-4f48-88e4-1b152f4424dd",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "client_id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
  "scheduled_date": "2026-03-17T16:00:00.000Z",
  "scheduled_time": "14:00:00",
  "status": "pending",
  "priority": "normal",
  "notes": "Afternoon appointment",
  "is_recurring": false,
  "created": "2026-03-17T21:26:54.339Z",
  "updated": "2026-03-17T21:26:54.339Z",
  "created_by": "349e4e4a-ea14-487e-92a5-32d0473b6959"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Itineraries**
**Endpoint:** `GET /itineraries?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "9e31021b-7c58-49cf-80ee-59284cb4a36c",
      "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "scheduled_date": "2026-03-16T16:00:00.000Z",
      "scheduled_time": "09:00:00",
      "status": "pending",
      "priority": "high",
      "notes": "First visit of the day",
      "is_recurring": false,
      "created": "2026-03-17T21:26:54.325Z",
      "updated": "2026-03-17T21:26:54.325Z",
      "...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Filter Itineraries by Date**
**Endpoint:** `GET /itineraries?date=2026-03-17`
```json
{
  "items": [
    {
      "id": "6ccef7d4-9159-4a6d-9751-233df0bef1bc",
      "caravan_id": "35d0d164-7675-4498-9472-9a99d0b812c7",
      "client_id": "70fb0ae8-85e7-4e0f-93db-bd30e9f17477",
      "scheduled_date": "2026-03-16T16:00:00.000Z",
      "scheduled_time": "09:00:00",
      "status": "completed",
      "priority": "high",
      "notes": "First visit of the day",
      "is_recurring": false,
      "created": "2026-03-17T20:25:15.635Z",
      "updated": "2026-03-17T20:25:15.904Z",
     ...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Itinerary by ID**
**Endpoint:** `GET /itineraries/9e31021b-7c58-49cf-80ee-59284cb4a36c`
```json
{
  "id": "9e31021b-7c58-49cf-80ee-59284cb4a36c",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "scheduled_date": "2026-03-16T16:00:00.000Z",
  "scheduled_time": "09:00:00",
  "status": "pending",
  "priority": "high",
  "notes": "First visit of the day",
  "is_recurring": false,
  "created": "2026-03-17T21:26:54.325Z",
  "updated": "2026-03-17T21:26:54.325Z",
  "created_by": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "expand": {
...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Itinerary - Mark Completed**
**Endpoint:** `PUT /itineraries/9e31021b-7c58-49cf-80ee-59284cb4a36c`
```json
{
  "id": "9e31021b-7c58-49cf-80ee-59284cb4a36c",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "scheduled_date": "2026-03-16T16:00:00.000Z",
  "scheduled_time": "09:00:00",
  "status": "completed",
  "priority": "high",
  "notes": "Visit completed successfully",
  "is_recurring": false,
  "created": "2026-03-17T21:26:54.325Z",
  "updated": "2026-03-17T21:26:54.846Z",
  "created_by": "349e4e4a-ea14-487e-92a5-32d0473b6959"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Itinerary**
**Endpoint:** `DELETE /itineraries/468a8c86-4aa6-4f48-88e4-1b152f4424dd`
```json
{
  "message": "Itinerary deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 9. Groups

**Create Group - PNP Retirees QC**
**Endpoint:** `POST /groups`
```json
{
  "id": "8429f1ea-6cc5-478e-86c5-3a2d3a73ab19",
  "name": "PNP Retirees - Quezon City",
  "description": "Group of PNP retirees in Quezon City area",
  "team_leader_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "created": "2026-03-17T21:26:54.361Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Groups**
**Endpoint:** `GET /groups?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "8429f1ea-6cc5-478e-86c5-3a2d3a73ab19",
      "name": "PNP Retirees - Quezon City",
      "description": "Group of PNP retirees in Quezon City area",
      "team_leader_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
      "team_leader_name": "Admin TestUser",
      "member_count": 0,
      "created": "2026-03-17T21:26:54.361Z"
    }
  ],
  "page": 1,
  "perPage": 10,
  "totalItems": 1,
  "totalPages": 1
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Group by ID**
**Endpoint:** `GET /groups/8429f1ea-6cc5-478e-86c5-3a2d3a73ab19`
```json
{
  "id": "8429f1ea-6cc5-478e-86c5-3a2d3a73ab19",
  "name": "PNP Retirees - Quezon City",
  "description": "Group of PNP retirees in Quezon City area",
  "team_leader_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "team_leader_name": "Admin TestUser",
  "members": [],
  "created": "2026-03-17T21:26:54.361Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Add Members to Group**
**Endpoint:** `POST /groups/8429f1ea-6cc5-478e-86c5-3a2d3a73ab19/members`
```json
{
  "message": "Added 2 members to group",
  "added": 2
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Group - Change Description**
**Endpoint:** `PUT /groups/8429f1ea-6cc5-478e-86c5-3a2d3a73ab19`
```json
{
  "id": "8429f1ea-6cc5-478e-86c5-3a2d3a73ab19",
  "name": "PNP Retirees QC - Updated",
  "description": "Updated group for PNP retirees in QC area",
  "team_leader_id": "349e4e4a-ea14-487e-92a5-32d0473b6959"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Remove Group Member**
**Endpoint:** `DELETE /groups/8429f1ea-6cc5-478e-86c5-3a2d3a73ab19/members/57212108-78c6-4940-aa30-f2c50bc55fe6`
```json
{
  "message": "Member removed from group"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Group**
**Endpoint:** `DELETE /groups/8429f1ea-6cc5-478e-86c5-3a2d3a73ab19`
```json
{
  "message": "Group deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 10. Targets

**Create Target - Monthly KPIs**
**Endpoint:** `POST /targets`
```json
{
  "id": "7fdf9f47-e979-4cc3-8f2f-553f2a3a1eec",
  "user_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "period": "monthly",
  "year": 2026,
  "month": 3,
  "week": null,
  "target_clients": 50,
  "target_touchpoints": 150,
  "target_visits": 40,
  "created": "2026-03-17T21:26:54.385Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Targets**
**Endpoint:** `GET /targets`
```json
{
  "items": [
    {
      "id": "7fdf9f47-e979-4cc3-8f2f-553f2a3a1eec",
      "user_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "user_name": "Juan Dela Cruz Updated",
      "period": "monthly",
      "year": 2026,
      "month": 3,
      "week": null,
      "target_clients": 50,
      "target_touchpoints": 150,
      "target_visits": 40,
      "created": "2026-03-17T21:26:54.385Z"
    },
    {
      "id": "dfd2ddb8-f4c0-40ac-b070-4a227690c160",
      "user_id": "b2738a10-fbf2-4845-a5ca-b...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Current Targets**
**Endpoint:** `GET /targets/current`
```json
{
  "target": null,
  "progress": {
    "actual_clients": 0,
    "actual_touchpoints": 0,
    "actual_visits": 0
  },
  "month": 3,
  "year": 2026
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Target History**
**Endpoint:** `GET /targets/history`
```json
{
  "items": []
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Target**
**Endpoint:** `DELETE /targets/7fdf9f47-e979-4cc3-8f2f-553f2a3a1eec`
```json
{
  "message": "Target deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 11. Attendance

**Attendance Check-In**
**Endpoint:** `POST /attendance/check-in`
```json
{
  "id": "cb680f54-48b5-4201-a70f-83cac3dbcd3f",
  "user_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "date": "2026-03-16T16:00:00.000Z",
  "time_in": "2026-03-17T21:26:54.420Z",
  "time_out": null,
  "location_in_lat": null,
  "location_in_lng": null,
  "location_out_lat": null,
  "location_out_lng": null,
  "notes": null,
  "created": "2026-03-17T21:26:54.420Z"
}
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Get Today Attendance**
**Endpoint:** `GET /attendance/today`
```json
{
  "checked_in": true,
  "checked_out": false,
  "attendance": {
    "id": "cb680f54-48b5-4201-a70f-83cac3dbcd3f",
    "user_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
    "date": "2026-03-16T16:00:00.000Z",
    "time_in": "2026-03-17T21:26:54.420Z",
    "time_out": null,
    "location_in_lat": null,
    "location_in_lng": null,
    "location_out_lat": null,
    "location_out_lng": null,
    "notes": null,
    "created": "2026-03-17T21:26:54.420Z"
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Attendance History**
**Endpoint:** `GET /attendance/history?limit=10`
```json
{
  "items": [
    {
      "id": "cb680f54-48b5-4201-a70f-83cac3dbcd3f",
      "user_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
      "date": "2026-03-16T16:00:00.000Z",
      "time_in": "2026-03-17T21:26:54.420Z",
      "time_out": null,
      "location_in_lat": null,
      "location_in_lng": null,
      "location_out_lat": null,
      "location_out_lng": null,
      "notes": null,
      "created": "2026-03-17T21:26:54.420Z",
      "user": {
        "first_name": "Admin",
        "last_name":...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Check Out**
**Endpoint:** `POST /attendance/check-out`
```json
{
  "id": "cb680f54-48b5-4201-a70f-83cac3dbcd3f",
  "user_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "date": "2026-03-16T16:00:00.000Z",
  "time_in": "2026-03-17T21:26:54.420Z",
  "time_out": "2026-03-17T21:26:54.939Z",
  "location_in_lat": null,
  "location_in_lng": null,
  "location_out_lat": null,
  "location_out_lng": null,
  "notes": null,
  "created": "2026-03-17T21:26:54.420Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 12. Approvals

**Create Approval - Client Type**
**Endpoint:** `POST /approvals`
```json
{
  "id": "1850d818-2f46-4378-8b7d-f3592a560531",
  "type": "client",
  "status": "pending",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "touchpoint_number": null,
  "role": "Marketing Representative",
  "reason": "New client registration",
  "notes": "First time client registration approval request",
  "approved_by": null,
  "approved_at": null,
  "rejected_by": null,
  "rejected_at": null,
  "rejection_reason": null,
  "creat...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**Create Approval - UDI Type**
**Endpoint:** `POST /approvals`
```json
{
  "id": "bcb33151-d420-4c3a-9250-fee535e156d9",
  "type": "udi",
  "status": "pending",
  "client_id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "touchpoint_number": 1,
  "role": "Account Specialist",
  "reason": null,
  "notes": "UDI approval for first touchpoint",
  "approved_by": null,
  "approved_at": null,
  "rejected_by": null,
  "rejected_at": null,
  "rejection_reason": null,
  "created": "2026-03-17T21:26:54.455Z",
  "updated": "...
```
**Status:** 201 ✅
**Result:** ✅ PASS

---
**List Approvals**
**Endpoint:** `GET /approvals?page=1&perPage=10`
```json
{
  "items": [
    {
      "id": "bcb33151-d420-4c3a-9250-fee535e156d9",
      "type": "udi",
      "status": "pending",
      "client_id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
      "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "touchpoint_number": 1,
      "role": "Account Specialist",
      "reason": null,
      "notes": "UDI approval for first touchpoint",
      "approved_by": null,
      "approved_at": null,
      "rejected_by": null,
      "rejected_at": null,
      "rejec...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Filter Approvals by Status**
**Endpoint:** `GET /approvals?status=pending`
```json
{
  "items": [
    {
      "id": "bcb33151-d420-4c3a-9250-fee535e156d9",
      "type": "udi",
      "status": "pending",
      "client_id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
      "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "touchpoint_number": 1,
      "role": "Account Specialist",
      "reason": null,
      "notes": "UDI approval for first touchpoint",
      "approved_by": null,
      "approved_at": null,
      "rejected_by": null,
      "rejected_at": null,
      "rejec...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Filter Approvals by Type**
**Endpoint:** `GET /approvals?type=client`
```json
{
  "items": [
    {
      "id": "1850d818-2f46-4378-8b7d-f3592a560531",
      "type": "client",
      "status": "pending",
      "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
      "touchpoint_number": null,
      "role": "Marketing Representative",
      "reason": "New client registration",
      "notes": "First time client registration approval request",
      "approved_by": null,
      "approved_at": null,
      "rejected_by"...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Approval by ID**
**Endpoint:** `GET /approvals/1850d818-2f46-4378-8b7d-f3592a560531`
```json
{
  "id": "1850d818-2f46-4378-8b7d-f3592a560531",
  "type": "client",
  "status": "pending",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "touchpoint_number": null,
  "role": "Marketing Representative",
  "reason": "New client registration",
  "notes": "First time client registration approval request",
  "approved_by": null,
  "approved_at": null,
  "rejected_by": null,
  "rejected_at": null,
  "rejection_reason": null,
  "creat...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Approval Stats**
**Endpoint:** `GET /approvals/stats/summary`
```json
{
  "total": 7,
  "pending": 2,
  "approved": 0,
  "rejected": 5,
  "client_approvals": 1,
  "udi_approvals": 6
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Approve an Approval**
**Endpoint:** `POST /approvals/1850d818-2f46-4378-8b7d-f3592a560531/approve`
```json
{
  "message": "Approval approved successfully",
  "approval": {
    "id": "1850d818-2f46-4378-8b7d-f3592a560531",
    "type": "client",
    "status": "approved",
    "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
    "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
    "touchpoint_number": null,
    "role": "Marketing Representative",
    "reason": "New client registration",
    "notes": "Approved by admin",
    "approved_by": "349e4e4a-ea14-487e-92a5-32d0473b6959",
    "approved_at"...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Reject an Approval**
**Endpoint:** `POST /approvals/bcb33151-d420-4c3a-9250-fee535e156d9/reject`
```json
{
  "message": "Approval rejected",
  "approval": {
    "id": "bcb33151-d420-4c3a-9250-fee535e156d9",
    "type": "udi",
    "status": "rejected",
    "client_id": "57212108-78c6-4940-aa30-f2c50bc55fe6",
    "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
    "touchpoint_number": 1,
    "role": "Account Specialist",
    "reason": null,
    "notes": "Please resubmit with complete documents",
    "approved_by": null,
    "approved_at": null,
    "rejected_by": "349e4e4a-ea14-487e-92a5-32d047...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Approval Notes**
**Endpoint:** `PUT /approvals/1850d818-2f46-4378-8b7d-f3592a560531`
```json
{
  "id": "1850d818-2f46-4378-8b7d-f3592a560531",
  "type": "client",
  "status": "approved",
  "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
  "caravan_id": "5635d907-7ecd-4171-8d54-b4d143ff9c10",
  "touchpoint_number": null,
  "role": "Marketing Representative",
  "reason": "New client registration",
  "notes": "Updated notes after approval",
  "approved_by": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "approved_at": "2026-03-17T21:26:54.977Z",
  "rejected_by": null,
  "rejected_at": null...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Delete Approval**
**Endpoint:** `DELETE /approvals/1850d818-2f46-4378-8b7d-f3592a560531`
```json
{
  "message": "Approval deleted successfully"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 13. My-Day

**Get Today Tasks**
**Endpoint:** `GET /my-day/tasks?caravan_id=5635d907-7ecd-4171-8d54-b4d143ff9c10`
```json
{
  "date": "2026-03-17",
  "summary": {
    "total": 1,
    "completed": 1,
    "pending": 0,
    "in_progress": 0,
    "completion_rate": 100
  },
  "tasks": [
    {
      "id": "9e31021b-7c58-49cf-80ee-59284cb4a36c",
      "client_id": "dd49c5f1-6f25-48de-a5c8-ac54232b897b",
      "scheduled_date": "2026-03-16T16:00:00.000Z",
      "scheduled_time": "09:00:00",
      "status": "completed",
      "priority": "high",
      "notes": "Visit completed successfully",
      "client": {
        "firs...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get My-Day Stats**
**Endpoint:** `GET /my-day/stats?caravan_id=5635d907-7ecd-4171-8d54-b4d143ff9c10`
```json
{
  "period": "week",
  "start_date": "2026-03-15",
  "touchpoints": {
    "total": 0,
    "visits": 0,
    "calls": 0
  },
  "clients": {
    "unique_visited": 0
  },
  "itineraries": {
    "total": 0,
    "completed": 0,
    "completion_rate": 0
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 14. Profile

**Get Profile**
**Endpoint:** `GET /profile/349e4e4a-ea14-487e-92a5-32d0473b6959`
```json
{
  "id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "email": "admin.1773782812765@imu.test",
  "first_name": "Admin",
  "last_name": "TestUser",
  "name": "Admin TestUser",
  "role": "admin",
  "phone": null,
  "created": "2026-03-17T21:26:53.761Z",
  "updated": "2026-03-17T21:26:53.761Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Update Profile - Change Name**
**Endpoint:** `PUT /profile/349e4e4a-ea14-487e-92a5-32d0473b6959`
```json
{
  "id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "email": "admin.1773782812765@imu.test",
  "first_name": "Admin Updated",
  "last_name": "TestUser Updated",
  "name": "Admin Updated TestUser Updated",
  "role": "admin",
  "phone": null,
  "avatar_url": null,
  "updated": "2026-03-17T21:26:55.076Z"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 15. Dashboard

**Get Dashboard Stats**
**Endpoint:** `GET /dashboard`
```json
{
  "period": {
    "start_date": "2026-02-28",
    "end_date": "2026-03-30"
  },
  "clients": {
    "total": 23,
    "potential": 1,
    "existing": 22
  },
  "touchpoints": {
    "total": 12,
    "visits": 11,
    "calls": 1
  },
  "itineraries": {
    "total": 11,
    "pending": 1,
    "completed": 10,
    "cancelled": 0,
    "in_progress": 0
  },
  "caravans": {
    "total_caravans": "24",
    "active_caravans": "11"
  },
  "clients_by_agency": [
    {
      "agency": "Bureau of Fire Protect...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Dashboard Performance**
**Endpoint:** `GET /dashboard/performance?caravan_id=5635d907-7ecd-4171-8d54-b4d143ff9c10`
```json
{
  "daily_touchpoints": [],
  "touchpoint_types": [],
  "conversion": {
    "potential": 0,
    "existing": 2
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 16. Upload

**Get Upload Categories**
**Endpoint:** `GET /upload/categories`
```json
{
  "categories": [
    {
      "name": "selfie",
      "description": "Attendance verification selfie",
      "allowed_types": [
        "image/jpeg",
        "image/png",
        "image/webp"
      ],
      "max_size": 10485760,
      "max_size_formatted": "10MB"
    },
    {
      "name": "avatar",
      "description": "Profile picture",
      "allowed_types": [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
      ],
      "max_size": 5242880,
      "max_...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Get Pending Uploads**
**Endpoint:** `GET /upload/pending`
```json
{
  "counts": {
    "clients": 0,
    "touchpoints": 0,
    "itineraries": 0
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---

### 17. Reports

**Agent Performance Report**
**Endpoint:** `GET /reports/agent-performance?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.610Z",
  "items": []
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Client Activity Report**
**Endpoint:** `GET /reports/client-activity?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.655Z",
  "client_summary": [
    {
      "client_type": "EXISTING",
      "count": 22,
      "starred_count": 0
    },
    {
      "client_type": "POTENTIAL",
      "count": 1,
      "starred_count": 0
    }
  ],
  "touchpoint_activity": {
    "total_touchpoints": 12,
    "clients_with_activity": 11,
    "last_7_days": 12,
    "last_30_days": 12
  }
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Touchpoint Summary Report**
**Endpoint:** `GET /reports/touchpoint-summary?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.663Z",
  "by_type": [
    {
      "type": "Visit",
      "count": 11
    },
    {
      "type": "Call",
      "count": 1
    }
  ],
  "by_status": [
    {
      "status": "pending",
      "count": 12
    }
  ],
  "by_reason": [
    {
      "reason": "New Client",
      "count": 11
    },
    {
      "reason": "Follow-up",
      "count": 1
    }
  ],
  "by_touchpoint_number": [
    {
      "touch...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Attendance Summary Report**
**Endpoint:** `GET /reports/attendance-summary?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.670Z",
  "items": [
    {
      "caravan_id": "11976507-6f14-4d0b-8059-e765cf46aacc",
      "agent_name": "Admin Updated TestUser",
      "total_days": 1,
      "present_days": 1,
      "absent_days": 0,
      "late_days": 0,
      "avg_work_hours": "0.00",
      "attendance_rate": 100
    },
    {
      "caravan_id": "32a34645-98d1-42c6-963d-319e1934f523",
      "agent_name": "Admin Updated Tes...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Target Achievement Report**
**Endpoint:** `GET /reports/target-achievement`
```json
{
  "year": 2026,
  "month": 3,
  "user_id": "349e4e4a-ea14-487e-92a5-32d0473b6959",
  "actual": {
    "clients": 0,
    "touchpoints": 0,
    "visits": 0
  },
  "target": null,
  "achievement": null,
  "status": "no_target"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Conversion Report**
**Endpoint:** `GET /reports/conversion?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.688Z",
  "funnel": {
    "total_clients": 23,
    "potential_clients": 1,
    "existing_clients": 22,
    "conversion_rate": 96
  },
  "conversion_by_touchpoint": [
    {
      "touchpoint_number": 1,
      "conversions": 11,
      "total_clients": 11,
      "rate": 100
    },
    {
      "touchpoint_number": 2,
      "conversions": 1,
      "total_clients": 1,
      "rate": 100
    }
  ],
  "to...
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Area Coverage Report**
**Endpoint:** `GET /reports/area-coverage?period=month`
```json
{
  "period": "month",
  "start_date": "2026-02-28T16:00:00.000Z",
  "end_date": "2026-03-17T21:26:54.695Z",
  "summary": {
    "clients_visited": 11,
    "cities_covered": 0,
    "provinces_covered": 0
  },
  "by_city": [
    {
      "city": "Unknown",
      "touchpoints": 12,
      "unique_clients": 11,
      "visits": 11
    }
  ],
  "by_province": [
    {
      "province": "Unknown",
      "touchpoints": 12,
      "unique_clients": 11
    }
  ]
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
**Export Report**
**Endpoint:** `GET /reports/export?type=touchpoints&period=month`
```json
{
  "filename": "touchpoints_month.csv",
  "content": "ID,Date,Type,Reason,Status,Client,Agent,Notes\n",
  "mime_type": "text/csv"
}
```
**Status:** 200 ✅
**Result:** ✅ PASS

---
