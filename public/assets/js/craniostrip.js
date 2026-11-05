// CranioSTRIP two-stage model, evaluated entirely in the browser.
// Stage 1: LightGBM classifier -> probability that any transfusion is needed.
// Stage 2: NGBoost (LogNormal) -> transfusion volume in mL/kg (median and IQR).
// Model data: /data/models/craniostrip.json, exported from the deployed app's model files.
(function (root) {
  "use strict";

  // Robust scaling of the continuous columns: (x - center) / scale.
  function scaledVector(part, features) {
    const x = part.columns.map((c) => {
      const v = features[c];
      return v === null || v === undefined ? NaN : Number(v);
    });
    const sc = part.scaler;
    sc.columns.forEach((c, k) => {
      const i = part.columns.indexOf(c);
      let v = x[i];
      if (sc.with_centering) v -= sc.center[k];
      if (sc.with_scaling) v /= sc.scale[k];
      x[i] = v;
    });
    return x;
  }

  // LightGBM tree: numeric "<=" splits. Missing type 0 = None (NaN treated as 0), 1 = NaN (default direction).
  function lgbmTree(t, x) {
    if (!t.f) return t.v[0];
    let n = 0;
    for (;;) {
      let v = x[t.f[n]];
      let left;
      if (Number.isNaN(v)) {
        if (t.m[n] === 1) left = t.d[n] === 1;
        else left = 0 <= t.t[n];
      } else left = v <= t.t[n];
      const next = left ? t.l[n] : t.r[n];
      if (next < 0) return t.v[-next - 1];
      n = next;
    }
  }

  // scikit-learn regression tree: compares float32(x) <= threshold, as sklearn casts inputs to float32.
  function skTree(t, x) {
    let n = 0;
    while (t.l[n] !== -1) n = Math.fround(x[t.f[n]]) <= t.t[n] ? t.l[n] : t.r[n];
    return t.v[n];
  }

  function predictRisk(model, features) {
    const m = model.risk;
    const x = scaledVector(m, features);
    let raw = 0;
    for (const t of m.trees) raw += lgbmTree(t, x);
    return 1 / (1 + Math.exp(-raw));
  }

  function predictVolume(model, features) {
    const m = model.volume;
    const x = scaledVector(m, features);
    let loc = m.init[0], logScale = m.init[1];
    for (const it of m.iterations) {
      const s0 = Array.isArray(it.s) ? it.s[0] : it.s;
      const s1 = Array.isArray(it.s) ? it.s[1] : it.s;
      loc -= m.learning_rate * skTree(it.p[0], x) * s0;
      logScale -= m.learning_rate * skTree(it.p[1], x) * s1;
    }
    const sigma = Math.exp(logScale);
    return {
      median: Math.exp(loc),
      q25: Math.exp(loc + sigma * m.z25),
      q75: Math.exp(loc - sigma * m.z25),
    };
  }

  // Gestational age (weeks) -> NSQIP-P prematurity category, as in the original app.
  function gaCategory(ga) {
    if (ga >= 37) return 0;
    if (ga >= 35) return 1;
    if (ga >= 33) return 2;
    if (ga >= 31) return 3;
    if (ga >= 29) return 4;
    if (ga >= 27) return 5;
    if (ga >= 25) return 6;
    if (ga >= 24) return 7;
    return 8;
  }

  // Build both models' feature sets from form values, mirroring the original app's collectors.
  // f: { age, ga, male, weight, ivh, asa, cardiac, comorbid:Set, support:Set, hct, plt, approach, multipleSutures, boneGraft }
  function features(f) {
    const has = (set, k) => (set && set.has(k) ? 1 : 0);
    const base = {
      AGE: f.age, ASA: f.asa, BONE_GRAFTS: f.boneGraft ? 1 : 0, CARDIAC_RISK_FACTOR: f.cardiac,
      GI_DISEASE: has(f.comorbid, "GI_DISEASE"), HEMATOLOGICAL_DISORDER: has(f.comorbid, "HEMATOLOGICAL_DISORDER"),
      IONOTROPIC_SUPPORT: has(f.support, "IONOTROPIC_SUPPORT"), IVH_GRADE: f.ivh, MALE: f.male ? 1 : 0,
      MIS_APPROACH: f.approach === "MIS_APPROACH" || f.approach === "COMBINED" ? 1 : 0,
      MULTIPLE_SUTURES: f.multipleSutures ? 1 : 0, PREMATURITY: f.ga < 37 ? 1 : 0, PREMATURITY_GA: gaCategory(f.ga),
      PREOP_HCT: f.hct, PREOP_PLT: f.plt, SEIZURE_DISORDER: has(f.comorbid, "SEIZURE_DISORDER"),
      STRUCTURAL_CNS_ABNORMALITY: has(f.comorbid, "STRUCTURAL_CNS_ABNORMALITY"),
      TRANSFUSION_48H_BEFORE: has(f.support, "TRANSFUSION_48H_BEFORE"), WEIGHT: f.weight,
    };
    const risk = Object.assign({}, base, {
      BPD_CLD: has(f.comorbid, "BPD_CLD"), CPR_WITHIN_7D: has(f.support, "CPR_WITHIN_7D"),
      NEUROMUSCULAR_DISORDER: has(f.comorbid, "NEUROMUSCULAR_DISORDER"),
      OPEN_APPROACH: f.approach === "OPEN_APPROACH" || f.approach === "COMBINED" ? 1 : 0,
      PREVIOUS_CARDIAC_SURGERY: has(f.comorbid, "PREVIOUS_CARDIAC_SURGERY"),
      STRUCTURAL_PULMONARY_ABNORMALITY: has(f.comorbid, "STRUCTURAL_PULMONARY_ABNORMALITY"),
      TRACHEOSTOMY: has(f.support, "TRACHEOSTOMY"),
    });
    const volume = Object.assign({}, base, {
      NUTRITIONAL_SUPPORT: has(f.support, "NUTRITIONAL_SUPPORT"), OXYGEN_SUPPORT: has(f.support, "OXYGEN_SUPPORT"),
      VENT_DEPENDENCE: has(f.support, "VENT_DEPENDENCE"),
    });
    return { risk, volume };
  }

  root.CranioSTRIP = { predictRisk, predictVolume, features, gaCategory };
})(typeof window !== "undefined" ? window : globalThis);
