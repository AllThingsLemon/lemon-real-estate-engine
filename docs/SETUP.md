# Setup guide

Everything needed to run, add and maintain client sites, in one place. For
changing the engine's code, see the [README](../README.md). For clients editing
their own site, see `EDITING.md` in their repo.

## The pieces

| Piece | Where it lives | What it does |
|---|---|---|
| **Engine** | GitHub `AllThingsLemon/lemon-real-estate-engine` (public) | Design, page templates, content rules and editor setup shared by every site |
| **Content template** | GitHub `AllThingsLemon/lemon-real-estate-template` (public, template repo) | Starter content repo. Every client repo is created from it |
| **Client repo** | GitHub, one per client, in the client's own org | That client's text, images and settings. Editor saves are commits here |
| **Pages project** | Cloudflare, one per client | Builds the client repo + engine and serves the site |
| **Sign-in Worker** | Cloudflare Worker `lemon-cms-auth` in the Lemon engineering account, `https://lemon-cms-auth.clients-lemon.workers.dev` | Handles "Sign in with GitHub" for every site's editor |
| **OAuth app** | GitHub, AllThingsLemon org → Settings → Developer settings → OAuth Apps → *Lemon Real Estate Site Editor* | The app clients approve when they sign in |
| **Build check** Action | Engine repo, `.github/workflows/build.yml` | Builds the engine against the template on every push and PR |
| **Deploy all clients** Action | Engine repo, `.github/workflows/deploy-all.yml` | Rebuilds every client site after an engine change |

The sign-in Worker and the OAuth app are shared. There is one of each, no
matter how many clients there are.

## How it fits together

```
 Client edits in https://their-site/admin/
        │  1. "Sign in with GitHub" opens a popup to the sign-in Worker
        ▼
 lemon-cms-auth Worker ──▶ GitHub login ──▶ back to Worker /callback
        │  2. Worker checks the site is in ALLOWED_DOMAINS, hands the editor a token
        ▼
 Editor saves ──▶ commit to the client repo on GitHub
        │  3. GitHub tells Cloudflare about the commit
        ▼
 Cloudflare Pages build: clone client repo → clone engine (main) → build → publish
        │  4. live in ~1–2 minutes; a failed build leaves the old site up
        ▼
 https://their-site/

 You merge to engine main ──▶ Build check ──▶ Deploy all clients
        └── POSTs every hook in DEPLOY_HOOKS ──▶ every site rebuilds with the new engine
```

**Where builds run:** on Cloudflare, not GitHub Actions. Cloudflare builds
every branch at its own preview address (which the editor's preview and review
modes rely on), and client repos then need no workflow files or API keys.
GitHub Actions only checks the engine and sends the rebuild signal.

## Build settings (every Pages project)

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `git clone --depth 1 https://github.com/AllThingsLemon/lemon-real-estate-engine.git engine && cd engine && npx -y pnpm@10.10.0 install --frozen-lockfile && CLIENT_DIR=.. npx -y pnpm@10.10.0 build` |
| Build output directory | `engine/dist` |
| Root directory | *(empty)* |
| Environment variable | `NODE_VERSION=24` |
| Preview deployments | All branches |

Why it looks like this:

- **pnpm via `npx`**: Cloudflare only installs pnpm when the connected repo has
  a pnpm lockfile. Client repos don't, since the lockfile is in the engine.
- **Node 24**: Astro needs Node 22.23.4 or newer.
- **`CLIENT_DIR=..`**: the engine is cloned *inside* the client repo, so the
  client's files are one folder up.

Optional environment variables, which override `site.config.json`:
`CMS_REPO`, `SITE_URL`, `CMS_AUTH_URL`.

## Adding a new client

Allow about 20 minutes. Do the steps in order.

### 1. GitHub

1. Create the client's GitHub organization, or use theirs, and make sure you're
   an owner. Have the client create their own GitHub account with two-factor
   sign-in, and add them to the org.
2. Create the client repo from the template: on
   `AllThingsLemon/lemon-real-estate-template` click **Use this template**,
   choose the client's org as the owner, and make it **private**.
3. In the new repo, edit `site.config.json`:

   ```json
   {
     "repo": "client-org/client-repo",
     "branch": "main",
     "siteUrl": "https://www.client-site.com",
     "authUrl": "https://lemon-cms-auth.clients-lemon.workers.dev",
     "listingsPath": "properties"
   }
   ```

   `listingsPath` is the URL prefix for listing pages (`/properties/harbor-view-lofts/`).
   Until the custom domain is live, `siteUrl` can be the `*.pages.dev` address.
4. **Approve the sign-in app for the client's org.** Without this, the editor
   says "you don't have access to the repository" even for owners. Go to
   `https://github.com/organizations/<client-org>/settings/oauth_application_policy`
   and approve **Lemon Real Estate Site Editor**. If it isn't listed yet, sign in
   to the client's editor once, which creates the request, then approve it.
5. Give editors **Write** access to the client repo. **Don't add branch
   protection to `main`**: it blocks saving in "publish straight away" mode.

### 2. Cloudflare Pages

1. In the Cloudflare account that will host the site, go to **Workers & Pages
   → Create → Pages → Connect to Git**.
2. If the client's GitHub org isn't listed, choose **Add account** and give
   Cloudflare's GitHub app access to the client repo.
3. Pick the client repo and enter the [build settings](#build-settings-every-pages-project) above.
4. Save and deploy. The first build takes about two minutes.
5. Add a custom domain under the project's **Custom domains** tab, then update
   `siteUrl` in `site.config.json` to match.

### 3. Sign-in Worker: allow the site

Add the site's hostnames to `ALLOWED_DOMAINS` in the Worker's `wrangler.toml`,
then redeploy:

```toml
ALLOWED_DOMAINS = "lemon-real-estate-stage.pages.dev,*.lemon-real-estate-stage.pages.dev,www.client-site.com,client-project.pages.dev,*.client-project.pages.dev"
```

```sh
cd ~/Sites/lemon-cms-auth && wrangler deploy
```

Include the `*.<project>.pages.dev` wildcard so editors work on preview
addresses too. A site that isn't on the list gets "Your domain is not allowed
to use the authenticator".

### 4. Deploy-all hook

1. In the Pages project: **Settings → Builds → Deploy hooks**, then add a hook
   named `deploy-all` on branch `main`.
2. Add a line to the engine's `DEPLOY_HOOKS` secret. Setting the secret
   replaces the whole value, so include every existing line:

   ```
   lemon-real-estate-stage https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…
   client-name             https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…
   ```

   ```sh
   gh secret set DEPLOY_HOOKS -R AllThingsLemon/lemon-real-estate-engine
   ```

   GitHub never shows the secret again, so keep the full list somewhere safe,
   such as your password manager.
3. Test it: engine repo → **Actions → Deploy all clients → Run workflow**. The
   log should show `✓ client-name: build queued`.

### 5. Check and hand over

- [ ] Site loads at its live address, including a listing page and `/about/`
- [ ] `https://<site>/admin/` → **Sign in with GitHub** works for you and the client
- [ ] Save a small edit, and it's live within about two minutes
- [ ] Send the client their `/admin/` link and point them to `EDITING.md`

## The stage site

A test client for trying engine changes and the editor without touching real
sites or the template.

| | |
|---|---|
| Site | <https://lemon-real-estate-stage.pages.dev> (editor at `/admin/`) |
| Content repo | `lumen8-labs/lemon-real-estate-stage` (private, made from the template) |
| Pages project | `lemon-real-estate-stage`, Lumen8 Team Cloudflare account |
| Deploy hook | In `DEPLOY_HOOKS` as `lemon-real-estate-stage` |

Edits in the stage editor change only the stage repo. To reset stage to the
template's demo content, copy the template's `content/` and `public/` folders
over the stage repo's and push.

## Shared sign-in: how it's set up

Already done. This is the record, for rebuilding it if needed.

**OAuth app** (AllThingsLemon org → Settings → Developer settings → OAuth Apps):

| Field | Value |
|---|---|
| Application name | Lemon Real Estate Site Editor |
| Homepage URL | <https://lemon-real-estate-stage.pages.dev> (only shown on GitHub's approval screen) |
| Redirect URI | `https://lemon-cms-auth.clients-lemon.workers.dev/callback`, the only one needed for every site |
| Allow wildcard matching | Off |
| Enable Device Flow | Off |
| Expire user access tokens | On (editors sign in again about once a day) |

**Worker** (`lemon-cms-auth`, Lemon engineering Cloudflare account):

- Code is Sveltia's official [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth),
  unmodified. Only `wrangler.toml` is ours. It sets the Worker name, the
  account, `ALLOWED_DOMAINS` and `GITHUB_CLIENT_ID`.
- `GITHUB_CLIENT_SECRET` is a Worker secret, never in a file. To rotate it,
  generate a new secret on the OAuth app page, then run
  `wrangler secret put GITHUB_CLIENT_SECRET` in `~/Sites/lemon-cms-auth` and
  delete the old secret on GitHub.
- To rebuild from scratch: clone sveltia-cms-auth, recreate `wrangler.toml`
  with the values above, run `wrangler deploy`, then set the secret.
- **Never leave `ALLOWED_DOMAINS` empty.** Empty means any website could
  receive sign-in tokens.

**What the sign-in can access:** the token acts as the signed-in person's own
GitHub account, and only reaches repos they can already reach. It's stored in
their browser, not on our servers.

## Day-to-day

| Task | How |
|---|---|
| Change the design or features | Branch in the engine, open a PR, make sure Build check passes, merge. Deploy all clients rebuilds every site. See the README's rules: content changes must stay backwards compatible. |
| Rebuild every site manually | Engine repo → Actions → Deploy all clients → Run workflow |
| Rebuild one site | Cloudflare → the Pages project → Deployments → Retry, or make any commit to its repo |
| Add or change a client domain | Pages project → Custom domains, then `siteUrl` in `site.config.json` and `ALLOWED_DOMAINS` in the Worker |
| Remove a client | Delete their line from `DEPLOY_HOOKS` and their hostnames from `ALLOWED_DOMAINS` (then redeploy the Worker) |
| A client leaves and takes the site | Their repo and content are already theirs. They need their own Pages project (same build settings), and either stay on the shared sign-in or set up their own OAuth app and Worker copy (about 10 minutes) and change `authUrl` |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Editor: "you don't have access to the repository" after signing in | The client's org hasn't approved the OAuth app. See [step 1.4](#1-github) |
| Sign-in popup: "Your domain is not allowed to use the authenticator" | Add the hostname to `ALLOWED_DOMAINS` and redeploy the Worker |
| Sign-in popup: "OAuth app client ID or secret is not configured" | Worker is missing `GITHUB_CLIENT_ID` or the `GITHUB_CLIENT_SECRET` secret |
| Cloudflare build: `No preset version installed for command pnpm` | Build command isn't using `npx -y pnpm@…`. Copy it from [build settings](#build-settings-every-pages-project) |
| Cloudflare build: `Node.js … is not supported by Astro` | Set `NODE_VERSION=24` on the Pages project |
| Cloudflare build fails after a client's save | Usually content the engine's schema rejects. The build log names the file. The old site stays live meanwhile |
| A save isn't showing on the site | Check the Pages project's Deployments tab. Builds take 1–2 minutes and queue behind each other |
| Editor still in the old publish mode | The mode changes after the next build. Wait about 2 minutes and reload the editor |
| Drafts disappeared after switching to "straight away" | They're still there as branches. Switch back to a preview mode, publish or delete them, then switch |
| Deploy all clients shows `deploy hook failed` | The hook was deleted or mistyped. Recreate it in the Pages project and update `DEPLOY_HOOKS` |

## Open items

- **Cloudflare accounts for real clients**: undecided between client-owned
  accounts (you as Administrator) and one shared account. Builds stay on
  Cloudflare either way. With one shared free account, all sites share 500
  builds a month and build one at a time.
- **Worker config backup**: `~/Sites/lemon-cms-auth` exists only on Jesse's Mac.
  Push it to a private `AllThingsLemon/lemon-cms-auth` repo.
- **Token expiry**: check how the editor behaves when the 8-hour sign-in
  expires mid-edit.
