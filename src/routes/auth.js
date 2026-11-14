const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op, literal } = require('sequelize');
const { User, Otp } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function hashCode(code) {
    return crypto
        .createHmac('sha256', process.env.OTP_SECRET)
        .update(String(code))
        .digest('hex');
}

router.post('/request-otp', async (req, res) => {
    const { phone } = req.body;

    // 1. Validate Iranian phone number format (09xxxxxxxxx)
    if (!phone || !/^09\d{9}$/.test(phone)) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    // 2. Cooldown check: prevent sending another code within 60 seconds
    const recent = await Otp.findOne({
        where: {
            phone,
            created_at: { [Op.gt]: literal('NOW() - INTERVAL 60 SECOND') },
        },
        order: [['id', 'DESC']],
    });

    if (recent) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Please wait before requesting another code' });
    }

    // 3. Generate a 6-digit random code and calculate its HMAC hash
    const code = String(crypto.randomInt(100000, 1000000));

    // 4. Save hash to database with 120s expiration
    await Otp.create({
        phone,
        code_hash: hashCode(code),
        expires_at: literal('NOW() + INTERVAL 120 SECOND'),
    });

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

    // 2. Find the latest active OTP
    const otp = await Otp.findOne({
        where: {
            phone,
            used_at: null,
            expires_at: { [Op.gt]: literal('NOW()') },
        },
        order: [['id', 'DESC']],
    });

    if (!otp) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 3. Consume one attempt atomically (max 5 attempts)
    const [consumed] = await Otp.update(
        { attempts: literal('attempts + 1') },
        { where: { id: otp.id, used_at: null, attempts: { [Op.lt]: 5 } } }
    );

    if (consumed === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 4. Compare HMAC hash
    if (hashCode(code) !== otp.code_hash) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 5. Mark OTP as used so it cannot be used again
    const [marked] = await Otp.update(
        { used_at: literal('NOW()') },
        { where: { id: otp.id, used_at: null } }
    );

    if (marked === 0) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // 6. Find or create the user, role comes strictly from the DB
    const [user] = await User.findOrCreate({ where: { phone } });

    // 7. Sign JWT (HS256, 1h)
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
