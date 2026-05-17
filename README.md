# Adosistering

Adosistering is a SolidStart web dashboard for IoT-based drip irrigation management. The application stores administration data in SQL through Prisma and uses Firebase Realtime Database for live sprayer telemetry and control.

## Core Features

- Role-based access control: Superadmin, Admin, and User.
- SQL-backed user, region, block, sprayer, assignment, threshold, history, and activity-log management.
- Firebase RTDB live monitoring for blocks and sprayers.
- Manual and automatic sprayer control.
- Region-based dashboard, map visualization, statistics, settings, and irrigation history.
- Password reset email with reusable templates.
- Responsive UI with skeleton loading, NProgress, modal confirmations, and global error handling.

## Tech Stack

- SolidStart 2 alpha, SolidJS, Solid Router, Solid Meta
- Bun, Vite, Tailwind CSS v4
- Prisma ORM with MySQL/MariaDB
- Firebase Client SDK and Firebase Admin SDK
- Nodemailer
- ESLint, Prettier, strict TypeScript

## Project Structure

```text
prisma/                  Database schema, migrations, and seed
public/                  Public static assets
src/
  assets/                Internal images and SVG assets
  components/
    form/                Reusable form controls
    shared/              App-wide components: Sidebar, Toast, Confirm, Leaflet map
    ui/                  Dumb UI components: Button, Card, Badge, Toggle
  config/                Public/server-adjacent app, site, env, and theme config
  constants/             Route constants and shared error messages
  features/              Domain UI modules, currently dashboard widgets
  layouts/               AppLayout and AuthLayout
  lib/
    client/              Browser-only helpers: Firebase client, NProgress
    shared/              Universal pure helpers: irrigation/Firebase path logic
  middleware/            SolidStart middleware implementation
  routes/                File-based routes, all URLs are English
  server/
    actions/             SolidStart server actions
    db/                  Prisma client
    email/               Email sender
    services/            Firebase Admin sync services
  templates/email/       Email templates
  types/                 Global/shared TypeScript declarations
```

## Environment

Copy `.env.example` to `.env`, then fill the required values.

```env
DATABASE_URL="mysql://root:password@localhost:3306/adosistering"
APP_ORIGIN="http://localhost:3000"
SESSION_COOKIE_NAME="adosistering_session"

FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
FIREBASE_DATABASE_URL=""
FIREBASE_SYNC_DISABLED="false"

VITE_FIREBASE_API_KEY=""
VITE_FIREBASE_AUTH_DOMAIN=""
VITE_FIREBASE_DATABASE_URL=""
VITE_FIREBASE_PROJECT_ID=""
VITE_FIREBASE_APP_ID=""

SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="Adosistering <no-reply@example.com>"
```

## Setup

Requirements: Bun and Node.js 22 or newer. Bun is used for dependency and development commands; the production Nitro server runs on Node.

```bash
bun install
bunx prisma generate
bun run db:migrate
bun run db:seed
bun run dev -- --host 127.0.0.1 --port 3000
```

Default seed accounts:

```text
superadmin@test.com / Password123!
admin@test.com / Password123!
user@test.com / Password123!
kawistamaos@adosistering.labgo.id / mernek123
```

## Development Commands

```bash
bun run dev          Start development server
bun run build        Production build
bun run start        Start the built Nitro Node server from .output
bunx tsc --noEmit    Type-check only
bunx prisma validate Validate Prisma schema
bun run db:seed      Seed demo data
```
