// Calculator hub, model cards, and the built-in logistic regression engine.
(function () {
  const { getJson, esc, fmtDate } = window.CF;

  const BADGE = {
    live: '<span class="badge live">Live</span>',
    "in-development": '<span class="badge dev">In Development</span>',
    planned: '<span class="badge">Planned</span>',
  };
  const badge = (t) => BADGE[t.status] || BADGE.planned;
  const hrefFor = (t) => (t.kind === "model" ? `/calculators/model?id=${encodeURIComponent(t.id)}` : t.href);

  // Groups with "showSummary": false list names only.
  const row = (t, g) =>
    `<li><a class="row" href="${esc(hrefFor(t))}"><span class="row-title">${esc(t.name)}</span>${
      g.showSummary === false ? "" : `<span class="row-desc">${esc(t.summary)}</span>`
    }<span class="row-meta">${badge(t)}</span></a></li>`;

  /* ---------- Hub ---------- */
  async function hub(root) {
    try {
      const d = await getJson("/data/calculators.json");
      root.innerHTML = d.groups
        .map((g) => {
          const tools = d.tools.filter((t) => t.group === g.id);
          return `<section class="calc-group" id="${esc(g.id)}">
            <h2>${esc(g.name)}</h2>
            ${g.intro ? `<p class="muted">${esc(g.intro)}</p>` : ""}
            ${
              tools.length
                ? `<ul class="index${g.showSummary === false ? " names-only" : ""}">${tools.map((t) => row(t, g)).join("")}</ul>`
                : `<p class="empty" style="border-top:1px solid var(--rule)">${esc(g.empty || "Coming soon.")}</p>`
            }
            ${d.nsqipDisclaimer && tools.some((t) => t.dataSource === "nsqip") ? `<p class="disclaimer">${esc(d.nsqipDisclaimer)}</p>` : ""}
          </section>`;
        })
        .join("");
    } catch {
      root.innerHTML = '<p class="empty">The calculator list couldn\'t load. Refresh to try again.</p>';
    }
  }

  /* ---------- Logistic engine ---------- */
  // engine: { type: "logistic", intercept, inputs: [...], baselineRisk?, bands? }
  // input types: number (coef per unit, optional center), binary (coef if checked), select (options[].coef)
  function linearPredictor(engine, values) {
    let lp = Number(engine.intercept) || 0;
    for (const inp of engine.inputs) {
      const v = values[inp.id];
      if (inp.type === "number") {
        if (v === null || v === undefined || Number.isNaN(v)) return null;
        lp += (Number(inp.coef) || 0) * (v - (Number(inp.center) || 0));
      } else if (inp.type === "binary") {
        if (v) lp += Number(inp.coef) || 0;
      } else if (inp.type === "select") {
        const opt = inp.options[v];
        if (!opt) return null;
        lp += Number(opt.coef) || 0;
      }
    }
    return lp;
  }
  const logistic = (lp) => 1 / (1 + Math.exp(-lp));

  function engineForm(t) {
    const e = t.engine;
    const field = (inp) => {
      const id = `in-${esc(inp.id)}`;
      if (inp.type === "number") {
        return `<div class="field"><label for="${id}">${esc(inp.label)}</label>
          <div class="unit-input"><input type="number" id="${id}" data-input="${esc(inp.id)}" inputmode="decimal"
            ${inp.min !== undefined ? `min="${esc(inp.min)}"` : ""} ${inp.max !== undefined ? `max="${esc(inp.max)}"` : ""}
            step="${esc(inp.step ?? "any")}" ${inp.default !== undefined ? `value="${esc(inp.default)}"` : ""}>
            ${inp.unit ? `<span>${esc(inp.unit)}</span>` : ""}</div>
          ${inp.hint ? `<p class="hint">${esc(inp.hint)}</p>` : ""}</div>`;
      }
      if (inp.type === "binary") {
        return `<div class="field"><label class="check-input"><input type="checkbox" data-input="${esc(inp.id)}"> ${esc(inp.label)}</label>
          ${inp.hint ? `<p class="hint">${esc(inp.hint)}</p>` : ""}</div>`;
      }
      return `<div class="field"><label for="${id}">${esc(inp.label)}</label>
        <select id="${id}" data-input="${esc(inp.id)}">${inp.options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}</select>
        ${inp.hint ? `<p class="hint">${esc(inp.hint)}</p>` : ""}</div>`;
    };
    return `<div class="calc" id="engine-calc" style="margin-top:28px">
      <form class="calc-panel" novalidate>${e.inputs.map(field).join("")}</form>
      <div aria-live="polite"><div class="readout" id="engine-out"></div></div>
    </div>`;
  }

  function bindEngine(t, root) {
    const e = t.engine;
    const out = root.querySelector("#engine-out");
    const read = () => {
      const values = {};
      root.querySelectorAll("[data-input]").forEach((el) => {
        const inp = e.inputs.find((i) => i.id === el.dataset.input);
        if (inp.type === "number") values[inp.id] = el.value === "" ? null : parseFloat(el.value);
        else if (inp.type === "binary") values[inp.id] = el.checked;
        else values[inp.id] = Number(el.value);
      });
      return values;
    };
    const update = () => {
      const lp = linearPredictor(e, read());
      if (lp === null) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Complete every field</div>`;
        return;
      }
      const p = logistic(lp);
      const band = (e.bands || []).find((b) => p <= b.max);
      const pct = p * 100;
      out.innerHTML = `
        <div class="value">${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}<small>%</small></div>
        <div class="grade">${esc(t.outcomeLabel || "Predicted probability")}${band ? `: ${esc(band.label)}` : ""}</div>
        ${e.baselineRisk !== undefined ? `<div class="sub">Average in the development cohort: ${(e.baselineRisk * 100).toFixed(1)}%</div>` : ""}`;
    };
    root.querySelector("#engine-calc").addEventListener("input", update);
    root.querySelector("#engine-calc").addEventListener("change", update);
    update();
  }

  function coefficientTable(e) {
    const rows = [["Intercept", e.intercept]];
    for (const inp of e.inputs) {
      if (inp.type === "number") rows.push([`${inp.label}${inp.unit ? ` (per ${inp.unit.replace(/s$/, "")}${inp.center ? `, centered at ${inp.center}` : ""})` : ""}`, inp.coef]);
      else if (inp.type === "binary") rows.push([inp.label, inp.coef]);
      else inp.options.forEach((o) => rows.push([`${inp.label}: ${o.label}`, o.coef]));
    }
    const fmt = (v) => (Number(v) || 0).toFixed(3);
    return `<table class="metrics coef-table"><thead><tr><th>Term</th><th>Coefficient</th><th>Odds ratio</th></tr></thead><tbody>${rows
      .map(([k, v], i) => `<tr><td>${esc(k)}</td><td>${fmt(v)}</td><td>${i === 0 ? "—" : Math.exp(Number(v) || 0).toFixed(2)}</td></tr>`)
      .join("")}</tbody></table>
      <p class="hint">Probability = 1 ÷ (1 + e<sup>−LP</sup>), where LP is the intercept plus the sum of the coefficients that apply.</p>`;
  }

  /* ---------- Model card ---------- */
  async function modelCard(root) {
    const id = new URLSearchParams(location.search).get("id");
    let t, d;
    try {
      d = await getJson("/data/calculators.json");
      t = d.tools.find((x) => x.id === id && x.kind === "model");
    } catch {}
    if (!t) {
      root.innerHTML = `<h1>Model Not Found</h1><p>There's no model with that name. <a href="/calculators/">See All Calculators</a>.</p>`;
      return;
    }
    document.title = `${t.name} | CranioCalc`;
    const group = d.groups.find((g) => g.id === t.group) || {};
    const live = t.status === "live";
    const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    const metrics =
      t.validation && t.validation.length
        ? `<table class="metrics"><thead><tr><th>Cohort</th><th>n</th><th>AUC (95% CI)</th><th>Calibration slope</th><th>Brier</th></tr></thead><tbody>${t.validation
            .map((v) => `<tr><td>${esc(v.cohort)}</td><td>${esc(v.n)}</td><td>${esc(v.auc)}</td><td>${esc(v.calibrationSlope || "—")}</td><td>${esc(v.brier || "—")}</td></tr>`)
            .join("")}</tbody></table>`
        : "";
    const fields = [
      ["Intended use", esc(t.intendedUse)],
      ["Outcome predicted", esc(t.outcome)],
      ["Inputs", list(t.inputs)],
      ["Development data", esc(t.development)],
      ["Validation", metrics],
      ["Model", live && t.engine ? coefficientTable(t.engine) : ""],
      ["Limitations", list(t.limitations)],
      ["How to cite", esc(t.citation)],
      ["Code", t.code ? `<a href="${esc(t.code)}" target="_blank" rel="noopener">${esc(t.code)}</a>` : ""],
      ["Version", [t.version, t.updated && `updated ${fmtDate(t.updated)}`].filter(Boolean).map(esc).join(", ")],
    ].filter(([, v]) => v);

    root.innerHTML = `
      <p class="small"><a href="/calculators/">Calculators</a>${group.name ? ` / ${esc(group.name)}` : ""}</p>
      <h1>${esc(t.name)} ${badge(t)}</h1>
      <p class="lede">${esc(t.summary)}</p>
      ${
        !live
          ? `<div class="notice warn measure" style="margin:24px 0"><p>This model is ${t.status === "planned" ? "planned" : "still being developed and validated"}. Its calculator and full model card will be published here once validation is complete.${
              t.validationOpen ? ` Centers interested in external validation can <a href="/collaboration?type=validation&amp;model=${encodeURIComponent(t.id)}">request to take part</a>.` : ""
            }</p></div>`
          : ""
      }
      ${live && t.engine ? engineForm(t) : ""}
      ${live && !t.engine && t.embedUrl ? `<iframe class="embed" src="${esc(t.embedUrl)}" title="${esc(t.name)} calculator" loading="lazy"></iframe>` : ""}
      ${fields.length ? `<h2 style="margin-top:48px">Model Card</h2><dl class="card-grid">${fields.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
      ${t.dataSource === "nsqip" && d.nsqipDisclaimer ? `<p class="disclaimer small muted measure" style="margin-top:24px">${esc(d.nsqipDisclaimer)}</p>` : ""}
      <p class="notice measure" style="margin-top:24px">For research and education. Not an FDA-cleared device. Predictions describe populations similar to the development cohort and should not be the sole basis for any clinical decision.</p>`;

    if (live && t.engine) bindEngine(t, root);
  }

  const hubRoot = document.getElementById("calc-groups");
  if (hubRoot) hub(hubRoot);
  const cardRoot = document.getElementById("model-card");
  if (cardRoot) modelCard(cardRoot);

  window.CFModel = { linearPredictor, logistic }; // exposed for testing
})();
