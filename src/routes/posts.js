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

// POST /posts - Create a new post
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

// GET /posts - List posts with pagination and search
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

// Helper: Convert flat comments array into a nested tree structure
function buildCommentTree(comments, parentId = null) {
    const branch = [];
    for (const comment of comments) {
        if (comment.parent_id === parentId) {
            branch.push({ ...comment, replies: buildCommentTree(comments, comment.id) });
        }
    }
    return branch;
}

// POST /posts/:postId/comments - Add a comment (or reply) to a post
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

// GET /posts/:postId/comments - Get nested comments tree for a post
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

// GET /posts/:id - Get a single post by ID
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

// PUT /posts/:id - Update post (author or admin only)
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

// DELETE /posts/:id - Delete post (author or admin only)
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
