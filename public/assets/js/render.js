// Safe rendering helpers shared by page scripts.
(function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  }

  // Minimal markdown: **bold**, "- " bullets, paragraphs. Input is escaped first.
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function markdown(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    let list = null;
    let para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      list = null;
    };
    for (const raw of lines) {
      const line = raw.trim();
      const bullet = line.match(/^[-*•]\s+(.*)$/);
      if (!line) {
        flushPara();
        flushList();
      } else if (bullet) {
        flushPara();
        (list = list || []).push(bullet[1]);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
    return out.join("");
  }

  function fmtDate(iso, opts) {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return d.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
  }

  async function getJson(url) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  window.CF = { esc, markdown, fmtDate, getJson };
})();
