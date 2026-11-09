const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');

const router = express.Router();

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

module.exports = router;