/**
 * Workforce API Integration Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Requires the server to be running:  cd server && npm run dev
 *
 * Run:  node --test tests/api.test.js
 *
 * All test data uses appName = "workforce-test" so it is clearly isolated
 * from production data in the same MongoDB cluster.
 * A cleanup step at the start removes any leftover data from prior runs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User       = require('../models/User');
const Employee   = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave      = require('../models/Leave');

const BASE = 'http://localhost:5050/api';
const APP  = 'workforce-test';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const get    = (path, token)        => api('GET',    path, null, token);
const post   = (path, body, token)  => api('POST',   path, body, token);
const put    = (path, body, token)  => api('PUT',    path, body, token);
const del    = (path, token)        => api('DELETE', path, null, token);

function log(label, data) {
  console.log(`\n  📦 ${label}:`);
  console.log('    ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n    '));
}

// ─── shared state ─────────────────────────────────────────────────────────────

const ctx = {
  adminToken    : null,
  hrToken       : null,
  managerToken  : null,
  employeeToken : null,
  emp1Id        : null,   // Jane Doe  – Engineering
  emp2Id        : null,   // Bob Smith – HR
  att1Id        : null,
  att2Id        : null,
  leaveId       : null,
};

// ─── cleanup ──────────────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce');
  console.log('\n🧹  Cleaning up leftover test data …');

  const testEmails = [
    'admin@wf-test.com',
    'hr@wf-test.com',
    'manager@wf-test.com',
    'emp.jane@wf-test.com',
    'emp.bob@wf-test.com',
  ];

  // Find employee records so we can delete their attendance / leaves
  const empRecords = await Employee.find({ email: { $in: testEmails } });
  const empIds     = empRecords.map(e => e._id);

  await Attendance.deleteMany({ employeeId: { $in: empIds } });
  await Leave.deleteMany({ employeeId: { $in: empIds } });
  await Employee.deleteMany({ email: { $in: testEmails } });
  await User.deleteMany({ appName: APP });

  console.log('✅  Cleanup done.\n');
});

after(async () => {
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. AUTH
// ═════════════════════════════════════════════════════════════════════════════

describe('1 · Auth', () => {

  it('1-1  registers admin user', async () => {
    const { status, body } = await post('/auth/register', {
      name      : 'Admin User',
      email     : 'admin@wf-test.com',
      password  : 'Admin@123',
      role      : 'admin',
      department: 'Management',
      appName   : APP,
    });
    log('register admin', { status, success: body.success, role: body.user?.role });
    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.ok(body.token, 'token must be present');
    assert.equal(body.user.appName, APP);
    ctx.adminToken = body.token;
  });

  it('1-2  registers hr user', async () => {
    const { status, body } = await post('/auth/register', {
      name      : 'HR User',
      email     : 'hr@wf-test.com',
      password  : 'Hr@123456',
      role      : 'hr',
      department: 'Human Resources',
      appName   : APP,
    });
    log('register hr', { status, success: body.success, role: body.user?.role });
    assert.equal(status, 201);
    ctx.hrToken = body.token;
  });

  it('1-3  registers manager user', async () => {
    const { status, body } = await post('/auth/register', {
      name      : 'Manager User',
      email     : 'manager@wf-test.com',
      password  : 'Mgr@123456',
      role      : 'manager',
      department: 'Engineering',
      appName   : APP,
    });
    log('register manager', { status, success: body.success, role: body.user?.role });
    assert.equal(status, 201);
    ctx.managerToken = body.token;
  });

  it('1-4  registers employee user', async () => {
    const { status, body } = await post('/auth/register', {
      name      : 'Employee User',
      email     : 'emp.jane@wf-test.com',
      password  : 'Emp@123456',
      role      : 'employee',
      department: 'Engineering',
      appName   : APP,
    });
    log('register employee', { status, success: body.success, role: body.user?.role });
    assert.equal(status, 201);
    ctx.employeeToken = body.token;
  });

  it('1-5  rejects duplicate email within same appName', async () => {
    const { status, body } = await post('/auth/register', {
      name    : 'Dup Admin',
      email   : 'admin@wf-test.com',
      password: 'Admin@123',
      appName : APP,
    });
    log('duplicate email', { status, message: body.message });
    assert.equal(status, 400);
    assert.match(body.message, /already in use/i);
  });

  it('1-6  allows same email under a different appName', async () => {
    const { status, body } = await post('/auth/register', {
      name    : 'Admin Other App',
      email   : 'admin@wf-test.com',
      password: 'Admin@123',
      appName : 'other-app-test',
      role    : 'admin',
    });
    log('cross-app same email', { status, success: body.success });
    assert.equal(status, 201);
    // clean up immediately
    await User.deleteOne({ email: 'admin@wf-test.com', appName: 'other-app-test' });
  });

  it('1-7  logs in admin and returns token with appName', async () => {
    const { status, body } = await post('/auth/login', {
      email   : 'admin@wf-test.com',
      password: 'Admin@123',
      appName : APP,
    });
    log('login admin', { status, success: body.success, appName: body.user?.appName });
    assert.equal(status, 200);
    assert.equal(body.user.appName, APP);
    ctx.adminToken = body.token; // refresh
  });

  it('1-8  rejects wrong password', async () => {
    const { status, body } = await post('/auth/login', {
      email   : 'admin@wf-test.com',
      password: 'wrongpass',
      appName : APP,
    });
    log('wrong password', { status, message: body.message });
    assert.equal(status, 401);
  });

  it('1-9  GET /me returns authenticated user', async () => {
    const { status, body } = await get('/auth/me', ctx.adminToken);
    log('/me', { status, name: body.user?.name, role: body.user?.role });
    assert.equal(status, 200);
    assert.equal(body.user.email, 'admin@wf-test.com');
  });

  it('1-10 GET /me rejects missing token', async () => {
    const { status } = await get('/auth/me');
    assert.equal(status, 401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. EMPLOYEES
// ═════════════════════════════════════════════════════════════════════════════

describe('2 · Employees', () => {

  it('2-1  admin creates employee Jane Doe (Engineering)', async () => {
    const { status, body } = await post('/employees', {
      name               : 'Jane Doe',
      email              : 'emp.jane@wf-test.com',
      department         : 'Engineering',
      designation        : 'Software Engineer',
      hourlyRate         : 40,
      overtimeMultiplier : 1.5,
      phone              : '555-0101',
      joiningDate        : '2023-06-01',
    }, ctx.adminToken);
    log('create Jane Doe', { status, employeeId: body.employee?.employeeId, _id: body.employee?._id });
    assert.equal(status, 201);
    assert.ok(body.employee.employeeId, 'auto-generated employeeId must exist');
    ctx.emp1Id = body.employee._id;
  });

  it('2-2  hr creates employee Bob Smith (HR)', async () => {
    const { status, body } = await post('/employees', {
      name               : 'Bob Smith',
      email              : 'emp.bob@wf-test.com',
      department         : 'Human Resources',
      designation        : 'HR Coordinator',
      hourlyRate         : 30,
      overtimeMultiplier : 1.5,
      phone              : '555-0202',
      joiningDate        : '2023-09-01',
    }, ctx.hrToken);
    log('create Bob Smith', { status, employeeId: body.employee?.employeeId });
    assert.equal(status, 201);
    ctx.emp2Id = body.employee._id;
  });

  it('2-3  employee role cannot create employee', async () => {
    const { status } = await post('/employees', {
      name       : 'Unauthorized',
      email      : 'unauth@wf-test.com',
      department : 'X',
      designation: 'X',
    }, ctx.employeeToken);
    assert.equal(status, 403);
  });

  it('2-4  get all employees (returns at least 2)', async () => {
    const { status, body } = await get('/employees', ctx.adminToken);
    log('all employees', { status, count: body.employees?.length });
    assert.equal(status, 200);
    assert.ok(body.employees.length >= 2);
  });

  it('2-5  get single employee by id', async () => {
    const { status, body } = await get(`/employees/${ctx.emp1Id}`, ctx.adminToken);
    log('get Jane Doe', { status, name: body.employee?.name });
    assert.equal(status, 200);
    assert.equal(body.employee.name, 'Jane Doe');
  });

  it('2-6  update employee designation (hr)', async () => {
    const { status, body } = await put(`/employees/${ctx.emp1Id}`, {
      designation: 'Senior Software Engineer',
      hourlyRate : 50,
    }, ctx.hrToken);
    log('update Jane Doe', { status, designation: body.employee?.designation, hourlyRate: body.employee?.hourlyRate });
    assert.equal(status, 200);
    assert.equal(body.employee.designation, 'Senior Software Engineer');
    assert.equal(body.employee.hourlyRate, 50);
  });

  it('2-7  get departments list', async () => {
    const { status, body } = await get('/employees/departments/list', ctx.adminToken);
    log('departments', { status, departments: body.departments });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.departments));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ATTENDANCE
// ═════════════════════════════════════════════════════════════════════════════

describe('3 · Attendance', () => {

  it('3-1  check-in Jane Doe', async () => {
    const { status, body } = await post('/attendance/mark', {
      employeeId: ctx.emp1Id,
      notes     : 'On time – test run',
    }, ctx.adminToken);
    log('check-in Jane', {
      status,
      checkIn   : body.attendance?.checkIn,
      hoursWorked: body.attendance?.hoursWorked,
    });
    assert.equal(status, 200);
    assert.ok(body.attendance.checkIn);
    assert.equal(body.attendance.checkOut, undefined);
    ctx.att1Id = body.attendance._id;
  });

  it('3-2  check-out Jane Doe (sets hoursWorked & overtimeHours)', async () => {
    // Manually set checkIn to 9h ago so overtime kicks in
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);
    await Attendance.findByIdAndUpdate(ctx.att1Id, { checkIn: nineHoursAgo });

    const { status, body } = await post('/attendance/mark', {
      employeeId: ctx.emp1Id,
    }, ctx.adminToken);
    log('check-out Jane (9h shift)', {
      status,
      hoursWorked  : body.attendance?.hoursWorked,
      overtimeHours: body.attendance?.overtimeHours,
    });
    assert.equal(status, 200);
    assert.ok(body.attendance.hoursWorked > 8, 'should have worked more than 8 hours');
    assert.ok(body.attendance.overtimeHours > 0, 'overtime must be > 0');
  });

  it('3-3  third mark on same day is rejected', async () => {
    const { status, body } = await post('/attendance/mark', {
      employeeId: ctx.emp1Id,
    }, ctx.adminToken);
    log('third mark rejected', { status, message: body.message });
    assert.equal(status, 400);
    assert.match(body.message, /already checked/i);
  });

  it('3-4  check-in Bob Smith', async () => {
    const { status, body } = await post('/attendance/mark', {
      employeeId: ctx.emp2Id,
      notes     : 'On time – test run',
    }, ctx.hrToken);
    log('check-in Bob', { status, checkIn: body.attendance?.checkIn });
    assert.equal(status, 200);
    ctx.att2Id = body.attendance._id;
  });

  it('3-5  admin edits attendance record (force-sets hours)', async () => {
    const checkIn  = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const checkOut = new Date();
    const { status, body } = await put(`/attendance/${ctx.att1Id}`, {
      checkIn,
      checkOut,
      status: 'present',
    }, ctx.adminToken);
    log('edit attendance', {
      status,
      hoursWorked  : body.attendance?.hoursWorked,
      overtimeHours: body.attendance?.overtimeHours,
    });
    assert.equal(status, 200);
    assert.ok(body.attendance.hoursWorked >= 9);
  });

  it('3-6  get todays attendance overview', async () => {
    const { status, body } = await get('/attendance/today', ctx.adminToken);
    log('today overview', { status, total: body.data?.length });
    assert.equal(status, 200);
    assert.ok(body.data.length >= 2);
  });

  it('3-7  get attendance for Jane (date range)', async () => {
    const from = new Date(); from.setDate(1);
    const to   = new Date(); to.setDate(to.getDate() + 1); // +1 day to avoid UTC boundary miss
    const { status, body } = await get(
      `/attendance/employee/${ctx.emp1Id}?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`,
      ctx.adminToken
    );
    log('Jane attendance this month', { status, count: body.attendance?.length });
    assert.equal(status, 200);
    assert.ok(body.attendance.length >= 1);
  });

  it('3-8  get monthly summary for Jane', async () => {
    const now = new Date();
    const { status, body } = await get(
      `/attendance/summary/${ctx.emp1Id}?month=${now.getMonth()+1}&year=${now.getFullYear()}`,
      ctx.adminToken
    );
    log('Jane monthly summary', { status, summary: body.summary });
    assert.equal(status, 200);
    assert.ok(body.summary.totalPresent >= 1);
    assert.ok(body.summary.totalOvertimeHours >= 0);
  });

  it('3-9  employee role cannot view todays overview', async () => {
    const { status } = await get('/attendance/today', ctx.employeeToken);
    assert.equal(status, 403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. OVERTIME
// ═════════════════════════════════════════════════════════════════════════════

describe('4 · Overtime', () => {

  it('4-1  generate overtime report for current month', async () => {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const to   = now.toISOString().slice(0, 10);
    const { status, body } = await get(`/overtime/report?from=${from}&to=${to}`, ctx.adminToken);
    log('overtime report', {
      status,
      count   : body.report?.length,
      sample  : body.report?.[0],
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.report));
    const jane = body.report.find(r => r.name === 'Jane Doe');
    assert.ok(jane, 'Jane Doe must appear in report');
    assert.ok(jane.overtimeHours >= 0);
    assert.ok(jane.totalPay >= 0);
  });

  it('4-2  filter overtime report by department', async () => {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const to   = now.toISOString().slice(0, 10);
    const { status, body } = await get(
      `/overtime/report?from=${from}&to=${to}&department=Engineering`,
      ctx.adminToken
    );
    log('overtime – Engineering only', { status, count: body.report?.length });
    assert.equal(status, 200);
    body.report.forEach(r => assert.equal(r.department, 'Engineering'));
  });

  it('4-3  payroll summary grouped by department', async () => {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const to   = now.toISOString().slice(0, 10);
    const { status, body } = await get(`/overtime/payroll-summary?from=${from}&to=${to}`, ctx.adminToken);
    log('payroll summary', { status, departments: body.summary?.map(d => d.department) });
    assert.equal(status, 200);
    assert.ok(body.summary.length >= 1);
    body.summary.forEach(d => {
      assert.ok(d.department);
      assert.ok(d.totalPay >= 0);
    });
  });

  it('4-4  CSV export returns text/csv with correct headers', async () => {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const to   = now.toISOString().slice(0, 10);
    const res  = await fetch(
      `${BASE}/overtime/export-csv?from=${from}&to=${to}`,
      { headers: { Authorization: `Bearer ${ctx.adminToken}` } }
    );
    const text = await res.text();
    console.log('\n  📦 CSV export:');
    console.log('    Content-Type:', res.headers.get('content-type'));
    console.log('    First line  :', text.split('\n')[0]);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment/);
    assert.match(text, /Employee ID/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. LEAVES
// ═════════════════════════════════════════════════════════════════════════════

describe('5 · Leaves', () => {

  it('5-1  Jane applies for annual leave', async () => {
    const from = new Date(); from.setDate(from.getDate() + 7);
    const to   = new Date(); to.setDate(to.getDate()   + 9);
    const { status, body } = await post('/leaves/apply', {
      employeeId: ctx.emp1Id,
      type      : 'annual',
      fromDate  : from.toISOString().slice(0, 10),
      toDate    : to.toISOString().slice(0, 10),
      reason    : 'Family vacation – test',
    }, ctx.adminToken);
    log('apply annual leave', {
      status,
      type      : body.leave?.type,
      totalDays : body.leave?.totalDays,
      leaveStatus: body.leave?.status,
    });
    assert.equal(status, 201);
    assert.equal(body.leave.status, 'pending');
    assert.ok(body.leave.totalDays >= 1);
    ctx.leaveId = body.leave._id;
  });

  it('5-2  Bob applies for sick leave', async () => {
    const from = new Date(); from.setDate(from.getDate() + 1);
    const to   = new Date(); to.setDate(to.getDate()   + 2);
    const { status, body } = await post('/leaves/apply', {
      employeeId: ctx.emp2Id,
      type      : 'sick',
      fromDate  : from.toISOString().slice(0, 10),
      toDate    : to.toISOString().slice(0, 10),
      reason    : 'Flu – test',
    }, ctx.hrToken);
    log('Bob sick leave', { status, type: body.leave?.type, totalDays: body.leave?.totalDays });
    assert.equal(status, 201);
  });

  it('5-3  get all pending leaves (admin)', async () => {
    const { status, body } = await get('/leaves/all?status=pending', ctx.adminToken);
    log('all pending leaves', { status, count: body.leaves?.length });
    assert.equal(status, 200);
    assert.ok(body.leaves.length >= 1);
    body.leaves.forEach(l => assert.equal(l.status, 'pending'));
  });

  it('5-4  employee role cannot view all leaves', async () => {
    const { status } = await get('/leaves/all', ctx.employeeToken);
    assert.equal(status, 403);
  });

  it('5-5  manager approves Janes leave', async () => {
    const { status, body } = await put(`/leaves/${ctx.leaveId}/approve`, {}, ctx.managerToken);
    log('approve Jane leave', {
      status,
      leaveStatus: body.leave?.status,
      approvedBy : body.leave?.approvedBy?.name,
    });
    assert.equal(status, 200);
    assert.equal(body.leave.status, 'approved');
    assert.ok(body.leave.approvedBy);
  });

  it('5-6  re-approving is idempotent (still 200)', async () => {
    const { status, body } = await put(`/leaves/${ctx.leaveId}/approve`, {}, ctx.adminToken);
    assert.equal(status, 200);
    assert.equal(body.leave.status, 'approved');
  });

  it('5-7  get leave balance for Jane', async () => {
    const { status, body } = await get(`/leaves/balance/${ctx.emp1Id}`, ctx.adminToken);
    log('Jane leave balance', { status, balance: body.balance });
    assert.equal(status, 200);
    assert.ok(body.balance.annual, 'annual balance must exist');
    assert.equal(body.balance.annual.entitled, 12);
    assert.ok(body.balance.annual.used >= 1, 'used days must reflect approved leave');
    assert.ok(body.balance.annual.remaining < 12);
  });

  it('5-8  get my own leaves', async () => {
    // employee user is not linked to an employeeRef, so returns empty — just check 200
    const { status, body } = await get('/leaves/my', ctx.employeeToken);
    log('/leaves/my', { status, count: body.leaves?.length });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.leaves));
  });

  it('5-9  manager rejects Bobs leave', async () => {
    // get Bob's leave ID
    const { body: all } = await get('/leaves/all?status=pending', ctx.adminToken);
    const bobLeave = all.leaves.find(l => l.employeeId?.name === 'Bob Smith');
    if (!bobLeave) { console.log('    ⚠️  Bob leave already processed, skipping'); return; }

    const { status, body } = await put(`/leaves/${bobLeave._id}/reject`, {}, ctx.managerToken);
    log('reject Bob leave', { status, leaveStatus: body.leave?.status });
    assert.equal(status, 200);
    assert.equal(body.leave.status, 'rejected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. ROLE-BASED ACCESS GUARD — cross-cutting
// ═════════════════════════════════════════════════════════════════════════════

describe('6 · Role-based access', () => {

  it('6-1  unauthenticated request is rejected (401)', async () => {
    const { status } = await get('/employees');
    assert.equal(status, 401);
  });

  it('6-2  employee cannot delete another employee', async () => {
    const { status } = await del(`/employees/${ctx.emp2Id}`, ctx.employeeToken);
    assert.equal(status, 403);
  });

  it('6-3  manager cannot delete employee (admin only)', async () => {
    const { status } = await del(`/employees/${ctx.emp2Id}`, ctx.managerToken);
    assert.equal(status, 403);
  });

  it('6-4  admin can delete employee', async () => {
    // create a temp employee to delete
    const { body: created } = await post('/employees', {
      name       : 'Temp Delete',
      email      : 'temp.delete@wf-test.com',
      department : 'Test',
      designation: 'Test',
    }, ctx.adminToken);
    const { status } = await del(`/employees/${created.employee._id}`, ctx.adminToken);
    log('admin deletes temp employee', { status });
    assert.equal(status, 200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════

describe('7 · Health', () => {
  it('7-1  /api/health returns ok', async () => {
    const { status, body } = await get('/health');
    log('health', { status, status_body: body.status });
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });
});
