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
  /* ---------- Head circumference z-score (WHO) ---------- */
  const hc = document.getElementById("hc-calc");
  if (hc) {
    const age = document.getElementById("hc-age");
    const unit = document.getElementById("hc-unit");
    const hcIn = document.getElementById("hc-hc");
    const ga = document.getElementById("hc-ga");
    const out = document.getElementById("hc-out");
    const bands = [
      { band: "sev-micro", test: (z) => z < -3, label: "Severe microcephaly range" },
      { band: "micro", test: (z) => z < -2, label: "Microcephaly range" },
      { band: "normal", test: (z) => z <= 2, label: "Within 2 SD of the median" },
      { band: "macro", test: (z) => z <= 3, label: "Macrocephaly range" },
      { band: "sev-macro", test: () => true, label: "Marked macrocephaly range" },
    ];
    // Standard normal CDF (Abramowitz and Stegun 7.1.26 via erf)
    const phi = (z) => {
      const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
      const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
      return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
    };
    const ordinal = (n) => {
      const r = Math.round(n);
      const s = r % 100 >= 11 && r % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][r % 10] || "th";
      return `${r}${s}`;
    };
    let table = null;
    fetch("/data/who-hcfa.json").then((r) => r.json()).then((d) => { table = d; update(); }).catch(() => {
      out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">The WHO reference data couldn't load. Refresh to try again.</div>`;
    });
    function update() {
      if (!table) return;
      hc.querySelectorAll(".scale li").forEach((li) => li.classList.remove("on"));
      const sex = hc.querySelector('input[name="hc-sex"]:checked').value;
      const a = parseFloat(String(age.value).replace(",", "."));
      const h = num(hcIn);
      const g = num(ga);
      if (!Number.isFinite(a) || a < 0 || !h) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter age and head circumference</div>`;
        return;
      }
      const chronoMonths = a * parseFloat(unit.value);
      let months = chronoMonths, corr = "";
      if (g && g < 37 && chronoMonths < 24) {
        months = chronoMonths - ((40 - g) * 7) / 30.4375;
        corr = ` Corrected for ${fmt(40 - g)} weeks of prematurity.`;
        if (months < 0) {
          out.innerHTML = `<div class="value">–</div><div class="grade muted">Corrected age is before term (40 weeks). The WHO standards start at term birth; use a preterm growth chart such as INTERGROWTH-21st or Fenton.</div>`;
          return;
        }
      }
      if (months > 60) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">The WHO head circumference standards cover birth to 60 months.</div>`;
        return;
      }
      const rows = table[sex];
      const i = Math.min(Math.floor(months), 59), f = months - i;
      const M = rows[i][0] + (rows[i + 1][0] - rows[i][0]) * f;
      const S = rows[i][1] + (rows[i + 1][1] - rows[i][1]) * f;
      const z = (h / M - 1) / S;
      if (Math.abs(z) > 6) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">Check the measurement: this is more than 6 SD from the median for age.</div>`;
        return;
      }
      const B = bands.find((x) => x.test(z));
      hc.querySelector(`.scale li[data-band="${B.band}"]`).classList.add("on");
      const p = phi(z) * 100;
      const pct = p < 0.1 ? "below the 0.1st" : p > 99.9 ? "above the 99.9th" : `${ordinal(p)}`;
      out.innerHTML = `
        <div class="value">${z >= 0 ? "+" : "−"}${fmt(Math.abs(z), 2)}<small>SD</small></div>
        <div class="grade">${B.label}</div>
        <div class="sub">${pct} percentile. WHO median for ${fmt(months, 1)} months: ${fmt(M, 1)} cm.${corr}</div>`;
    }
    hc.addEventListener("input", update);
    hc.addEventListener("change", update);
  }

  /* ---------- Corrected age ---------- */
  const ca = document.getElementById("ca-calc");
  if (ca) {
    const dob = document.getElementById("ca-dob");
    const gaw = document.getElementById("ca-gaw");
    const gad = document.getElementById("ca-gad");
    const date = document.getElementById("ca-date");
    const out = document.getElementById("ca-out");
    const today = new Date();
    date.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const parse = (v) => (v ? new Date(v + "T12:00:00") : null);
    // Calendar months and days between two dates
    const ymd = (from, to) => {
      let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
      let anchor = new Date(from); anchor.setMonth(from.getMonth() + m);
      if (anchor > to) { m--; anchor = new Date(from); anchor.setMonth(from.getMonth() + m); }
      const d = Math.round((to - anchor) / 864e5);
      return { m, d };
    };
    const describe = ({ m, d }) => {
      const parts = [];
      if (m >= 24) { parts.push(`${Math.floor(m / 12)} y`); if (m % 12) parts.push(`${m % 12} mo`); }
      else if (m) parts.push(`${m} mo`);
      if (d || !parts.length) parts.push(`${d} d`);
      return parts.join(" ");
    };
    const wk = (days) => `${Math.floor(days / 7)}<small>w</small> ${days % 7}<small>d</small>`;
    const update = () => {
      const b = parse(dob.value), t = parse(date.value);
      const w = parseInt(gaw.value, 10), dd = parseInt(gad.value || "0", 10);
      if (!b || !t || !Number.isFinite(w)) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter date of birth and gestational age</div>`;
        return;
      }
      if (w < 22 || w > 44 || dd < 0 || dd > 6) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">Gestational age should be 22 to 44 weeks and 0 to 6 days.</div>`;
        return;
      }
      if (t < b) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">The assessment date is before the date of birth.</div>`;
        return;
      }
      const chronoDays = Math.round((t - b) / 864e5);
      const gaDays = w * 7 + dd;
      const pmaDays = gaDays + chronoDays;
      const early = 280 - gaDays;
      const chrono = describe(ymd(b, t));
      if (early <= 0) {
        out.innerHTML = `
          <div class="value" style="font-size:2.4rem">${chrono}</div>
          <div class="grade">Chronological age</div>
          <div class="sub">Born at term (${w} weeks ${dd} days), so no correction applies. Postmenstrual age ${Math.floor(pmaDays / 7)} weeks ${pmaDays % 7} days.</div>`;
        return;
      }
      const corrDate = new Date(b); corrDate.setDate(corrDate.getDate() + early); // term-equivalent date
      const pre = t < corrDate;
      out.innerHTML = `
        ${pre
          ? `<div class="value">${wk(pmaDays)}</div><div class="grade">Postmenstrual age</div><div class="sub">Before term-equivalent age (40 weeks), which is ${corrDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</div>`
          : `<div class="value" style="font-size:2.4rem">${describe(ymd(corrDate, t))}</div><div class="grade">Corrected age</div>`}
        <div class="sub" style="margin-top:16px">Chronological age ${chrono} (${chronoDays} days).<br>Born ${Math.floor(early / 7)} weeks ${early % 7} days early.${pre ? "" : `<br>Postmenstrual age ${Math.floor(pmaDays / 7)} weeks ${pmaDays % 7} days.`}</div>`;
    };
    ca.addEventListener("input", update);
    ca.addEventListener("change", update);
    update();
  }

  /* ---------- Argenta classification ---------- */
  const arg = document.getElementById("arg-calc");
  if (arg) {
    const out = document.getElementById("arg-out");
    const roman = ["", "I", "II", "III", "IV", "V"];
    const NAMES = {
      plagio: ["", "Deformity limited to the back of the skull", "Posterior flattening with ear malposition", "Ear malposition with forehead deformity", "Forehead deformity with facial asymmetry", "Facial asymmetry with vertical or temporal growth"],
      brachy: ["", "Central posterior flattening", "Central flattening with posterior widening", "Posterior widening with vertical or temporal growth"],
    };
    const update = () => {
      const pattern = arg.querySelector('input[name="arg-pattern"]:checked').value;
      arg.querySelectorAll("[data-pattern]").forEach((el) => (el.hidden = el.dataset.pattern !== pattern));
      document.getElementById("arg-scale-plagio").hidden = pattern !== "plagio";
      document.getElementById("arg-scale-brachy").hidden = pattern !== "brachy";
      arg.querySelectorAll(".scale li").forEach((li) => li.classList.remove("on"));
      const checked = [...arg.querySelectorAll(`[data-pattern="${pattern}"] input:checked`)].map((el) => Number(el.dataset.type));
      if (!checked.length) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Check the findings present</div>`;
        return;
      }
      const type = Math.max(...checked);
      document.querySelector(`#arg-scale-${pattern} li[data-type="${type}"]`).classList.add("on");
      const gaps = [];
      for (let k = 1; k < type; k++) if (!checked.includes(k)) gaps.push(k);
      out.innerHTML = `
        <div class="value">Type ${roman[type]}</div>
        <div class="grade">${pattern === "plagio" ? "Positional plagiocephaly" : "Positional brachycephaly"}</div>
        <div class="sub">${NAMES[pattern][type]}.${gaps.length ? " Types are cumulative, so the earlier findings are usually present too; check that they were not missed." : ""}</div>`;
    };
    arg.addEventListener("change", update);
    update();
  }

  /* ---------- GILLS score ---------- */
  const gills = document.getElementById("gills-calc");
  if (gills) {
    const out = document.getElementById("gills-out");
    const update = () => {
      const score = gills.querySelectorAll("input[data-point]:checked").length;
      const low = score <= 2;
      gills.querySelectorAll(".scale li").forEach((li) => li.classList.toggle("on", li.dataset.band === (low ? "low" : "high")));
      out.innerHTML = `
        <div class="value">${score}<small>of 5</small></div>
        <div class="grade">${low ? "Associated with TLA success" : "Associated with TLA failure"}</div>
        <div class="sub">${low ? "A score of 2 or less favored successful tongue-lip adhesion in the development study." : "Scores of 3 or more were associated with needing a further airway procedure after tongue-lip adhesion."}</div>`;
    };
    gills.addEventListener("change", update);
    update();
  }

  /* ---------- Facial Injury Severity Scale ---------- */
  const fiss = document.getElementById("fiss-calc");
  if (fiss) {
    const out = document.getElementById("fiss-out");
    const update = () => {
      let total = 0;
      fiss.querySelectorAll('input[type="number"][data-pts]').forEach((el) => {
        const n = parseInt(el.value, 10);
        if (Number.isFinite(n) && n > 0) total += n * Number(el.dataset.pts);
      });
      fiss.querySelectorAll('input[type="checkbox"][data-pts]:checked').forEach((el) => (total += Number(el.dataset.pts)));
      fiss.querySelectorAll("select[data-select]").forEach((el) => (total += Number(el.value)));
      out.innerHTML = `
        <div class="value">${total}</div>
        <div class="grade">Facial Injury Severity Scale</div>
        <div class="sub">${total ? "Higher scores reflect more extensive and complex facial injury. There are no fixed severity cutoffs." : "Enter the fractures and lacerations present."}</div>`;
    };
    fiss.addEventListener("input", update);
    fiss.addEventListener("change", update);
    update();
  }

  /* ---------- Maintenance fluids (Holliday-Segar) ---------- */
  const mf = document.getElementById("mf-calc");
  if (mf) {
    const w = document.getElementById("mf-weight");
    const out = document.getElementById("mf-out");
    const update = () => {
      const kg = num(w);
      if (!kg) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter weight</div>`;
        return;
      }
      const tier = (a, b, c) => Math.min(kg, 10) * a + Math.min(Math.max(kg - 10, 0), 10) * b + Math.max(kg - 20, 0) * c;
      const hourly = tier(4, 2, 1);
      const daily = tier(100, 50, 20);
      out.innerHTML = `
        <div class="value">${fmt(hourly, hourly < 100 ? 1 : 0)}<small>mL/h</small></div>
        <div class="grade">Maintenance rate (4-2-1 rule)</div>
        <div class="value" style="margin-top:28px">${Math.round(daily).toLocaleString("en-US")}<small>mL/day</small></div>
        <div class="grade">Daily requirement (100-50-20 rule)</div>
        <div class="sub">Equal to ${fmt(daily / 24, 1)} mL/h averaged over 24 hours.</div>`;
    };
    mf.addEventListener("input", update);
    update();
  }
  /* ---------- Sunnybrook Facial Grading System ---------- */
  const sb = document.getElementById("sb-calc");
  if (sb) {
    const out = document.getElementById("sb-out");
    const MOVE = ["1: None", "2: Slight", "3: Mild", "4: Near complete", "5: Complete"];
    const SYNK = ["0: None", "1: Mild", "2: Moderate", "3: Severe"];
    sb.querySelectorAll("[data-move]").forEach((el) => {
      el.innerHTML = MOVE.map((t, i) => `<option value="${i + 1}"${i === 4 ? " selected" : ""}>${t}</option>`).join("");
    });
    sb.querySelectorAll("[data-synk]").forEach((el) => {
      el.innerHTML = SYNK.map((t, i) => `<option value="${i}">${t}</option>`).join("");
    });
    const sum = (sel) => [...sb.querySelectorAll(sel)].reduce((a, el) => a + Number(el.value), 0);
    const update = () => {
      const rest = sum("[data-rest]") * 5;
      const move = sum("[data-move]") * 4;
      const synk = sum("[data-synk]");
      const composite = move - rest - synk;
      out.innerHTML = `
        <div class="value">${composite}<small>of 100</small></div>
        <div class="grade">Composite score</div>
        <div class="sub">Voluntary movement ${move} − resting symmetry ${rest} − synkinesis ${synk}.</div>`;
    };
    sb.addEventListener("change", update);
    update();
  }

  /* ---------- Pittsburgh Weighted Speech Score ---------- */
  const pw = document.getElementById("pw-calc");
  if (pw) {
    const out = document.getElementById("pw-out");
    const BANDS = [
      { band: 0, max: 0, label: "Competent" },
      { band: 1, max: 2, label: "Borderline competent" },
      { band: 2, max: 6, label: "Borderline incompetent" },
      { band: 3, max: Infinity, label: "Incompetent" },
    ];
    const update = () => {
      const emission = pw.querySelector("[data-emission]:checked") ? 3 : 0;
      const grimace = document.getElementById("pw-grimace").checked ? 2 : 0;
      const nasality = Number(document.getElementById("pw-nasality").value);
      const phonation = Number(document.getElementById("pw-phonation").value);
      const artic = [...pw.querySelectorAll("[data-artic]:checked")].reduce((a, el) => a + Number(el.dataset.artic), 0);
      const total = emission + grimace + nasality + phonation + artic;
      const B = BANDS.find((b) => total <= b.max);
      pw.querySelectorAll("#pw-scale li").forEach((li) => li.classList.toggle("on", Number(li.dataset.band) === B.band));
      out.innerHTML = `
        <div class="value">${total}</div>
        <div class="grade">${B.label}</div>
        <div class="sub">Nasal emission ${emission}, facial grimace ${grimace}, nasality ${nasality}, phonation ${phonation}, articulation ${artic}.</div>`;
    };
    pw.addEventListener("change", update);
    update();
  }
  /* ---------- Grade pickers (House-Brackmann, Bergland, Whitaker) ---------- */
  document.querySelectorAll("[data-picker]").forEach((root) => {
    const out = root.querySelector("[data-picker-out]");
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const update = () => {
      const el = root.querySelector('input[name="pick"]:checked');
      root.querySelectorAll(".pick-row").forEach((r) => r.classList.toggle("on", r.contains(el)));
      if (!el) return;
      out.innerHTML = `<div class="value">${esc(el.dataset.grade)}</div><div class="grade">${esc(el.dataset.name)}</div><div class="sub">${esc(el.dataset.detail)}</div>`;
    };
    root.addEventListener("change", update);
    update();
  });

  /* ---------- OMENS ---------- */
  const om = document.getElementById("om-calc");
  if (om) {
    const out = document.getElementById("om-out");
    const update = () => {
      const code = [...om.querySelectorAll("[data-om]")].map((el) => el.dataset.om + el.value).join(" ");
      out.innerHTML = `<div class="value" style="font-size:clamp(2rem,5vw,2.8rem)">${code}</div><div class="grade">OMENS classification</div>`;
    };
    om.addEventListener("change", update);
    update();
  }

  /* ---------- Jaw index ---------- */
  const ji = document.getElementById("ji-calc");
  if (ji) {
    const out = document.getElementById("ji-out");
    const update = () => {
      const ojRaw = document.getElementById("ji-oj").value;
      const oj = parseFloat(String(ojRaw).replace(",", "."));
      const mx = num(document.getElementById("ji-max")), md = num(document.getElementById("ji-mand"));
      if (ojRaw === "" || !Number.isFinite(oj) || oj < 0 || !mx || !md) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter all three measurements</div>`;
        return;
      }
      if (mx / md > 1.6 || md / mx > 1.6) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">Check the arch measurements: they differ by more than 60%.</div>`;
        return;
      }
      const v = oj * (mx / md);
      out.innerHTML = `<div class="value">${fmt(v, 1)}</div><div class="grade">Jaw index</div>
        <div class="sub">Reported means: healthy newborns 2.1 to 4.2 depending on technique; Robin sequence 13 to 15.</div>`;
    };
    ji.addEventListener("input", update);
    update();
  }

  /* ---------- Transfusion volume (Davies 2007) ---------- */
  const tv = document.getElementById("tv-calc");
  if (tv) {
    const out = document.getElementById("tv-out");
    const update = () => {
      const w = num(document.getElementById("tv-weight")), hb = num(document.getElementById("tv-hb"));
      const tg = num(document.getElementById("tv-target")), hct = num(document.getElementById("tv-hct"));
      if (!w || !hb || !tg || !hct) {
        out.innerHTML = `<div class="value">–</div><div class="grade muted">Enter weight and hemoglobin values</div>`;
        return;
      }
      if (tg <= hb) {
        out.innerHTML = `<div class="value">–</div><div class="grade" style="color:var(--danger)">The target hemoglobin must be above the current value.</div>`;
        return;
      }
      const vol = (w * (tg - hb) * 3) / (hct / 100);
      out.innerHTML = `<div class="value">${Math.round(vol).toLocaleString("en-US")}<small>mL</small></div>
        <div class="grade">Red cell volume</div>
        <div class="sub">${fmt(vol / w, 1)} mL/kg to raise hemoglobin by ${fmt(tg - hb, 1)} g/dL, with red cells at a hematocrit of ${fmt(hct, 0)}%.</div>`;
    };
    tv.addEventListener("input", update);
    update();
  }

  /* ---------- Synkinesis Assessment Questionnaire ---------- */
  const saq = document.getElementById("saq-calc");
  if (saq) {
    const out = document.getElementById("saq-out");
    const update = () => {
      const sum = [...saq.querySelectorAll("[data-saq]")].reduce((a, el) => a + Number(el.value), 0);
      const score = (sum / 45) * 100;
      out.innerHTML = `<div class="value">${fmt(score, 1)}<small>of 100</small></div><div class="grade">SAQ score</div>
        <div class="sub">Item total ${sum} of 45. The lowest possible score is 20 (no synkinesis on any item).</div>`;
    };
    saq.addEventListener("change", update);
    update();
  }

  /* ---------- FaCE Scale ---------- */
  const face = document.getElementById("face-calc");
  if (face) {
    const out = document.getElementById("face-out");
    const list = document.getElementById("face-domains");
    const DOMAINS = [
      ["Facial movement", [1, 2, 3]], ["Facial comfort", [4, 6, 13]], ["Oral function", [11, 12]],
      ["Eye comfort", [5, 7]], ["Lacrimal control", [8]], ["Social function", [9, 10, 14, 15]],
    ];
    const value = (n) => {
      const v = face.querySelector(`[data-face="${n}"]`).value;
      return v === "" ? null : Number(v);
    };
    const score = (nums) => {
      const vals = nums.map(value).filter((v) => v !== null);
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return ((sum - vals.length) / (4 * vals.length)) * 100;
    };
    const show = (v) => (v === null ? "–" : fmt(v, 1));
    const update = () => {
      const total = score([...Array(15)].map((_, i) => i + 1));
      out.innerHTML = `<div class="value">${show(total)}${total === null ? "" : "<small>of 100</small>"}</div><div class="grade">FaCE total score</div><div class="sub">0 is the worst and 100 the best facial function.</div>`;
      list.innerHTML = DOMAINS.map(([name, nums]) => `<li><span>${name}</span><span class="range">${show(score(nums))}</span></li>`).join("");
    };
    face.addEventListener("change", update);
    update();
  }

  /* ---------- eFACE ---------- */
  const ef = document.getElementById("ef-calc");
  if (ef) {
    const out = document.getElementById("ef-out");
    const itemScore = (el) => {
      const v = Number(el.value);
      return el.dataset.bi === "1" ? 100 - Math.abs(v - 100) : v;
    };
    const avg = (dom) => {
      const els = [...ef.querySelectorAll(`[data-ef="${dom}"]`)];
      return els.reduce((a, el) => a + itemScore(el), 0) / els.length;
    };
    const update = () => {
      ef.querySelectorAll("[data-ef]").forEach((el) => (document.getElementById(`${el.id}-v`).textContent = el.value));
      const st = avg("static"), dy = avg("dynamic"), sy = avg("synk");
      out.innerHTML = `
        <div class="value" style="font-size:clamp(2rem,5vw,2.8rem)">${fmt(st, 0)} · ${fmt(dy, 0)} · ${fmt(sy, 0)}</div>
        <div class="grade">Static · Dynamic · Synkinesis</div>
        <div class="sub">Each subscore runs from 0 to 100, where 100 is normal.</div>`;
    };
    ef.addEventListener("input", update);
    update();
  }
})();
