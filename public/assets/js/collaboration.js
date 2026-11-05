(function () {
  const { getJson, esc } = window.CF;
  const params = new URLSearchParams(location.search);
  const listEl = document.getElementById("open-models");
  const modelSelect = document.getElementById("c-model");
  const typeSelect = document.getElementById("c-type");
  const msg = document.getElementById("c-msg");
  const msgLabel = document.getElementById("c-msg-label");

  const PROMPTS = {
    validation: ["Anything else we should know", "Data available, variables you collect routinely, timeline, questions"],
    calculator: ["Which calculator?", "The published model (title, PMID, or DOI) or the clinical question you'd like a calculator for"],
    research: ["Your idea", "Question, data source, and what you'd bring to the project"],
    other: ["Your message", ""],
  };

  function syncType() {
    const t = typeSelect.value;
    document.querySelectorAll("[data-show]").forEach((el) => (el.hidden = el.dataset.show !== t));
    msgLabel.textContent = PROMPTS[t][0];
    msg.placeholder = PROMPTS[t][1];
  }
  if (PROMPTS[params.get("type")]) typeSelect.value = params.get("type");
  typeSelect.addEventListener("change", syncType);
  syncType();
  if (params.get("type")) document.getElementById("contact").scrollIntoView();

  getJson("/data/calculators.json")
    .then((d) => {
      const open = d.tools.filter((t) => t.kind === "model" && t.validationOpen);
      listEl.innerHTML = open.length
        ? open
            .map(
              (t) =>
                `<li><a class="row" href="/calculators/model?id=${encodeURIComponent(t.id)}"><span class="row-title">${esc(t.name)}</span><span class="row-desc">${esc(t.summary)}</span></a></li>`
            )
            .join("")
        : '<li class="empty">No models are open for validation right now.</li>';
      modelSelect.innerHTML =
        open.map((t) => `<option value="${esc(t.name)}"${t.id === params.get("model") ? " selected" : ""}>${esc(t.name)}</option>`).join("") +
        '<option value="Not sure yet">Not sure yet</option>';
    })
    .catch(() => {
      listEl.innerHTML = '<li class="empty">The model list couldn\'t load.</li>';
      modelSelect.innerHTML = '<option value="Not sure yet">Not sure yet</option>';
    });

  const form = document.getElementById("collab-form");
  const status = document.getElementById("c-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data.type !== "validation") {
      delete data.model;
      delete data.cohortSize;
      delete data.irb;
    }
    const missing = [];
    if (!data.name.trim()) missing.push("your name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) missing.push("a valid email");
    if (!data.institution.trim()) missing.push("your institution");
    if (data.type !== "validation" && !data.message.trim()) missing.push("a message");
    if (missing.length) {
      status.innerHTML = `<p class="notice error">Add ${missing.join(", ")}.</p>`;
      return;
    }
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const res = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Your message couldn't be sent.");
      const type = typeSelect.value;
      form.reset();
      typeSelect.value = type;
      syncType();
      status.innerHTML = '<p class="notice ok">Message sent. We\'ll reply by email.</p>';
    } catch (err) {
      status.innerHTML = `<p class="notice error">${esc(err.message)} You can also email <a href="mailto:hello@craniocalc.com">hello@craniocalc.com</a>.</p>`;
    } finally {
      btn.disabled = false;
    }
  });
})();
