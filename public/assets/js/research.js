(function () {
  const { getJson, esc, fmtDate } = window.CF;
  const root = document.getElementById("digest");
  const issue = document.getElementById("issue");

  function render(d) {
    if (!d || !d.items || !d.items.length) {
      root.innerHTML = `<div class="empty"><p>The first issue is published on Monday morning. Subscribe to get it by email.</p></div>`;
      return;
    }
    const groups = new Map();
    for (const it of d.items) {
      if (!groups.has(it.category)) groups.set(it.category, []);
      groups.get(it.category).push(it);
    }
    root.innerHTML = `
      <p class="muted">Week of ${fmtDate(d.range.from, { month: "long", day: "numeric" })} to ${fmtDate(d.range.to, { month: "long", day: "numeric", year: "numeric" })}. ${d.items.length} papers chosen from ${Number(d.scanned).toLocaleString()} new records.</p>
      ${d.intro ? `<p class="prose measure">${esc(d.intro)}</p>` : ""}
      ${[...groups]
        .map(([cat, items]) => `<section class="digest-group"><h2>${esc(cat)}</h2>${items.map((it) => window.CFDigest.paper(it)).join("")}</section>`)
        .join("")}`;
  }

  async function load(date) {
    root.innerHTML = '<p class="empty">Loading…</p>';
    try {
      render(await getJson(date ? `/data/digest/${date}.json` : "/data/digest/latest.json"));
    } catch {
      render(null);
    }
  }

  getJson("/data/digest/index.json")
    .then((idx) => {
      if (!idx.length) {
        issue.hidden = true;
        return;
      }
      issue.innerHTML = idx
        .map((d, i) => `<option value="${esc(d.date)}">${i === 0 ? "Latest: " : ""}${fmtDate(d.date, { month: "long", day: "numeric", year: "numeric" })}</option>`)
        .join("");
    })
    .catch(() => (issue.hidden = true));
  issue.addEventListener("change", () => load(issue.selectedIndex === 0 ? null : issue.value));
  load(null);

  // Meetings
  getJson("/data/meetings.json")
    .then((data) => {
      const { dated } = window.CFMeetings.upcoming(data);
      document.getElementById("meetings-list").innerHTML = dated.length
        ? `<ul class="meetings">${dated.map(window.CFMeetings.item).join("")}</ul>`
        : '<p class="empty">No confirmed meeting dates right now.</p>';
      document.getElementById("meetings-note").textContent = `Dates last checked ${fmtDate(data.lastChecked, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}. Confirm on the society site before booking travel.`;
    })
    .catch(() => {
      document.getElementById("meetings-list").innerHTML = '<p class="empty">Meeting dates couldn\'t load.</p>';
    });

  // Email sign-up
  const form = document.getElementById("subscribe-form");
  const status = document.getElementById("sub-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      status.textContent = "Enter a valid email address.";
      form.email.focus();
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website: form.website.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-up failed. Try again in a minute.");
      status.textContent = "Subscribed. The next issue arrives Monday.";
      form.reset();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
})();
