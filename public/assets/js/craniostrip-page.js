// CranioSTRIP calculator page: reads the form, runs both stages in the browser, shows results.
(function () {
  const root = document.getElementById("cs-calc");
  if (!root || !window.CranioSTRIP) return;
  const C = window.CranioSTRIP;
  const out = document.getElementById("cs-out");
  const vol = document.getElementById("cs-vol");
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 1) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Ranges from the original app (approximate bounds of the training data).
  const RANGES = [
    ["cs-age", "Age", 0, 36, "months"],
    ["cs-weight", "Weight", 1, 25, "kg"],
    ["cs-ga", "Gestational age", 24, 40, "weeks"],
    ["cs-hct", "Hematocrit", 15, 60, "%"],
    ["cs-plt", "Platelets", 20, 1000, "×10⁹/L"],
  ];

  let model = null;
  fetch("/data/models/craniostrip.json")
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((m) => {
      model = m;
      update();
    })
    .catch(() => {
      out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">The model couldn't load. Refresh to try again.</div>`;
    });

  function read() {
    const vals = {};
    for (const [id, label, lo, hi, unit] of RANGES) {
      const raw = $(id).value.trim();
      const v = parseFloat(raw.replace(",", "."));
      if (raw === "" || !Number.isFinite(v)) return { error: `Enter ${label.toLowerCase()}.`, muted: true };
      if (v < lo || v > hi) return { error: `${label} must be between ${lo.toLocaleString("en-US")} and ${hi.toLocaleString("en-US")} ${unit}, the range the model was developed on.` };
      vals[id] = v;
    }
    const checked = (name) => new Set([...root.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value));
    return {
      form: {
        age: vals["cs-age"], weight: vals["cs-weight"], ga: vals["cs-ga"], hct: vals["cs-hct"], plt: vals["cs-plt"],
        male: $("cs-sex").value === "1", asa: Number($("cs-asa").value), cardiac: Number($("cs-cardiac").value),
        ivh: Number($("cs-ivh").value), comorbid: checked("comorbid"), support: checked("support"),
        approach: $("cs-approach").value, multipleSutures: $("cs-multi").checked, boneGraft: $("cs-graft").checked,
      },
    };
  }

  function update() {
    if (!model) return;
    const r = read();
    if (r.error) {
      out.innerHTML = `<div class="value">–</div><div class="grade${r.muted ? " muted" : ""}"${r.muted ? "" : ' style="color:var(--danger)"'}>${r.error}</div>`;
      vol.innerHTML = "";
      return;
    }
    const feats = C.features(r.form);
    const p = C.predictRisk(model, feats.risk);
    const t = parseFloat($("cs-threshold").value);
    const elevated = p >= t;
    const pct = p * 100;
    out.innerHTML = `
      <div class="value">${fmt(pct)}<small>%</small></div>
      <div class="grade">${elevated ? "Elevated transfusion risk" : "Lower transfusion risk"}</div>
      <div class="sub">Predicted probability of perioperative transfusion. ${elevated ? "At or above" : "Below"} the ${Math.round(t * 100)}% ${t < 0.5 ? "high-sensitivity" : "balanced"} threshold.</div>`;

    if (elevated || $("cs-always").checked) {
      const v = C.predictVolume(model, feats.volume);
      const kg = r.form.weight;
      vol.innerHTML = `
        <div class="value">${fmt(v.median)}<small>mL/kg</small></div>
        <div class="grade">Expected transfusion volume if transfused</div>
        <div class="sub">Interquartile range ${fmt(v.q25)} to ${fmt(v.q75)} mL/kg. For ${fmt(kg)} kg, a median of about ${Math.round(v.median * kg).toLocaleString("en-US")} mL (${Math.round(v.q25 * kg).toLocaleString("en-US")} to ${Math.round(v.q75 * kg).toLocaleString("en-US")} mL).</div>
        ${!elevated ? `<p class="notice warn" style="margin-top:16px">Predicted risk is below the threshold, so this child may not need a transfusion, and the volume estimate is unreliable. Correlate with clinical need.</p>` : ""}`;
    } else {
      vol.innerHTML = `<div class="sub">No volume estimate: predicted risk is below the threshold. Check “Always show the volume estimate” to see it anyway.</div>`;
    }
  }

  root.addEventListener("input", update);
  root.addEventListener("change", update);
})();
