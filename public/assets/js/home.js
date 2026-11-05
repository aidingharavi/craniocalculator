(function () {
  const { getJson, esc } = window.CF;

  getJson("/data/calculators.json")
    .then((d) => {
      const live = d.tools.filter((t) => t.status === "live");
      const href = (t) => (t.kind === "model" ? `/calculators/model?id=${encodeURIComponent(t.id)}` : t.href);
      document.getElementById("home-live").innerHTML = live
        .slice(0, 5)
        .map((t) => `<li><a class="row" href="${esc(href(t))}"><span class="row-title">${esc(t.name)}</span></a></li>`)
        .join("");
    })
    .catch(() => {
      document.getElementById("home-live").innerHTML = '<li class="empty">The calculator list couldn\'t load.</li>';
    });

  getJson("/data/digest/latest.json")
    .then((d) => {
      if (!d.items || !d.items.length) throw new Error("empty");
      document.getElementById("home-digest").innerHTML = d.items
        .slice(0, 4)
        .map((it) => window.CFDigest.paper(it, { short: true }))
        .join("");
    })
    .catch(() => {
      document.getElementById("home-digest").innerHTML =
        '<p class="empty">The first issue is published on Monday. <a href="/research">Sign up for the email</a> or follow the <a href="/research.xml">RSS feed</a>.</p>';
    });

  getJson("/data/meetings.json")
    .then((data) => {
      const { dated } = window.CFMeetings.upcoming(data);
      document.getElementById("home-meetings").innerHTML = dated.length
        ? `<ul class="meetings">${dated.slice(0, 4).map(window.CFMeetings.item).join("")}</ul>`
        : '<p class="empty">No dated meetings listed yet.</p>';
    })
    .catch(() => {
      document.getElementById("home-meetings").innerHTML = '<p class="empty">Meeting dates are unavailable right now.</p>';
    });
})();
