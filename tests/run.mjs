// Offline tests for the API functions and digest script, using mocked network calls.
// Run: node tests/run.mjs
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n${e.stack}`);
    process.exitCode = 1;
  }
};

// ---------- fixtures ----------
const article = (pmid, title, abs, opts = {}) => `<PubmedArticle><MedlineCitation Status="MEDLINE" Owner="NLM"><PMID Version="1">${pmid}</PMID><Article PubModel="Print-Electronic"><Journal><JournalIssue CitedMedium="Internet"><PubDate><Year>${opts.year || 2024}</Year><Month>Mar</Month></PubDate></JournalIssue><Title>The Cleft Palate-Craniofacial Journal</Title><ISOAbbreviation>Cleft Palate Craniofac J</ISOAbbreviation></Journal><ArticleTitle>${title}</ArticleTitle><Abstract>${abs}</Abstract><AuthorList CompleteYN="Y"><Author ValidYN="Y"><LastName>Nguyen</LastName><ForeName>An</ForeName><Initials>A</Initials></Author><Author ValidYN="Y"><LastName>O&apos;Brien</LastName><Initials>K</Initials></Author><Author ValidYN="Y"><LastName>Smith</LastName><Initials>J</Initials></Author><Author ValidYN="Y"><LastName>Lee</LastName><Initials>M</Initials></Author></AuthorList><PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType>${opts.type ? `<PublicationType UI="x">${opts.type}</PublicationType>` : ""}</PublicationTypeList></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">10.1177/${pmid}</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`;

const XML = `<?xml version="1.0" ?><!DOCTYPE PubmedArticleSet><PubmedArticleSet>
${article("38000001", "Speech outcomes after palatoplasty before 12 months &amp; after", '<AbstractText Label="BACKGROUND">Timing matters.</AbstractText><AbstractText Label="RESULTS">Among 412 children, VPI occurred in 12% vs 21% (p&lt;0.01).</AbstractText><AbstractText Label="CONCLUSIONS">Earlier repair was associated with less VPI.</AbstractText>', { type: "Multicenter Study" })}
${article("38000002", "A <i>systematic</i> review of palatoplasty timing", "<AbstractText>Eighteen studies were included. Findings were inconsistent.</AbstractText>", { type: "Systematic Review", year: 2023 })}
${article("38000003", "No abstract here", "")}
</PubmedArticleSet>`;

function mockFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const [match, fn] of handlers) if (u.includes(match)) return fn(u, init);
    throw new Error(`Unmocked fetch: ${u}`);
  };
  return calls;
}
const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const claudeRes = (text) => jsonRes({ content: [{ type: "text", text }] });

class MemKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, v); }
  async list({ prefix }) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; }
}
const ctx = (request, env = {}) => ({ request, env, waitUntil: () => {} });
const post = (path, body) =>
  new Request(`https://craniocalc.com${path}`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body) });

// ---------- tests ----------
const { parseArticles, citation } = await import("../functions/_lib/pubmed.js");
const collaborate = await import("../functions/api/collaborate.js");
const subscribe = await import("../functions/api/subscribe.js");
const exportFn = await import("../functions/api/admin/export.js");

console.log("pubmed parser");
await test("parses titles, abstracts, labels, entities, authors", () => {
  const a = parseArticles(XML);
  assert.equal(a.length, 3);
  assert.equal(a[0].pmid, "38000001");
  assert.equal(a[0].title, "Speech outcomes after palatoplasty before 12 months & after");
  assert.match(a[0].abstract, /^BACKGROUND: Timing matters\. RESULTS: Among 412 children, VPI occurred in 12% vs 21% \(p<0\.01\)\./);
  assert.equal(a[0].conclusion, "Earlier repair was associated with less VPI.");
  assert.deepEqual(a[0].authors, ["Nguyen A", "O'Brien K", "Smith J"]);
  assert.equal(a[0].nAuthors, 4);
  assert.equal(a[0].journal, "Cleft Palate Craniofac J");
  assert.equal(a[0].doi, "10.1177/38000001");
  assert.equal(a[1].title, "A systematic review of palatoplasty timing");
  assert.equal(a[2].abstract, "");
  assert.equal(citation(a[0]), "Nguyen A, O'Brien K, Smith J, et al. Cleft Palate Craniofac J. 2024.");
});

console.log("forms");
await test("collaboration message stored; honeypot ignored; validation fields only kept for validation", async () => {
  mockFetch([]);
  const kv = new MemKV();
  const good = { type: "validation", name: "Dr Test", email: "t@hospital.org", institution: "Example Hospital", model: "CranioSTRIP", role: "Attending surgeon" };
  let r = await collaborate.onRequestPost(ctx(post("/api/collaborate", good), { SUBMISSIONS: kv }));
  assert.equal(r.status, 200);
  assert.equal(kv.m.size, 1);
  assert.match([...kv.m.keys()][0], /^collaboration:/);
  r = await collaborate.onRequestPost(ctx(post("/api/collaborate", { ...good, website: "spam" }), { SUBMISSIONS: kv }));
  assert.equal(kv.m.size, 1);
  r = await collaborate.onRequestPost(ctx(post("/api/collaborate", { ...good, email: "nope" }), { SUBMISSIONS: kv }));
  assert.equal(r.status, 400);
  // A calculator suggestion needs a message and drops validation-only fields.
  r = await collaborate.onRequestPost(ctx(post("/api/collaborate", { ...good, type: "calculator" }), { SUBMISSIONS: kv }));
  assert.equal(r.status, 400);
  r = await collaborate.onRequestPost(ctx(post("/api/collaborate", { ...good, type: "calculator", message: "Add the Whitaker classification" }), { SUBMISSIONS: kv }));
  assert.equal(r.status, 200);
  const saved = [...kv.m.values()].map((v) => JSON.parse(v)).find((e) => e.type === "calculator");
  assert.equal(saved.model, "");
});
await test("subscribe stores lowercase email; export requires token", async () => {
  const kv = new MemKV();
  let r = await subscribe.onRequestPost(ctx(post("/api/subscribe", { email: "Reader@Example.org" }), { SUBMISSIONS: kv }));
  assert.equal(r.status, 200);
  assert.ok(kv.m.has("subscriber:reader@example.org"));
  const env = { SUBMISSIONS: kv, ADMIN_TOKEN: "secret" };
  r = await exportFn.onRequestGet(ctx(new Request("https://craniocalc.com/api/admin/export?type=subscriber"), env));
  assert.equal(r.status, 401);
  r = await exportFn.onRequestGet(ctx(new Request("https://craniocalc.com/api/admin/export?type=subscriber&format=csv", { headers: { authorization: "Bearer secret" } }), env));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /reader@example\.org/);
});

console.log("digest script");
await test("builds digest JSON, index, and RSS with Claude summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfai-"));
  await cp(join(ROOT, "functions"), join(dir, "functions"), { recursive: true });
  await cp(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  await cp(join(ROOT, "package.json"), join(dir, "package.json"));
  mockFetch([
    ["esearch.fcgi", (u) => {
      assert.equal(new URL(u).searchParams.get("reldate"), "7");
      assert.equal(new URL(u).searchParams.get("tool"), "craniocalc");
      return jsonRes({ esearchresult: { count: "212", idlist: ["38000001", "38000002", "38000003"] } });
    }],
    ["efetch.fcgi", () => new Response(XML)],
    ["api.anthropic.com", (u, init) => {
      const p = JSON.parse(init.body).messages[0].content;
      if (p.startsWith("New records")) return claudeRes('{"picks":[{"pmid":"38000002","category":"Cleft lip and palate"},{"pmid":"38000001","category":"Speech and velopharyngeal function"},{"pmid":"99999999","category":"Other craniofacial"}]}');
      return claudeRes('```json\n{"intro":"A week weighted toward palate timing.","items":[{"pmid":"38000001","design":"Multicenter cohort, 412 children","takeaway":"Earlier repair was associated with less VPI."},{"pmid":"38000002","design":"Systematic review, 18 studies","takeaway":"Evidence on timing was inconsistent."}]}\n```');
    }],
  ]);
  process.env.ANTHROPIC_API_KEY = "k";
  await import(join(dir, "scripts", "digest.mjs"));
  await new Promise((r) => setTimeout(r, 300)); // main() is async at import
  const latest = JSON.parse(await readFile(join(dir, "public/data/digest/latest.json"), "utf8"));
  assert.equal(latest.generatedBy, "claude");
  assert.equal(latest.items.length, 2); // invented PMID dropped
  assert.equal(latest.items[0].pmid, "38000002");
  assert.equal(latest.items[1].design, "Multicenter cohort, 412 children");
  assert.equal(latest.scanned, 212);
  const idx = JSON.parse(await readFile(join(dir, "public/data/digest/index.json"), "utf8"));
  assert.equal(idx.length, 1);
  const rss = await readFile(join(dir, "public/research.xml"), "utf8");
  assert.match(rss, /<item>/);
  assert.match(rss, /pubmed\.ncbi\.nlm\.nih\.gov\/38000001/);
  assert.match(rss, /craniocalc\.com\/research/);
  await rm(dir, { recursive: true, force: true });
  delete process.env.ANTHROPIC_API_KEY;
});

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
