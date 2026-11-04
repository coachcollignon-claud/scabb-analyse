/* Bibliothèque LNB — lecture du Match Center public (Boxscore + Play by play). Source unique : shared/lnb.js (copiée par tools/sync.sh) */
const LNB = (() => {
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(C\)/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase();
  const COLS = ["pts","f2m","f2a","p2","tpm","tpa","p3","ftm","fta","pft","orb","drb","reb","ast","stl","blk","ba","tov","pf","pm","eval"];
  const lines = t => String(t || "").split(/\r?\n/).map(s => s.replace(/ /g, " ").trim()).filter(Boolean);
  function parseBox(text) {
    const L = lines(text); const teams = []; let cur = null;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (l === "#" && i > 0) { const name = L[i - 1]; if (!/^(Num[ée]ro|Trier par|5 D[ée]part|Minutes)$/i.test(name)) { cur = { name, players: [] }; teams.push(cur); } continue; }
      if (!cur) continue;
      const tm = l.match(/^TOTAL\s+[\d:]+\s+(.*)$/);
      if (tm) { const n = tm[1].split(/\s+/).filter(Boolean).map(Number); const t = {};
        ["pts","f2m","f2a","p2","tpm","tpa","p3","ftm","fta","pft","orb","drb","reb","ast","stl","blk","ba","tov","pf"].forEach((c, k) => t[c] = n[k] ?? 0);
        cur.total = { pts: t.pts, fgm: t.f2m + t.tpm, fga: t.f2a + t.tpa, tpm: t.tpm, tpa: t.tpa, ftm: t.ftm, fta: t.fta, orb: t.orb, drb: t.drb, ast: t.ast, tov: t.tov, stl: t.stl, blk: t.blk, pf: t.pf };
        continue; }
      const m = l.match(/^(\d{1,2})\s+(\*\s*)?(.+?)\s+(\d{1,3}:\d\d|NPJ)(?:\s+(.*))?$/);
      if (m) {
        const p = { num: m[1], starter: !!m[2], name: m[3].replace(/\s*\(C\)\s*/, "").trim(), dnp: m[4] === "NPJ" };
        if (!p.dnp) { const [mm, ss] = m[4].split(":").map(Number); p.bmin = mm + ss / 60; }
        p.key = p.num + "|" + norm(p.name);
        if (!p.dnp) { const n = (m[5] || "").split(/\s+/).filter(Boolean).map(Number); COLS.forEach((c, k) => p[c] = n[k] ?? 0); }
        cur.players.push(p);
      }
    }
    return teams.filter(t => t.players.length >= 5).slice(0, 2);
  }
  const clockRe = /^(Q|P|OT|PR)(\d+)\s+(\d{1,2}):(\d\d)$/;
  const elapsed = (per, rem) => per <= 4 ? (per - 1) * 600 + (600 - rem) : 2400 + (per - 5) * 300 + (300 - rem);
  function parsePbp(text) {
    const L = lines(text); const ev = [];
    for (let i = 0; i < L.length; i++) {
      const c = L[i].match(clockRe); if (!c) continue;
      const sc = (L[i + 2] || "").match(/^(\d+)\s*-\s*(\d+)$/); if (!sc) continue;
      const pl = (L[i - 1] || "").match(/^#(\d+)\s+(.+)$/); const per = +c[2], rem = (+c[3]) * 60 + (+c[4]);
      ev.push({ per, rem, t: elapsed(per, rem), clock: `${c[1]}${per} ${c[3]}:${c[4]}`, num: pl ? pl[1] : null, name: pl ? pl[2] : null, key: pl ? pl[1] + "|" + norm(pl[2]) : null, type: L[i + 1], h: +sc[1], a: +sc[2] });
    }
    ev.reverse(); ev.forEach((e, k) => e.idx = k); ev.sort((x, y) => x.t - y.t || x.idx - y.idx);
    return ev;
  }
  function classify(type) {
    const s = String(type).toLowerCase();
    if (/remplacement entrant/.test(s)) return "in";
    if (/remplacement sortant/.test(s)) return "out";
    if (/lancer franc/.test(s)) return /r[ée]ussi/.test(s) ? "ftm" : "ftx";
    if (/^3\s*pts?\b|^3pt/.test(s)) return /r[ée]ussi/.test(s) ? "3m" : "3x";
    if (/^2\s*pts?\b|^2pt/.test(s)) return /r[ée]ussi/.test(s) ? "2m" : "2x";
    if (/balle perdue/.test(s)) return "tov";
    if (/rebond offensif/.test(s)) return "orb";
    if (/rebond d[ée]fensif/.test(s)) return "drb";
    if (/passe d[ée]cisive/.test(s)) return "ast";
    if (/interception/.test(s)) return "stl";
    if (/^contre$/.test(s)) return "blk";
    if (/faute (personnelle|offensive)|technical|antisportive|disqualifiante/.test(s) && !/provoqu/.test(s)) return "pf";
    return "other";
  }
  const STAT = () => ({ sec: 0, pf: 0, pa: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls: 0,
                        o_fgm: 0, o_fga: 0, o_tpm: 0, o_fta: 0, o_orb: 0, o_drb: 0, o_tov: 0 });
  function bump(o, k, own) {
    const map = { "2m": ["fgm", "fga"], "2x": ["fga"], "3m": ["fgm", "fga", "tpm", "tpa"], "3x": ["fga", "tpa"], ftm: ["ftm", "fta"], ftx: ["fta"], tov: ["tov"], orb: ["orb"], drb: ["drb"], ast: ["ast"], stl: ["stl"], blk: ["blk"], pf: ["fouls"] };
    const f = map[k]; if (!f) return;
    f.forEach(x => { const key = own ? x : "o_" + x; if (key in o) o[key]++; });
  }
  function finish(o) {
    const poss = o.fga + 0.44 * o.fta - o.orb + o.tov, oposs = o.o_fga + 0.44 * o.o_fta - o.o_orb + o.o_tov, pp = (poss + oposs) / 2;
    o.min = o.sec / 60; o.pm = o.pf - o.pa; o.poss = pp;
    o.ortg = pp > 0 ? 100 * o.pf / pp : null; o.drtg = pp > 0 ? 100 * o.pa / pp : null; o.net = pp > 0 ? 100 * o.pm / pp : null;
    o.efg = o.fga ? (o.fgm + .5 * o.tpm) / o.fga : null; o.oefg = o.o_fga ? (o.o_fgm + .5 * o.o_tpm) / o.o_fga : null;
    o.tovp = poss > 0 ? o.tov / poss : null; o.otovp = oposs > 0 ? o.o_tov / oposs : null;
    o.orbp = (o.orb + o.o_drb) ? o.orb / (o.orb + o.o_drb) : null; o.drbp = (o.drb + o.o_orb) ? o.drb / (o.drb + o.o_orb) : null;
    o.ftr = o.fga ? o.ftm / o.fga : null; o.p3 = o.tpa ? o.tpm / o.tpa : null; o.ftp = o.fta ? o.ftm / o.fta : null;
    o.ts = (o.fga + .44 * o.fta) ? o.pf / (2 * (o.fga + .44 * o.fta)) : null;
    return o;
  }
  /* box: parseBox() — index 0 = équipe à domicile (score de gauche) */
  function analyse(box, ev, fromT = 0, toT = Infinity) {
    const roster = {}, teamOf = {}, byNum = {};
    box.forEach((tm, ti) => tm.players.forEach(p => { roster[p.key] = p; teamOf[p.key] = ti; (byNum[p.num] = byNum[p.num] || []).push(p); }));
    const resolve = e => {
      if (!e.key) return null; if (e.key in teamOf) return e.key;
      const c = byNum[e.num] || []; if (c.length === 1) return c[0].key;
      const last = norm(e.name).split(" ").pop(); const f = c.find(p => norm(p.name).split(" ").includes(last)); return f ? f.key : null;
    };
    const on = [new Set(), new Set()];
    box.forEach((tm, ti) => tm.players.filter(p => p.starter).forEach(p => on[ti].add(p.key)));
    const team = [STAT(), STAT()], units = [{}, {}], pl = [{}, {}];
    const unitKey = ti => [...on[ti]].sort().join(",");
    const inWin = t => t > fromT && t <= toT;
    const each = (fn) => { for (const ti of [0, 1]) { const k = unitKey(ti); fn(units[ti][k] = units[ti][k] || Object.assign(STAT(), { key: k }), ti); on[ti].forEach(pk => fn(pl[ti][pk] = pl[ti][pk] || Object.assign(STAT(), { key: pk }), ti)); fn(team[ti], ti); } };
    let lastT = 0, lastH = 0, lastA = 0, lastMissTeam = null, unknown = 0;
    const box2 = [{}, {}]; // stats individuelles depuis le PBP
    for (const e of ev) {
      if (e.t > lastT) { const a = Math.max(lastT, fromT), b = Math.min(e.t, toT); if (b > a) each(o => o.sec += b - a); lastT = e.t; }
      const dh = e.h - lastH, da = e.a - lastA;
      if ((dh || da) && inWin(e.t)) each((o, ti) => { o.pf += ti === 0 ? dh : da; o.pa += ti === 0 ? da : dh; });
      lastH = e.h; lastA = e.a;
      const k = classify(e.type); const pk = resolve(e); let ti = pk != null ? teamOf[pk] : null;
      if (k === "in") { if (ti != null) on[ti].add(pk); continue; }
      if (k === "out") { if (ti != null) on[ti].delete(pk); continue; }
      if (ti == null && (k === "orb" || k === "drb") && lastMissTeam != null) ti = k === "orb" ? lastMissTeam : 1 - lastMissTeam;
      if (ti == null) { if (e.key) unknown++; continue; }
      if (k === "2x" || k === "3x" || k === "ftx") lastMissTeam = ti;
      if (!inWin(e.t)) continue;
      each((o, t2) => bump(o, k, t2 === ti));
      if (pk) { const s = box2[ti][pk] = box2[ti][pk] || { pts: 0, reb: 0, ast: 0, tov: 0, stl: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, fouls: 0 };
        if (k === "2m") { s.pts += 2; s.fgm++; s.fga++; } else if (k === "2x") s.fga++; else if (k === "3m") { s.pts += 3; s.fgm++; s.fga++; s.tpm++; s.tpa++; } else if (k === "3x") { s.fga++; s.tpa++; }
        else if (k === "ftm") { s.pts++; s.ftm++; s.fta++; } else if (k === "ftx") s.fta++; else if (k === "orb" || k === "drb") s.reb++; else if (k === "ast") s.ast++; else if (k === "tov") s.tov++; else if (k === "stl") s.stl++; else if (k === "pf") s.fouls++; }
    }
    const onNow = [0, 1].map(ti => [...on[ti]].map(k => roster[k]).filter(Boolean));
    const res = [0, 1].map(ti => ({
      name: box[ti].name, team: finish(team[ti]),
      units: Object.values(units[ti]).filter(u => u.sec > 0).map(finish).map(u => Object.assign(u, { players: u.key.split(",").map(k => roster[k]).filter(Boolean), current: u.key === unitKey(ti) })),
      players: Object.values(pl[ti]).map(finish).map(p => Object.assign(p, { info: roster[p.key], box: box2[ti][p.key] || {} })),
      onNow: onNow[ti]
    }));
    return { res, unknown, score: [lastH, lastA], last: ev[ev.length - 1] || null };
  }
  function periods(ev) { const r = {}; ev.forEach(e => r[e.per] = [e.h, e.a]); let h = 0, a = 0; return Object.keys(r).map(Number).sort((x, y) => x - y).map(k => { const o = { per: k, h: r[k][0] - h, a: r[k][1] - a }; h = r[k][0]; a = r[k][1]; return o; }); }
  function runs(ev) { // série en cours
    let side = null, n = 0, oth = 0, lh = 0, la = 0, since = null;
    for (const e of ev) { const dh = e.h - lh, da = e.a - la; lh = e.h; la = e.a; if (!dh && !da) continue;
      const s = dh ? 0 : 1, pts = dh || da; if (s === side) n += pts; else { side = s; n = pts; since = e.clock; } }
    return { side, pts: n, since };
  }
  /* Calendrier : texte d'une journée (sélection "Jn") → liste de matchs */
  const JOURS = /^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)\s+(\d{1,2})\s+([A-ZÉÛÈÔ]+)$/i;
  const MOIS_L = {JANVIER:1,"FÉVRIER":2,FEVRIER:2,MARS:3,AVRIL:4,MAI:5,JUIN:6,JUILLET:7,"AOÛT":8,AOUT:8,SEPTEMBRE:9,OCTOBRE:10,NOVEMBRE:11,"DÉCEMBRE":12,DECEMBRE:12};
  function parseCalendar(text, seasonStartYear = 2026) {
    const L = lines(text); const out = []; let date = null;
    for (let i = 0; i < L.length; i++) {
      const d = L[i].match(JOURS);
      if (d) { const mo = MOIS_L[d[3].toUpperCase()]; if (mo) { const y = mo >= 7 ? seasonStartYear : seasonStartYear + 1; date = `${y}-${String(mo).padStart(2, "0")}-${d[2].padStart(2, "0")}`; } continue; }
      const j = L[i].match(/^J(\d{1,2})$/); if (!j || !date) continue;
      const home = L[i + 1], x = L[i + 2]; if (!home || !x) continue;
      let k = i - 1; while (k >= 0 && /^(\d{1,2}|[JHMS:])$/.test(L[k])) k--;
      const prev = k >= 0 ? L[k] : "";
      const g = { journee: +j[1], date, home, away: null, time: null, home_pts: null, away_pts: null, status: "prevu" };
      if (/^\d{1,2}:\d\d$/.test(x)) { g.time = x; g.away = L[i + 3]; i += 3; }
      else if (/^\d+$/.test(x) && L[i + 3] === "-" && /^\d+$/.test(L[i + 4] || "")) { g.home_pts = +x; g.away_pts = +L[i + 4]; g.away = L[i + 5]; g.status = /TERMIN/i.test(prev) ? "termine" : "live"; i += 5; }
      else continue;
      if (g.away) out.push(g);
    }
    return out;
  }
  /* Rotations : séquence des cinq d'une équipe avec score pendant leur présence */
  function stints(box, ev, us) {
    const teamOf = {}; box.forEach((tm, ti) => tm.players.forEach(p => teamOf[p.key] = ti));
    const roster = {}; box.forEach(tm => tm.players.forEach(p => roster[p.key] = p));
    const on = new Set(box[us].players.filter(p => p.starter).map(p => p.key));
    const out = []; let cur = null, lh = 0, la = 0;
    const open = e => { cur = { key: [...on].sort().join(","), players: [...on].map(k => roster[k]).filter(Boolean), from: e ? e.clock : "Q1 10:00", t0: e ? e.t : 0, pf: 0, pa: 0 }; };
    open(null);
    for (const e of ev) {
      const dh = e.h - lh, da = e.a - la; lh = e.h; la = e.a;
      if (dh || da) { cur.pf += us === 0 ? dh : da; cur.pa += us === 0 ? da : dh; }
      const k = classify(e.type); if ((k === "in" || k === "out") && e.key && teamOf[e.key] === us) {
        if (k === "in") on.add(e.key); else on.delete(e.key);
        const nk = [...on].sort().join(",");
        if (on.size === 5 && nk !== cur.key) { cur.to = e.clock; cur.t1 = e.t; if (cur.t1 > cur.t0 || cur.pf || cur.pa) out.push(cur); open(e); }
      }
    }
    const last = ev[ev.length - 1]; cur.to = last ? last.clock : cur.from; cur.t1 = last ? last.t : 0; cur.current = true; out.push(cur);
    return out.map(s => Object.assign(s, { sec: Math.max(0, s.t1 - s.t0), pm: s.pf - s.pa }));
  }
  const MOIS = {janv:1,"févr":2,fevr:2,fev:2,"fév":2,mars:3,avr:4,mai:5,juin:6,juil:7,"août":8,aout:8,sept:9,oct:10,nov:11,"déc":12,dec:12};
  function parseMeta(text){
    const L = lines(text); let i = -1; L.forEach((l,k)=>{ if (/^Match Center$/i.test(l)) i = k; });
    const seg = i >= 0 ? L.slice(i+1, i+9) : []; const status = seg[0] || ""; let date = null;
    for (const l of seg){ const m = l.match(/^(\d{1,2})\s+([a-zéèûô]+)\.?\s+(\d{4})$/i); if (m){ const mo = MOIS[m[2].toLowerCase()]; if (mo) date = `${m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; break; } }
    const comp = seg.find(l => /[ÉE]LITE|BETCLIC|COUPE|LEADERS/i.test(l)) || "";
    return { status, final: /TERMIN/i.test(status), half: /MI[-\s]?TEMPS|PAUSE/i.test(status), date, comp };
  }
  const detectUs = box => { const i = box.findIndex(t => /SCABB/i.test(t.name)); return i >= 0 ? i : 0; };
  const titleCase = s => String(s||"").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m,a,b)=>a+b.toUpperCase()).replace(/\bMc(\p{L})/gu,(m,b)=>"Mc"+b.toUpperCase());
  const lastName = n => { const w = String(n||"").split(/\s+/); return titleCase(w.length > 1 ? w.slice(1).join(" ") : w[0]); };
  const shortTeam = n => /SCABB/i.test(n) ? "SCABB" : (t => t.length > 16 ? t.slice(0,15) + "." : t)(titleCase(String(n||"").split(/\s+/).filter(w=>!/^(BASKET|BASKETBALL|BC|SA|CB|ES|AS|JL|ALM)$/i.test(w))[0] || n));
  const pName = p => p ? `#${p.num} ${lastName(p.name)}` : "?";
  return { parseBox, parsePbp, parseMeta, parseCalendar, stints, analyse, periods, runs, norm, classify, detectUs, titleCase, lastName, shortTeam, pName };
})();
export default LNB;
export { LNB };
