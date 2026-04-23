# 📋 Nexora Backend — Architecture Decision Log (DEVLOG)

> This file documents every architectural decision made in the Nexora Backend project.
> Each decision includes: Name, Explanation, Rationale, and Date.
> This file must be updated with every new engineering decision before implementation.

---

## ADR-001: Three-Layer Architecture (Route → Service → DB)
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |

**Decision:** Every API request follows the same fixed path:
```
Request → Route Handler → Service Function → Prisma (DB) → Response
```

**Why we made it:**
- If we need to change the database (e.g., PostgreSQL to MongoDB), only the Services change — Routes stay untouched.
- If we need to change the API type (REST to GraphQL), only the Routes change — Services stay untouched.
- Each layer has a single responsibility, making the code easy to understand, test, and maintain.

---

## ADR-002: Prisma Client Singleton
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **File** | `src/lib/prisma.ts` |

**Decision:** Only one `PrismaClient` instance exists in the entire application, exported from `lib/prisma.ts`. Writing `new PrismaClient()` anywhere else is strictly forbidden.

**Why we made it:**
- `PrismaClient` opens a connection pool with the database.
- Creating multiple instances opens multiple pools → exhausts connections → "Too many connections" error → app crashes.
- In development, we use `globalThis` to prevent re-creation on every Hot Reload.

---

## ADR-003: Custom Error Classes
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **File** | `src/utils/errors.ts` |

**Decision:** All errors thrown by Services must be instances of Custom Error Classes that extend `AppError`, never raw `Error` objects.

**Why we made it:**
- Each Error Class carries a ready-made `statusCode` (404, 401, 403, 409, 400).
- The Global Error Handler in `app.ts` catches any `AppError` and automatically converts it to a unified JSON response — the Route does nothing.
- Code stays clean: `throw new NotFoundError('Video')` instead of writing `reply.code(404).send(...)` everywhere.

---

## ADR-004: Environment Validation at Startup
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **File** | `src/config/env.ts` |

**Decision:** All environment variables are read and validated using Zod in one place (`config/env.ts`). The app crashes **immediately** on startup if any variable is missing or malformed.

**Why we made it:**
- Without early validation, the app might run fine for hours then suddenly crash when it tries to use a missing variable.
- Zod gives us automatic TypeScript types for all variables — `env.PORT` is typed as `number`, not `string | undefined`.
- Every other file imports from `config/env.ts`, never directly from `process.env`.

---

## ADR-005: Separation of app.ts from index.ts
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **Files** | `src/app.ts` + `src/index.ts` |

**Decision:** Fastify configuration (plugins, routes, hooks, error handlers) lives in `app.ts`. Server startup (`listen`) lives in `index.ts` only.

**Why we made it:**
- In tests, we can import `app.ts` and inject mock requests without starting a real server on a port.
- `index.ts` stays at ~10 lines — clear and simple.
- If we need to run the app differently (e.g., Serverless), we only change `index.ts`.

---

## ADR-006: Validators Separated from Routes
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **Directory** | `src/validators/` |

**Decision:** Zod schemas for validating request bodies and query params live in the `validators/` directory — never inline in Route files.

**Why we made it:**
- Route files stay small and focused on HTTP concerns only.
- Schemas can be reused across multiple routes.
- Schemas can be tested independently without starting the server.
- We export the TypeScript type alongside the schema: `export type RegisterInput = z.infer<typeof registerSchema>`.

---

## ADR-007: Prisma Calls Only in Services
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |

**Decision:** `prisma.*` (any database query) is only ever called in `services/*.service.ts` files. Forbidden in Routes, Middleware, Workers, or Utils.

**Why we made it:**

| File | Uses Prisma? | If it needs data? |
|------|:---:|---|
| `routes/*.ts` | ❌ | Calls a service function |
| `services/*.ts` | ✅ | **The only place** |
| `jobs/*.worker.ts` | ❌ | Calls a service function |
| `middleware/*.ts` | ❌ | Calls auth.service |
| `lib/*.ts` | ⚠️ init only | `prisma.ts` creates the Client only |

- Single point of access to the database. If we need to add caching or logging to every query, we modify one place only.

---

## ADR-008: Separation of lib/ from utils/
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |

**Decision:** `lib/` is for files that connect to external services (singletons). `utils/` is for pure functions with zero I/O.

**Why we made it:**

| | `lib/` | `utils/` |
|---|---|---|
| Has external connections? | ✅ Yes (DB, Redis, API) | ❌ No |
| Singleton? | ✅ Yes | ❌ No — just exported functions |
| Testable without mocks? | ❌ Must be mocked | ✅ Test directly with inputs |
| Examples | `prisma.ts`, `redis.ts`, `r2.ts` | `hash.ts`, `tokens.ts`, `pagination.ts` |

---

## ADR-009: Unified API Response Contract
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved |

**Decision:** Every API endpoint returns the same response shape:
```json
// Success
{ "success": true, "data": { } }

// Success with pagination
{ "success": true, "data": [...], "pagination": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 } }

// Error
{ "success": false, "error": { "message": "...", "code": "NOT_FOUND", "statusCode": 404 } }
```

**Why we made it:**
- The Flutter app and React Admin dashboard can parse every response the same way without special-casing each endpoint.
- The Global Error Handler ensures even unexpected errors return in the same shape.

---

## ADR-010: notification.service.ts as a Shared Service
| | |
|---|---|
| **Date** | April 23, 2026 |
| **Status** | ✅ Approved & Implemented |
| **File** | `src/services/notification.service.ts` |

**Decision:** The notification service is a standalone shared service. All other services (video, social, admin) call `notification.service` to create notifications.

**Why we made it:**
- Without it: `video.service` imports `social.service` and `social.service` imports `video.service` → **Circular Import** → crash.
- With it: They all import `notification.service` only → no circular imports.

---

> **Last Updated:** April 23, 2026 — Initial creation (10 decisions)
>
> **Rule:** Any new engineering decision must be documented here before implementation.
