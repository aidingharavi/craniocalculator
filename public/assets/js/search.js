// Header calculator search. Matches calculator names, summaries, and condition
// keywords from /data/calculators.json, with tolerance for small typos.
(function () {
  const box = document.querySelector(".site-search");
  if (!box) return;
  const input = box.querySelector("input");
  const list = box.querySelector("[role=listbox]");
  // Short placeholder where the box is narrow (phones), so it isn't cut off.
  const setPlaceholder = () => (input.placeholder = input.clientWidth && input.clientWidth < 170 ? "Search" : "Search calculators");
  setPlaceholder();
  window.addEventListener("resize", setPlaceholder);

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
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    if (a.slice(i + 1) === b.slice(i)) return true; // deletion from a
    if (a.slice(i) === b.slice(i + 1)) return true; // insertion into a
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }

  let index = null;
  let loading = null;
  function load() {
    if (!loading) {
      loading = fetch("/data/calculators.json")
        .then((r) => r.json())
        .then((d) => {
          const groups = Object.fromEntries(d.groups.map((g) => [g.id, g.name]));
          index = d.tools.map((t) => ({
            t,
            group: groups[t.group] || "",
            href: t.href || `/calculators/model?id=${encodeURIComponent(t.id)}`,
            fields: [
              { w: 6, words: words(t.name) },
              { w: 4, words: words((t.keywords || []).join(" ")) },
              { w: 1.5, words: words(t.summary) },
            ],
            phrase: norm([t.name, ...(t.keywords || [])].join(" | ")),
          }));
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
      for (const f of entry.fields) {
        for (const w of f.words) {
          let s = 0;
          if (w === q) s = 1;
          else if (w.startsWith(q) && q.length >= 2) s = 0.8;
          else if (q.length >= 5 && w.length >= 5 && (nearMatch(q, w) || (w.length > q.length && nearMatch(q, w.slice(0, q.length))))) s = 0.6;
          if (s * f.w > best) best = s * f.w;
        }
      }
      if (!best) return 0; // every word in the query must match something
      total += best;
    }
    if (qPhrase.length >= 3 && entry.phrase.includes(qPhrase)) total += 5;
    if (entry.t.status === "live") total += 0.5;
    return total;
  }

  let results = [];
  let active = -1;

  function render(q) {
    const qWords = words(q);
    if (!qWords.length) return close();
    results = index
      .map((e) => ({ e, s: score(e, qWords, norm(q)) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((r) => r.e);
    active = results.length ? 0 : -1;
    list.innerHTML = results.length
      ? results
          .map(
            (r, i) => `<li role="option" id="ss-opt-${i}" aria-selected="${i === active}">
              <a href="${esc(r.href)}" tabindex="-1">
                <span class="ss-name">${esc(r.t.name)}${r.t.status !== "live" ? ' <span class="ss-tag">In Development</span>' : ""}</span>
                <span class="ss-desc">${esc(r.t.summary)}</span>
                <span class="ss-group">${esc(r.group)}</span>
              </a></li>`
          )
          .join("")
      : `<li class="ss-empty">No calculators match “${esc(q)}”. <a href="/collaboration?type=calculator">Suggest one</a>.</li>`;
    open();
    syncActive();
  }

  function syncActive() {
    list.querySelectorAll("[role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", `ss-opt-${active}`);
      document.getElementById(`ss-opt-${active}`)?.scrollIntoView({ block: "nearest" });
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
      if (r && !list.hidden) location.href = r.href;
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
    if (!box.contains(e.target)) close();
  });
  // "/" focuses the search from anywhere, unless typing in a field.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });
})();
