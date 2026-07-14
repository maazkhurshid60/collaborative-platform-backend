# Kolabme Collaborative Workspace — Backend Server

[![Express](https://img.shields.io/badge/Express-4-blue.svg?style=flat&logo=express)](https://expressjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748.svg?style=flat&logo=prisma)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-D82C20.svg?style=flat&logo=redis)](https://redis.io)

This repository contains the Node.js + Express backend server powering the Kolabme client-provider collaboration workspace. The architecture is built with TypeScript, structured with standard REST API route patterns, managed by the Prisma ORM, and integrated with Redis-backed queues for intensive asynchronous operations.

---

## 🚀 Core Engine Features

*   **Secure Authentication & 2FA:** JWT access/refresh token rotation inside secure HTTP-only cookies, combined with Google MFA (Speakeasy Speakeasy OTP).
*   **Asynchronous Processing (BullMQ):** High-performance background queues driven by Redis:
    *   `EmailWorker` for transactional nodemailer SMTP mailings.
    *   `AuditLogWorker` for non-blocking administrative action tracking logs.
    *   `KitWorker` for background CRM tag synchronization.
*   **Dynamic Document & Form Sharing:** Custom template parsing, token-based link sharing, link expiration, and secure JSON data payload storage.
*   **AWS S3 Storage:** Multipart file uploads and downloads handling using the AWS S3 SDK and Multer.
*   **Stripe billing engine:** Live subscription state listeners and multi-plan payments management via secure Stripe Webhook controllers.
*   **Primary Cluster Manager:** Standard Node.js cluster fork manager to scale server capacity across multi-core CPU hardware in production.

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Runtime & Language** | Node.js (v20+), TypeScript 5 |
| **HTTP Framework** | Express.js, http-status-codes |
| **Database ORM** | Prisma ORM, Prisma Client |
| **Database Engine** | PostgreSQL (Hosted AWS RDS) |
| **Task Queue Manager** | BullMQ, ioredis (Redis) |
| **WebSocket Protocol** | Socket.io (Real-time events) |
| **Secure Cryptography** | bcrypt, jsonwebtoken, speakeasy |
| **Storage Engine** | AWS S3, multer, multer-s3 |
| **Payment Gateway** | Stripe SDK |
| **CRM Integration** | Kit (ConvertKit) v4 API client |

---

## 📦 Directory Structure

```bash
src/
├── config/            # Environment configurations (Stripe, AWS, Redis, Kit)
├── controller/        # REST route handler logics (Auth, Forms, Clients, Chat)
├── db/                # Prisma DB client initialization configuration
├── integrations/      # Third-party API wrappers (Kit v4 API helper clients)
├── middleware/        # JWT auth verify, 2FA validation, rate limiters
├── route/             # API Router definitions grouped by resource endpoints
├── services/          # Business services, queues, and worker definitions (BullMQ)
├── socket/            # Real-time WebSocket room and connection setup
├── utils/             # Helper logs, responses, cron utilities, mailers
├── app.ts             # Express Application setup and middleware imports
└── index.ts           # Core server entry point with cluster manager rules
```

---

## ⚙️ Local Development Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
*   [PostgreSQL](https://www.postgresql.org/) database server instance
*   [Redis](https://redis.io/) memory cache server instance (required for BullMQ workers)

### 2. Clone the Repository
```bash
git clone https://github.com/maazkhurshid60/collaborative-platform-backend.git
cd collaborative-platform-backend
```

### 3. Install Node Modules
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory (you can copy the structure from `example.env`):
```bash
cp example.env .env
```
Ensure you provide correct connection parameters for PostgreSQL and Redis:
```env
# Server Port
PORT=8000
NODE_ENV="development"

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/dbname?connection_limit=20"

# Redis Server URL (BullMQ)
REDIS_URL="redis://localhost:6379"

# Stripe API Access
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Kit API keys (V4 CRM Key)
KIT_V4_API_KEY="kit_..."
KIT_FREE_USER_TAG_ID="..."
KIT_PREMIUM_USER_TAG_ID="..."
```

### 5. Run Prisma Migrations
Sync your local database schema using the Prisma CLI:
```bash
npx prisma migrate dev
```
*(Optional)* Populate the database with seed data:
```bash
npm run prisma:seed
```

### 6. Launch the Server
Start the development server with Nodemon. It will automatically restart on file changes:
```bash
npm run dev
```

### 7. Run Unit Tests
To execute unit tests written in Jest:
```bash
npm test
```

---

## 🔒 Security Audit Rules

*   **Double CSRF Cookie Protection:** Authentication relies on rotating HttpOnly, secure cookies.
*   **Strict CORS Policy:** The server restricts requests strictly to the configured frontend client URL.
*   **Interactive Transactions:** Atomic transactions are strictly bound to multiple query operations (e.g. form submissions) to guarantee database consistency.
