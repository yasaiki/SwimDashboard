export const MANUAL_RESULTS_KEY = "swimProgressManualResultsV1";

const jsonCache = new Map();
async function requestJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Unable to load ${path} (HTTP ${response.status}). Check that this file exists under the server's project folder.`);
    try { return await response.json(); }
    catch { throw new Error(`${path} is not valid JSON. Check the file for missing commas or an HTML error page returned by the server.`); }
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Loading ${path} timed out. Check that your local web server is running, then retry.`);
    throw error;
  } finally { clearTimeout(timeout); }
}
async function getJson(path) {
  if (jsonCache.has(path)) return jsonCache.get(path);
  // Share only concurrent requests. Retaining resolved JSON here hid file
  // replacements until the whole page was reloaded.
  const pending = requestJson(path).finally(() => {
    if (jsonCache.get(path) === pending) jsonCache.delete(path);
  });
  jsonCache.set(path, pending);
  return pending;
}
export async function loadDirectory() {
  const directory = await getJson("data/swimmers.json");
  if (!directory || !Array.isArray(directory.swimmers)) throw new Error("data/swimmers.json must contain a swimmers array.");
  for (const entry of directory.swimmers) {
    if (!entry || typeof entry.id !== "string" || !entry.id || typeof entry.dataFile !== "string" || !entry.dataFile.trim())
      throw new Error("Every swimmer in data/swimmers.json needs an id and a dataFile path.");
  }
  return directory;
}
export const loadAppConfig = () => getJson("data/app-config.json");

// Admin drafts remain private to the editor until exported and saved into
// the project. Dashboard reads always use the authoritative on-disk document.
export const ADMIN_DRAFTS_KEY = "swimProgressAdminDocumentsV2";
const clone = (value) => JSON.parse(JSON.stringify(value));
function stored(key, fallback) {
  const raw = localStorage.getItem(key);
  const value = raw ? JSON.parse(raw) : fallback;
  if (key === MANUAL_RESULTS_KEY && (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object")))
    throw new Error("Invalid saved manual results");
  if (key === ADMIN_DRAFTS_KEY && (!value || typeof value !== "object" || Array.isArray(value)))
    throw new Error("Invalid saved admin drafts");
  return value;
}
function signature(r) {
  return JSON.stringify([r.date, r.course, Number(r.distance), r.stroke,
    r.status === "DQ" || r.time == null || r.time === "DQ" ? "DQ" : Number(r.time), r.meet]);
}
export async function loadSwimmerSource(id, fresh = false) {
  const directory = await loadDirectory();
  const entry = directory.swimmers.find((s) => s.id === id);
  if (!entry) throw new Error(`Unknown swimmer: ${id}`);
  const path = entry.dataFile.replace(/\\/g, "/");
  const doc = await (fresh ? requestJson(path) : getJson(path));
  if (!doc.profile || !Array.isArray(doc.records)) throw new Error("Invalid swimmer document");
  return { entry, doc: clone(doc) };
}
// The on-disk schema uses a numeric time or the literal "DQ", not status.
// Export deliberately selects only the fields in that schema, in its order.
export function exportSwimmerDocument(document) {
  return { ...clone(document), records: document.records.map((record, index) => {
    const isDQ = record.status === "DQ" || record.time == null || String(record.time).trim().toUpperCase() === "DQ";
    const time = isDQ ? "DQ" : Number(record.time);
    const distance = Number(record.distance);
    if ((!isDQ && (!Number.isFinite(time) || time <= 0)) || !Number.isFinite(distance) || distance <= 0)
      throw new Error(`Record ${index + 1} has an invalid time or distance. Correct it before exporting.`);
    const meet = String(record.meet ?? "");
    const slug = (value) => value.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
    const meetId = record.meetId || slug(/^\d{4}-\d{2}-\d{2}(?:[- _]|$)/.test(meet) ? meet : `${record.date}-${meet}`);
    // Preserve all supplied IDs. Only older records without an ID need a
    // deterministic fallback so Copy and Export produce identical documents.
    let hash = 2166136261;
    for (const character of JSON.stringify([record.date,record.course,distance,record.stroke,time,meet,index]))
      hash = Math.imul(hash ^ character.charCodeAt(0),16777619) >>> 0;
    return {
      date: record.date,
      year: Number(record.year ?? String(record.date).slice(0,4)),
      stroke: record.stroke,
      distance,
      time,
      meet,
      age: record.age == null || record.age === "" ? null : Number(record.age),
      id: record.id || `swim_${hash.toString(16).padStart(8,"0")}`,
      meetId,
      course: record.course,
      legacyDistance: `${distance}${record.course === "SCY" ? "Y" : "M"}`
    };
  }) };
}
function sameDocument(a, b) {
  return JSON.stringify(exportSwimmerDocument(a)) === JSON.stringify(exportSwimmerDocument(b));
}
export async function loadAdminDocument(id, fresh = false) {
  const { entry, doc: base } = await loadSwimmerSource(id, fresh);
  let drafts, manual;
  try {
    drafts = stored(ADMIN_DRAFTS_KEY, {});
    manual = stored(MANUAL_RESULTS_KEY, []);
    const draft = drafts[id];
    if (draft && (!draft.base || !draft.document || !draft.document.profile || !Array.isArray(draft.document.records)))
      throw new Error("Invalid saved swimmer draft");
  } catch (error) {
    return { entry, base, document: clone(base), conflict: false, hasDraft: false,
      storageWarning: `Saved browser changes could not be read (${error.message}). Showing the data file only. Editing and export are disabled to protect saved changes. Check browser storage permissions or use another browser to access the source file.`, readOnly: true };
  }
  const draft = drafts[id];
  if (draft) {
    const saved = sameDocument(base, draft.document);
    const conflict = !saved && !sameDocument(base, draft.base);
    return { entry, base, document: clone(saved ? base : draft.document), conflict, hasDraft: !saved };
  }
  // Carry forward earlier manual entries, but never duplicate an entry already
  // copied into the source file. IDs alone are unreliable in older data.
  const document = clone(base);
  const known = new Set(document.records.map(signature));
  for (const row of manual.filter((r) => r.swimmerId === id)) {
    if (known.has(signature(row))) continue;
    const { swimmerId, swimmerName, ...record } = row;
    document.records.push(record);
    known.add(signature(row));
  }
  return { entry, base, document, conflict: false,
    hasDraft: document.records.length !== base.records.length };
}
export function saveAdminDocument(id, base, document) {
  const drafts = stored(ADMIN_DRAFTS_KEY, {});
  drafts[id] = { base: clone(base), document: clone(document) };
  // Persist first; quota/privacy errors must not claim the edit succeeded.
  localStorage.setItem(ADMIN_DRAFTS_KEY, JSON.stringify(drafts));
}
export function discardAdminDocument(id) {
  const drafts = stored(ADMIN_DRAFTS_KEY, {});
  delete drafts[id];
  const manual = stored(MANUAL_RESULTS_KEY, []);
  localStorage.setItem(MANUAL_RESULTS_KEY, JSON.stringify(manual.filter((r) => r.swimmerId !== id)));
  localStorage.setItem(ADMIN_DRAFTS_KEY, JSON.stringify(drafts));
}
export async function loadSwimmer(id) {
  // Browser drafts and older manual entries must never override corrections
  // or resurrect records deleted from the saved swimmer file.
  const { doc } = await loadSwimmerSource(id, true);
  return doc;
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
  const entry = directory.swimmers.find((swimmer) => swimmer.id === id);
  return { swimmer, goals: goals.goals || [], standards, directory,
    dataFile: entry.dataFile.replace(/\\/g, "/") };
}