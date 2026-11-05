// Shared digest item rendering.
(function () {
  function paper(it, opts = {}) {
    const { esc } = window.CF;
    const link = `https://pubmed.ncbi.nlm.nih.gov/${esc(it.pmid)}/`;
    const meta = [it.authors, it.journal, it.year].filter(Boolean).map(esc).join(", ");
    return `<article class="paper">
      <h3><a href="${link}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
      ${opts.short ? "" : `<p class="takeaway">${esc(it.takeaway)}</p>`}
      <div class="meta">${it.design && !opts.short ? `<span class="design">${esc(it.design)}.</span> ` : ""}${meta}</div>
    </article>`;
  }
  window.CFDigest = { paper };
})();
