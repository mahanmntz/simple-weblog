# 04 · Error handling

[⬅ Index](./README.md) · [⬅ Prev](./03-express-app-and-server.md) · [Next ➡ 05 OTP table](./05-otps-table-and-schema-simplify.md)

## 🎯 Goal

Return clean JSON for 404s and for common failures (bad JSON, duplicate rows, broken foreign keys), and never leak SQL details to the client.

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `e222096` | created both files (copied from a MongoDB project) |
| `29a39a0` | fix(errors): handle MySQL and JSON parse errors |
| `fb159e7` | fix(errors): handle MySQL and JSON parse errors (`notFound` shape) |

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/middleware/notFound.js` | created, then `message` → `error` |
| `src/middleware/errorHandler.js` | created, then Mongo branches replaced with MySQL |

## 🛠️ Walkthrough

### 1. `src/middleware/notFound.js`

```js
function notFound(req, res, next) {
    res.status(404).json({ error: 'Not Found' });
}

module.exports = notFound;
```

> [!NOTE]
> It first returned `{ message: 'Not Found' }`. `fb159e7` changed it to `{ error: ... }` so **every** error response in the API has the same shape.

### 2. `src/middleware/errorHandler.js`: first version (Mongo leftovers)

Copied from an earlier project. These branches are useless with MySQL.

```js
// ❌ original — Mongo-specific
if (err.code === 11000) { ... }            // duplicate key (Mongo)
if (err.name === 'ValidationError') { ... } // Mongoose
if (err.name === 'CastError') { ... }       // Mongoose
```

### 3. `src/middleware/errorHandler.js`: final version

```js
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    const field = /for key '(?:\w+\.)?(\w+)'/.exec(err.sqlMessage)?.[1];
    return res.status(409).json({ error: 'Duplicate value', field });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
```

### 4. Error map

| Cause | Error signal | HTTP | Response |
| --- | --- | :-: | --- |
| Malformed JSON body | `err.type === 'entity.parse.failed'` | 400 | `{ "error": "Invalid JSON" }` |
| Unique constraint violated | `err.code === 'ER_DUP_ENTRY'` | 409 | `{ "error": "Duplicate value", "field": "phone" }` |
| Foreign key target missing | `err.code === 'ER_NO_REFERENCED_ROW_2'` | 400 | `{ "error": "Referenced record does not exist" }` |
| Anything else | n/a | 500 | `{ "error": "Internal server error" }` |

### 5. The regex, explained

MySQL's message looks like: `Duplicate entry 'x' for key 'users.phone'`.

```js
/for key '(?:\w+\.)?(\w+)'/.exec(err.sqlMessage)?.[1]
//          └─ optional "table." prefix, ignored
//                     └─ captured: the key/column name → "phone"
```

> [!IMPORTANT]
> The handler logs the full error with `console.error(err)` on the server only. `sqlMessage` is **never** sent to the client, because it can reveal table and column names.

## ✅ Verify

```bash
# malformed JSON → 400
curl -X POST localhost:3000/auth/request-otp \
  -H 'Content-Type: application/json' -d '{bad json'
# {"error":"Invalid JSON"}

# unknown route → 404
curl localhost:3000/nope
# {"error":"Not Found"}
```

## ⚠️ Gotchas

- Express 5 forwards rejected promises from `async` handlers to this middleware automatically, so no `try/catch` is needed in routes.
- If you forget the 4th `next` parameter, Express treats the function as a normal middleware and it never receives errors.
