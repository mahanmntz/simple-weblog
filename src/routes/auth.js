const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authenticate }  = require('../middleware/auth');
router.post('/request-otp', async (req, res) => {
    const { phone } = req.body;

    // 1. Validate Iranian phone number format (09xxxxxxxxx)
    if (!phone || !/^09\d{9}$/.test(phone)) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    // 2. Cooldown check: prevent sending another code within 60 seconds
    const [recentOtps] = await pool.query(
        `SELECT created_at FROM otps 
         WHERE phone = ? AND created_at > NOW() - INTERVAL 60 SECOND 
         ORDER BY id DESC LIMIT 1`,
        [phone]
    );

    if (recentOtps.length > 0) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    // 3. Generate a 6-digit random code and calculate its HMAC hash
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto
        .createHmac('sha256', process.env.OTP_SECRET)
        .update(code)
        .digest('hex');

    // 4. Save hash to database with 120s expiration
    await pool.query(
        `INSERT INTO otps (phone, code_hash, expires_at) 
         VALUES (?, ?, NOW() + INTERVAL 120 SECOND)`,
        [phone, codeHash]
    );

    // 5. In development, log the plain code to test easily
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV OTP] Phone: ${phone} | Code: ${code}`);
    }

    res.json({ message: 'OTP sent successfully' });
});

router.post('/verify-otp', async (req, res) => {
    const { phone, code } = req.body;

    // 1. Basic validation
    if (!phone || !/^09\d{9}$/.test(phone) || !code || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 2. Consume one attempt atomically (max 5 attempts, must be active and unused)
    const [updateResult] = await pool.query(
        `UPDATE otps 
         SET attempts = attempts + 1 
         WHERE phone = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < 5 
         ORDER BY id DESC LIMIT 1`,
        [phone]
    );

    if (updateResult.affectedRows === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 3. Fetch the latest active OTP hash
    const [rows] = await pool.query(
        `SELECT id, code_hash FROM otps 
         WHERE phone = ? AND used_at IS NULL AND expires_at > NOW() 
         ORDER BY id DESC LIMIT 1`,
        [phone]
    );

    if (rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const otp = rows[0];

    // 4. Compare HMAC hash
    const inputHash = crypto
        .createHmac('sha256', process.env.OTP_SECRET)
        .update(String(code))
        .digest('hex');

    if (inputHash !== otp.code_hash) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 5. Mark OTP as used so it cannot be used again
    await pool.query(
        `UPDATE otps SET used_at = NOW() WHERE id = ? AND used_at IS NULL`,
        [otp.id]
    );

    // 6. Ensure user exists (insert if new, ignore if existing)
    await pool.query(
        `INSERT INTO users (phone) VALUES (?) 
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [phone]
    );

    // 7. Get user id and role strictly from DB
    const [users] = await pool.query(
        `SELECT id, role FROM users WHERE phone = ?`,
        [phone]
    );
    const user = users[0];

    // 8. Sign JWT (HS256, 1h)
    const token = jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
    );

    res.json({ token });
});


router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;