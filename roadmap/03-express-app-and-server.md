# 03 · Express app / server split

[⬅ Index](./README.md) · [⬅ Prev](./02-database-schema-and-pool.md) · [Next ➡ 04 Error handling](./04-error-handling.md)

## 🎯 Goal

Replace the hello-world server with a real Express app. Keep **app construction** (`app.js`) separate from **process startup** (`server.js`).

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `e222096` | chore: scaffold Express app with MySQL connection pool |
| `c5eade3` | chore: use node --watch in dev script |
| `a9e5b47` | chore: remove temporary test routes |

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/app.js` | rewritten as an Express app |
| `src/server.js` | created (env checks, DB check, `listen`) |
| `src/middleware/notFound.js` | created (see [step 04](./04-error-handling.md)) |
| `src/middleware/errorHandler.js` | created (see [step 04](./04-error-handling.md)) |
| `package.json` | `dev` script changed twice |

## 🛠️ Walkthrough

### 1. Why split `app.js` and `server.js`?

| File | Responsibility | Why separate |
| --- | --- | --- |
| `app.js` | Build and export the Express app | Tests can import it without opening a port |
| `server.js` | Check env, check DB, call `listen` | Startup concerns live in one place |

### 2. `src/app.js`

```js
const http = require('http');
const dotenv = require('dotenv');
const express = require('express');
const pool = require('./config/db');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const app = express();
const PORT = process.env.PORT;

app.disable('x-powered-by');
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
    const [rows] = await pool.query('SELECT 1 AS OK');
    res.json(rows[0]);
})
dotenv.config();

app.use(notFound);
app.use(errorHandler);

module.exports = app;
```

What each line does:

| Line | Purpose |
| --- | --- |
| `app.disable('x-powered-by')` | Don't advertise "Express" in response headers |
| `app.use(express.json())` | Parse JSON bodies into `req.body` |
| `/health` | Liveness check, no DB |
| `/health/db` | Readiness check, runs `SELECT 1` |
| `app.use(notFound)` | Catch-all 404, **must come after all routes** |
| `app.use(errorHandler)` | Error handler, **must be last** |

> [!WARNING]
> In the repo, `dotenv.config()` sits in the middle of `app.js`, and `http` and `PORT` are unused. It works only because `server.js` loads dotenv first. When rebuilding, drop `http`, `PORT` and the `dotenv` lines from `app.js` and keep `require('dotenv').config()` at the top of `server.js`.

### 3. `src/server.js`

```js
require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');
const PORT = process.env.PORT || 3000;

for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET']) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
}

pool.query('SELECT 1')
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Error connecting to the database:', err.message);
        process.exit(1);
    });
```

> [!IMPORTANT]
> **Fail fast.** If a secret is missing the server refuses to start. There are no default secrets like `'changeme'`.

> [!NOTE]
> The list becomes `['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'OTP_SECRET']` in [step 05](./05-otps-table-and-schema-simplify.md).

### 4. Update the `dev` script

Two small commits changed it:

```diff
-"dev": "node src/app.js"
+"dev": "node src/server.js"        // e222096: entry point is now server.js
```

```diff
-"dev": "node src/server.js"
+"dev": "node --watch src/server.js" // c5eade3: auto-restart on file change
```

Final:

```json
"scripts": {
  "dev": "node --watch src/server.js"
}
```

### 5. Install nothing new

`express`, `dotenv` and `mysql2` are already installed. `package.json` just records `mysql2`.

### 6. Temporary routes

`a9e5b47` ("remove temporary test routes") deleted the throwaway routes used to test the setup. The only trace is two blank lines left in `app.js`, where the auth and posts routers get mounted later.

## ✅ Verify

```bash
npm run dev
# Server is running on port 3000

curl localhost:3000/health
# {"status":"ok"}

curl localhost:3000/health/db
# {"OK":1}

curl localhost:3000/nope
# {"error":"Not Found"}
```

## ⚠️ Gotchas

- Express 5's `app.use(notFound)` and the 4-argument `errorHandler(err, req, res, next)` must be registered **last**, in that order.
- The error handler needs all four parameters. Express tells error middleware apart from normal middleware by `fn.length === 4`.
