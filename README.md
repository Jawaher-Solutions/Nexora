# Nexora Backend - Hybrid Video Platform API

[![Status](https://img.shields.io/badge/status-MVP%20Foundation-orange)](https://github.com/Jawaher-Solutions/Nexora)
[![API](https://img.shields.io/badge/api-v1-blue)](https://github.com/Jawaher-Solutions/Nexora)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-6.x-3178c6)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-not%20configured-lightgrey)](https://github.com/Jawaher-Solutions/Nexora)
[![License](https://img.shields.io/badge/license-ISC-lightgrey)](./LICENSE)

Production-oriented backend service for a hybrid social video platform that combines short videos, long videos, social interactions, and AI moderation workflows.

## 📋 Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Architecture Diagrams](#architecture-diagrams)
- [Testing](#testing)
- [Security](#security)
- [Contribution](#contribution)
- [Team](#team)
- [License](#license)

## ✨ Features

- JWT-based authentication with refresh token rotation
- Role-aware authorization middleware support
- Unified API response and error contract
- Prisma schema covering user, video, social graph, moderation, and messaging domains
- Redis integration for caching and queue foundations
- Cloudflare R2 integration for object storage
- Gemini integration foundation for moderation scoring
- Runtime environment validation with Zod
- Centralized error handling and rate limiting

## 🛠 Technology Stack

| Category | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | >=20 |
| Framework | Fastify | ^5.8.5 |
| Language | TypeScript | ^6.0.3 |
| Database | PostgreSQL | 16 |
| ORM | Prisma | ^7.8.0 |
| DB Adapter | @prisma/adapter-pg | ^7.8.0 |
| Cache | Redis + ioredis | ^5.10.1 |
| Queue Base | BullMQ | ^5.76.1 |
| Validation | Zod | ^4.3.6 |
| Auth | @fastify/jwt | ^10.0.0 |
| Security | Helmet + Rate Limit | ^13.0.2 / ^10.3.0 |
| Storage SDK | AWS S3 SDK (R2) | ^3.1035.0 |

## 🚀 Installation

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop

### Steps

1. Clone the repository:

```bash
git clone https://github.com/Jawaher-Solutions/Nexora.git
cd Nexora/nexora-backend
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

Create a `.env` file from `.env.example`.

```bash
cp .env.example .env
```

Example `.env` values for local development:

```env
DATABASE_URL=postgresql://nexora:nexora_secret@localhost:55433/nexora_db
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
REDIS_URL=redis://localhost:6381
CLOUDFLARE_R2_BUCKET=your-bucket-name
CLOUDFLARE_R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=your-access-key
CLOUDFLARE_R2_SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
PORT=3000
NODE_ENV=development
```

4. Start infrastructure services:

```bash
docker compose up -d
```

5. Run database migrations:

```bash
npx prisma migrate dev --name init
```

6. Start development server:

```bash
npm run dev
```

Server base URL:

- http://localhost:3000

## 📖 Usage

Health check:

```bash
curl http://localhost:3000/health
```

Root metadata endpoint:

```bash
curl http://localhost:3000/
```

## 📚 API Documentation

Current API prefix:

- `/api/v1`

### Auth Endpoints

| Endpoint | Method | Description | Auth |
| --- | --- | --- | --- |
| `/api/v1/auth/register` | POST | Register user and issue tokens | No |
| `/api/v1/auth/login` | POST | Login and issue tokens | No |
| `/api/v1/auth/refresh` | POST | Rotate refresh token and issue new access token | No |
| `/api/v1/auth/logout` | POST | Logout and revoke refresh token | Yes |

Sample login request:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "StrongPass123"
  }'
```

### Standard Response Contract

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "message": "...",
    "code": "VALIDATION_ERROR",
    "statusCode": 400
  }
}
```

## 🗺 Architecture Diagrams

### Service Layer Flow

```mermaid
flowchart LR
    A[Client: Mobile or Web] --> B[Fastify Route Layer]
    B --> C[Service Layer]
    C --> D[(PostgreSQL via Prisma)]
    C --> E[(Redis)]
    C --> F[Cloudflare R2]
    C --> G[Gemini API]
    C --> H[Unified Response Contract]
```

### Request Processing Pipeline

```mermaid
flowchart LR
    R[HTTP Request] --> V[Validation]
    V --> M[Auth and Role Middleware]
    M --> S[Service Logic]
    S --> DB[Data and External Calls]
    DB --> O[Response or Typed Error]
```

## 🧪 Testing

Current status:

- `tests/` directory is present
- automated test suites are not configured yet

Current quality checks:

```bash
npm run build
npx prisma validate
```

Recommended next testing commands (when test scripts are added):

- `npm test`
- `npm run test:coverage`

## 🔒 Security

Implemented controls:

- Helmet for security headers
- Rate limiting: 100 requests per minute
- JWT access token verification middleware
- Refresh token rotation persisted in database
- bcrypt password hashing with 12 rounds
- Zod input validation for auth payloads
- Centralized error middleware with controlled production output

Security reporting:

- For internal security findings, report directly to: JawaherTech@gmail.com

## 🤝 Contribution

Internal contribution workflow:

1. Create a branch from `main`.
2. Use conventional commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).
3. Run build and migration checks before opening a PR.
4. Open a pull request with a clear scope and test evidence.

Suggested commit format:

```text
<type>: <short summary>

[optional details]
```


## 👨‍💻 Geliştirici

<div align="center">

### **Hamed Mohamed Abdelalim KAMEL**

Full-Stack Engineer (React & Node.js) | Application Security & QA

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/7amed3li)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/hamed-ali)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hamed.m.abdelalim@gmail.com)

</div>

---
## 📄 License

This project is licensed under the ISC License.

See [LICENSE](./LICENSE).