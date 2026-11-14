# 00 · Project init

[⬅ Index](./README.md) · [Next ➡ 01 Hello server + env](./01-hello-server-and-env.md)

## 🎯 Goal

Create an empty Node project under git, with a placeholder `src/app.js`.

## 🔖 Commits

| Hash | Message |
| --- | --- |
| `557d01c` | first commit |

## 🗂️ Files

| File | Action |
| --- | --- |
| `README.md` | created (`# test`) |
| `package.json` | created by `npm init` |
| `src/app.js` | created, empty |

## 🛠️ Walkthrough

### 1. Create the folder and initialise git + npm

```bash
mkdir simple-weblog && cd simple-weblog
git init
npm init -y
mkdir src && touch src/app.js
```

### 2. Result: `package.json`

```json
{
  "name": "simple-weblog",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "license": "ISC"
}
```

> [!NOTE]
> `npm init -y` also fills in `repository`, `bugs` and `homepage` once a GitHub remote exists. They don't matter for the code.

### 3. First commit

```bash
git add .
git commit -m "first commit"
```

## ✅ Verify

```bash
git log --oneline
# 557d01c first commit
```
