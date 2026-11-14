# 14 · Auth routes with the ORM

[⬅ Index](./README.md) · [⬅ Prev](./13-orm-setup-and-models.md) · [Next ➡ 15 Posts routes with ORM](./15-orm-posts-routes.md)

## 🎯 Goal

Rewrite `request-otp` and `verify-otp` with models. Same endpoints, same responses, same security rules.

## 🔖 Commits

Part of the ORM migration commit (see [step 13](./13-orm-setup-and-models.md)).

## 🗂️ Files

| File | Action |
| --- | --- |
| `src/routes/auth.js` | rewritten with `User` and `Otp` models |

## 🛠️ Walkthrough

### 1. Imports and a hash helper

The HMAC code was duplicated in both routes. It's now one helper.

```js
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
```

### 2. `POST /auth/request-otp`

```js
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
```

> [!IMPORTANT]
> Times still come from the **database clock** through `literal('NOW() ...')`. Don't replace them with `new Date()`, or the app and DB clocks can disagree.

### 3. `POST /auth/verify-otp`

```js
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
```

### 4. What changed, and why it's still safe

| Before (raw SQL) | After (ORM) | Security effect |
| --- | --- | --- |
| One `UPDATE ... ORDER BY id DESC LIMIT 1` to spend an attempt, then a `SELECT` | `findOne` the latest active OTP, then `update` **by that row's `id`** with `attempts < 5` in the `WHERE` | The attempt check and increment are still **one atomic statement** per row. Parallel guesses can't exceed 5 |
| Final `UPDATE used_at` result ignored | Checks `marked === 0` | If two requests race with the same correct code, only **one** gets a token |
| `INSERT ... ON DUPLICATE KEY` + `SELECT` | `User.findOrCreate({ where: { phone } })` | One call. The `UNIQUE(phone)` index still guards against duplicates |
| Role read from a `SELECT` | Role read from `user.role` | Still comes from the DB, never from the client |

> [!NOTE]
> `Model.update` returns `[affectedRows]`. Destructure the first item, like `const [consumed] = await ...`.

## ✅ Verify

Same commands as [step 06](./06-request-otp.md#-verify) and [step 07](./07-verify-otp-and-jwt.md#-verify). The responses are identical:

```bash
curl -X POST localhost:3000/auth/request-otp -H 'Content-Type: application/json' -d '{"phone":"09123456789"}'
# {"message":"OTP sent successfully"}

# same phone again right away
# 429 {"error":"Please wait before requesting another code"}

# reuse a code that already worked
# 400 {"error":"Invalid or expired code"}
```

## ⚠️ Gotchas

- Use `used_at: null` in a `where` to mean `IS NULL`. `undefined` is an error in Sequelize.
- Wrap raw SQL in `literal(...)` **only for constant fragments**. Never put user input inside `literal`.
