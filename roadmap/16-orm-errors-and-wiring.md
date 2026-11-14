# 16 · ORM errors + wiring `app.js` and `server.js`

[⬅ Index](./README.md) · [⬅ Prev](./15-orm-posts-routes.md) · [Next ➡ Final reference](./99-final-reference.md)

## 🎯 Goal

Teach the error handler Sequelize's error names, and switch the app and server from the old pool to the Sequelize instance.

## 🔖 Commits

Part of the ORM migration commit (see [step 13](./13-orm-setup-and-models.md)). This commit also includes the `app.use('/posts', postsRouter)` line from [step 12](./12-mount-posts-router.md).

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/middleware/errorHandler.js` | MySQL error codes → Sequelize error names |
| `src/app.js` | `pool` → `sequelize`, health check updated |
| `src/server.js` | `pool.query('SELECT 1')` → `sequelize.authenticate()` |

## 🛠️ Walkthrough

### 1. Error map

Sequelize wraps database errors in its own classes, so `err.code === 'ER_DUP_ENTRY'` no longer matches. Match on `err.name` instead.

| Cause | Before | After | HTTP |
| --- | --- | --- | :-: |
| Malformed JSON | `entity.parse.failed` | *(same)* | 400 |
| Duplicate unique value | `ER_DUP_ENTRY` | `SequelizeUniqueConstraintError` | 409 |
| Missing foreign key target | `ER_NO_REFERENCED_ROW_2` | `SequelizeForeignKeyConstraintError` | 400 |
| Model validation failed | n/a | `SequelizeValidationError` | 400 |
| Anything else | n/a | n/a | 500 |

### 2. `src/middleware/errorHandler.js`

```js
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors?.[0]?.path;
    return res.status(409).json({ error: 'Duplicate value', field });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: 'Validation failed' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
```

> [!NOTE]
> The old regex that pulled the column name out of `sqlMessage` is gone. Sequelize gives it directly at `err.errors[0].path`. The SQL text is still never sent to the client.

### 3. `src/app.js`

```diff
-const pool = require('./config/db');
+const sequelize = require('./config/db');
 ...
 app.use('/auth', authRouter);
 app.use('/posts', postsRouter);
 app.get('/health', (req, res) => res.json({ status: 'ok' }));
 app.get('/health/db', async (req, res) => {
-    const [rows] = await pool.query('SELECT 1 AS OK');
-    res.json(rows[0]);
+    await sequelize.authenticate();
+    res.json({ OK: 1 });
 })
```

### 4. `src/server.js`

```diff
-const pool = require('./config/db');
+const sequelize = require('./config/db');
 ...
-pool.query('SELECT 1')
+sequelize.authenticate()
     .then(() => {
```

`authenticate()` opens a connection and runs a trivial query, so it fails fast at startup if the database is unreachable. Same intent as before.

## ✅ Verify

```bash
npm run dev
# Server is running on port 3000

curl localhost:3000/health/db
# {"OK":1}

# unknown route → 404, bad JSON → 400, same as before
curl localhost:3000/nope
# {"error":"Not Found"}
```

## 🧪 Migration check

This migration was verified end to end against a throwaway database (not your dev data):

| Area | Checked |
| --- | --- |
| Auth | request OTP, 60 s cooldown, wrong code, correct code, code reuse rejected, `/me` |
| Posts | create, read, list + pagination, search, update, 404 on missing post |
| Permissions | another user's edit and delete both return 403 |
| Comments | top-level comment, reply, bad parent id, nested tree |
| Errors | unknown route, malformed JSON |

All responses matched the pre-ORM API.

## ⚠️ Gotchas

- Raw `pool` is gone. Any code that still does `require('./config/db').query(...)` will break. Use the models, or `sequelize.query(sql, { replacements })` for a one-off raw query.
- `sequelize.authenticate()` is a connectivity check only. It does **not** create or verify tables.
