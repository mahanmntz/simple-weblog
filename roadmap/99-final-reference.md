# 🏁 Final reference

[⬅ Index](./README.md) · [⬅ Prev](./12-mount-posts-router.md)

One page with everything you need once all steps are done.

---

## 📁 Final project tree

```text
simple-weblog/
├── .env                      # secrets (git-ignored)
├── .env.example              # variable names only
├── .gitignore
├── package.json
├── README.md
├── sql/
│   └── schema.sql            # users, posts, comments, otps
└── src/
    ├── app.js                # builds the Express app
    ├── server.js             # env check, DB check, listen
    ├── config/
    │   └── db.js             # mysql2 pool
    ├── middleware/
    │   ├── auth.js           # authenticate, requireAdmin
    │   ├── errorHandler.js   # JSON error responses
    │   └── notFound.js       # 404
    └── routes/
        ├── auth.js           # request-otp, verify-otp, me
        └── posts.js          # posts CRUD, list, comments
```

---

## 🌐 API reference

| Method | Path | Auth | Description | Step |
| --- | --- | :-: | --- | :-: |
| `GET` | `/health` | public | Liveness | 03 |
| `GET` | `/health/db` | public | DB check | 03 |
| `POST` | `/auth/request-otp` | public | Send a code (60 s cooldown) | 06 |
| `POST` | `/auth/verify-otp` | public | Exchange code for JWT | 07 |
| `GET` | `/auth/me` | ✅ | Current user | 08 |
| `GET` | `/posts` | public | List, paginate, search | 10 |
| `POST` | `/posts` | ✅ | Create post | 09 |
| `GET` | `/posts/:id` | public | One post | 09 |
| `PUT` | `/posts/:id` | ✅ author/admin | Update post | 09 |
| `DELETE` | `/posts/:id` | ✅ author/admin | Delete post | 09 |
| `GET` | `/posts/:postId/comments` | public | Comment tree | 11 |
| `POST` | `/posts/:postId/comments` | ✅ | Comment or reply | 11 |

### Status codes used

| Code | Meaning in this API |
| :-: | --- |
| `200` / `201` | OK / created |
| `400` | Bad input, malformed JSON, missing FK target |
| `401` | Missing, invalid or expired token |
| `403` | Logged in but not allowed |
| `404` | Unknown route, post or user resource |
| `409` | Duplicate unique value |
| `429` | OTP requested too soon (`Retry-After: 60`) |
| `500` | Unexpected server error (details only in server log) |

All errors share one shape: `{ "error": "message" }`.

---

## 🔐 Environment variables

```dotenv
PORT=3000
NODE_ENV=development        # prints OTP codes to the console. NEVER in production
DB_HOST=127.0.0.1
DB_USER=
DB_PASSWORD=
DB_NAME=simple_weblog
JWT_SECRET=                 # long random string
OTP_SECRET=                 # a different long random string
```

| Variable | Required at startup | Used by |
| --- | :-: | --- |
| `DB_HOST`, `DB_USER`, `DB_NAME` | ✅ | `config/db.js` |
| `DB_PASSWORD` | no | `config/db.js` |
| `JWT_SECRET` | ✅ | sign and verify tokens |
| `OTP_SECRET` | ✅ | HMAC of OTP codes |
| `PORT` | no (default 3000) | `server.js` |
| `NODE_ENV` | no | dev OTP logging |

> [!IMPORTANT]
> The repo's `.env.example` does not list `OTP_SECRET` or `NODE_ENV` yet. Add them.

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🧪 End-to-end smoke test

Save as `smoke.sh` and run with the server up and `NODE_ENV=development`.

```bash
#!/usr/bin/env bash
set -e
BASE=http://localhost:3000
H='Content-Type: application/json'
PHONE=09123456789

echo "1) request OTP"
curl -s -X POST $BASE/auth/request-otp -H "$H" -d "{\"phone\":\"$PHONE\"}"; echo
read -p "Enter the code printed in the server console: " CODE

echo "2) verify OTP"
TOKEN=$(curl -s -X POST $BASE/auth/verify-otp -H "$H" \
  -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
echo "token: ${TOKEN:0:20}..."

echo "3) me";            curl -s $BASE/auth/me -H "Authorization: Bearer $TOKEN"; echo
echo "4) create post";   curl -s -X POST $BASE/posts -H "$H" -H "Authorization: Bearer $TOKEN" \
                           -d '{"title":"Hello","body":"First post"}'; echo
echo "5) list posts";    curl -s "$BASE/posts?q=hello"; echo
echo "6) comment";       curl -s -X POST $BASE/posts/1/comments -H "$H" -H "Authorization: Bearer $TOKEN" \
                           -d '{"body":"Nice"}'; echo
echo "7) reply";         curl -s -X POST $BASE/posts/1/comments -H "$H" -H "Authorization: Bearer $TOKEN" \
                           -d '{"body":"Thanks","parent_id":1}'; echo
echo "8) comment tree";  curl -s $BASE/posts/1/comments; echo
```

---

## 🛡️ Security checklist (what this project already does)

- [x] Secrets only in `.env`, and the server **fails fast** if any are missing
- [x] OTP stored as **HMAC hash**, never plain
- [x] OTP: 60 s resend cooldown, 120 s expiry, max 5 attempts, single use
- [x] One generic error for every OTP failure
- [x] JWT algorithm pinned to HS256 on both sign and verify
- [x] Role read from the DB at login, never from client input
- [x] All SQL values passed as `?` placeholders
- [x] `author_id` / `user_id` always taken from the token
- [x] Ownership enforced inside the SQL `WHERE`
- [x] SQL error text never sent to the client
- [x] `x-powered-by` header disabled

---

## 🐛 Known quirks and follow-ups

Things the commits left behind. None of them stop the project from running.

| # | Where | Issue | Suggested fix |
| :-: | --- | --- | --- |
| 1 | `src/app.js` | Posts router mount is **uncommitted** | Commit it (step 12) |
| 2 | `src/routes/posts.js` | `express()` used instead of `express.Router()` | Use `express.Router()` |
| 3 | `.env.example` | Missing `OTP_SECRET` (and `NODE_ENV`) | Add them |
| 4 | `src/app.js` | Unused `http` import and `PORT`. `dotenv.config()` placed mid-file | Remove. Keep dotenv only in `server.js` |
| 5 | `src/middleware/auth.js` | `next()` inside `try`: a downstream sync throw becomes a 401 | Move `next()` after the `try/catch` |
| 6 | `sql/schema.sql` | No `ON DELETE CASCADE`: deleting a post that has comments gives a 500 | Add cascade or delete comments first |
| 7 | `sql/schema.sql` | `comments` has no `created_at` | Add the column |
| 8 | `src/middleware/auth.js` | `requireAdmin` exported but unused | Use it on admin-only routes, or remove it |
| 9 | `package.json` | `main` is `index.js` (does not exist) | Set to `src/server.js` |
| 10 | Whole API | No rate limit per IP, no real SMS, no refresh tokens | Out of scope for the exercise |

---

## 🧾 Commit timeline

```text
557d01c  first commit
f341391  chore: scaffold Express app with MySQL connection pool
79f2c63  add config/db.js
e222096  chore: scaffold Express app with MySQL connection pool
f72abbc  fix(db): export the connection pool from config/db.js
29a39a0  fix(errors): handle MySQL and JSON parse errors
fb159e7  fix(errors): handle MySQL and JSON parse errors
289fd3c  feat(db): add otps table
a9e5b47  chore: remove temporary test routes
5b815b3  refactor(db): simplify schema
c5eade3  chore: use node --watch in dev script
38cfa28  chore(auth): require OTP_SECRET in environment check
3eaeaf7  feat(auth): implement request-otp endpoint with cooldown
1529431  feat(auth): implement verify-otp endpoint and JWT generation
6c2750b  feat(auth): add authenticate and requireAdmin middlewares with /me route
cebd2ce  feat(posts): add pagination and search to list endpoint
a125b74  feat(comments): add nested comments support for posts
(working tree)  mount posts router in app.js
```

Replay any step's exact diff:

```bash
git show <hash> --stat
git show <hash> -- src/routes/auth.js
```
