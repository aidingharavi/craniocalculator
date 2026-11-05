#!/usr/bin/env node
// Builds the weekly "New in craniofacial" digest.
// Runs in GitHub Actions every Monday (see .github/workflows/digest.yml), or locally:
//   ANTHROPIC_API_KEY=... NCBI_API_KEY=... NCBI_EMAIL=... node scripts/digest.mjs
// Writes public/data/digest/{latest,index,YYYY-MM-DD}.json and public/research.xml.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { esearch, efetch } from "../functions/_lib/pubmed.js";
import { askClaude, extractJson, DEFAULT_FAST_MODEL } from "../functions/_lib/claude.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "data", "digest");
const SITE = process.env.SITE_URL || "https://craniocalc.com";
const DAYS = Number(process.env.DIGEST_DAYS || 7);
const MAX_PICKS = Number(process.env.DIGEST_PICKS || 12);
const env = process.env;

export const CATEGORIES = [
  "Craniosynostosis and cranial vault",
  "Cleft lip and palate",
  "Speech and velopharyngeal function",
  "Ear and microtia",
  "Facial skeleton, trauma, and orthognathic surgery",
  "Facial nerve and reanimation",
  "Cranioplasty and reconstruction",
  "Syndromes and genetics",
  "Airway and Robin sequence",
  "Other craniofacial",
];

const TOPIC = [
  "craniosynostosis[tiab]", "craniosynostoses[mh]", "plagiocephaly[tiab]",
  '"cleft lip"[tiab]', '"cleft palate"[tiab]', "cleft lip[mh]", "cleft palate[mh]",
  "velopharyngeal[tiab]", "microtia[tiab]", '"hemifacial microsomia"[tiab]',
  '"Pierre Robin"[tiab]', '"Robin sequence"[tiab]', "craniofacial[tiab]",
  "craniomaxillofacial[tiab]", "orthognathic[tiab]", "cranioplasty[tiab]",
  '"facial reanimation"[tiab]', '"facial paralysis"[tiab]', "distraction osteogenesis[mh]",
].join(" OR ");
const TERM = `(${TOPIC}) AND hasabstract[text] AND english[lang]`;

const SELECT_SYSTEM = `You are the editor of a weekly literature digest for craniofacial, cleft, and pediatric plastic surgeons and researchers.
From the list of new PubMed records, choose the ${MAX_PICKS} that matter most to this audience. Favor randomized trials, large or multicenter cohorts, systematic reviews and meta-analyses, novel techniques with outcome data, and guideline or consensus statements. Avoid duplicates, single case reports unless truly novel, and papers only loosely related to craniofacial care.
Assign each pick exactly one category from this list: ${CATEGORIES.join("; ")}.
Reply with JSON only: {"picks":[{"pmid":"...","category":"..."}]}`;

const SUMMARY_SYSTEM = `You write concise, neutral summaries for a weekly craniofacial surgery literature digest.
For each abstract, write:
- "design": the study design and size in a few words, e.g. "Retrospective cohort, 412 patients" or "Systematic review, 18 studies". Use only what the abstract states.
- "takeaway": one or two plain sentences, at most 45 words, stating the main finding. Use only information in the abstract. No hype, no recommendations beyond what the authors conclude.
Also write "intro": one or two sentences characterizing this week's selection as a whole, without naming specific authors.
Reply with JSON only: {"intro":"...","items":[{"pmid":"...","design":"...","takeaway":"..."}]}`;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function shortAuthors(a) {
  if (!a.authors.length) return "";
  return a.nAuthors > 1 ? `${a.authors[0]} et al.` : a.authors[0];
}

function fallbackTakeaway(a) {
  const src = a.conclusion || a.abstract;
  const sentences = src.match(/[^.!?]+[.!?]+/g) || [src];
  const text = sentences.slice(0, 2).join(" ").trim();
  return text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, "") + "…" : text;
}

async function main() {
  const now = new Date();
  const from = new Date(now.getTime() - DAYS * 864e5);
  console.log(`Searching PubMed for craniofacial records added in the last ${DAYS} days…`);

  const search = await esearch(TERM, env, { retmax: 400, sort: "pub_date", reldate: DAYS, datetype: "edat" });
  console.log(`Found ${search.count} records; fetching ${search.ids.length}.`);
  const articles = (await efetch(search.ids, env)).filter(
    (a) => a.abstract && !a.pubTypes.some((t) => /erratum|retraction|comment|editorial/i.test(t))
  );
  const byPmid = new Map(articles.map((a) => [a.pmid, a]));

  let picks = [];
  let intro = "";
  let summaries = new Map();
  let generatedBy = "rules";

  if (env.ANTHROPIC_API_KEY && articles.length) {
    try {
      const listing = articles
        .map((a) => `${a.pmid} | ${a.journal} | ${a.pubTypes.filter((t) => t !== "Journal Article").join(", ") || "Article"} | ${a.title}`)
        .join("\n");
      const sel = extractJson(
        await askClaude(env, {
          system: SELECT_SYSTEM,
          prompt: `New records (${articles.length}):\n${listing}`,
          model: env.CLAUDE_FAST_MODEL || DEFAULT_FAST_MODEL,
          maxTokens: 1500,
        })
      );
      picks = (sel.picks || [])
        .filter((p) => byPmid.has(String(p.pmid)))
        .map((p) => ({ pmid: String(p.pmid), category: CATEGORIES.includes(p.category) ? p.category : "Other craniofacial" }))
        .filter((p, i, arr) => arr.findIndex((q) => q.pmid === p.pmid) === i)
        .slice(0, MAX_PICKS);

      const evidence = picks
        .map((p) => {
          const a = byPmid.get(p.pmid);
          return `PMID: ${a.pmid}\nTitle: ${a.title}\nType: ${a.pubTypes.join(", ")}\nAbstract: ${a.abstract.slice(0, 3000)}`;
        })
        .join("\n\n---\n\n");
      const sum = extractJson(
        await askClaude(env, { system: SUMMARY_SYSTEM, prompt: evidence, maxTokens: 3000 })
      );
      intro = typeof sum.intro === "string" ? sum.intro.trim() : "";
      for (const it of sum.items || []) {
        if (byPmid.has(String(it.pmid))) summaries.set(String(it.pmid), it);
      }
      generatedBy = "claude";
    } catch (e) {
      console.warn("Claude step failed; falling back to rule-based digest:", e.message);
      picks = [];
    }
  }

  if (!picks.length) {
    // Rule-based fallback: prefer reviews and trials, then most recent.
    const score = (a) =>
      (a.pubTypes.some((t) => /randomized|meta-analysis|systematic review/i.test(t)) ? 2 : 0) +
      (a.pubTypes.some((t) => /multicenter|guideline|consensus/i.test(t)) ? 1 : 0);
    picks = [...articles]
      .sort((x, y) => score(y) - score(x))
      .slice(0, MAX_PICKS)
      .map((a) => ({ pmid: a.pmid, category: "Other craniofacial" }));
    generatedBy = "rules";
  }

  const items = picks.map((p) => {
    const a = byPmid.get(p.pmid);
    const s = summaries.get(p.pmid) || {};
    return {
      pmid: a.pmid,
      title: a.title,
      journal: a.journal,
      year: a.year,
      authors: shortAuthors(a),
      doi: a.doi,
      category: p.category,
      design: typeof s.design === "string" ? s.design.slice(0, 120) : "",
      takeaway: typeof s.takeaway === "string" ? s.takeaway.slice(0, 400) : fallbackTakeaway(a),
    };
  });

  const date = isoDate(now);
  const digest = {
    date,
    range: { from: isoDate(from), to: date },
    scanned: search.count,
    intro,
    generatedBy,
    items,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, `${date}.json`), JSON.stringify(digest, null, 2));
  await writeFile(join(OUT, "latest.json"), JSON.stringify(digest, null, 2));

  let index = [];
  try {
    index = JSON.parse(await readFile(join(OUT, "index.json"), "utf8"));
  } catch {}
  index = [{ date, count: items.length, scanned: search.count }, ...index.filter((d) => d.date !== date)].slice(0, 104);
  await writeFile(join(OUT, "index.json"), JSON.stringify(index, null, 2));

  await writeFile(join(ROOT, "public", "research.xml"), rss(digest));
  console.log(`Wrote digest for ${date} with ${items.length} papers (${generatedBy}).`);
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rss(d) {
  const pub = new Date(`${d.date}T12:00:00Z`).toUTCString();
  const items = d.items
    .map(
      (it) => `    <item>
      <title>${esc(it.title)}</title>
      <link>https://pubmed.ncbi.nlm.nih.gov/${it.pmid}/</link>
      <guid isPermaLink="false">pmid-${it.pmid}-${d.date}</guid>
      <category>${esc(it.category)}</category>
      <pubDate>${pub}</pubDate>
      <description>${esc(`${it.design ? it.design + ". " : ""}${it.takeaway} (${it.authors} ${it.journal}${it.year ? ", " + it.year : ""})`)}</description>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>New craniofacial research | craniocalc</title>
    <link>${SITE}/research</link>
    <description>A weekly selection of new craniofacial, cleft, and pediatric plastic surgery papers from PubMed.</description>
    <language>en</language>
    <lastBuildDate>${pub}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
