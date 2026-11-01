# ConceptBridge — Adaptive Mathematics Learning Platform

ConceptBridge helps middle- and secondary-school students build mathematical understanding step by step. It uses a curriculum knowledge graph, short diagnostics, question-level practice, and recorded mastery to guide each learner toward a useful next topic. Teachers can review class and student progress and prepare printable practice materials.

## Try the live application

- **Website:** [https://conceptbridge-web.onrender.com/](https://conceptbridge-web.onrender.com/)
- **Backend API:** [https://conceptbridge-api.onrender.com/](https://conceptbridge-api.onrender.com/)

### Demo sign-in

Use the teacher credentials for the teacher workspace. Student demo sign-in currently supports **Class 10 only**.

**Teacher**

- Email: [teacher@conceptbridge.demo](mailto:teacher@conceptbridge.demo)
- Password: `LearnMath2026!`

**Student demo access — Class 10 only**

| Class | Class code | Rolls | PINs by roll |
| --- | --- | --- | --- |
| 10 | `DEMO10` | `01`–`40` | `1001`–`1040` |

Students sign in with class code `DEMO10`, their roll number, and the corresponding PIN; for example, roll `01` uses PIN `1001` and roll `40` uses PIN `1040`.

## What is implemented

- **Student learning journey:** an initial diagnostic, class-layered concept map, baseline/current mastery comparison, daily recommendations, practice activities, revision, adaptive tests, and a learning streak. After an answer, the next question is requested while feedback is shown and used on Continue when it is still valid; failed or expired prefetches fall back to a normal request.
- **Teacher workspace:** the dashboard selector loads class-specific data for classrooms associated with the signed-in teacher. Dashboard and student detail views include rosters, mastery groups, progress and activity information, misconception patterns, streaks, and alerts. Teachers can save group plans, set learning overrides, acknowledge alerts, create printable worksheets, and review scanned answers. Which classrooms appear depends on the classrooms provisioned in the connected database.
- **Classes 6–10 curriculum:** the curriculum graph contains 15 concepts across five class levels. The teacher dashboard and curriculum can represent class-specific content across these levels when the corresponding classroom/content records are available. This curriculum/dashboard coverage is separate from student authentication: the current public demo student login documented above is Class 10 only.
- **Adaptive learning:** the engine updates mastery using correctness, confidence, hints, and response time; tracks estimate confidence separately; decays old estimates toward uncertainty; and schedules revision. Adaptive tests use sequential stopping rules.
- **Knowledge graph:** prerequisite edges support concept sequencing, prerequisite checks, and root-cause paths when a student struggles.
- **Recommendations:** Continue chooses an eligible concept based on prerequisite readiness and mastery. Challenge selects a mastered concept for harder practice when one is available. Due revision is surfaced separately; the dashboard explains when a challenge is not yet available.
- **English and Telugu:** the interface and learning content support English and Telugu, including question text, choices, hints, explanations, feedback, and curriculum names. The language control switches the login and learning workspaces.
- **Printable worksheets and scan review:** teachers can create English or Telugu worksheets for up to two concepts, download a PDF with a QR code and a separate answer key, then upload or photograph a completed sheet. QR and bubble detection assist review; a teacher selects the student and reviews detected answers before saving them.
- **Offline and installable web app:** the PWA service worker precaches the application shell and static assets. Student dashboards and topic packs are stored in IndexedDB; topic packs are refreshed after 24 hours. Offline answers are queued for authenticated synchronization when connectivity returns. Authenticated API responses are not cached by the service worker.
- **Authentication and access control:** teacher/admin sign-in uses email and password; students use class code, roll number, and PIN. Passwords and PINs are Argon2-hashed. Session cookies, CSRF checks, rate limiting, request validation, Helmet, and role-specific API access are implemented.
- **Administrator workspace:** administrators can create teacher accounts, enable or disable teacher access, and review classroom/student totals and curriculum question/explanation coverage.

## Screenshots

<img width="1823" height="900" alt="Screenshot 2026-11-01 224139" src="https://github.com/user-attachments/assets/463eb615-f4b6-4341-b2ba-84c5912157cd" />
<img width="1825" height="907" alt="Screenshot 2026-11-01 224505" src="https://github.com/user-attachments/assets/be49d43c-bbfc-4aa1-b8a8-5215551f598f" />
<img width="1848" height="911" alt="Screenshot 2026-11-01 224552" src="https://github.com/user-attachments/assets/dda5a91c-fdd7-4838-a1be-e6579139f199" />
<img width="1806" height="907" alt="image" src="https://github.com/user-attachments/assets/5389a6c6-cdc6-4dcb-81ca-b1b84c477edf" />
<img width="1818" height="907" alt="image" src="https://github.com/user-attachments/assets/6e00f838-53ae-4876-bd7f-292cdc2185c7" />
<img width="1805" height="890" alt="image" src="https://github.com/user-attachments/assets/cba9ae91-ee1f-4908-8f7b-c4dac63257de" />
<img width="1808" height="912" alt="image" src="https://github.com/user-attachments/assets/d4d758ef-7753-4c5a-820f-995436a0a154" />
<img width="1816" height="818" alt="image" src="https://github.com/user-attachments/assets/184e4014-63b1-4e09-8e0b-821283314d3a" />



## Technology and architecture

| Area | Implementation |
| --- | --- |
| Web client | React 18, TypeScript, Vite, React Router, Tailwind CSS, i18next, Lucide icons |
| API | Node.js, Express 4, TypeScript, Mongoose, Zod |
| Database | MongoDB; local development defaults to `mongodb://127.0.0.1:27017/conceptbridge`; production receives its connection URI through Render's `MONGODB_URI` environment setting |
| Adaptive engine | Dependency-light TypeScript package shared by the API and web client |
| Shared contracts | Zod request schemas and shared TypeScript types |
| Worksheets | `@react-pdf/renderer`, QRCode, jsQR, and OpenCV.js |
| Offline storage | Workbox service worker and IndexedDB via `idb` |
| Tests | Vitest, Testing Library, and jsdom for web tests |

The repository is an npm-workspaces monorepo:

```text
apps/
  api/                 Express API, Mongoose models, routes, seed/migration tools
  web/                 React application, PWA configuration, styles, tests
packages/
  engine/              Curriculum graph, diagnostics, mastery, recommendations
  shared/              Shared Zod schemas and types
.github/workflows/     CI workflow
render.yaml            Render Blueprint for the API service
vercel.json            Vercel frontend configuration (alternative deployment)
```

The API owns authentication, authorization, question selection, answer evaluation, attempt history, mastery and streak updates, teacher analytics, and database writes. The engine contains reusable curriculum and decision logic. The web app calls the API and stores only the documented offline dashboard/topic-pack data and queued answers in IndexedDB.

### Adaptive engine notes

The current mastery update uses a learning rate of `0.22` and targets of `1.0` for sure-correct, `0.88` for unsure-correct, `0.68` for guess-correct, and `0` for incorrect answers. Hints reduce the update by 18% each, with a 46% minimum multiplier. Very fast or slow response times reduce influence. A sure-wrong answer requests a concept check and does not change mastery. Confidence is tracked separately, and mastery decays exponentially toward `0.5` with a 90-day half-life.

The diagnostic uses a minimum of 8 and maximum of 12 questions. Adaptive tests use 3–8 questions. Revision is scheduled at 3 and 7 days after mastery confirmation, subject to the engine's revision rules. Streak activity uses the `Asia/Kolkata` day boundary and supports up to two earned freezes. Thresholds and tuning values are centralized in `packages/engine/src/config.ts`.

## Local development

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- A local MongoDB Community Server, or a MongoDB Atlas database for development

### Setup (PowerShell)

From the repository root:

```powershell
Copy-Item .env.example .env
```

Edit the root `.env` and set `MONGODB_URI` to your **local development database**, `SESSION_SECRET` to a random value of at least 32 characters, and `WEB_ORIGIN` to `http://localhost:5173`. Keep `.env` private and out of Git. The API and scripts load this root `.env` file.

Install dependencies and start the application:

```powershell
npm ci
npm run dev
```

- Web app: <http://localhost:5173>
- API health endpoint: <http://localhost:4000/api/health>

Vite proxies `/api` requests to the API on port 4000. The API defaults to the local MongoDB URI shown in the technology table when `MONGODB_URI` is unset in development; production requires explicit database and web-origin configuration.

### Seed a local demo database

To populate a **disposable local development database** with curriculum, content, demo teacher/classrooms/students, and teacher dashboard sample data, run:

```powershell
npm run seed
```

The full seed is intended for local setup and is not a production-safe migration: parts of it update existing demo/curriculum records. Do not point it at production. The separate production curriculum/demo commands listed below have their own dry-run/apply behavior and should only be used with the intended database after reviewing their output.

## npm commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and web development servers together |
| `npm run test` | Run tests in workspaces that define a test script |
| `npm run typecheck` | Type-check workspaces that define a typecheck script |
| `npm run build` | Build all workspaces that define a build script |
| `npm run seed` | Run the full local demo seed; use only with a disposable development database |
| `npm run seed:admin -w @conceptbridge/api` | Provision an administrator using `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` from the root `.env` |
| `npm run seed:curriculum:production` | Dry-run the insert-only curriculum planner by default; use `npm run seed:curriculum:production -- --apply` to insert missing curriculum records |
| `npm run seed:demo:production -- --dry-run` | Explicitly dry-run the separate Class 10 demo-account planner. This command requires `--dry-run` because the current script applies when called without a mode flag; `npm run seed:demo:production -- --apply` explicitly applies it |
| `npm run seed:demo:classes:production` | Dry-run the Classes 6–9 migration by default; use `npm run seed:demo:classes:production -- --apply` to apply. It reads its source from `LOCAL_MONGODB_URI` and target from `MONGODB_URI` |

Production curriculum and Class 10 commands connect to the database selected by `MONGODB_URI`. The Classes 6–9 migration uses both `LOCAL_MONGODB_URI` (local source) and `MONGODB_URI` (target). Review each dry-run and source/target configuration before any `--apply`; the full `npm run seed` is not a substitute for these tools.

## Tests and production build

```powershell
npm run test
npm run typecheck
npm run build
```

The web workspace also provides `npm run test -w @conceptbridge/web`; the API provides `npm run test -w @conceptbridge/api`. CI runs `npm ci`, workspace tests, typecheck, and build on pushes and pull requests using `.github/workflows/ci.yml`.

## Deployment configuration

The live URLs above are hosted on Render. In this repository, `render.yaml` defines the **API web service** (`conceptbridge-api`): it runs `npm ci`, builds `@conceptbridge/api`, starts that workspace, and checks `/api/health`. The manifest declares `MONGODB_URI` and `WEB_ORIGIN` as externally supplied values and generates `SESSION_SECRET`. Set `MONGODB_URI` in Render to the production MongoDB Atlas connection URI; the actual URI and credentials are not stored in the repository and must be inspected in Render's environment settings.

The frontend URL is also on Render, but this checkout does not contain a Render frontend service definition: `render.yaml` defines only the API. `vercel.json` is a separate Vercel frontend configuration that builds `@conceptbridge/web` and publishes `apps/web/dist`; it does not describe the live Render frontend service. Consequently, frontend service build settings and its repository/branch connection must be checked in the Render dashboard. The frontend build uses `VITE_API_BASE_URL` when configured; it is a public build-time API origin, not a secret. Locally, Vite uses its `/api` proxy.

Production configuration uses credentialed CORS and secure cross-site session cookies for separate frontend/API origins. Configure `WEB_ORIGIN` to the exact frontend origin. Browser privacy settings can restrict cross-site cookies; this README does not claim that behavior is resolved in every browser. Keep Atlas credentials and session secrets in Render's environment settings, never in source control or `VITE_*` variables.
