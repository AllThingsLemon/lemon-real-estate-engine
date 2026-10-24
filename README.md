# lemon-real-estate-engine

The shared Astro engine behind every client site. It holds the templates,
styles, content schemas and CMS setup. Each client's text, images and settings
live in their own content repo (start one from
[lemon-real-estate-template](https://github.com/allthingslemon/lemon-real-estate-template)),
and the two are combined at build time.

```
client repo (theirs)                engine (this repo)
├── site.config.json  ─────────┐    ├── src/content.config.ts   content shapes
├── content/                   ├──▶ ├── src/cms/config.mjs      CMS fields + publish mode
│   ├── settings/*.json        │    ├── src/pages, layouts, components
│   ├── listings/*.md          │    └── src/styles/global.css
│   ├── categories/*.json      │
│   └── pages/*.md             │
└── public/uploads/…  ─────────┘    → dist/  (complete static site + /admin/)
```

## How a client site is built

The Cloudflare Pages project is connected to the **client's** repo, so every
save in the CMS triggers a build, and draft branches get preview URLs. The
build clones this engine and points it at the client repo:

| Setting | Value |
|---|---|
| Build command | `git clone --depth 1 https://github.com/allthingslemon/lemon-real-estate-engine.git engine && cd engine && pnpm install --frozen-lockfile && CLIENT_DIR=.. pnpm build` |
| Build output directory | `engine/dist` |
| Environment variables | `NODE_VERSION=22` |

Every build uses the latest `main`, so **all clients update together**.

### Rebuilding every client after an engine change

A client site only rebuilds when that client saves something, so the
**Deploy all clients** Action (`.github/workflows/deploy-all.yml`) rebuilds
every site after an engine change lands on `main`. It runs the build check
first, then calls each client's Cloudflare Pages deploy hook. It only fires
for changes under `src/`, `scripts/`, `astro.config.mjs` or the package
files, and has a **Run workflow** button for a manual refresh.

Hooks live in the repo secret `DEPLOY_HOOKS`, one client per line:

```
acme-realty https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...
```

To add a client: in their Pages project go to **Settings → Builds → Deploy
hooks**, create a hook for `main`, then add a line to the secret
(`gh secret set DEPLOY_HOOKS -R allthingslemon/lemon-real-estate-engine`
replaces the whole value, so paste every line). The Action only knows the
build was queued; build failures show up in Cloudflare's build notifications.

## Rules for changing the engine

`main` is live for every client the next time they save. So:

1. Work on a branch. The **Build check** Action must pass before merging.
2. Content changes must be backwards compatible. New fields are optional or
   have a default (`text` / `.default()` in `src/content.config.ts`). Never
   rename or remove a field until every client's content has been migrated.
3. Change the CMS form in `src/cms/config.mjs` and the matching schema in
   `src/content.config.ts` together. `pnpm check:cms` validates the CMS config
   against Sveltia's schema (it also runs as part of `pnpm build`).
4. Bump `@sveltia/cms` deliberately (it's in beta) and test the editor
   locally before merging.

## Local development

```sh
pnpm install
pnpm client ../lemon-real-estate-template     # or a git URL; makes ./client
pnpm dev                                # http://localhost:4321
```

The editor is at <http://localhost:4321/admin/index.html>. Choose **Work with
Local Repository** and pick the client repo folder: edits are written straight
to those files and the dev site reloads. Nothing is pushed.

## What's per client

| Where | What | Who edits it |
|---|---|---|
| `site.config.json` | GitHub repo, branch, live URL, sign-in service URL, listing URL prefix | Jesse (not in the CMS) |
| `content/settings/publishing.json` | Publish mode: `simple`, `preview` or `editorial_workflow` | Client, under **Publishing** in the CMS |
| `content/settings/general.json` | Name, logo, favicon, colors, fonts, menu, footer | Client |
| `content/settings/home.json` | Hero, section headings, FAQ | Client |
| `content/listings`, `categories`, `pages` | The site's content | Client |
| `public/uploads` | Every image and file | Client (via the CMS media library) |

Environment variables `SITE_URL` and `CMS_AUTH_URL` override the matching
values in `site.config.json` if set.

### Publish modes

- **simple**: saving publishes straight away.
- **preview**: each change goes to a draft branch with a preview link; the
  client clicks Publish when happy.
- **editorial_workflow**: draft → in review → ready → publish.

The Publishing setting itself always saves straight away, so switching modes
never waits on a review. The new mode applies after the next build (about 2
minutes) and a reload of the editor. Don't add branch protection to client
`main` branches: it blocks saves in simple mode.
