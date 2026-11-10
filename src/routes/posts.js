const express = require('express');
const pool = require('../config/db');
const {authenticate} = require('../middleware/auth');

const router = express();

// POST /posts - Create a new post

router.post('/', authenticate, async (req, res) => {
    const {title, body} = req.body;
    // Validate inputs 
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Body is required' });
    }

    // 2. Insert post with authenticated user's ID
    const [result] = await pool.query(
        `INSERT INTO posts (author_id, title, body) VALUES (?, ?, ?)`,
        [req.user.id, title.trim(), body.trim()]
    );

    res.status(201).json({
        id: result.insertId,
        title: title.trim(),
        body: body.trim(),
        author_id: req.user.id
    });
});

// GET /posts/:id - Get a single post by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    // 1. Vaildate integer ID
    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID'});
    }

    // 2. Fetch post
    const [rows] = await pool.query(
        `SELECT id, author_id, title, body, created_at 
         FROM posts 
         WHERE id = ?`,
        [id]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post: rows[0] });
})

// PUT /posts/:id - Update post (author or admin only)
router.put('/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    const { title, body } = req.body;

    // 1. Validate integer ID
    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    // 2. Validate input fields
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: 'Body is required' });
    }

    // 3. Update with ownership check inside WHERE clause
    const [result] = await pool.query(
        `UPDATE posts 
         SET title = ?, body = ? 
         WHERE id = ? AND (author_id = ? OR ? = 'admin')`,
        [title.trim(), body.trim(), id, req.user.id, req.user.role]
    );

    // 4. Distinguish 404 (not found) from 403 (forbidden)
    if (result.affectedRows === 0) {
        const [rows] = await pool.query(`SELECT id, author_id FROM posts WHERE id = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ id: Number(id), title: title.trim(), body: body.trim() });
});

// DELETE /posts/:id - Delete post (author or admin only)
router.delete('/:id', authenticate, async (req, res) => {
    const { id } = req.params;

    // 1. Validate integer ID
    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    // 2. Delete with ownership check inside WHERE clause
    const [result] = await pool.query(
        `DELETE FROM posts 
         WHERE id = ? AND (author_id = ? OR ? = 'admin')`,
        [id, req.user.id, req.user.role]
    );

    // 3. Distinguish 404 from 403
    if (result.affectedRows === 0) {
        const [rows] = await pool.query(`SELECT id FROM posts WHERE id = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ message: 'Post deleted successfully' });
});

// GET /posts - List posts with pagination and search
router.get('/', async (req, res) => {
    // 1. Sanitize and validate pagination parameters 
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if(limit > 50) limit = 50;

    const offset = (page - 1) * limit;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    // 2. build WHERE clause dynamically based on search query
    let whereClause = '';
    const queryParams = [];

    if(q) {
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

module.exports = router;