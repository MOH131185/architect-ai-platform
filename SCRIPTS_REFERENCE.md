# NPM Scripts Reference

This document describes the recommended NPM scripts for the ArchitectAI platform.

## Recommended package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "server": "node server.js",
    "dev": "concurrently \"npm start\" \"npm run server\"",

    "check:env": "node scripts/check-env.js",
    "check:contracts": "node scripts/check-contracts.js",
    "check:all": "npm run check:env && npm run check:contracts",

    "format": "prettier --write \"src/**/*.{js,jsx,json,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{js,jsx,json,css,md}\"",

    "lint": "eslint src --ext .js,.jsx",
    "lint:fix": "eslint src --ext .js,.jsx --fix",

    "precommit": "npm run check:all && npm run format:check && npm run lint",
    "prebuild": "npm run check:all"
  }
}
```

---

## Script Descriptions

### Core Scripts

#### `npm start`
Start the React development server on http://localhost:3000

#### `npm run server`
Start the Express API proxy server on http://localhost:3001

#### `npm run dev`
Run both React and Express servers concurrently (requires `concurrently` package)

#### `npm run build`
Create production build in `/build` folder (runs `check:all` first)

#### `npm test`
Run test suite in interactive mode

---

### Quality Gate Scripts

#### `npm run check:env`
Validates that all required environment variables are set.

**Output:**
```
🔍 Checking environment variables...

📡 Server-side API Keys:
  ✅ OPENAI_REASONING_API_KEY
  ✅ OPENAI_IMAGES_API_KEY

🌐 Client-side API Keys:
  ✅ REACT_APP_GOOGLE_MAPS_API_KEY
  ✅ REACT_APP_OPENWEATHER_API_KEY

✅ Environment check PASSED
```

**Fails if:** Any required environment variable is missing

---

#### `npm run check:contracts`
Validates that Design DNA contract files exist and contain expected exports.

**Output:**
```
🔍 Checking Design DNA contracts...

  ✅ src/domain/dna.js
  ✅ src/domain/validators.js
  ✅ src/config/appConfig.js
  ✅ src/services/apiClient.js
  ✅ src/services/adapters/openaiAdapter.js
  ✅ src/services/adapters/replicateAdapter.js

✅ Contract check PASSED
```

**Fails if:** Any contract file is missing or incomplete

---

#### `npm run check:all`
Runs all validation checks (env + contracts)

**Use before:** Committing code, deploying to production, running builds

---

### Code Quality Scripts

#### `npm run format`
Formats all code using Prettier (auto-fix)

**Requires:** `npm install --save-dev prettier`

**Prettier config** (create `.prettierrc`):
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "tabWidth": 2
}
```

---

#### `npm run format:check`
Checks code formatting without making changes

**Use in CI:** To ensure code is properly formatted

---

#### `npm run lint`
Lint code using ESLint

**Requires:** ESLint already configured in Create React App

**Optional:** Add custom ESLint rules in `.eslintrc.json`:
```json
{
  "extends": ["react-app"],
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "warn"
  }
}
```

---

#### `npm run lint:fix`
Lint code and auto-fix issues

---

### Pre-Hook Scripts

#### `npm run precommit`
Runs before git commits (requires `husky`)

**Runs:** `check:all` → `format:check` → `lint`

**Setup Husky** (optional):
```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm run precommit"
```

---

#### `npm run prebuild`
Runs automatically before `npm run build`

**Ensures:** Environment and contracts are valid before building

---

## Installation of Dev Dependencies

```bash
# Install Prettier
npm install --save-dev prettier

# Install Concurrently (for running multiple servers)
npm install --save-dev concurrently

# Install Husky (for git hooks)
npm install --save-dev husky

# Install dotenv (for env var loading)
npm install dotenv
```

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/quality-check.yml`:

```yaml
name: Quality Check

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Check environment template
        run: cp .env.example .env && npm run check:env

      - name: Check contracts
        run: npm run check:contracts

      - name: Check formatting
        run: npm run format:check

      - name: Lint code
        run: npm run lint

      - name: Run tests
        run: npm test -- --watchAll=false

      - name: Build
        run: npm run build
```

---

## Vercel Deployment

Vercel automatically runs `npm run build` before deploying.

**Ensure** `.env` is configured in Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add all required variables (see `check:env` output)
3. Set for Production, Preview, and Development environments

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm run check:env` | Validate env vars | Before starting dev, before deployment |
| `npm run check:contracts` | Validate DNA contracts | After creating new contracts, before commit |
| `npm run check:all` | Run all checks | Before every commit, in CI/CD |
| `npm run format` | Auto-format code | Before committing code |
| `npm run lint` | Check code quality | Before committing code |
| `npm run precommit` | Full pre-commit check | Automatically via Husky hook |

---

**End of Scripts Reference**
