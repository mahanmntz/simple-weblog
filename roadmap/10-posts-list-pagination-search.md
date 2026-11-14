# 10 · Posts list: pagination + search

[⬅ Index](./README.md) · [⬅ Prev](./09-posts-crud.md) · [Next ➡ 11 Nested comments](./11-nested-comments.md)

## 🎯 Goal

`GET /posts?page=2&limit=10&q=hello`: a safe, paginated list with optional text search and pagination metadata.

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `cebd2ce` | feat(posts): add pagination and search to list endpoint |

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/routes/posts.js` | `GET /` handler added (below `DELETE /:id`) |

## 🛠️ Walkthrough

### 1. Query parameters

| Param | Default | Rule |
| --- | :-: | --- |
| `page` | `1` | Integer ≥ 1, otherwise falls back to 1 |
| `limit` | `10` | Integer ≥ 1, **capped at 50** |
| `q` | none | Substring match on `title` or `body` |

### 2. The handler

```js
// GET /posts - List posts with pagination and search
router.get('/', async (req, res) => {
    // 1. Sanitize and validate pagination parameters
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const offset = (page - 1) * limit;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    // 2. Build WHERE clause dynamically based on search query
    let whereClause = '';
    const queryParams = [];

    if (q) {
        whereClause = 'WHERE title LIKE ? OR body LIKE ?';
        const searchTerm = `%${q}%`;
        queryParams.push(searchTerm, searchTerm);
    }

    // 3. Count total matching records for pagination metadata
    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM posts ${whereClause}`,
        queryParams
    );

    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // 4. Fetch the paginated slice
    const [posts] = await pool.query(
        `SELECT id, author_id, title, body, created_at
        FROM posts
        ${whereClause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
    );

    res.json({
        posts,
        pagination: {
            page,
            limit,
            total,
            totalPages
        }
    });
});
```

### 3. Step by step

| # | What | Why |
| :-: | --- | --- |
| 1 | `parseInt(..., 10)` then fallback | `?page=abc`, `?page=-5` and `?limit=999999` all become safe values |
| 2 | `typeof req.query.q === 'string'` | `?q[]=a&q[]=b` makes `q` an array. Ignore anything that isn't a string |
| 3 | Dynamic `whereClause` string | Only the **fixed** SQL fragment is concatenated. User text always goes through `?` placeholders |
| 4 | Same `whereClause` in the count query and the list query | Totals always match the filtered results |
| 5 | `ORDER BY id DESC` | Newest first. Cheaper and more stable than sorting by timestamp |
| 6 | `Math.ceil(total / limit) \|\| 1` | An empty result reports 1 page, not 0 |

### 4. The offset formula

```
offset = (page - 1) * limit

page=1, limit=10 → OFFSET 0   (rows 1–10)
page=2, limit=10 → OFFSET 10  (rows 11–20)
page=3, limit=25 → OFFSET 50  (rows 51–75)
```

> [!IMPORTANT]
> Interpolating `${whereClause}` into SQL is only safe because `whereClause` is **built by the server** from constant strings. Never put user input inside it.

> [!NOTE]
> `LIKE '%q%'` can't use an index, so it gets slow on very large tables. That's fine for this project. A `FULLTEXT` index would be the next step.

> [!NOTE]
> Characters `%` and `_` typed by a user act as wildcards inside `LIKE`. This is harmless here (they only widen their own search), but escape them if exact matching ever matters.

### 5. Example response

```json
{
  "posts": [
    { "id": 12, "author_id": 1, "title": "Hello", "body": "...", "created_at": "2026-11-09T10:00:00.000Z" }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 12, "totalPages": 2 }
}
```

## ✅ Verify

```bash
curl "localhost:3000/posts"
curl "localhost:3000/posts?page=2&limit=5"
curl "localhost:3000/posts?q=hello"
curl "localhost:3000/posts?page=abc&limit=9999"   # → page 1, limit 50
```

## ⚠️ Gotchas

- `pool.query` (not `pool.execute`) is what makes `LIMIT ? OFFSET ?` with numbers work smoothly with mysql2.
- Put `GET /` anywhere among the routes. It doesn't clash with `/:id`, because `/` has no segment.
