# 12 · Mount the posts router

[⬅ Index](./README.md) · [⬅ Prev](./11-nested-comments.md) · [Next ➡ 13 ORM setup](./13-orm-setup-and-models.md)

## 🎯 Goal

Plug `routes/posts.js` into the app so `/posts/...` actually responds.

## 🔖 Commit

> [!NOTE]
> The earlier posts commits added `routes/posts.js` but never touched `app.js`, so on their own `/posts` returns 404. This mount line was committed together with the ORM migration ([step 16](./16-orm-errors-and-wiring.md)). If you follow the raw-SQL steps only, commit it yourself:
>
> ```bash
> git add src/app.js
> git commit -m "feat(posts): mount posts router at /posts"
> ```

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/app.js` | require and mount the router |

## 🛠️ Walkthrough

### 1. Import the router

```diff
 const authRouter = require('./routes/auth');
+const postsRouter = require('./routes/posts');
```

### 2. Mount it **before** `notFound`

```diff
 app.use('/auth', authRouter);
+app.use('/posts', postsRouter);
 app.get('/health', ...
```

### 3. Final `src/app.js` (clean version)

```js
const express = require('express');
const pool = require('./config/db');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const authRouter = require('./routes/auth');
const postsRouter = require('./routes/posts');

const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.use('/auth', authRouter);
app.use('/posts', postsRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
    const [rows] = await pool.query('SELECT 1 AS OK');
    res.json(rows[0]);
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
```

> [!NOTE]
> This is the tidy form. The repo's `app.js` still has the unused `http` import, the `PORT` constant and the mid-file `dotenv.config()` (see [step 03](./03-express-app-and-server.md)). They are harmless leftovers.

### 4. Order rules

| Order | Rule |
| :-: | --- |
| 1 | `express.json()` before any router that reads `req.body` |
| 2 | Routers and routes |
| 3 | `notFound` after every route |
| 4 | `errorHandler` last |

## ✅ Verify

```bash
curl localhost:3000/posts
# {"posts":[],"pagination":{"page":1,"limit":10,"total":0,"totalPages":1}}
```

If you see `{"error":"Not Found"}`, the router isn't mounted, or is mounted after `notFound`.
