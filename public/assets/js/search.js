// Calculator search: the header box and the home page box ([data-calc-search]).
// Matches calculator names, condition and procedure tags, keywords, and summaries
// from /data/calculators.json, tolerates small typos, and shows why each result matched.
(function () {
  const boxes = [...document.querySelectorAll("[data-calc-search]")];
  if (!boxes.length) return;

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const words = (s) => norm(s).split(" ").filter(Boolean);

  // One edit (insert, delete, substitute, or swap) apart, for typo tolerance.
  function nearMatch(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i >= Math.min(a.length, b.length)) return true;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    if (a.slice(i + 1) === b.slice(i)) return true;
    if (a.slice(i) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const wordMatch = (q, w) => {
    if (w === q) return 1;
    if (w.startsWith(q) && q.length >= 2) return 0.8;
    if (q.length >= 5 && w.length >= 5 && (nearMatch(q, w) || (w.length > q.length && nearMatch(q, w.slice(0, q.length))))) return 0.6;
    return 0;
  };

  let index = null;
  let loading = null;
  function load() {
    if (!loading) {
      loading = fetch("/data/calculators.json")
        .then((r) => r.json())
        .then((d) => {
          const groups = Object.fromEntries(d.groups.map((g) => [g.id, g.name]));
          index = d.tools.map((t) => {
            const tags = [
              ...(t.conditions || []).map((x) => ({ kind: "Condition", text: x })),
              ...(t.procedures || []).map((x) => ({ kind: "Procedure", text: x })),
            ].map((g) => ({ ...g, words: words(g.text), norm: norm(g.text) }));
            return {
              t,
              tags,
              group: groups[t.group] || "",
              href: t.href || `/calculators/model?id=${encodeURIComponent(t.id)}`,
              fields: [
                { w: 6, words: words(t.name) },
                { w: 6, words: tags.flatMap((g) => g.words) },
                { w: 4, words: words((t.keywords || []).join(" ")) },
                { w: 1.5, words: words(t.summary) },
              ],
              phrase: norm([t.name, ...tags.map((g) => g.text), ...(t.keywords || [])].join(" | ")),
            };
          });
        })
        .catch(() => {
          loading = null;
          throw new Error("load failed");
        });
    }
    return loading;
  }

  function score(entry, qWords, qPhrase) {
    let total = 0;
    for (const q of qWords) {
      let best = 0;
      for (const f of entry.fields) for (const w of f.words) best = Math.max(best, wordMatch(q, w) * f.w);
      if (!best) return 0; // every word in the query must match something
      total += best;
    }
    if (qPhrase.length >= 3 && entry.phrase.includes(qPhrase)) total += 5;
    if (entry.t.status === "live") total += 0.5;
    return total;
  }

  // The condition or procedure tag that best explains the match, if any.
  function matchedTag(entry, qWords, qPhrase) {
    let best = null, bestScore = 0;
    for (const g of entry.tags) {
      let s = g.norm.includes(qPhrase) ? 10 : 0;
      for (const q of qWords) s += Math.max(0, ...g.words.map((w) => wordMatch(q, w)));
      if (s > bestScore && (s >= 10 || qWords.every((q) => g.words.some((w) => wordMatch(q, w))))) {
        best = g;
        bestScore = s;
      }
    }
    // Don't repeat what the calculator's name already says.
    if (best && qWords.every((q) => words(entry.t.name).some((w) => wordMatch(q, w)))) return null;
    return best;
  }

  boxes.forEach((box, n) => {
    const input = box.querySelector("input");
    const list = box.querySelector("[role=listbox]");
    const limit = Number(box.dataset.limit) || 8;
    const shortPh = box.dataset.shortPlaceholder;
    const longPh = input.placeholder;
    let results = [];
    let active = -1;

    if (shortPh) {
      const setPlaceholder = () => (input.placeholder = input.clientWidth && input.clientWidth < 170 ? shortPh : longPh);
      setPlaceholder();
      window.addEventListener("resize", setPlaceholder);
    }

    function render(q) {
      const qWords = words(q);
      const qPhrase = norm(q);
      if (!qWords.length) return close();
      const ranked = index
        .map((e) => ({ e, s: score(e, qWords, qPhrase) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s);
      results = ranked.slice(0, limit).map((r) => ({ e: r.e, tag: matchedTag(r.e, qWords, qPhrase) }));
      active = results.length ? 0 : -1;
      const more = ranked.length - results.length;
      list.innerHTML = results.length
        ? results
            .map(
              ({ e, tag }, i) => `<li role="option" id="${list.id}-opt-${i}" aria-selected="${i === active}">
              <a href="${esc(e.href)}" tabindex="-1">
                <span class="ss-name">${esc(e.t.name)}${e.t.status !== "live" ? ' <span class="ss-tag">In Development</span>' : ""}</span>
                <span class="ss-desc">${esc(e.t.summary)}</span>
                <span class="ss-group">${tag ? `<span class="ss-why">${tag.kind}: ${esc(tag.text)}</span> · ` : ""}${esc(e.group)}</span>
              </a></li>`
            )
            .join("") + (more > 0 ? `<li class="ss-empty">${more} more. Add a word to narrow the search, or <a href="/calculators/">see all calculators</a>.</li>` : "")
        : `<li class="ss-empty">No calculators match “${esc(q)}”. <a href="/collaboration?type=calculator">Suggest one</a>.</li>`;
      open();
      syncActive();
    }

    function syncActive() {
      list.querySelectorAll("[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      if (active >= 0) {
        input.setAttribute("aria-activedescendant", `${list.id}-opt-${active}`);
        document.getElementById(`${list.id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    }
    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    }
    function update() {
      const q = input.value;
      if (!q.trim()) return close();
      if (index) return render(q);
      load()
        .then(() => input.value === q && render(q))
        .catch(() => {
          list.innerHTML = '<li class="ss-empty">Search is unavailable right now. <a href="/calculators/">See all calculators</a>.</li>';
          open();
        });
    }

    input.addEventListener("focus", () => {
      load().catch(() => {});
      if (input.value.trim()) update();
    });
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.hidden) return update();
        if (!results.length) return;
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
        syncActive();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[active >= 0 ? active : 0];
        if (r && !list.hidden) location.href = r.e.href;
      } else if (e.key === "Escape") {
        if (!list.hidden) close();
        else input.blur();
      }
    });
    list.addEventListener("mousemove", (e) => {
      const li = e.target.closest("[role=option]");
      if (!li) return;
      const i = [...list.querySelectorAll("[role=option]")].indexOf(li);
      if (i !== active) {
        active = i;
        syncActive();
      }
    });
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target) && !e.target.closest("[data-search-chip]")) close();
    });

    // Quick-pick buttons that fill this box (home page).
    document.querySelectorAll(`[data-search-chip][data-for="${box.id}"]`).forEach((chip) =>
      chip.addEventListener("click", () => {
        input.value = chip.dataset.searchChip;
        input.focus();
        update();
      })
    );

    // "/" focuses the first search box from anywhere, unless typing in a field.
    if (n === 0)
      document.addEventListener("keydown", (e) => {
        if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) {
          e.preventDefault();
          input.focus();
        }
      });
  });
})();
