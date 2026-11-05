// Meeting list rendering for the research page.
(function () {
  function upcoming(data, today = new Date()) {
    const t = today.toISOString().slice(0, 10);
    // Only meetings with confirmed dates are listed.
    const dated = data.meetings
      .filter((m) => m.confirmed && m.start && (m.end || m.start) >= t)
      .sort((a, b) => a.start.localeCompare(b.start));
    return { dated };
  }

  function range(m) {
    const s = new Date(m.start + "T12:00:00");
    const e = new Date((m.end || m.start) + "T12:00:00");
    const mo = (d) => d.toLocaleDateString("en-US", { month: "short" });
    if (m.start === m.end || !m.end) return `${mo(s)} ${s.getDate()}`;
    if (s.getMonth() === e.getMonth()) return `${mo(s)} ${s.getDate()}–${e.getDate()}`;
    return `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}`;
  }

  function item(m) {
    const { esc } = window.CF;
    const when = `${range(m)}<small>${new Date(m.start + "T12:00:00").getFullYear()}</small>`;
    return `<li><div class="when">${when}</div><div class="what"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a><div class="where">${esc(m.location)}${m.focus ? `. ${esc(m.focus)}` : ""}</div></div></li>`;
  }

  window.CFMeetings = { upcoming, item };
})();
