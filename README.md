# craniocalc

Calculators for craniofacial surgery, plus a weekly digest of new craniofacial research and a collaboration portal. Domain: **craniocalc.com**.

**Stack:** static HTML/CSS/JS on Cloudflare Pages, with two small Pages Functions for forms. No framework and no build step on the host. The weekly research digest runs on GitHub Actions.

| Tab | Path | Powered by |
|---|---|---|
| Calculators | `/calculators/` | `public/data/calculators.json`, `assets/js/calc.js`, `assets/js/calculators.js` |
| New craniofacial research | `/research` | `scripts/digest.mjs` (weekly GitHub Action) writes `public/data/digest/`; meetings from `public/data/meetings.json` |
| Collaboration | `/collaboration` | `functions/api/collaborate.js` stores messages in Cloudflare KV |
| About | `/about` | static |

---

## Deploy (about 30 minutes, once)

### 1. Buy the domain
Buy `craniocalc.com`. Cloudflare Registrar is simplest because DNS is set up automatically. With another registrar (Porkbun, Namecheap), change the nameservers to Cloudflare's after you add the site there.

### 2. Put the code on GitHub
Create a free GitHub account and a new **private** repository called `craniocalc`. Upload this folder (GitHub's "Add file → Upload files", or `git push`).

### 3. Create the Cloudflare Pages project
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
Build settings: **Framework preset: None**, **Build command: empty**, **Build output directory: `public`**. Deploy.
You get a `*.pages.dev` URL; the calculators work right away.

### 4. Storage for forms
Dashboard → **Storage & Databases → KV → Create namespace** twice: `RATE_LIMIT` and `SUBMISSIONS`.
Pages project → **Settings → Bindings → Add → KV namespace**, using exactly those variable names.

### 5. Secrets
Pages project → **Settings → Variables and Secrets** (Production):

| Name | Required | What it's for |
|---|---|---|
| `ADMIN_TOKEN` | yes | any long random string; lets you export form submissions |
| `RATE_SALT` | yes | any random string |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`, `NOTIFY_FROM` | optional | resend.com, to get an email whenever someone sends a collaboration message |

Then redeploy (Deployments → ⋯ → Retry deployment).

### 6. Connect the domain
Pages project → **Custom domains → Set up a domain** → `craniocalc.com`, then again for `www.craniocalc.com`.

### 7. Email address
Cloudflare → your domain → **Email → Email Routing** → forward `hello@craniocalc.com` to your inbox (free).

### 8. Turn on the weekly research digest
GitHub repo → **Settings → Secrets and variables → Actions** → add:
- `ANTHROPIC_API_KEY` (console.anthropic.com; set a monthly spend limit there)
- `NCBI_API_KEY` (free, from your NCBI account settings)
- `NCBI_EMAIL` (your contact email)

Then **Actions → Weekly digest → Run workflow** to publish the first issue. After that it runs every Monday morning, commits the issue, and Cloudflare redeploys automatically.

---

## Adding your own calculators

All calculators are listed in `public/data/calculators.json`, in three groups: `established`, `models` (your institutional models), and `nsqip`.

**Regression models (recommended for NSQIP models): built in, no server needed.**
Copy `examples/logistic-model-example.json` into the `tools` list, set `"group": "nsqip"` and `"dataSource": "nsqip"`, and replace the made-up numbers with your fitted model:
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
- **Meeting dates:** `public/data/meetings.json`. Past meetings disappear automatically.
- **Page text, header, footer:** files in `src/`, then `python3 build.py` (regenerates `public/`). Commit both.
- **Colors and type:** tokens at the top of `public/assets/css/site.css`.
- **Logo:** `public/assets/img/logo.svg` and `public/favicon.svg` (the skull from the CranioSTRIP mark, without the blood drop).
- **Export messages:**
  `curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://craniocalc.com/api/admin/export?type=collaboration&format=csv" -o messages.csv`
  Use `type=subscriber` for digest email sign-ups.

## Emailing the digest
Sign-ups are stored in KV. When the list is worth it, export it and import it into a newsletter service (Buttondown, Beehiiv, Resend Broadcasts). Most can send automatically from the RSS feed at `/research.xml`.

## Costs
Cloudflare Pages, KV, and Email Routing are free at this scale, and so are GitHub Actions and PubMed. The only usage-based cost is the Claude API for the weekly digest: two calls per week.

## Local development
```bash
cp .dev.vars.example .dev.vars
npx wrangler pages dev           # http://localhost:8788
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
Literature search (PubMed + Claude), a clinical trials finder, and a resources page were part of the first version. They're preserved in the first git commit (`git show HEAD~1 --stat`) if you want any of them back.

## Design notes
Palette: cool lightbox paper (`#f2f4f3`), slate ink (`#16232b`), and gentian violet (`#5b3fa0`), the surgical skin-marker ink, as the single accent. Type: Bricolage Grotesque (interface) and Source Serif 4 (reading text), self-hosted under the SIL Open Font License. The vertex skull tracing with cranial diagonals is the home page illustration and reappears as the live diagram on the CVAI calculator.
