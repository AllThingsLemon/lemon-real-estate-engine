# Setup guide

Everything needed to run, add and maintain client sites, in one place. For
changing the engine's code, see the [README](../README.md). For clients editing
their own site, see `EDITING.md` in their repo.

## The pieces

| Piece | Where it lives | What it does |
|---|---|---|
| **Engine** | GitHub `Lemon-Grove-Mgmt/lemon-real-estate-engine` (public) | Design, page templates, content rules and editor setup shared by every site |
| **Content template** | GitHub `Lemon-Grove-Mgmt/lemon-real-estate-template` (public, template repo) | Starter content repo. Every client repo is created from it |
| **Client repo** | GitHub, one per client, all in the `Lemon-Grove-Mgmt` org (private) | That client's text, images and settings. Editor saves are commits here |
| **Pages project** | Cloudflare, one per client, all in the Lemon Grove account | Builds the client repo + engine and serves the site |
| **Sign-in Worker** | Cloudflare Worker `lemon-grove-auth` in the Lemon Grove account, `https://lemon-grove-auth.clients-lemon-grove.workers.dev`. Config in GitHub `Lemon-Grove-Mgmt/lemon-cms-auth` (private) | Handles "Sign in with GitHub" for every site's editor |
| **OAuth app** | GitHub, Lemon-Grove-Mgmt org → Settings → Developer settings → OAuth Apps → *Lemon Grove Site Editor* | The app clients approve when they sign in |
| **Build check** Action | Engine repo, `.github/workflows/build.yml` | Builds the engine against the template on every push and PR |
| **Deploy all clients** Action | Engine repo, `.github/workflows/deploy-all.yml` | Rebuilds every client site after an engine change |

The sign-in Worker and the OAuth app are shared. There is one of each, no
matter how many clients there are.

## How it fits together

```
 Client edits in https://their-site/admin/
        │  1. "Sign in with GitHub" opens a popup to the sign-in Worker
        ▼
 lemon-grove-auth Worker ──▶ GitHub login ──▶ back to Worker /callback
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
        └── rebuilds every Lemon Grove site that clones main, plus each hook
            in DEPLOY_HOOKS ──▶ every site rebuilds with the new engine

 You push to engine develop ──▶ Build check ──▶ Deploy stage
        └── POSTs STAGE_DEPLOY_HOOK ──▶ stage rebuilds with the new develop
```

**Where builds run:** on Cloudflare, not GitHub Actions. Cloudflare builds
every branch at its own preview address (which the editor's preview and review
modes rely on), and client repos then need no workflow files or API keys.
GitHub Actions only checks the engine and sends the rebuild signal.

## Build settings (every Pages project)

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `git clone --depth 1 https://github.com/Lemon-Grove-Mgmt/lemon-real-estate-engine.git engine && cd engine && npx -y pnpm@10.10.0 install --frozen-lockfile && CLIENT_DIR=.. npx -y pnpm@10.10.0 build` |
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

**The quick way:** the private `Lemon-Grove-Mgmt/lemon-grove-ops` repo has a
script, `scripts/new-client.sh`, and a Claude Code skill, `/real-estate-new-client`,
that do steps 1 to 4 below for a site in the Lemon Grove account, then check
the site. The steps here are the manual reference for what they do.

By hand, allow about 20 minutes. Do the steps in order.

Every client repo lives in the `Lemon-Grove-Mgmt` GitHub org, and every
client site is built and served from the Lemon Grove Cloudflare account. Two
things are set up once for the whole org, not per client:

- [ ] Cloudflare's GitHub app is installed on `Lemon-Grove-Mgmt` (the first
      **Connect to Git** in the Lemon Grove account asks for it; give it access
      to all repos, or add each new client repo as you go)
- [ ] The **Lemon Grove Site Editor** sign-in app is owned by `Lemon-Grove-Mgmt`,
      so the org doesn't need to approve it. A repo in another org (stage, in
      `lumen8-labs`) may need that org to approve it at
      `https://github.com/organizations/<org>/settings/oauth_application_policy`;
      otherwise the editor says "you don't have access to the repository".

### 1. GitHub

1. Create the client repo from the template: on
   `Lemon-Grove-Mgmt/lemon-real-estate-template` click **Use this template**,
   choose `Lemon-Grove-Mgmt` as the owner, and make it **private**. Name it
   after the client, e.g. `acme-realty`.
2. In the new repo, edit `site.config.json`:

   ```json
   {
     "repo": "Lemon-Grove-Mgmt/acme-realty",
     "branch": "main",
     "siteUrl": "https://www.client-site.com",
     "authUrl": "https://lemon-grove-auth.clients-lemon-grove.workers.dev",
     "listingsPath": "properties"
   }
   ```

   `listingsPath` is the URL prefix for listing pages (`/properties/harbor-view-lofts/`).
   Until the custom domain is live, `siteUrl` can be the `*.pages.dev` address.

   **Only for a client with on-chain investing**, add a `fund` block. It turns
   on the wallet pages and the "Investment" group in the listing editor (see
   [WALLET_PLAN.md](WALLET_PLAN.md)). Leave it out otherwise: without it the
   site is built exactly as before.

   ```json
   "fund": {
     "chainId": 97,
     "factories": ["0x8f2548d8d41394BA2c8Cc1bc364CD24EC2eA7FC1"],
     "lens": "0x2aa6717bfA3122dCeFdb91931cE48E946Ae816a2",
     "walletConnectProjectId": "…",
     "indexerUrl": "https://…"
   }
   ```

   `chainId` is 97 (BSC testnet) or 56 (BSC). `factories` and `lens` come
   from real-estate-fund's `contracts/deployments/`. `walletConnectProjectId` is
   loans-dapp's Reown project ID; add the site's domains to that project's
   allowlist in the Reown dashboard. Without it, only browser wallets can
   connect. `indexerUrl` is real-estate-fund's indexer Worker, for the lists
   and history on `/manage/`; add the site's domains to the indexer's
   `DASHBOARD_ORIGIN`. Both stay where they are: a site in the Lemon Grove
   account uses them across accounts by its domain alone. Without it, `/manage/` works but says those lists are
   unavailable, and it only finds projects a listing links to or that were
   created in that browser. A mistake in this block fails the build with a
   message naming the field.

   **Trusted owners** are the wallets allowed to own this client's projects:
   a project shows on the site only if its owner is one of them. The client
   keeps the list in their editor, under **Site settings → Project owners**
   (`content/settings/owners.json`), so their own admins can add an owner
   wallet without us. Anyone who can publish the site can change it, so tell
   the client that adding a wallet there trusts every project it owns on the
   site's factory. The site also trusts a `"trustedOwners": ["0x…"]` list
   in this `fund` block: the editor's list adds to it and can't remove from
   it, so a client adding its own wallet never hides existing projects. Only
   we can drop a wallet from `trustedOwners`; to hand one to the client's
   control, add it in the editor, then remove it here.

   Role holders manage their projects at `/manage/` on the client's site. It
   isn't in the navigation; a **Manage** link appears in the header once
   their wallet connects. Trusted owners also create projects there (**New
   project**), then link each one to a listing from the editor. `/manage/`
   lists every project a trusted owner created and owns, whether or not a
   listing links to it yet. When a project's ownership moves, add the new owner to the
   trusted owners before they accept.

   Then fill in **Site settings → Investor disclosures** in the client's
   editor, with text counsel has reviewed ([SAMPLE_DISCLOSURES.md](SAMPLE_DISCLOSURES.md)
   is a starting point). Investing stays off until the acknowledgments and
   the deposit confirmation are there.
3. Have each of the client's editors create their own GitHub account with
   two-factor sign-in. Add them to **their repo only** as outside
   collaborators with **Write** access (repo → Settings → Collaborators →
   Add people). Don't make them org members: every client shares the org, and
   members can see other clients' repos.

   Write access is also control of the site's trusted owners (Site settings →
   Project owners), so only add people the client trusts to decide which
   wallets' projects appear on their site.

   **Don't add branch protection to `main`**: it blocks saving in "publish
   straight away" mode.

### 2. Cloudflare Pages

1. In the Lemon Grove Cloudflare account, go to **Workers & Pages → Create →
   Pages → Connect to Git**.
2. Choose `Lemon-Grove-Mgmt`. If the new repo isn't listed, Cloudflare's GitHub
   app only has access to some repos: add this one in the app's settings on
   GitHub.
3. Pick the client repo and enter the [build settings](#build-settings-every-pages-project) above.
4. Save and deploy. The first build takes about two minutes.
5. Add a custom domain under the project's **Custom domains** tab, then update
   `siteUrl` in `site.config.json` to match.

### 3. Sign-in Worker: allow the site

Add the site's hostnames to `ALLOWED_DOMAINS` in `wrangler.toml` in the
`Lemon-Grove-Mgmt/lemon-cms-auth` repo (cloned at `~/Sites/lemon-cms-auth`),
commit and push, then redeploy:

```toml
ALLOWED_DOMAINS = "lemon-real-estate-stage.pages.dev,*.lemon-real-estate-stage.pages.dev,www.client-site.com,client-project.pages.dev,*.client-project.pages.dev"
```

```sh
cd ~/Sites/lemon-cms-auth && wrangler deploy
```

Include the `*.<project>.pages.dev` wildcard so editors work on preview
addresses too. A site that isn't on the list gets "Your domain is not allowed
to use the authenticator".

### 4. Engine updates (Deploy all clients)

**A site in the Lemon Grove Cloudflare account needs nothing here.** Deploy all
clients asks that account for every Pages project whose build command clones
this engine's main, and rebuilds each one. This uses two engine secrets, set
once: `CLOUDFLARE_API_TOKEN` (a Cloudflare API token with Account →
Cloudflare Pages → Edit, limited to the Lemon Grove account) and
`CLOUDFLARE_ACCOUNT_ID`. A project whose build command clones another branch
with `--branch` (stage) is skipped.

Only a site in **another** Cloudflare account needs a deploy hook:

1. In the Pages project: **Settings → Builds → Deploy hooks**, then add a hook
   named `deploy-all` on branch `main`.
2. Add a line to the engine's `DEPLOY_HOOKS` secret. Setting the secret
   replaces the whole value, so include every existing line:

   ```
   new-company-demo https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…
   client-name      https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…
   ```

   ```sh
   gh secret set DEPLOY_HOOKS -R Lemon-Grove-Mgmt/lemon-real-estate-engine
   ```

   GitHub never shows the secret again, so keep the full list somewhere safe,
   such as your password manager.
3. Test it: engine repo → **Actions → Deploy all clients → Run workflow**. The
   log should show `✓ client-name: build queued`.

### 5. Check and hand over

- [ ] Site loads at its live address, including a listing page and `/about/`
- [ ] `https://<site>/admin/` → **Sign in with GitHub** works for you and the client
- [ ] Save a small edit, and it's live within about two minutes
- [ ] With a `fund` block: the site's domains are in the indexer's
      `DASHBOARD_ORIGIN` and the Reown project's allowlist, and a wallet
      connects on a linked listing
- [ ] Send the client their `/admin/` link and point them to `EDITING.md`

## The stage site

A test client for trying engine changes and the editor without touching real
sites or the template.

| | |
|---|---|
| Site | <https://lemon-real-estate-stage.pages.dev> (editor at `/admin/`) |
| Content repo | `lumen8-labs/lemon-real-estate-stage` (private, made from the template) |
| Pages project | `lemon-real-estate-stage`, Lumen8 Team Cloudflare account |
| Engine branch | `develop`: its build command clones with `--branch develop`, so stage (and its branch previews) runs the engine's develop, not main |
| Deploy hook | `engine-develop`, saved in the engine secret `STAGE_DEPLOY_HOOK`. Not in `DEPLOY_HOOKS`: a merge to main doesn't need to rebuild a site that runs develop |

Every push to the engine's `develop` that changes the built site runs the
**Deploy stage** Action (`.github/workflows/stage.yml`): the build check, then
the stage hook. Stage is live with the new develop about two minutes later, with
no commit to the stage repo needed. To rebuild by hand once this workflow is on
main: engine repo → Actions → Deploy stage → Run workflow (pick `develop`).

Stage holds a full fake demo, *Keystone Estates* (8 sample properties with
illustrations), so layout changes can be checked against realistic content.
The template itself only has generic placeholders. Edits in the stage editor
change only the stage repo. To undo test edits, revert the commits in the
stage repo.

## Shared sign-in: how it's set up

Already done. This is the record, for rebuilding it if needed.

**OAuth app** (Lemon-Grove-Mgmt org → Settings → Developer settings → OAuth Apps):

| Field | Value |
|---|---|
| Application name | Lemon Grove Site Editor |
| Homepage URL | <https://lemon-real-estate-stage.pages.dev> (only shown on GitHub's approval screen) |
| Authorization callback URL (OAuth "redirect URI") | `https://lemon-grove-auth.clients-lemon-grove.workers.dev/callback`, the only one needed for every site |
| Allow wildcard matching | Off |
| Enable Device Flow | Off |
| Expire user access tokens | On (editors sign in again about once a day) |

**Worker** (`lemon-grove-auth`, Lemon Grove Cloudflare account; config repo `lemon-cms-auth`):

- Code is Sveltia's official [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth),
  unmodified. Only `wrangler.toml` is ours. It sets the Worker name, the
  account, `ALLOWED_DOMAINS` and `GITHUB_CLIENT_ID`.
- `GITHUB_CLIENT_SECRET` is a Worker secret, never in a file. To rotate it,
  generate a new secret on the OAuth app page, then run
  `wrangler secret put GITHUB_CLIENT_SECRET` in `~/Sites/lemon-cms-auth` and
  delete the old secret on GitHub.
- To rebuild from scratch: clone `Lemon-Grove-Mgmt/lemon-cms-auth`, run
  `wrangler deploy`, then set the secret. Pull upstream updates with
  `git pull upstream main` (see `LEMON.md` in that repo).
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
| Remove a client | Remove their hostnames from `ALLOWED_DOMAINS` (then redeploy the Worker). Deleting their Pages project takes them off Deploy all clients; a site outside the Lemon Grove account also needs its line removed from `DEPLOY_HOOKS` |
| A client leaves and takes the site | Transfer their repo from `Lemon-Grove-Mgmt` to their own GitHub org or account (repo → Settings → Transfer), and update `repo` in `site.config.json`. They need their own Pages project (same build settings), and either stay on the shared sign-in or set up their own OAuth app and Worker copy (about 10 minutes) and change `authUrl`. Then remove them as above |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Editor: "you don't have access to the repository" after signing in | The repo's org hasn't approved the OAuth app (only needed outside `Lemon-Grove-Mgmt`; see the one-time setup under [Adding a new client](#adding-a-new-client)), or the person isn't a collaborator on that client's repo |
| Sign-in popup: "Your domain is not allowed to use the authenticator" | Add the hostname to `ALLOWED_DOMAINS` and redeploy the Worker |
| Sign-in popup: "OAuth app client ID or secret is not configured" | Worker is missing `GITHUB_CLIENT_ID` or the `GITHUB_CLIENT_SECRET` secret |
| Cloudflare build: `No preset version installed for command pnpm` | Build command isn't using `npx -y pnpm@…`. Copy it from [build settings](#build-settings-every-pages-project) |
| Cloudflare build: `Node.js … is not supported by Astro` | Set `NODE_VERSION=24` on the Pages project |
| Cloudflare build fails after a client's save | Usually content the engine's schema rejects. The build log names the file. The old site stays live meanwhile |
| A save isn't showing on the site | Check the Pages project's Deployments tab. Builds take 1–2 minutes and queue behind each other |
| Editor still in the old publish mode | The mode changes after the next build. Wait about 2 minutes and reload the editor |
| Drafts disappeared after switching to "straight away" | They're still there as branches. Switch back to a preview mode, publish or delete them, then switch |
| Deploy all clients shows `deploy hook failed` | The hook was deleted or mistyped. Recreate it in the Pages project and update `DEPLOY_HOOKS` |
| Deploy all clients skips a Lemon Grove site | Its build command doesn't clone `github.com/Lemon-Grove-Mgmt/lemon-real-estate-engine.git`, or it has `--branch`. Copy the command from [build settings](#build-settings-every-pages-project) |
| Deploy all clients: "couldn't start a build" | The `CLOUDFLARE_API_TOKEN` has expired or lost Pages Edit on the Lemon Grove account. Make a new one and update the secret |
| A linked listing says "Investing opens here once this site's investor disclosures are set up" | Fill in the acknowledgments and the deposit confirmation under Site settings → Investor disclosures |
| A project disappeared from `/manage/` or its listing after an ownership transfer | The new owner isn't a trusted owner. Add them under Site settings → Project owners in the editor |
| A trusted owner doesn't see **New project** on `/manage/` | Their wallet isn't in the trusted owners the site was built with. Check Site settings → Project owners and `fund.trustedOwners`, then wait for the rebuild |
| A new project doesn't show on `/manage/` in another browser | The indexer hasn't listed it yet, or the site has no `indexerUrl`. It shows once a listing links to it |
| A trusted owner's project doesn't show on `/manage/` | It was created by a wallet that isn't a trusted owner (the fund dashboard's operator wallet, say). `/manage/` only finds projects a trusted owner created; link it from a listing instead |
| A manage page button says the pool's BNB fee can't be priced | The pool's price feed has no BNB price right now, so the fee can't be quoted. Try again later, or ask the Loans team to check the feed |
| A linked listing says "Investing isn't available for this listing" | The project failed the link check. The browser console says which part: not a fund project on this network, a factory missing from `fund.factories`, or an owner who isn't a trusted owner |

## Open items

- **Build limits in the Lemon Grove account**: every client site shares the
  one account. On the free plan that's 500 builds a month, one at a time, and
  each editor save and each deploy-all is a build per site. Move to a paid
  plan once there are enough clients for builds to queue.
- **Stage and the new-company demo** are still in `lumen8-labs` and the Lumen8
  Team Cloudflare account. They work as they are; move them to Lemon Grove
  only if it's useful to test there.
- **Token expiry**: check how the editor behaves when the 8-hour sign-in
  expires mid-edit.
