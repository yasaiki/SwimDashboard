import { loadAppConfig, loadDashboardData } from "./data-service.js";
import {
  STROKE_ORDER,
  compareRows,
  currentAge,
  distanceSortValue,
  eventLabel,
  firstRecord,
  formatDate,
  formatSwimTime,
  formatTimeOnly,
  latestRecord,
  pbMap,
  unique,
} from "./utils.js";
import {
  badgeHtml,
  evaluateStandard,
  getAgeBracket,
  getStandardTable,
} from "./standards.js";
import {
  renderPBProgress,
  renderProgressChart,
  renderRadar,
  resizeCharts,
} from "./charts.js";

let swimmerDoc,
  profile,
  records = [],
  goals = [],
  standards,
  directory;
let sortState = { field: "date", direction: "desc" },
  historyPage = 1,
  historyPageSize = 25;
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );

function selected() {
  return {
    year: $("year").value,
    stroke: $("stroke").value,
    course: $("course").value,
    distance: $("distance").value,
  };
}
function applyRecordFilters(source = records) {
  const f = selected();
  return source.filter(
    (r) =>
      (f.year === "All" || String(r.year) === f.year) &&
      (f.stroke === "All" || r.stroke === f.stroke) &&
      (f.course === "All" || r.course === f.course) &&
      (f.distance === "All" || eventLabel(r) === f.distance),
  );
}
function matchingGoals() {
  const f = selected();
  return goals.filter(
    (g) =>
      (f.stroke === "All" || g.stroke === f.stroke) &&
      (f.course === "All" || g.course === f.course) &&
      (f.distance === "All" || eventLabel(g) === f.distance),
  );
}
function currentPB(stroke, course, distance, source = records) {
  const rs = source.filter(
    (r) =>
      r.stroke === stroke &&
      r.course === course &&
      Number(r.distance) === Number(distance),
  );
  return rs.length ? Math.min(...rs.map((r) => r.time)) : null;
}
function goalProgress(g, source) {
  const first = firstRecord(source, g.stroke, g.course, g.distance),
    pb = currentPB(g.stroke, g.course, g.distance, source);
  if (pb == null || !first)
    return {
      baseline: first?.time ?? null,
      pb,
      percent: 0,
      remaining: null,
      met: false,
    };
  if (pb <= g.target)
    return { baseline: first.time, pb, percent: 100, remaining: 0, met: true };
  if (first.time <= g.target)
    return {
      baseline: first.time,
      pb,
      percent: 100,
      remaining: Math.max(0, pb - g.target),
      met: false,
    };
  const percent = Math.max(
    0,
    Math.min(100, ((first.time - pb) / (first.time - g.target)) * 100),
  );
  return {
    baseline: first.time,
    pb,
    percent,
    remaining: Math.max(0, pb - g.target),
    met: false,
  };
}

function buildFilters() {
  const years = unique(records.map((r) => r.year)).sort((a, b) => b - a);
  $("year").innerHTML =
    '<option value="All">All years</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");
  buildDistanceFilter();
}
function buildDistanceFilter() {
  const f = selected();
  const candidates = [...records, ...goals].filter(
    (x) =>
      (f.stroke === "All" || x.stroke === f.stroke) &&
      (f.course === "All" || x.course === f.course),
  );
  const ds = unique(candidates.map(eventLabel)).sort(
    (a, b) => distanceSortValue(a) - distanceSortValue(b),
  );
  const old = $("distance").value;
  $("distance").innerHTML =
    '<option value="All">All distances</option>' +
    ds.map((d) => `<option value="${d}">${d}</option>`).join("");
  $("distance").value = ds.includes(old) ? old : "All";
}
function filterSummary() {
  const f = selected(),
    parts = [];
  if (f.year !== "All") parts.push(f.year);
  if (f.stroke !== "All")
    parts.push(f.stroke === "Individual Medley" ? "IM" : f.stroke);
  if (f.course !== "All") parts.push(f.course);
  if (f.distance !== "All") parts.push(f.distance);
  const count = applyRecordFilters().length;
  $("filterSummary").textContent = parts.length
    ? `Current view: ${parts.join(" · ")} · ${count} swim${count === 1 ? "" : "s"}`
    : `Showing all available data · ${count} swims`;
}
function renderHeader() {
  const age = currentAge(profile);
  $('swimmerName').textContent =
  profile.id === 'sofia-li'
    ? `🐬 ${profile.name}`
    : profile.name;
  $("swimmerMeta").textContent = [
    age != null ? `Age ${age}` : null,
    profile.gender === "F" ? "Girls" : profile.gender === "M" ? "Boys" : null,
    profile.team,
  ]
    .filter(Boolean)
    .join(" · ");
  $("sourceLinkWrap").innerHTML = profile.sourceUrl
    ? `<a class="back-link" href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noopener">Source data ↗</a>`
    : "";
  document.title = `${profile.name} — Swim Progress`;
}
function renderMetrics() {
  const view = applyRecordFilters(),
    pbs = pbMap(view),
    meets = unique(view.map((r) => r.meetId || r.meet)),
    latest = latestRecord(view);
  $("metricPBs").textContent = pbs.size;
  $("metricResults").textContent = view.length;
  $("metricMeets").textContent = meets.length;
  $("metricLatest").textContent = latest
    ? `${formatDate(latest.date)} · ${eventLabel(latest)}`
    : "—";
}

function renderNextStandards() {
  const grid = $("nextStandards"),
    view = applyRecordFilters(),
    pbs = [...pbMap(view).values()].sort((a, b) => {
      const s = STROKE_ORDER.indexOf(a.stroke) - STROKE_ORDER.indexOf(b.stroke);
      return s || distanceSortValue(a) - distanceSortValue(b);
    }),
    cards = [];
  for (const r of pbs) {
    const t = getStandardTable(r, profile, standards);
    const ev = evaluateStandard(r.time, t, standards);
    if (!t || !ev || !ev.next) continue;
    cards.push(
      `<article class="next-card"><h3>${escapeHtml(r.stroke)} · ${eventLabel(r)}</h3><div class="row"><span>Current PB</span><strong>${formatSwimTime(r.time)}</strong></div><div class="row"><span>Current</span>${badgeHtml(ev)}</div><div class="next-bar"><span class="next-dot"></span><span class="next-line"></span><span class="badge sb-${ev.next}">${ev.next}</span></div><div class="big">${formatSwimTime(ev.gap)} to ${ev.next}</div><div class="note">Target: ${formatSwimTime(ev.nextCutoff)}</div></article>`,
    );
  }
  grid.innerHTML = cards.length
    ? cards.join("")
    : '<div class="empty">No next-standard targets are available for records in the current view.</div>';
}
function renderPBs() {
  const cards = [...pbMap(applyRecordFilters()).values()].sort((a, b) => {
    const s = STROKE_ORDER.indexOf(a.stroke) - STROKE_ORDER.indexOf(b.stroke);
    return s || distanceSortValue(a) - distanceSortValue(b);
  });
  $("pbGrid").innerHTML = cards.length
    ? cards
        .map((r) => {
          const ev = evaluateStandard(
            r.time,
            getStandardTable(r, profile, standards),
            standards,
          );
          return `<article class="pb-card"><h3>${escapeHtml(r.stroke)} · ${eventLabel(r)}</h3><div class="pb-time">${formatSwimTime(r.time)}</div><div class="muted">${escapeHtml(r.meet)}<br>${formatDate(r.date)}</div><div class="row"><span>Standard</span>${badgeHtml(ev)}</div>${ev?.next ? `<div class="note">Next: ${ev.next} · ${formatSwimTime(ev.gap)} away</div>` : ""}</article>`;
        })
        .join("")
    : '<div class="empty">No personal bests match the current view.</div>';
}
function renderGoals() {
  const view = applyRecordFilters(),
    gs = matchingGoals();
  $("goalGrid").innerHTML = gs.length
    ? gs
        .map((g) => {
          const p = goalProgress(g, view),
            ev =
              p.pb != null
                ? evaluateStandard(
                    p.pb,
                    getStandardTable(g, profile, standards),
                    standards,
                  )
                : null;
          return `<article class="goal-card"><h3>${escapeHtml(g.stroke)} · ${eventLabel(g)}</h3><div class="muted">${escapeHtml(g.label || "Goal")}</div><div class="row"><span>Current-view PB</span><strong>${formatSwimTime(p.pb)}</strong></div><div class="row"><span>Target</span><strong>${formatSwimTime(g.target)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${p.percent.toFixed(1)}%"></div></div><div class="row"><span>Progress</span><strong>${p.percent.toFixed(0)}%</strong></div><div class="row"><span>Remaining</span><strong>${formatSwimTime(p.remaining)}</strong></div><div class="row"><span>Standard</span>${badgeHtml(ev)}</div>${p.met ? '<div class="note"><strong>Goal achieved ✓</strong></div>' : ""}</article>`;
        })
        .join("")
    : '<div class="empty">No configured goals match the current course, stroke, and distance filters.</div>';
}
function renderStandards() {
  const age = currentAge(profile),
    bracket = getAgeBracket(age, standards),
    genderLabel =
      profile.gender === "F"
        ? "Girls"
        : profile.gender === "M"
          ? "Boys"
          : "Unknown",
    f = selected(),
    view = applyRecordFilters();
  const filterText = [
    f.year !== "All" ? `PBs from ${f.year}` : null,
    f.stroke !== "All" ? f.stroke : null,
    f.course !== "All" ? f.course : null,
    f.distance !== "All" ? f.distance : null,
  ]
    .filter(Boolean)
    .join(" · ");
  $("standardsNote").innerHTML = bracket
    ? `<strong>${escapeHtml(standards.source || "USA Swimming Motivational Standards")}</strong> · ${bracket.key} ${genderLabel} · age ${age}. ${filterText ? `Displayed standards are filtered to <strong>${escapeHtml(filterText)}</strong>. ` : ""}Year filters PB annotations only; official cutoff times do not change by year.`
    : `No configured standards bracket is available for age ${age ?? "unknown"}.`;
  if (!bracket) {
    $("standardsReference").innerHTML =
      '<div class="empty">No standards available.</div>';
    return;
  }
  const courses = f.course === "All" ? ["SCY", "SCM"] : [f.course],
    sections = [];
  for (const course of courses) {
    const group = standards.courses?.[course]?.[profile.gender]?.[bracket.key];
    if (!group) continue;
    const rows = [];
    for (const stroke of STROKE_ORDER) {
      if (f.stroke !== "All" && stroke !== f.stroke) continue;
      const dm = group[stroke] || {};
      for (const d of Object.keys(dm).sort(
        (a, b) => distanceSortValue(a) - distanceSortValue(b),
      )) {
        if (f.distance !== "All" && d !== f.distance) continue;
        rows.push({ stroke, d, table: dm[d] });
      }
    }
    if (rows.length) sections.push({ course, rows });
  }
  if (!sections.length) {
    $("standardsReference").innerHTML =
      '<div class="empty">No official standards match the current filters.</div>';
    return;
  }
  const levels = standards.levels || [];
  $("standardsReference").innerHTML = sections
    .map(
      (sec) =>
        `<h3>${sec.course === "SCY" ? "Short Course Yards (SCY)" : "Short Course Meters (SCM)"}</h3><div class="table-wrap"><table><thead><tr><th>Event</th>${levels.map((l) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${sec.rows
          .map((x) => {
            const dist = parseInt(x.d, 10),
              pb = currentPB(x.stroke, sec.course, dist, view),
              ev = pb != null ? evaluateStandard(pb, x.table, standards) : null;
            return `<tr><td>${escapeHtml(x.stroke)} · ${x.d}${pb != null ? `<div class="note">PB in view ${formatSwimTime(pb)} · ${badgeHtml(ev)}</div>` : ""}</td>${levels.map((l) => `<td>${typeof x.table[l] === "number" ? formatTimeOnly(x.table[l]) : "—"}</td>`).join("")}</tr>`;
          })
          .join("")}</tbody></table></div>`,
    )
    .join("");
}
function renderHistory() {
  const rows = applyRecordFilters()
      .slice()
      .sort((a, b) => {
        const c = compareRows(a, b, sortState.field);
        return sortState.direction === "asc" ? c : -c;
      }),
    pages = Math.max(1, Math.ceil(rows.length / historyPageSize));
  historyPage = Math.min(Math.max(1, historyPage), pages);
  const start = (historyPage - 1) * historyPageSize,
    pageRows = rows.slice(start, start + historyPageSize),
    tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = pageRows.length
    ? pageRows
        .map((r) => {
          const ev = evaluateStandard(
            r.time,
            getStandardTable(r, profile, standards, r.age),
            standards,
          );
          return `<tr><td>${formatDate(r.date)}</td><td>${r.year}</td><td>${escapeHtml(r.stroke)}</td><td>${eventLabel(r)}</td><td>${formatSwimTime(r.time)}</td><td>${badgeHtml(ev)}</td><td>${escapeHtml(r.meet)}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="7" class="empty">No records match the current view.</td></tr>';
  $("pageInfo").textContent =
    `${rows.length ? start + 1 : 0}-${Math.min(start + historyPageSize, rows.length)} of ${rows.length} · Page ${historyPage} of ${pages}`;
  $("firstPage").disabled = $("prevPage").disabled = historyPage <= 1;
  $("nextPage").disabled = $("lastPage").disabled = historyPage >= pages;
}
function renderCharts() {
  const view = applyRecordFilters();
  renderProgressChart(view);
  renderPBProgress(view);
  renderRadar(view);
}
function progressTabVisible() {
  return $("tab-progress").classList.contains("active");
}
function renderAll() {
  filterSummary();
  renderMetrics();
  renderPBs();
  renderGoals();
  renderStandards();
  renderHistory();
  renderNextStandards();
  if (progressTabVisible())
    requestAnimationFrame(() => {
      renderCharts();
      requestAnimationFrame(resizeCharts);
    });
}
function resetFilters() {
  $("year").value = "All";
  $("stroke").value = "All";
  $("course").value = "All";
  buildDistanceFilter();
  $("distance").value = "All";
  historyPage = 1;
  renderAll();
}

function setupEvents() {
  document.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) =>
          p.classList.toggle("active", p.id === `tab-${b.dataset.tab}`),
        );
      if (b.dataset.tab === "progress")
        requestAnimationFrame(() => {
          renderCharts();
          requestAnimationFrame(resizeCharts);
        });
    }),
  );
  ["year", "stroke", "course"].forEach((id) =>
    $(id).addEventListener("change", () => {
      buildDistanceFilter();
      historyPage = 1;
      renderAll();
    }),
  );
  $("distance").addEventListener("change", () => {
    historyPage = 1;
    renderAll();
  });
  $("resetFilters").addEventListener("click", resetFilters);
  $("pageSize").addEventListener("change", (e) => {
    historyPageSize = Number(e.target.value) || 25;
    historyPage = 1;
    renderHistory();
  });
  $("firstPage").onclick = () => {
    historyPage = 1;
    renderHistory();
  };
  $("prevPage").onclick = () => {
    historyPage = Math.max(1, historyPage - 1);
    renderHistory();
  };
  $("nextPage").onclick = () => {
    historyPage++;
    renderHistory();
  };
  $("lastPage").onclick = () => {
    historyPage = Math.max(
      1,
      Math.ceil(applyRecordFilters().length / historyPageSize),
    );
    renderHistory();
  };
  document.querySelectorAll("th[data-field]").forEach((th) =>
    th.addEventListener("click", () => {
      const f = th.dataset.field;
      if (sortState.field === f)
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      else sortState = { field: f, direction: "asc" };
      historyPage = 1;
      renderHistory();
    }),
  );
}

try {
  const params = new URLSearchParams(location.search),
    cfg = await loadAppConfig();
  let id = params.get("swimmer") || cfg.defaultSwimmerId;
  ({
    swimmer: swimmerDoc,
    goals,
    standards,
    directory,
  } = await loadDashboardData(id));
  profile = swimmerDoc.profile;
  records = swimmerDoc.records || [];
  renderHeader();
  buildFilters();
  setupEvents();
  renderAll();
  $("loading").classList.add("hide");
  $("app").classList.remove("hide");
} catch (e) {
  $("loading").classList.add("hide");
  $("error").textContent =
    `${e.message}. If you opened the HTML directly, start the included local server and open the http://localhost address instead.`;
  $("error").classList.remove("hide");
}
