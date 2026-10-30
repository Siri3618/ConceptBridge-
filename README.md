# ConceptBridge

Adaptive math learning for Indian classrooms, built as an npm-workspaces monorepo.

## Workspace layout

- `apps/web` — React, TypeScript, Vite, Tailwind, and i18next client.
- `apps/api` — Express, TypeScript, Mongoose, session authentication, and API routes.
- `packages/shared` — shared Zod schemas and client/server types.
- `packages/engine` — dependency-free adaptive engine package (implemented in Phase 3).

## Requirements and local setup

Node.js 20+ and npm 10+ are required. Start MongoDB locally or create an Atlas database.

```sh
cp .env.example .env
# Set MONGODB_URI and replace SESSION_SECRET with a random value of at least 32 characters.
npm install
npm run seed
npm run dev
```

Keep `.env` in the repository root (`C:\ConceptBridge\.env`). API and seed scripts load that root file even though npm runs them from the `apps/api` workspace.

The web app runs at `http://localhost:5173`; Vite proxies `/api` to the API on port 4000.

### Demo sign-in (Phase 1)

- Teacher: `teacher@conceptbridge.demo` / `LearnMath2026!`
- Demo classrooms are available for Classes 6–10 with codes `DEMO06`, `DEMO07`, `DEMO08`, `DEMO09`, and `DEMO10`.
- Class 10 students: rolls `01` through `40`, PINs `1001` through `1040` respectively.
- Classes 6–9: rolls `01` through `08`; PINs are `6001`–`6008`, `7001`–`7008`, `8001`–`8008`, and `9001`–`9008` respectively.

Change these demo credentials before using any shared or public environment.

### Administrator account

The admin console is not seeded with a public demo login. To provision the first admin, set `ADMIN_EMAIL`, `ADMIN_NAME`, and a unique `ADMIN_PASSWORD` of at least 12 characters in the root `.env`, ensure MongoDB is running, and run `npm run seed:admin`. Admins sign in through the teacher sign-in tab, then land on a separate administration screen. It supports creating teachers, enabling/disabling teacher access, and reviewing seeded curriculum coverage. Passwords are stored as Argon2 hashes. The initial teacher password must be shared securely with that teacher.

## Security configuration

Every state-changing auth endpoint validates its request with shared Zod schemas. Express sessions use the Mongo store, `httpOnly` cookies, secure cookies in production, role identity, and CSRF token validation. Login requests are rate-limited, request bodies are size-limited, Helmet is enabled, and credentials are Argon2-hashed. The configured Vercel/Render deployment uses credentialed CORS and `SameSite=None; Secure` cookies; set `WEB_ORIGIN` to the exact frontend origin. Configure `COOKIE_DOMAIN` only when the frontend and API share a registrable domain. See the deployment steps below for the API-origin environment variable and browser cookie limitations.

## Commands

- `npm run dev` — run web and API concurrently.
- `npm run test` — run workspace tests.
- `npm run build` — build all workspaces.
- `npm run typecheck` — check TypeScript in all workspaces.
- `npm run seed` — create demo teacher, class, and 40 student profiles.

GitHub Actions runs workspace tests, TypeScript checks, and production builds on pushes and pull requests using `.github/workflows/ci.yml`.

## Deployment

The frontend is deployed to Vercel, the API to Render, and MongoDB to Atlas. The repository includes `vercel.json` and `render.yaml`.

### MongoDB Atlas

1. Create an Atlas project and database deployment. Create a database user with access only to the ConceptBridge database.
2. Add the Render service's outbound IP policy, or use Atlas's documented network access setting for the chosen Render plan. Avoid opening database access broadly for a production school deployment.
3. Copy the Atlas connection string for the Render `MONGODB_URI` environment variable and replace its database username, password, and database name.

### Render API

1. Create a Render Blueprint from this repository and select `render.yaml`.
2. Set `MONGODB_URI` in the Render service environment. Render generates `SESSION_SECRET` from the blueprint.
3. Deploy and wait for `/api/health` to report `status: ok` (it also checks the MongoDB connection).
4. Run `npm run seed -w @conceptbridge/api` once with the production database URI to create the demo curriculum and demo users. Use a controlled one-off job or local trusted environment; do not expose demo credentials to students. Create real teacher accounts and rotate/remove the demo account before public use.

### Vercel frontend

1. Import this repository into Vercel with the repository root as the project root. The checked-in configuration builds `apps/web` and publishes `apps/web/dist`.
2. Set `VITE_API_BASE_URL` to the Render API origin, without a trailing slash (for example, `https://conceptbridge-api.onrender.com`). This is a public API origin, not a secret; Vite embeds it at build time.
3. Set Render's `WEB_ORIGIN` to the exact deployed Vercel origin (scheme and host, no path). Redeploy the API after changing it.
4. The API uses credentialed CORS and `SameSite=None; Secure` session cookies in production. Keep `COOKIE_DOMAIN` empty for the separate Vercel and Render domains. The browser must allow cross-site cookies for this deployment arrangement.

Use a custom same-site domain or a Vercel `/api` rewrite to a fixed API hostname if the target browser blocks third-party cookies. In that setup, use the frontend origin as the browser-visible API origin and configure Render's CORS origin to match it. Do not set secrets in `VITE_*` variables. Keep Atlas credentials and session secrets in Render's secret environment settings.

### Local development and verification

Copy `.env.example` to `.env`, set a local or Atlas `MONGODB_URI`, set a random `SESSION_SECRET` of at least 32 characters, then run `npm install`, `npm run seed`, and `npm run dev`. Locally, Vite proxies `/api` to port 4000. Before deploying, run `npm run test` and `npm run build`.

## Product implementation phases

The project was implemented in the nine phases in the product brief. The sections below describe the completed feature phases and implementation notes.

## Phase 2: knowledge graph

The pure TypeScript curriculum and graph traversal live in `packages/engine`. The seeded graph has 15 concepts across Classes 6–10, with CBSE and Telangana SCERT chapter labels. Edges point from prerequisite to dependent concept. The seed validates the graph with a topological sort before writing nodes and edges to MongoDB. `getPrerequisites` and `getDependents` traverse breadth-first (nearest concepts first); `findRootCause` selects the most foundational weak prerequisite (mastery below 0.6 by default) and returns the rewind path. The graph package has unit tests for traversal, root-cause selection, order and cycle rejection.

## Phase 3: adaptive engine

All tuning values are centralized in `packages/engine/src/config.ts`. Mastery changes use `delta = 0.22 × (target − mastery) × hintMultiplier × responseMultiplier`; targets are 1.0 for sure-correct, 0.88 for unsure-correct, 0.68 for guess-correct, and 0 for other incorrect responses. A sure-wrong response is flagged for a concept check and receives no mastery change. Each hint reduces the gain by 18% (46% minimum multiplier); unusually fast or slow answers have less influence. Confidence of the estimate is stored separately, and mastery decays exponentially toward 0.5 with a 90-day half-life.

The diagnostic starts at the student’s class level, descends into unprobed prerequisites on an error, moves upward after confident correct answers, and records inferred prerequisite estimates with lower confidence. Next-activity rules and bilingual reasons are listed in `packages/engine/src/rules.ts` and returned with their input audit data. Test stopping uses a sequential probability ratio test with minimum 3 and maximum 8 answers. Mastery review dates are scheduled at 3 and 7 days. Streak helpers use the Asia/Kolkata day boundary, idempotent activity dates, up to two earned freezes, and a weekend grace day. Grouping thresholds are centralized in the same config.

## Phase 4: student learning journey

After `npm run seed`, the student dashboard offers a first-use diagnostic, a class-layered My Map with first-check/current mastery comparison, Today’s Path recommendations with the engine’s reason and rewind path, and a weekly streak strip. Students can open Learn, Solve, Test, Revise, or Challenge activities; answers, hints, confidence, misconceptions, mastery, decision logs, revisions, and eligible streak activity are recorded by student-scoped API routes. The seed creates six question variants and two explanation variants per concept so the student experience has content to use immediately.

## Phase 6: English + Telugu and curriculum mapping

The app language control switches the login, student learning journey, and teacher dashboard between English and Telugu. Student question prompts, answer choices, hints, feedback, misconception text, decision reasons, and explanation variants are stored and served with both `en` and `te` values. Concept records now include Telugu display names; seeded concept updates populate them. Run `npm run seed` after upgrading an existing database so its concept and learning-content records receive the bilingual fields and text.

Classes carry a `board` setting (`CBSE` or `TELANGANA_SCERT`). Student API responses select the corresponding chapter label from each concept’s board map; teacher class views use the selected class’s board and expose it in the classroom header. The UI uses Noto Sans Telugu with system sans-serif fallbacks for Telugu glyphs.

## Phase 7: installable app and offline learning

The Vite PWA plugin uses Workbox to precache the app shell and keep static scripts, styles, and fonts available. The service worker does not cache authenticated API responses. Student dashboards and bilingual topic packs are stored in IndexedDB through `idb`, keyed by student ID; class-level concepts and their prerequisites are prefetched when the dashboard is online. Cached topic packs provide question and explanation content while offline.

Answers submitted without a network connection are queued in IndexedDB with a UUID `clientId`, CSRF token, student ID, and client timestamp. When the browser reconnects, the app sends queued attempts through the normal authenticated API. The API’s unique `(studentId, clientId)` index makes retries idempotent; mastery and streak are computed by the server. Server-accepted client timestamps are limited to the previous seven days and at most five minutes in the future. An offline diagnostic completion is queued after its attempts and is finalized only after those attempts sync. The student workspace shows connection state and pending/synced counts.

Use HTTPS in production for service-worker installation. Browser support for IndexedDB and service workers is required for offline mode; online learning continues in browsers without IndexedDB.

## Phase 8: printable worksheets and scan review

Teachers can create worksheets for one or two selected concepts and an optional class group. Each worksheet has three questions per concept, board/class labels, bilingual English or Telugu content, bubble-style answer circles, a QR code encoding the worksheet, class, and group identifiers, and a separate teacher answer-key page. Noto Sans Telugu is bundled for print/PDF rendering. Worksheets are generated in the browser with `@react-pdf/renderer` and stored as teacher-owned metadata in MongoDB.

The scan tool is a separate lazy-loaded teacher view. Upload or photograph the question page with its QR code visible. jsQR reads the worksheet code, and OpenCV.js estimates filled answer bubbles from the standardized page layout. The teacher selects the student and reviews or corrects every detected mark before saving. Reviewed answers are validated against the worksheet and class on the API; the server records idempotent attempts, updates mastery and decision logs, and retains misconception tags. OpenCV and PDF generation are split into on-demand chunks; Workbox precaches neither tool chunk nor the large OpenCV bundle.

## Phase 9: production hardening

The production config now fails fast when `MONGODB_URI` or `WEB_ORIGIN` is missing, serves a readiness health check that includes MongoDB state, hides the Express signature header, and does not count successful classroom logins against the failed-login throttle. The client uses `VITE_API_BASE_URL` in production while retaining Vite's local `/api` proxy. Keyboard focus and reduced-motion preferences are respected, and the document language follows the English/Telugu switch. Vercel and Render manifests and Atlas deployment steps are included above.

The production build keeps the large worksheet PDF and OpenCV code outside the initial app bundle and Workbox precache. OpenCV remains a roughly 14.5 MB download when a teacher opens worksheet scanning. API tests cover database readiness and unauthenticated role protection; UI journey tests cover teacher sign-in to classroom overview, admin sign-in to administration, and student sign-in to Today’s Path and My Map using API test doubles. A seeded real-browser end-to-end run and Lighthouse audit remain deployment-environment checks: this workspace has no local MongoDB service, and browser-test tooling could not be installed while package-network access was restricted.
