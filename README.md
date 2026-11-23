# wyeastclimbers.com

A living history of the Wy'east Climbers, the Portland mountaineering club that
pioneered new routes on Mount Hood in the 1930s. Built with [Astro](https://astro.build)
as a static, single-page site, ready for GitHub Pages.

Everything (timeline, route map, people, sources, research desk, about) renders
into one page, `src/pages/index.astro`, with each part reachable by anchor (`/#timeline`,
`/#person-everett-darr`, …). Old URLs such as `/timeline` or
`/people/ranger` still work and redirect to their section. Inside markdown content, link
with anchors: `#contribute`, `#person-<id>`, or a milestone's `#<id>`.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Where things live

| What | Where | Notes |
|---|---|---|
| Timeline entries | `src/content/milestones/*.md` | One file per event. `date` sorts; `dateLabel` displays. Use `undated: true` if the date is unknown. |
| People | `src/content/people/*.md` | `membership`: `member` / `probable` / `associate`. |
| Sources | `src/content/sources.yaml` | Every citation points to an `id` here. The build fails on an unknown id. |

Every timeline entry and profile has a `status`:

- `sourced`: backed by a cited source
- `conflicting`: sources disagree (explain it in the body)
- `unverified`: still needs a source. Avoid publishing these: the site only carries sourced content.

### Adding a photo

Put images in `src/assets/` or `public/images/` and add a normal
`<figure><img …><figcaption>…</figcaption></figure>` where it belongs.
**Always include the credit line and record the permission** (see REVIEW.md).

## Deploying to wyeastclimbers.com

This folder is self-contained so it can become its own repository:

1. Create a repo (e.g. `wyeast-climbers`) and copy this folder's contents to its root.
2. In the repo, go to **Settings → Pages → Source: GitHub Actions**. `.github/workflows/deploy.yml` builds and deploys on every push to `main`.
3. `public/CNAME` already contains `wyeastclimbers.com`. At your DNS provider add:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<your-github-username>.github.io`
4. Back in **Settings → Pages**, enter the custom domain and tick **Enforce HTTPS** once the certificate is issued.
