<div align="center">

# 🗺️ simple-weblog — Build Roadmap

**A step-by-step roadmap of the whole project, commit by commit.**
Node.js · Express 5 · MySQL · OTP login · JWT · Posts · Nested comments

</div>

---

## How to use this

This folder is a **replay script**. Follow the steps in order, from an empty folder to the finished API. Each step matches one or more real commits in this repo, so you can always compare with `git show <hash>`.

Every step page has the same layout:

| Section | What it gives you |
| --- | --- |
| 🎯 **Goal** | What this step adds and why |
| 🔖 **Commits** | The matching git commit(s) |
| 🗂️ **Files** | Files created or changed |
| 🛠️ **Walkthrough** | Numbered actions with code boxes |
| ✅ **Verify** | A command to prove it works |
| ⚠️ **Gotchas** | Mistakes made along the way, so you can skip them |

> [!TIP]
> Don't copy blindly in a live session. Read the **Goal**, type the code yourself, then use the **Verify** block to check.

---

## 🧭 Roadmap

| # | Step | Commit(s) | You end up with |
| :-: | --- | --- | --- |
| 00 | [Project init](./00-project-init.md) | `557d01c` | Empty repo, `package.json`, `src/app.js` |
| 01 | [Hello-world server + env](./01-hello-server-and-env.md) | `f341391` | Plain `http` server, `.env`, `.gitignore`, deps |
| 02 | [Database schema + pool](./02-database-schema-and-pool.md) | `79f2c63`, `f72abbc` | `users`/`posts`/`comments` tables, MySQL pool |
| 03 | [Express app / server split](./03-express-app-and-server.md) | `e222096`, `c5eade3`, `a9e5b47` | `app.js` + `server.js`, health routes, `--watch` |
| 04 | [Error handling](./04-error-handling.md) | `29a39a0`, `fb159e7` | `notFound` + MySQL-aware `errorHandler` |
| 05 | [OTP table + simpler schema](./05-otps-table-and-schema-simplify.md) | `289fd3c`, `5b815b3`, `38cfa28` | `otps` table, `OTP_SECRET` check |
| 06 | [Request OTP](./06-request-otp.md) | `3eaeaf7` | `POST /auth/request-otp` with cooldown |
| 07 | [Verify OTP + JWT](./07-verify-otp-and-jwt.md) | `1529431` | `POST /auth/verify-otp` returns a token |
| 08 | [Auth middleware + `/me`](./08-auth-middleware.md) | `6c2750b` | `authenticate`, `requireAdmin`, `GET /auth/me` |
| 09 | [Posts CRUD](./09-posts-crud.md) | `cebd2ce` | create / read / update / delete posts |
| 10 | [Posts list: pagination + search](./10-posts-list-pagination-search.md) | `cebd2ce` | `GET /posts?page=&limit=&q=` |
| 11 | [Nested comments](./11-nested-comments.md) | `a125b74` | threaded comments on posts |
| 12 | [Mount posts router](./12-mount-posts-router.md) | *uncommitted* | `/posts` wired into `app.js` |
| 🏁 | [Final reference](./99-final-reference.md) | — | Tree, API table, env, curl script, known quirks |

---

## 🏗️ Architecture at a glance

```mermaid
flowchart LR
    C([Client]) --> A[app.js<br/>express.json]
    A --> R1[/auth router/]
    A --> R2[/posts router/]
    A --> H[/health/]
    R1 --> M[authenticate]
    R2 --> M
    R1 --> DB[(MySQL pool)]
    R2 --> DB
    A --> NF[notFound 404]
    NF --> EH[errorHandler]
```

```mermaid
sequenceDiagram
    participant U as User
    participant API as API
    participant DB as MySQL
    U->>API: POST /auth/request-otp {phone}
    API->>DB: INSERT otps (HMAC hash, +120s)
    API-->>U: 200 OTP sent
    U->>API: POST /auth/verify-otp {phone, code}
    API->>DB: attempts+1, compare hash, mark used, upsert user
    API-->>U: 200 { token }
    U->>API: GET /auth/me (Bearer token)
    API-->>U: 200 { user }
```

---

## 🧰 Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js (uses `node --watch`, so Node 18+) | No nodemon needed |
| Web framework | `express@^5` | Async handlers forward rejected promises to the error handler |
| Database | `mysql2/promise` pool | `await pool.query(...)` with `?` placeholders |
| Auth | Phone + OTP, then JWT (HS256, 1h) | Passwordless |
| OTP storage | HMAC-SHA256 hash, never the plain code | A DB leak does not leak codes |
| Config | `dotenv` | Secrets stay out of git |

> [!NOTE]
> Express 5 catches errors thrown (or rejected) inside `async` route handlers. That is why none of the routes here need `try/catch` around DB calls.

---

## ⚡ Quick start (after finishing all steps)

```bash
npm install
cp .env.example .env          # then fill in the values
mysql -u <user> -p simple_weblog < sql/schema.sql
npm run dev
```

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```
