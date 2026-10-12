export const MANUAL_RESULTS_KEY = "swimProgressManualResultsV1";

const jsonCache = new Map();
async function getJson(path) {
  if (jsonCache.has(path)) return jsonCache.get(path);
  const p = fetch(path).then((r) => {
    if (!r.ok) throw new Error(`Unable to load ${path} (${r.status})`);
    return r.json();
  });
  jsonCache.set(path, p);
  return p;
}
export const loadDirectory = () => getJson("data/swimmers.json");
export const loadAppConfig = () => getJson("data/app-config.json");

// Results entered in admin.html are stored client-side in localStorage,
// keyed by swimmerId. We read and normalize them into the same record
// shape used by the swimmer JSON files so they merge seamlessly.
function loadManualResults(swimmerId) {
  try {
    const raw = localStorage.getItem(MANUAL_RESULTS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    return all
      .filter((r) => r.swimmerId === swimmerId)
      .map((r) => ({
        date: r.date,
        year: r.year,
        stroke: r.stroke,
        distance: r.distance,
        course: r.course,
        time: r.status === "DQ" ? null : r.time,
        status: r.status || (r.time == null ? "DQ" : "TIME"),
        meet: r.meet,
        age: r.age ?? null,
        source: "admin",
      }));
  } catch {
    return [];
  }
}

export async function loadSwimmer(id) {
  const directory = await loadDirectory();
  const entry = directory.swimmers.find((s) => s.id === id);
  if (!entry) throw new Error(`Unknown swimmer: ${id}`);
  const doc = await getJson(entry.dataFile);
  const manual = loadManualResults(id);
  if (!manual.length) return doc;
  // Return a shallow copy so the cached base document is never mutated.
  return { ...doc, records: [...(doc.records || []), ...manual] };
}

export async function loadGoals(id) {
  try {
    return await getJson(`data/goals/${id}.json`);
  } catch {
    return { swimmerId: id, goals: [] };
  }
}
export async function loadStandards() {
  const c = await loadAppConfig();
  return getJson(c.standardsFile);
}
export async function loadDashboardData(id) {
  const [swimmer, goals, standards, directory] = await Promise.all([
    loadSwimmer(id),
    loadGoals(id),
    loadStandards(),
    loadDirectory(),
  ]);
  return { swimmer, goals: goals.goals || [], standards, directory };
}