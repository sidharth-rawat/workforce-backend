# WorkForce Pro — Backend

REST API for the WorkForce Pro HR management platform. Built with Node.js, Express, and MongoDB.

---

## System Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT                             │
│         React SPA (workforce-pro1.netlify.app)          │
└─────────────────────┬───────────────────────────────────┘
                      │  HTTPS  (JSON REST)
┌─────────────────────▼───────────────────────────────────┐
│                  EXPRESS SERVER                         │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   helmet    │  │  rate-limit  │  │  CORS guard   │  │
│  │ (sec hdrs) │  │ 100/15min    │  │ allowlist     │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│  ┌─────────────┐  ┌──────────────┐                      │
│  │mongo-sanit. │  │     hpp      │                      │
│  │(NoSQL inj.) │  │(param pollut)│                      │
│  └─────────────┘  └──────────────┘                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                   ROUTES                         │   │
│  │  /api/auth  /api/employees  /api/attendance      │   │
│  │  /api/leaves               /api/overtime         │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │              MIDDLEWARE                          │   │
│  │   authenticate (JWT verify)                      │   │
│  │   authorize    (role-based access)               │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │              MODELS (Mongoose)                   │   │
│  │   User · Employee · Attendance · Leave           │   │
│  └──────────────┬───────────────────────────────────┘   │
└─────────────────┼───────────────────────────────────────┘
                  │  Mongoose ODM
┌─────────────────▼───────────────────────────────────────┐
│                    MongoDB Atlas                         │
└─────────────────────────────────────────────────────────┘
```

---

### Database Schema

```
┌──────────────────────────┐       ┌──────────────────────────┐
│          User            │       │        Employee          │
├──────────────────────────┤       ├──────────────────────────┤
│ _id         ObjectId PK  │──┐    │ _id         ObjectId PK  │
│ appName     String       │  │    │ employeeId  String (uniq)│
│ name        String       │  │    │ name        String       │
│ email       String       │  └───▶│ email       String (uniq)│
│ password    String(hash) │       │ department  String       │
│ role        Enum         │       │ designation String       │
│ department  String       │       │ hourlyRate  Number       │
│ employeeRef ObjectId ────┼──────▶│ overtimeMul Number      │
│ createdAt   Date         │       │ joiningDate Date         │
└──────────────────────────┘       │ phone       String       │
                                   │ status      Enum         │
                                   └────────────┬─────────────┘
                                                │
                    ┌───────────────────────────┼────────────────────┐
                    │                           │                    │
       ┌────────────▼──────────┐   ┌────────────▼──────────┐        │
       │      Attendance       │   │         Leave         │        │
       ├───────────────────────┤   ├───────────────────────┤        │
       │ _id        ObjectId   │   │ _id        ObjectId   │        │
       │ employeeId ObjectId ──┘   │ employeeId ObjectId ──┘        │
       │ date       Date           │ type       Enum                │
       │ checkIn    Date           │ fromDate   Date                │
       │ checkOut   Date           │ toDate     Date                │
       │ hoursWorked Number        │ totalDays  Number              │
       │ overtimeHrs Number        │ reason     String              │
       │ status     Enum           │ status     Enum                │
       │ notes      String         │ approvedBy ObjectId ──▶ User   │
       └───────────────────────┘   │ approvedAt Date                │
                                   │ appliedAt  Date                │
                                   └───────────────────────────────┘
```

---

### Role-Based Access Control

```
┌──────────┬────────────┬────────────┬───────────┬──────────────┐
│ Resource │   admin    │     hr     │  manager  │   employee   │
├──────────┼────────────┼────────────┼───────────┼──────────────┤
│Employees │ Full CRUD  │ Read+Write │ Read only │ Own record   │
│Attendance│ Read+Edit  │ Read+Edit  │ Read only │ Mark own     │
│Leaves    │ Full CRUD  │ Full CRUD  │Approve/   │ Apply & view │
│          │            │            │Reject     │ own leaves   │
│Overtime  │ Full report│ Full report│Full report│ Own report   │
│Auth      │ Register   │ Register   │     —     │     —        │
└──────────┴────────────┴────────────┴───────────┴──────────────┘
```

---

### API Endpoints

#### Auth — `/api/auth`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/register` | Public | Register new user |
| POST | `/login` | Public | Login & receive JWT |
| GET | `/me` | Auth | Get current user profile |

#### Employees — `/api/employees`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/` | Auth | List all employees |
| GET | `/:id` | Auth | Get single employee |
| GET | `/departments/list` | Auth | List departments |
| POST | `/` | Admin, HR | Create employee |
| PUT | `/:id` | Admin, HR | Update employee |
| DELETE | `/:id` | Admin | Delete employee |

#### Attendance — `/api/attendance`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/mark` | Auth | Check-in / Check-out |
| GET | `/today` | Admin, HR, Manager | Today's attendance |
| GET | `/employee/:id` | Auth | Employee attendance history |
| GET | `/summary/:id` | Auth | Monthly summary |
| PUT | `/:id` | Admin, HR | Edit attendance record |

#### Leaves — `/api/leaves`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/apply` | Auth | Apply for leave |
| GET | `/my` | Auth | My leave requests |
| GET | `/all` | Admin, HR, Manager | All leave requests |
| GET | `/balance/:id` | Auth | Leave balance by type |
| PUT | `/:id/approve` | Admin, HR, Manager | Approve leave |
| PUT | `/:id/reject` | Admin, HR, Manager | Reject leave |

#### Overtime — `/api/overtime`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/report` | Auth | Overtime & pay report |
| GET | `/payroll-summary` | Auth | Department payroll summary |
| GET | `/export-csv` | Auth | Export report as CSV |

---

### Security Layers

```
Request
   │
   ▼
[helmet]          → Secure HTTP headers (XSS, HSTS, content-type sniffing)
   │
   ▼
[CORS]            → Allowlisted origins only
   │
   ▼
[rate-limit]      → 100 req/15min (general) · 10 req/15min (auth)
   │
   ▼
[JSON limit 10kb] → Prevent large payload attacks
   │
   ▼
[mongoSanitize]   → Strip $ and . to prevent NoSQL injection
   │
   ▼
[hpp]             → Prevent HTTP parameter pollution
   │
   ▼
[authenticate]    → JWT verification
   │
   ▼
[authorize]       → Role-based access check
   │
   ▼
Route Handler
```

---

### Authentication Flow

```
Client                          Server                        MongoDB
  │                               │                              │
  │── POST /api/auth/login ──────▶│                              │
  │   { email, password }         │── findOne({ email }) ───────▶│
  │                               │◀─ user document ────────────│
  │                               │                              │
  │                               │── bcrypt.compare()           │
  │                               │                              │
  │◀── { token, user } ──────────│                              │
  │                               │                              │
  │── GET /api/... ──────────────▶│                              │
  │   Authorization: Bearer <JWT> │                              │
  │                               │── jwt.verify(token)          │
  │                               │── findById(decoded.id) ─────▶│
  │◀── protected resource ───────│◀─ user ─────────────────────│
```

---

### Overtime & Payroll Calculation

```
For each employee in date range:
  totalHours     = SUM(attendance.hoursWorked)
  overtimeHours  = SUM(attendance.overtimeHours)   [hours > 8/day]
  regularHours   = totalHours - overtimeHours

  regularPay     = regularHours  × hourlyRate
  overtimePay    = overtimeHours × hourlyRate × overtimeMultiplier
  totalPay       = regularPay + overtimePay
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Security | helmet, express-rate-limit, express-mongo-sanitize, hpp |
| CSV Export | json2csv |
| Dev | nodemon |

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)

### Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, APP_NAME, PORT

# Seed the database with sample data
node scripts/seed.js

# Start development server
npm run dev
```

### Environment Variables

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/workforce
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
APP_NAME=workforce
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Sample Login Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| admin | admin@company.com | Admin@123 |
| hr | sarah@company.com | Sarah@123 |
| manager | mark@company.com | Mark@123 |
| employee | jane@company.com | Jane@123 |
