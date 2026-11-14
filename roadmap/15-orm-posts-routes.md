# 15 · Posts and comments routes with the ORM

[⬅ Index](./README.md) · [⬅ Prev](./14-orm-auth-routes.md) · [Next ➡ 16 Errors + wiring](./16-orm-errors-and-wiring.md)

## 🎯 Goal

Rewrite every posts and comments route with `Post` and `Comment`. Endpoints, validation and JSON shapes stay the same.

## 🔖 Commits

Part of the ORM migration commit (see [step 13](./13-orm-setup-and-models.md)).

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/routes/posts.js` | rewritten with models, and `express.Router()` instead of `express()` |

## 🛠️ Walkthrough

### 1. Header and shared helpers

```js
const express = require('express');
const { Op } = require('sequelize');
const { Post, Comment } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const POST_FIELDS = ['id', 'author_id', 'title', 'body', 'created_at'];
const COMMENT_FIELDS = ['id', 'post_id', 'user_id', 'parent_id', 'body'];

// Only the author or an admin may touch a post
function ownerScope(id, user) {
    return user.role === 'admin' ? { id } : { id, author_id: user.id };
}
```

| Helper | Purpose |
| --- | --- |
| `POST_FIELDS`, `COMMENT_FIELDS` | `attributes` whitelist, so responses contain exactly these columns |
| `ownerScope` | Builds the `where` for "author **or** admin". Replaces `(author_id = ? OR ? = 'admin')` from the raw SQL |

> [!NOTE]
> This step also fixes the `express()` quirk from [step 09](./09-posts-crud.md). It's now `express.Router()`.

### 2. Create: `POST /posts`

```js
router.post('/', authenticate, async (req, res) => {
    const { title, body } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Body is required' });
    }

    const post = await Post.create({
        author_id: req.user.id,
        title: title.trim(),
        body: body.trim(),
    });

    res.status(201).json({
        id: post.id,
        title: post.title,
        body: post.body,
        author_id: post.author_id,
    });
});
```

### 3. List: `GET /posts`

```js
router.get('/', async (req, res) => {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = q
        ? { [Op.or]: [{ title: { [Op.like]: `%${q}%` } }, { body: { [Op.like]: `%${q}%` } }] }
        : {};

    const { count: total, rows: posts } = await Post.findAndCountAll({
        attributes: POST_FIELDS,
        where,
        order: [['id', 'DESC']],
        limit,
        offset: (page - 1) * limit,
        raw: true,
    });

    res.json({
        posts,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
});
```

| Before | After |
| --- | --- |
| Build a `whereClause` **string** by hand, run `COUNT(*)` and the page query separately | `findAndCountAll` does both and shares one `where` object |
| `?` placeholders + string concat | `where` is an object, so values are always parameterised. No string SQL to get wrong |
| `parseInt` clamping | **Unchanged** (still sanitise before the ORM sees it) |

> [!TIP]
> `raw: true` returns plain objects instead of model instances. That's what you want when the result goes straight into `res.json`.

### 4. Comment tree helper

Unchanged:

```js
function buildCommentTree(comments, parentId = null) {
    const branch = [];
    for (const comment of comments) {
        if (comment.parent_id === parentId) {
            branch.push({ ...comment, replies: buildCommentTree(comments, comment.id) });
        }
    }
    return branch;
}
```

### 5. Comments: create and read

```js
router.post('/:postId/comments', authenticate, async (req, res) => {
    const { postId } = req.params;
    const { body, parent_id } = req.body;

    if (!/^\d+$/.test(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    const parentIdValue = parent_id !== undefined && parent_id !== null ? Number(parent_id) : null;
    if (parentIdValue !== null && (!Number.isInteger(parentIdValue) || parentIdValue < 1)) {
        return res.status(400).json({ error: 'Invalid parent comment ID' });
    }

    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Comment body is required' });
    }

    const post = await Post.findByPk(postId, { attributes: ['id'] });
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    // Parent must belong to the same post
    if (parentIdValue !== null) {
        const parent = await Comment.findOne({
            attributes: ['id'],
            where: { id: parentIdValue, post_id: postId },
        });
        if (!parent) {
            return res.status(400).json({ error: 'Parent comment not found on this post' });
        }
    }

    const comment = await Comment.create({
        post_id: postId,
        user_id: req.user.id,
        parent_id: parentIdValue,
        body: body.trim(),
    });

    res.status(201).json({
        id: comment.id,
        post_id: Number(postId),
        user_id: req.user.id,
        parent_id: parentIdValue,
        body: comment.body,
    });
});

router.get('/:postId/comments', async (req, res) => {
    const { postId } = req.params;

    if (!/^\d+$/.test(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await Post.findByPk(postId, { attributes: ['id'] });
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const comments = await Comment.findAll({
        attributes: COMMENT_FIELDS,
        where: { post_id: postId },
        order: [['id', 'ASC']],
        raw: true,
    });

    res.json({ comments: buildCommentTree(comments, null) });
});
```

### 6. Read, update, delete

```js
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await Post.findByPk(id, { attributes: POST_FIELDS, raw: true });
    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post });
});

router.put('/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { title, body } = req.body;

    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Body is required' });
    }

    // Ownership check lives inside the WHERE clause
    const [affected] = await Post.update(
        { title: title.trim(), body: body.trim() },
        { where: ownerScope(id, req.user) }
    );

    // Distinguish 404 (not found) from 403 (forbidden)
    if (affected === 0) {
        const exists = await Post.findByPk(id, { attributes: ['id'] });
        return exists
            ? res.status(403).json({ error: 'Forbidden' })
            : res.status(404).json({ error: 'Post not found' });
    }

    res.json({ id: Number(id), title: title.trim(), body: body.trim() });
});

router.delete('/:id', authenticate, async (req, res) => {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const deleted = await Post.destroy({ where: ownerScope(id, req.user) });

    if (deleted === 0) {
        const exists = await Post.findByPk(id, { attributes: ['id'] });
        return exists
            ? res.status(403).json({ error: 'Forbidden' })
            : res.status(404).json({ error: 'Post not found' });
    }

    res.json({ message: 'Post deleted successfully' });
});

module.exports = router;
```

> [!IMPORTANT]
> The **"ownership inside the `WHERE`"** pattern from [step 09](./09-posts-crud.md) is preserved. The permission check and the write are still one statement. `ownerScope` just builds the condition in JS.

### 7. Route order

The comment routes now sit **above** `GET /:id`. It would work either way (different segment counts), but grouping routes with the same shape avoids surprises if you add more later.

## ✅ Verify

Responses are identical to steps [09](./09-posts-crud.md), [10](./10-posts-list-pagination-search.md) and [11](./11-nested-comments.md):

```bash
TOKEN="<token>"
H='Content-Type: application/json'

curl -X POST localhost:3000/posts -H "$H" -H "Authorization: Bearer $TOKEN" -d '{"title":"Hello","body":"First post"}'
# 201 {"id":1,"title":"Hello","body":"First post","author_id":1}

curl "localhost:3000/posts?q=hello&limit=5"
curl localhost:3000/posts/1/comments

# someone else's post
curl -X DELETE localhost:3000/posts/1 -H "Authorization: Bearer <other user's token>"
# 403 {"error":"Forbidden"}
```

## ⚠️ Gotchas

- `Model.update` / `Model.destroy` take the `where` as an **option**, not as the first argument.
- With `raw: true` you get plain rows, so you can't call model methods like `.save()` on them.
- Deleting a post that still has comments still fails on the foreign key (see the quirks table in the [final reference](./99-final-reference.md#-known-quirks-and-follow-ups)).
