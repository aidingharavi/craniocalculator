# CranioCalc

Calculators for craniofacial surgery, plus a weekly digest of new craniofacial research and a collaboration portal. Domain: **craniocalc.com**.

**Stack:** static HTML/CSS/JS served by a Cloudflare Worker with static assets (`wrangler.toml`), plus a small API in `worker/index.js` for the forms. No framework and no build step on the host. The weekly research digest runs on GitHub Actions.

| Tab | Path | Powered by |
|---|---|---|
| Calculators | `/calculators/` | `public/data/calculators.json`, `assets/js/calc.js`, `assets/js/calculators.js` |
| New craniofacial research | `/research` | `scripts/digest.mjs` (weekly GitHub Action) writes `public/data/digest/`; meetings from `public/data/meetings.json` |
| Collaboration | `/collaboration` | `functions/api/collaborate.js` stores messages in Cloudflare KV |
| About | `/about` | static |

---

## Deploy

The repo is `aidingharavi/craniocalculator`, connected to a Cloudflare **Worker** named `craniocalculator`. Every push to `main` redeploys automatically (Build command `npm run build`, Deploy command `npx wrangler deploy`, both already set). The `name` in `wrangler.toml` must stay the same as the Worker's name.

### Domain (bought at GoDaddy, DNS on Cloudflare)
1. GoDaddy nameservers point to the two Cloudflare nameservers shown under the craniocalc.com site in Cloudflare.
2. When Cloudflare shows craniocalc.com as **Active**: Worker → **Settings → Domains & Routes → Add → Custom domain** → `craniocalc.com`, then again for `www.craniocalc.com`.
3. Email: craniocalc.com → **Email → Email Routing** → forward `hello@craniocalc.com` to your inbox.

### Forms storage (collaboration messages and digest sign-ups)
1. **Storage & Databases → KV → Create namespace**: `RATE_LIMIT`, then `SUBMISSIONS`.
2. Copy each namespace ID into `wrangler.toml` (the commented `[[kv_namespaces]]` blocks) and uncomment them. Push, or send the IDs to Claude to do it.
3. Worker → **Settings → Variables and Secrets**: add `ADMIN_TOKEN` and `RATE_SALT` (any long random strings). Optional: `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM` to get an email for each collaboration message.

Until step 2 is done the forms show "email us instead," and everything else works.

### Weekly research digest
GitHub repo → **Settings → Secrets and variables → Actions** → add `ANTHROPIC_API_KEY` (set a spend limit at console.anthropic.com), `NCBI_API_KEY`, and `NCBI_EMAIL`. Then **Actions → Weekly digest → Run workflow** to publish the first issue. It then runs every Monday, commits the issue, and the push redeploys the site.

---

## Adding your own calculators

All calculators are listed in `public/data/calculators.json`, in two groups: `established` (published formulas and scores, listed by name only) and `predictive` (shown as "Predictive Models": single-center and multicenter models, including NSQIP).

**Regression models (recommended for NSQIP models): built in, no server needed.**
Copy `examples/logistic-model-example.json` into the `tools` list, set `"group": "predictive"` and `"dataSource": "nsqip"` (this adds the NSQIP disclaimer), and replace the made-up numbers with your fitted model:
- `intercept` and one entry per predictor in `inputs`:
  - `"type": "number"`: `coef` is per unit; optional `center` (coefficient applies to value − center), `unit`, `min`, `max`, `default`
  - `"type": "binary"`: `coef` is added when the box is checked
  - `"type": "select"`: each option has its own `coef` (reference level = 0)
- optional `baselineRisk` (cohort event rate) and `bands` (labels by probability)

The page computes 1 / (1 + e^−LP) in the browser, shows the coefficient and odds-ratio table on the model card, and adds the ACS NSQIP disclaimer automatically. Splines and interactions aren't supported yet; ask and they can be added.

**Machine learning models (CranioSTRIP, speech outcomes):** deploy the Shiny app (shinyapps.io or Posit Connect Cloud), then set `"status": "live"` and `"embedUrl"` to the app URL. The page embeds it above the model card.

**Model card fields** (any left empty are hidden): `intendedUse`, `outcome`, `inputs`, `development`, `validation` (list of `{cohort, n, auc, calibrationSlope, brier}`), `limitations`, `citation`, `code`, `version`, `updated`.

**New established calculators** (published formulas) get their own page: copy `src/pages/calculators/cvai.html`, add the logic to `public/assets/js/calc.js`, add an entry in `calculators.json`, and run `python3 build.py`.

## Everyday edits
- **Meeting dates:** `public/data/meetings.json`. Only meetings with `"confirmed": true` and a start date are shown; past meetings disappear automatically.
- **Page text, header, footer:** files in `src/`, then `python3 build.py` (regenerates `public/`). Commit both. (`public/` is committed, so the Cloudflare build doesn't need Python.)
- **Colors and type:** tokens at the top of `public/assets/css/site.css`.
- **Logo:** `public/assets/img/logo.svg` and `public/favicon.svg` (the skull from the CranioSTRIP mark, without the blood drop).
- **Export messages:**
  `curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://craniocalc.com/api/admin/export?type=collaboration&format=csv" -o messages.csv`
  Use `type=subscriber` for digest email sign-ups.

## Emailing the digest
Sign-ups are stored in KV. When the list is worth it, export it and import it into a newsletter service (Buttondown, Beehiiv, Resend Broadcasts). Most can send automatically from the RSS feed at `/research.xml`.

## Costs
Cloudflare Workers (free plan), KV, and Email Routing are free at this scale, and so are GitHub Actions and PubMed. The only usage-based cost is the Claude API for the weekly digest: two calls per week.

## Local development
```bash
cp .dev.vars.example .dev.vars
npx wrangler dev                 # http://localhost:8787
node tests/run.mjs               # offline tests (mocked PubMed and Claude)
node scripts/digest.mjs          # build a digest issue (needs network + keys)
```

## Before going public
- **Mayo IP:** confirm with your mentor and Mayo Clinic Ventures before publishing models built on Mayo data. They're listed as "in development" with no details until you fill them in.
- **NSQIP:** check the exact disclaimer wording and any publication rules in your ACS NSQIP Data Use Agreement. The standard Participant Use File disclaimer is used in `calculators.json` (`groups[nsqip].disclaimer`) and on the Terms page.
- **Regulatory:** keep "research and education" labeling on risk calculators; get advice before presenting any model as a clinical decision tool.
- **About page:** add your full name, photo, and links (`src/pages/about.html`, marked TODO).
- **Commitments on the site** to review: the ICMJE authorship statement on the collaboration page.

## Earlier features
Literature search (PubMed + Claude), a clinical trials finder, and a resources page were part of the first version. They're preserved in the first git commit (`the "Initial craniofacial.ai site" commit in the original project`) if you want any of them back.

## Design notes
Palette: cool lightbox paper (`#f2f4f3`), slate ink (`#16232b`), and gentian violet (`#5b3fa0`), the surgical skin-marker ink, as the single accent. Type: Bricolage Grotesque (interface) and Source Serif 4 (reading text), self-hosted under the SIL Open Font License. The home page illustration is a lateral cephalometric tracing (`public/assets/img/ceph-tracing.png`, used as a CSS mask so it is black in light mode and white in dark mode). The CVAI calculator draws its own live vertex diagram.
