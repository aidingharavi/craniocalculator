// Reference calculators. Pure client-side; nothing entered leaves the browser.
(function () {
  const num = (el) => {
    const v = parseFloat(String(el.value).replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const fmt = (v, d = 1) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------- CVAI ---------- */
  const cvai = document.getElementById("cvai-calc");
  if (cvai) {
    const r = document.getElementById("diag-r");
    const l = document.getElementById("diag-l");
    const out = document.getElementById("cvai-out");
    const fig = document.getElementById("cvai-figure");
    const scale = document.querySelectorAll("#cvai-scale li");

    const LEVELS = [
      { max: 3.5, level: 1, label: "Level 1, within normal limits" },
      { max: 6.25, level: 2, label: "Level 2, mild" },
      { max: 8.75, level: 3, label: "Level 3, moderate" },
      { max: 11.0, level: 4, label: "Level 4, severe", inclusive: true },
      { max: Infinity, level: 5, label: "Level 5, very severe" },
    ];
    const grade = (v) => LEVELS.find((L) => (L.inclusive ? v <= L.max : v < L.max));

    const drawFigure = (a, b) => {
      // a: right frontal → left occipital, b: left frontal → right occipital. Drawn to scale.
      const longer = Math.max(a || 1, b || 1);
      const half = 175;
      const la = a ? (a / longer) * half : half;
      const lb = b ? (b / longer) * half : half;
      const sx = 0.5, sy = 0.866;
      const cx = 200, cy = 250;
      const aLong = a && b && a >= b;
      const line = (len, dir, cls) => {
        const x1 = cx + dir * sx * len, y1 = cy - sy * len, x2 = cx - dir * sx * len, y2 = cy + sy * len;
        return `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      };
      fig.innerHTML = `<svg class="tracing" viewBox="0 0 400 490">
        <line class="axis" x1="200" y1="12" x2="200" y2="470"/>
        <path class="feature" d="M186 44L200 16L214 44"/>
        <path class="outline" d="M200 40C280 40 335 95 345 175C355 255 345 330 315 385C285 435 245 455 200 455C155 455 115 435 85 385C55 330 45 255 55 175C65 95 120 40 200 40Z"/>
        <path class="feature" d="M347 214C366 226 369 266 350 286"/><path class="feature" d="M53 214C34 226 31 266 50 286"/>
        ${line(la, 1, aLong ? "diag" : "diag b")}
        ${line(lb, -1, aLong ? "diag b" : "diag")}
        <text class="side" x="318" y="92">R</text><text class="side" x="64" y="92">L</text>
        <text x="208" y="484">posterior</text>
      </svg>`;
    };

    const update = () => {
      const a = num(r), b = num(l);
      scale.forEach((li) => li.classList.remove("on"));
      drawFigure(a, b);
      if (!a || !b) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter both diagonals</div>`;
        return;
      }
      if (Math.abs(a - b) / Math.max(a, b) > 0.35) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">Check the measurements: the diagonals differ by more than 35%.</div>`;
        return;
      }
      const useShort = document.querySelector('input[name="denom"]:checked').value === "short";
      const cva = Math.abs(a - b);
      const v = (cva / (useShort ? Math.min(a, b) : Math.max(a, b))) * 100;
      const g = grade(v);
      document.querySelector(`#cvai-scale li[data-level="${g.level}"]`).classList.add("on");
      let side = "";
      if (g.level > 1 && a !== b) {
        side = a > b
          ? "Shorter diagonal runs left frontal to right occipital, consistent with right occipital flattening."
          : "Shorter diagonal runs right frontal to left occipital, consistent with left occipital flattening.";
      }
      out.innerHTML = `
        <div class="value">${fmt(v, 2)}<small>%</small></div>
        <div class="grade">${g.label}</div>
        <div class="sub">Cranial vault asymmetry ${fmt(cva)} mm. ${side}</div>`;
    };
    cvai.addEventListener("input", update);
    update();
  }

  /* ---------- Cephalic index ---------- */
  const ci = document.getElementById("ci-calc");
  if (ci) {
    const w = document.getElementById("ci-width");
    const len = document.getElementById("ci-length");
    const out = document.getElementById("ci-out");
    const bands = [
      { band: "dolicho", test: (v) => v < 75, label: "Dolichocephalic range", note: "Long, narrow head shape. Consider sagittal synostosis or positional dolichocephaly." },
      { band: "ref", test: (v) => v <= 90, label: "Within commonly used reference range", note: "Interpret borderline values against age- and sex-specific norms." },
      { band: "mild", test: (v) => v <= 93, label: "Mild brachycephaly", note: "" },
      { band: "mod", test: (v) => v <= 97, label: "Moderate brachycephaly", note: "" },
      { band: "sev", test: () => true, label: "Severe brachycephaly", note: "" },
    ];
    const update = () => {
      const a = num(w), b = num(len);
      ci.querySelectorAll(".scale li").forEach((li) => li.classList.remove("on"));
      if (!a || !b) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter width and length</div>`;
        return;
      }
      const v = (a / b) * 100;
      if (v < 50 || v > 130) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">Check the measurements: width should be roughly 60–110% of length.</div>`;
        return;
      }
      const B = bands.find((x) => x.test(v));
      ci.querySelector(`.scale li[data-band="${B.band}"]`).classList.add("on");
      out.innerHTML = `<div class="value">${fmt(v)}<small>%</small></div><div class="grade">${B.label}</div>${B.note ? `<div class="sub">${B.note}</div>` : ""}`;
    };
    ci.addEventListener("input", update);
    update();
  }

  /* ---------- Estimated blood volume and allowable blood loss ---------- */
  const ebl = document.getElementById("ebl-calc");
  if (ebl) {
    const w = document.getElementById("ebl-weight");
    const age = document.getElementById("ebl-age");
    const perkg = document.getElementById("ebl-perkg");
    const hi = document.getElementById("ebl-hi");
    const hf = document.getElementById("ebl-hf");
    const out = document.getElementById("ebl-out");
    const ml = (v) => Math.round(v).toLocaleString("en-US");

    age.addEventListener("change", () => {
      perkg.value = age.value;
    });
    const update = () => {
      const kg = num(w), pk = num(perkg), a = num(hi), b = num(hf);
      if (!kg || !pk) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter weight and hematocrit values</div>`;
        return;
      }
      const ebv = kg * pk;
      let mabl = "";
      if (a && b) {
        if (b >= a) {
          mabl = `<div class="grade" style="color:var(--danger)">The lowest acceptable hematocrit must be below the starting value.</div>`;
        } else {
          const loss = (ebv * (a - b)) / ((a + b) / 2);
          mabl = `
            <div class="value" style="margin-top:28px">${ml(loss)}<small>mL</small></div>
            <div class="grade">Maximum allowable blood loss</div>
            <div class="sub">${((loss / ebv) * 100).toFixed(0)}% of estimated blood volume, from hematocrit ${fmt(a)}% to ${fmt(b)}%.</div>`;
        }
      } else {
        mabl = `<div class="sub" style="margin-top:16px">Add starting and lowest acceptable hematocrit to calculate allowable blood loss.</div>`;
      }
      out.innerHTML = `
        <div class="value">${ml(ebv)}<small>mL</small></div>
        <div class="grade">Estimated blood volume</div>
        <div class="sub">${fmt(kg)} kg × ${fmt(pk, 0)} mL/kg</div>
        ${mabl}`;
    };
    ebl.addEventListener("input", update);
    ebl.addEventListener("change", update);
    update();
  }
})();
