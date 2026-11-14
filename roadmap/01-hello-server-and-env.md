# 01 · Hello-world server + environment

[⬅ Index](./README.md) · [⬅ Prev](./00-project-init.md) · [Next ➡ 02 Database](./02-database-schema-and-pool.md)

## 🎯 Goal

Prove the toolchain works with a plain `http` server, and set up configuration through `.env` without ever committing secrets.

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `f341391` | chore: scaffold Express app with MySQL connection pool |

> [!NOTE]
> Despite the commit message, this commit only contains the hello-world server and the config files. Express and the pool come in step 03.

## 🗂️ Files

| File | Action |
| --- | --- |
| `.gitignore` | created |
| `.env.example` | created |
| `package.json` | `dev` script + dependencies |
| `package-lock.json` | generated |
| `src/app.js` | hello-world `http` server |

## 🛠️ Walkthrough

### 1. Install dependencies

```bash
npm install express dotenv
```

### 2. `.gitignore`

```gitignore
node_modules/
dist/
.env
```

> [!WARNING]
> Add `.env` to `.gitignore` **before** your first `git add .`. Once a secret is committed it stays in history.

### 3. `.env.example`: variable names only, no values

```dotenv
PORT=3000
DB_HOST=127.0.0.1
DB_USER=
DB_PASSWORD=
DB_NAME=simple_weblog
JWT_SECRET=
```

Copy it to a real `.env` and fill it in:

```bash
cp .env.example .env
```

> [!IMPORTANT]
> Step 05 adds `OTP_SECRET` to the required variables. The repo's `.env.example` does not list it yet, so add `OTP_SECRET=` yourself (see [final reference](./99-final-reference.md#-environment-variables)).

### 4. Add a `dev` script to `package.json`

```diff
 "scripts": {
-  "test": "echo \"Error: no test specified\" && exit 1"
+  "test": "echo \"Error: no test specified\" && exit 1",
+  "dev": "node src/app.js"
 },
```

### 5. `src/app.js`: temporary hello-world server

```js
const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, World!\n');
}).listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```

## ✅ Verify

```bash
npm run dev
# Server is running on port 3000

curl http://localhost:3000
# Hello, World!
```

## ⚠️ Gotchas

- `dotenv.config()` must run **before** you read `process.env.PORT`.
- This `app.js` is thrown away in step 03. Its job was only to check that env loading works.
