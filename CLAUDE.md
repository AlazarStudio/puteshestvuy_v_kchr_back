# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Backend REST API for **Путешествуй в КЧР** — a travel website for Karachay-Cherkessia. Express.js + MongoDB (via Prisma). The frontend lives in `c:\github\puteshestvuy_v_kchr`.

## Commands

```bash
npm run dev           # Dev server with nodemon (port 5000)
npm run create-admin  # Seed an admin user
npm run backup        # MongoDB backup/restore CLI
npm run sync-view-counts  # Sync view counts (also runs via cron)
npx prisma migrate dev --name <name>  # Run a migration
npx prisma studio     # DB browser UI (port 5555)
```

## Environment Variables

```
NODE_ENV=development
PORT=5000
DATABASE_URL=mongodb://localhost:27017/puteshestvuy
JWT_SECRET=

# Email (Nodemailer)
SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM / MAIL_FROM

# Production SSL
SERVER_KEY / SERVER_CERT / SERVER_CA
FRONTEND_URL   # comma-separated allowed origins for CORS
```

## Architecture

### Entry Point (`server.js`)
Middleware chain order: CORS → Cookie Parser → JSON body (10 MB) → static `/uploads` → routes at `/api/*` → 404 handler → global error handler. Creates HTTP (dev) or HTTP+HTTPS (prod with SSL env vars) servers with graceful shutdown.

### Module Layout
Each resource lives in its own folder under `app/` with a consistent structure:

```
app/
├── auth/          # register, login → JWT issued (10-day expiry)
├── user/          # profile get/update
├── admin/         # admin-only CRUD for all entities
├── places/        # public listing, filters, detail, reviews
├── routes/        # public listing, filters, detail, reviews
├── services/      # public listing, filters, detail, reviews
├── bookings/      # booking request creation, busy-date queries
├── news/          # news/article listing and detail
├── region/        # CMS — region info page
├── home/          # CMS — home page content
├── footer/        # CMS — footer content
├── pages/         # CMS — generic JSON block pages
├── middleware/    # auth, error, validation, visitor tracking
├── utils/         # imageUpload, mailer, user field helpers
├── _empty/        # template folder — copy to scaffold a new module
└── prisma.js      # Prisma client singleton
prisma/
└── schema.prisma  # MongoDB schema
scripts/           # one-off scripts (createAdmin, syncViewCounts, importPlaces, backup)
```

### Authentication
- `protect` middleware — extracts Bearer token, verifies JWT, loads `req.user`
- `admin` middleware — checks `SUPERADMIN` or `ADMIN` role
- Passwords hashed with Argon2

### API Route Groups

| Prefix | Purpose |
|---|---|
| `/api/auth` | login, register |
| `/api/users` | user profile |
| `/api/admin` | admin CRUD (places, routes, services, news, bookings, users…) |
| `/api/places` | public place listing + filters |
| `/api/routes` | public route listing + filters |
| `/api/services` | public service listing + filters |
| `/api/bookings` | booking requests + busy dates |
| `/api/news` | news/articles |
| `/api/region`, `/api/home`, `/api/footer`, `/api/pages` | CMS endpoints |

### Database Schema (MongoDB via Prisma)
Key models:
- **User** — role (`SUPERADMIN` / `ADMIN` / `USER`), favorites arrays (routeIds, placeIds, serviceIds), custom routes
- **Route / Place / Service** — slug, images array, reviews, custom filter configs
- **Review** — polymorphic via `entityType` + `entityId`, statuses: `pending / approved / rejected`
- **BookingRequest** — polymorphic entity reference, status: `new / processed / cancelled`
- **ViewTracking** — unique-per-visitor view deduplication (`entityType + entityId + userId/visitorId`)
- **RouteFilterConfig / PlaceFilterConfig** — admin-configurable filter groups (JSON)
- **Region, Home, Footer, Page** — JSON blob CMS models
- **Media** — uploaded file metadata
- **News** — block-based content (JSON blocks field)

### Image Upload Pipeline (`app/utils/imageUpload.js`)
Multer → Sharp: JPEG/PNG converted to WebP (quality 78, max 2560 px, EXIF auto-rotate); SVG/GIF pass through unchanged. Max upload: 40 MB. Original file deleted after conversion. Output stored in `/uploads`.

### Validation
`app/middleware/validation.middleware.js` — field-level config array passed inline to routes:
```js
validateRequest([{ field: 'email', required: true, isEmail: true }])
```

### Visitor Tracking
`app/middleware/visitor.middleware.js` assigns a UUID cookie to unauthenticated users for view deduplication on detail endpoints.

### Error Handling
`express-async-handler` wraps all controllers. `app/middleware/error.middleware.js` catches 404s and all unhandled errors; stack traces suppressed in production.

### Email (`app/utils/mailer.js`)
Nodemailer transporter (cached). Used for booking confirmations and footer contact form. Fails silently if SMTP not configured.

## Code Guidelines

- Clean, readable, efficient, maintainable code — no over-engineering or unnecessary abstractions
- Logic in controllers/utils; keep middleware focused on a single concern
- No logic duplication — reuse existing utilities
- No new dependencies without clear necessity
- Always analyze existing structure and style before writing code; strictly follow established architecture and patterns

## Response Style

- Think in English, respond in Russian
- No explanations of what you're doing — just do it
- No unnecessary comments or post-task summaries
- If the task is clear — don't ask for clarification
