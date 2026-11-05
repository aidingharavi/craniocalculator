// PubMed (NCBI E-utilities) helpers shared by the literature search
// endpoint and the weekly digest script. No dependencies, works in
// Cloudflare Workers and Node 18+.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function ncbiParams(env = {}) {
  const p = new URLSearchParams({ tool: "craniocalc" });
  if (env.NCBI_EMAIL) p.set("email", env.NCBI_EMAIL);
  if (env.NCBI_API_KEY) p.set("api_key", env.NCBI_API_KEY);
  return p;
}

/**
 * Run a PubMed search. Returns { ids, count, translation }.
 * opts: { retmax, sort, reldate, datetype }
 */
export async function esearch(term, env = {}, opts = {}) {
  const p = ncbiParams(env);
  p.set("db", "pubmed");
  p.set("retmode", "json");
  p.set("term", term);
  p.set("retmax", String(opts.retmax ?? 20));
  p.set("sort", opts.sort ?? "relevance");
  if (opts.reldate) {
    p.set("reldate", String(opts.reldate));
    p.set("datetype", opts.datetype ?? "edat");
  }
  const res = await fetch(`${EUTILS}/esearch.fcgi?${p}`);
  if (!res.ok) throw new Error(`PubMed search failed (HTTP ${res.status})`);
  const data = await res.json();
  const r = data.esearchresult || {};
  if (r.ERROR) throw new Error(`PubMed search error: ${r.ERROR}`);
  return {
    ids: r.idlist || [],
    count: Number(r.count || 0),
    translation: r.querytranslation || "",
  };
}

/** Fetch full records for a list of PMIDs and parse them. */
export async function efetch(ids, env = {}) {
  if (!ids.length) return [];
  const out = [];
  // POST keeps long ID lists out of the URL.
  for (let i = 0; i < ids.length; i += 100) {
    const p = ncbiParams(env);
    p.set("db", "pubmed");
    p.set("retmode", "xml");
    p.set("id", ids.slice(i, i + 100).join(","));
    const res = await fetch(`${EUTILS}/efetch.fcgi`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: p.toString(),
    });
    if (!res.ok) throw new Error(`PubMed fetch failed (HTTP ${res.status})`);
    out.push(...parseArticles(await res.text()));
  }
  // Preserve the requested order (relevance ranking).
  const order = new Map(ids.map((id, i) => [String(id), i]));
  return out.sort((a, b) => (order.get(a.pmid) ?? 1e9) - (order.get(b.pmid) ?? 1e9));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function cleanText(s) {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function first(block, re) {
  const m = block.match(re);
  return m ? m[1] : "";
}

/** Parse efetch XML into plain article objects (regex-based; Workers lack DOMParser). */
export function parseArticles(xml) {
  const articles = [];
  const blocks = xml.split(/<PubmedArticle>/).slice(1);
  for (const raw of blocks) {
    const b = raw.split(/<\/PubmedArticle>/)[0];
    const pmid = first(b, /<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmid) continue;

    const sections = [...b.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((m) => {
      const label = (m[1].match(/Label="([^"]+)"/) || [])[1];
      return { label: label ? cleanText(label) : "", text: cleanText(m[2]) };
    });
    const abstract = sections.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join(" ");
    const conclusion =
      sections.find((s) => /conclusion|interpretation/i.test(s.label))?.text || "";

    const authorBlocks = [...b.matchAll(/<Author[ >][\s\S]*?<\/Author>/g)].map((m) => m[0]);
    const authors = authorBlocks
      .map((a) => {
        const last = cleanText(first(a, /<LastName>([\s\S]*?)<\/LastName>/));
        const init = cleanText(first(a, /<Initials>([\s\S]*?)<\/Initials>/));
        const coll = cleanText(first(a, /<CollectiveName>([\s\S]*?)<\/CollectiveName>/));
        return last ? `${last} ${init}`.trim() : coll;
      })
      .filter(Boolean);

    const pubDate = first(b, /<PubDate>([\s\S]*?)<\/PubDate>/);
    const year =
      first(pubDate, /<Year>(\d{4})<\/Year>/) ||
      first(pubDate, /<MedlineDate>(\d{4})/) ||
      first(b, /<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>/);

    articles.push({
      pmid,
      title: cleanText(first(b, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)) ||
        cleanText(first(b, /<VernacularTitle[^>]*>([\s\S]*?)<\/VernacularTitle>/)),
      abstract,
      conclusion,
      journal:
        cleanText(first(b, /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)) ||
        cleanText(first(b, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)),
      year,
      authors: authors.slice(0, 3),
      nAuthors: authors.length,
      pubTypes: [...b.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)].map((m) =>
        cleanText(m[1])
      ),
      doi: cleanText(first(b, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)),
    });
  }
  return articles;
}

/** Short citation string, e.g. "Smith J, Lee K, et al. Cleft Palate Craniofac J. 2024." */
export function citation(a) {
  const auth = a.authors.length
    ? a.authors.join(", ") + (a.nAuthors > a.authors.length ? ", et al." : ".")
    : "";
  return [auth, a.journal ? `${a.journal}.` : "", a.year ? `${a.year}.` : ""]
    .filter(Boolean)
    .join(" ");
}
