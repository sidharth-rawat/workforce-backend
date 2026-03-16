/**
 * Seed Script — WorkForce Pro
 * Creates realistic data for testing every app flow.
 *
 * Run: node scripts/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const User       = require('../models/User');
const Employee   = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave      = require('../models/Leave');

const APP_NAME = process.env.APP_NAME || 'workforce';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce';

// ─── helpers ──────────────────────────────────────────────────────────────────

const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = (arr) => arr[rand(0, arr.length - 1)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

/** Returns array of the last N calendar days (most recent last) */
function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return startOfDay(d);
  });
}

function countBusinessDays(start, end) {
  let count = 0;
  const cur = new Date(start); cur.setHours(0, 0, 0, 0);
  const e   = new Date(end);   e.setHours(23, 59, 59, 999);
  while (cur <= e) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── seed data definitions ────────────────────────────────────────────────────

const DEPARTMENTS = ['Engineering', 'Human Resources', 'Finance', 'Marketing', 'Operations'];

const USERS_DEF = [
  { name: 'Admin User',    email: 'admin@company.com',   password: 'Admin@123',   role: 'admin',    department: 'Management' },
  { name: 'Sarah HR',      email: 'sarah@company.com',   password: 'Sarah@123',   role: 'hr',       department: 'Human Resources' },
  { name: 'Mark Manager',  email: 'mark@company.com',    password: 'Mark@123',    role: 'manager',  department: 'Engineering' },
  { name: 'Jane Doe',      email: 'jane@company.com',    password: 'Jane@123',    role: 'employee', department: 'Engineering' },
  { name: 'Bob Smith',     email: 'bob@company.com',     password: 'Bob@123',     role: 'employee', department: 'Human Resources' },
  { name: 'Alice Chen',    email: 'alice@company.com',   password: 'Alice@123',   role: 'employee', department: 'Finance' },
  { name: 'Carlos Rivera', email: 'carlos@company.com',  password: 'Carlos@123',  role: 'employee', department: 'Marketing' },
  { name: 'Diana Prince',  email: 'diana@company.com',   password: 'Diana@123',   role: 'employee', department: 'Operations' },
];

const EMPLOYEES_DEF = [
  { name: 'Jane Doe',       email: 'jane@company.com',    department: 'Engineering',     designation: 'Senior Software Engineer', hourlyRate: 55, overtimeMultiplier: 1.5, phone: '555-1001', joiningDate: '2022-03-15' },
  { name: 'Bob Smith',      email: 'bob@company.com',     department: 'Human Resources', designation: 'HR Coordinator',           hourlyRate: 35, overtimeMultiplier: 1.5, phone: '555-1002', joiningDate: '2022-07-01' },
  { name: 'Alice Chen',     email: 'alice@company.com',   department: 'Finance',         designation: 'Financial Analyst',        hourlyRate: 48, overtimeMultiplier: 1.5, phone: '555-1003', joiningDate: '2021-11-20' },
  { name: 'Carlos Rivera',  email: 'carlos@company.com',  department: 'Marketing',       designation: 'Marketing Specialist',     hourlyRate: 38, overtimeMultiplier: 1.5, phone: '555-1004', joiningDate: '2023-01-10' },
  { name: 'Diana Prince',   email: 'diana@company.com',   department: 'Operations',      designation: 'Operations Manager',       hourlyRate: 52, overtimeMultiplier: 2.0, phone: '555-1005', joiningDate: '2020-06-05' },
  { name: 'Ethan Hunt',     email: 'ethan@company.com',   department: 'Engineering',     designation: 'DevOps Engineer',          hourlyRate: 60, overtimeMultiplier: 1.5, phone: '555-1006', joiningDate: '2021-09-14' },
  { name: 'Fiona Green',    email: 'fiona@company.com',   department: 'Engineering',     designation: 'Frontend Developer',       hourlyRate: 45, overtimeMultiplier: 1.5, phone: '555-1007', joiningDate: '2023-04-03' },
  { name: 'George King',    email: 'george@company.com',  department: 'Finance',         designation: 'Accountant',               hourlyRate: 40, overtimeMultiplier: 1.5, phone: '555-1008', joiningDate: '2022-12-01' },
  { name: 'Hannah Lee',     email: 'hannah@company.com',  department: 'Marketing',       designation: 'Content Strategist',       hourlyRate: 36, overtimeMultiplier: 1.5, phone: '555-1009', joiningDate: '2023-06-15' },
  { name: 'Ivan Petrov',    email: 'ivan@company.com',    department: 'Operations',      designation: 'Logistics Coordinator',    hourlyRate: 32, overtimeMultiplier: 1.5, phone: '555-1010', joiningDate: '2022-02-28' },
  { name: 'Julia Roberts',  email: 'julia@company.com',   department: 'Human Resources', designation: 'Talent Acquisition Lead',  hourlyRate: 42, overtimeMultiplier: 1.5, phone: '555-1011', joiningDate: '2021-08-10' },
  { name: 'Kevin Bacon',    email: 'kevin@company.com',   department: 'Engineering',     designation: 'Backend Developer',        hourlyRate: 50, overtimeMultiplier: 1.5, phone: '555-1012', joiningDate: '2020-01-15' },
];

const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid'];

// ─── main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('\n🔗  Connected to MongoDB\n');

  // ── 1. Wipe all collections for a clean slate ─────────────────────────────
  console.log('🧹  Dropping all collections for a clean slate …');
  await Attendance.deleteMany({});
  await Leave.deleteMany({});
  await Employee.deleteMany({});
  await User.deleteMany({ appName: APP_NAME });
  console.log('✅  Clean slate ready\n');

  // ── 2. Create Employees ────────────────────────────────────────────────────
  console.log('👥  Creating employees …');
  const employees = [];
  for (let i = 0; i < EMPLOYEES_DEF.length; i++) {
    const def = EMPLOYEES_DEF[i];
    const emp = await Employee.create({
      ...def,
      employeeId: `EMP${String(i + 1).padStart(4, '0')}`,
      status: 'active',
    });
    employees.push(emp);
    console.log(`   ✔  ${emp.employeeId}  ${emp.name.padEnd(18)} ${emp.department}`);
  }

  // ── 3. Create Users (hash passwords manually to avoid double-hashing) ──────
  console.log('\n🔑  Creating user accounts …');
  const users = [];
  for (const def of USERS_DEF) {
    const empMatch = employees.find(e => e.email === def.email);
    // Pass plain-text password — the pre('save') hook in User.js hashes it
    const user = await User.create({
      appName    : APP_NAME,
      name       : def.name,
      email      : def.email,
      password   : def.password,
      role       : def.role,
      department : def.department,
      employeeRef: empMatch?._id || null,
    });
    users.push(user);
    console.log(`   ✔  ${def.role.padEnd(9)}  ${def.email}  /  pw: ${def.password}`);
  }

  const adminUser   = users.find(u => u.role === 'admin');
  const managerUser = users.find(u => u.role === 'manager');

  // ── 4. Attendance — last 30 days ───────────────────────────────────────────
  console.log('\n📅  Seeding attendance records (last 30 days) …');
  const days = lastNDays(30);
  let attCount = 0;

  for (const emp of employees) {
    for (const day of days) {
      const dow = day.getDay(); // 0=Sun 6=Sat
      if (dow === 0 || dow === 6) continue; // skip weekends

      // 10 % chance of absence
      if (Math.random() < 0.10) continue;

      // Check-in between 08:00 – 09:30
      const checkIn  = new Date(day);
      checkIn.setHours(rand(8, 9), rand(0, 59), 0, 0);

      // Work 7–11 hours (some people do overtime)
      const workHours = 7 + Math.random() * 4; // 7.0 – 11.0
      const checkOut  = new Date(checkIn.getTime() + workHours * 3600 * 1000);

      const hoursWorked   = workHours;
      const overtimeHours = Math.max(0, hoursWorked - 8);

      // Status: late if check-in after 09:05
      const late   = checkIn.getHours() > 9 || (checkIn.getHours() === 9 && checkIn.getMinutes() > 5);
      const status = late ? 'late' : 'present';

      try {
        await Attendance.create({
          employeeId  : emp._id,
          date        : day,
          checkIn,
          checkOut,
          hoursWorked : parseFloat(hoursWorked.toFixed(4)),
          overtimeHours: parseFloat(overtimeHours.toFixed(4)),
          status,
        });
        attCount++;
      } catch (e) {
        // skip duplicate (shouldn't happen but just in case)
      }
    }
  }
  console.log(`   ✔  ${attCount} attendance records created`);

  // ── 5. Leaves ──────────────────────────────────────────────────────────────
  console.log('\n🌴  Seeding leave records …');
  const leaveRows = [];

  // Helper to add days to a date
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // -- Approved leaves (past) --
  const approvedLeaves = [
    { emp: employees[0], type: 'annual',  from: addDays(new Date(), -45), to: addDays(new Date(), -43), status: 'approved' },
    { emp: employees[1], type: 'sick',    from: addDays(new Date(), -20), to: addDays(new Date(), -19), status: 'approved' },
    { emp: employees[2], type: 'casual',  from: addDays(new Date(), -30), to: addDays(new Date(), -28), status: 'approved' },
    { emp: employees[3], type: 'annual',  from: addDays(new Date(), -60), to: addDays(new Date(), -55), status: 'approved' },
    { emp: employees[4], type: 'unpaid',  from: addDays(new Date(), -10), to: addDays(new Date(), -10), status: 'approved' },
    { emp: employees[5], type: 'sick',    from: addDays(new Date(), -5),  to: addDays(new Date(), -4),  status: 'approved' },
    { emp: employees[6], type: 'casual',  from: addDays(new Date(), -14), to: addDays(new Date(), -14), status: 'approved' },
    { emp: employees[7], type: 'annual',  from: addDays(new Date(), -90), to: addDays(new Date(), -85), status: 'approved' },
  ];

  // -- Rejected leaves (past) --
  const rejectedLeaves = [
    { emp: employees[0], type: 'annual',  from: addDays(new Date(), -70), to: addDays(new Date(), -65), status: 'rejected' },
    { emp: employees[2], type: 'casual',  from: addDays(new Date(), -50), to: addDays(new Date(), -49), status: 'rejected' },
    { emp: employees[8], type: 'sick',    from: addDays(new Date(), -25), to: addDays(new Date(), -24), status: 'rejected' },
  ];

  // -- Pending leaves (future) --
  const pendingLeaves = [
    { emp: employees[0],  type: 'annual',  from: addDays(new Date(), 5),  to: addDays(new Date(), 9)  },
    { emp: employees[1],  type: 'sick',    from: addDays(new Date(), 2),  to: addDays(new Date(), 3)  },
    { emp: employees[3],  type: 'casual',  from: addDays(new Date(), 7),  to: addDays(new Date(), 7)  },
    { emp: employees[5],  type: 'annual',  from: addDays(new Date(), 14), to: addDays(new Date(), 18) },
    { emp: employees[9],  type: 'sick',    from: addDays(new Date(), 1),  to: addDays(new Date(), 2)  },
    { emp: employees[10], type: 'casual',  from: addDays(new Date(), 3),  to: addDays(new Date(), 4)  },
    { emp: employees[11], type: 'annual',  from: addDays(new Date(), 20), to: addDays(new Date(), 25) },
  ];

  for (const l of approvedLeaves) {
    const totalDays = countBusinessDays(l.from, l.to);
    await Leave.create({
      employeeId: l.emp._id,
      type      : l.type,
      fromDate  : l.from,
      toDate    : l.to,
      totalDays,
      reason    : `${l.type.charAt(0).toUpperCase() + l.type.slice(1)} leave`,
      status    : 'approved',
      approvedBy: adminUser._id,
      approvedAt: new Date(l.to.getTime() - 86400000),
      appliedAt : new Date(l.from.getTime() - 3 * 86400000),
    });
    leaveRows.push(`approved  ${l.type.padEnd(9)} ${l.emp.name}`);
  }

  for (const l of rejectedLeaves) {
    const totalDays = countBusinessDays(l.from, l.to);
    await Leave.create({
      employeeId: l.emp._id,
      type      : l.type,
      fromDate  : l.from,
      toDate    : l.to,
      totalDays,
      reason    : `${l.type.charAt(0).toUpperCase() + l.type.slice(1)} leave request`,
      status    : 'rejected',
      approvedBy: managerUser._id,
      approvedAt: new Date(l.from.getTime() - 86400000),
      appliedAt : new Date(l.from.getTime() - 4 * 86400000),
    });
    leaveRows.push(`rejected  ${l.type.padEnd(9)} ${l.emp.name}`);
  }

  for (const l of pendingLeaves) {
    const totalDays = countBusinessDays(l.from, l.to);
    await Leave.create({
      employeeId: l.emp._id,
      type      : l.type,
      fromDate  : l.from,
      toDate    : l.to,
      totalDays,
      reason    : `Requesting ${l.type} leave`,
      status    : 'pending',
      appliedAt : new Date(),
    });
    leaveRows.push(`pending   ${l.type.padEnd(9)} ${l.emp.name}`);
  }

  leaveRows.forEach(r => console.log(`   ✔  ${r}`));

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('🎉  Seed complete!\n');
  console.log('  Employees  :', employees.length);
  console.log('  Users      :', users.length);
  console.log('  Attendance :', attCount, 'records (last 30 days)');
  console.log('  Leaves     :', approvedLeaves.length + rejectedLeaves.length + pendingLeaves.length,
    `(${approvedLeaves.length} approved, ${rejectedLeaves.length} rejected, ${pendingLeaves.length} pending)`);
  console.log('\n' + '─'.repeat(60));
  console.log('\n📋  LOGIN CREDENTIALS\n');
  USERS_DEF.forEach(u => {
    console.log(`  ${u.role.padEnd(9)}  ${u.email.padEnd(28)}  ${u.password}`);
  });
  console.log('\n  All passwords are as shown above.');
  console.log('─'.repeat(60) + '\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
