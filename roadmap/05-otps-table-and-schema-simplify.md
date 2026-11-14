# 05 · OTP table + simpler schema

[⬅ Index](./README.md) · [⬅ Prev](./04-error-handling.md) · [Next ➡ 06 Request OTP](./06-request-otp.md)

## 🎯 Goal

Add storage for one-time login codes, simplify the schema for local development, and make `OTP_SECRET` a required variable.

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `289fd3c` | feat(db): add otps table |
| `5b815b3` | refactor(db): simplify schema |
| `38cfa28` | chore(auth): require OTP_SECRET in environment check |

## 🗂️ Files

| File | Action |
| --- | --- |
| `sql/schema.sql` | `otps` added, then everything simplified |
| `src/server.js` | `OTP_SECRET` added to required env vars |

## 🛠️ Walkthrough

### 1. The `otps` table design

| Column | Type | Purpose |
| --- | --- | --- |
| `phone` | `VARCHAR(11)` | Who the code was sent to |
| `code_hash` | `CHAR(64)` | HMAC-SHA256 hex digest (64 chars). **Never the code itself** |
| `expires_at` | `DATETIME` | Hard expiry (+120 s) |
| `attempts` | `INT` | Wrong-guess counter (max 5) |
| `used_at` | `DATETIME NULL` | Set on success → one-time use |
| `created_at` | `TIMESTAMP` | Used for the 60 s resend cooldown |

The first version (`289fd3c`) also had an index to find the latest code quickly:

```sql
-- One-time codes. We store a hash of the code, never the code itself.
CREATE TABLE IF NOT EXISTS otps (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(11) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otps_phone_created (phone, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2. Simplify the whole schema (`5b815b3`)

For a live-coding project the extras were noise. Removed:

| Removed | Reason |
| --- | --- |
| `ENUM('author','admin')` | Replaced by `VARCHAR(10)` |
| `UNSIGNED` | Plain `INT` is enough |
| Indexes | Not needed at this size |
| `ON DELETE CASCADE` and named constraints | Simpler plain `FOREIGN KEY` |
| `name`, `updated_at` | Not used by any route |
| `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` | Server defaults are fine |

Added `DROP TABLE IF EXISTS` at the top so you can re-run the file to reset your local DB.

### 3. `sql/schema.sql`: final

```sql
DROP TABLE IF EXISTS comments, posts, otps, users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(11) NOT NULL UNIQUE,
  role VARCHAR(10) NOT NULL DEFAULT 'author'
);

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_id INT NULL,
  body TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE TABLE otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(11) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> [!WARNING]
> `DROP TABLE` **deletes all data**. This file is for local development only. Never run it against a database you care about.

> [!NOTE]
> `DROP TABLE IF EXISTS comments, posts, otps, users;` lists children before parents, so foreign keys don't block the drop.

Re-run it any time to reset:

```bash
mysql -u <user> -p simple_weblog < sql/schema.sql
```

### 4. Require `OTP_SECRET` (`38cfa28`)

`src/server.js`:

```diff
-for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET']) {
+for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET', 'OTP_SECRET']) {
     if (!process.env[name]) throw new Error(`${name} is not set`);
 }
```

Generate two strong secrets and put them in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```dotenv
JWT_SECRET=<paste one random value>
OTP_SECRET=<paste a different random value>
```

> [!IMPORTANT]
> Use **different** values for `JWT_SECRET` and `OTP_SECRET`. They protect different things.

## ✅ Verify

```bash
mysql -u <user> -p simple_weblog -e "SHOW TABLES;"
# comments, otps, posts, users

# remove OTP_SECRET from .env and the server must refuse to start:
npm run dev
# Error: OTP_SECRET is not set
```
