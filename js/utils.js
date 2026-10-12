export const STROKE_ORDER = [
  "Freestyle",
  "Back Stroke",
  "Breast Stroke",
  "Butterfly",
  "Individual Medley",
];
export function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}
export function formatSwimTime(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const v = Number(seconds);
  if (v < 60) return `${v.toFixed(2)} sec`;
  const m = Math.floor(v / 60),
    r = v - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}
export function formatTimeOnly(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const v = Number(seconds);
  if (v < 60) return v.toFixed(2);
  const m = Math.floor(v / 60),
    r = v - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
}
export function eventLabel(x) {
  const suffix = x.course === "SCY" ? "Y" : "M";
  return `${x.distance}${suffix}`;
}
export function eventKey(x) {
  return `${x.stroke}|${x.course}|${x.distance}`;
}
export function standardDistanceKey(x) {
  return eventLabel(x);
}
export function distanceSortValue(x) {
  const c =
    typeof x === "string" ? (x.endsWith("Y") ? "SCY" : "SCM") : x.course;
  const n = typeof x === "string" ? parseInt(x, 10) : Number(x.distance);
  return n + (c === "SCY" ? 10000 : 0);
}
export function currentAge(profile) {
  if (profile.birthDate) {
    const dob = new Date(profile.birthDate + "T00:00:00");
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const md = now.getMonth() - dob.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }
  return profile.currentAge ?? null;
}

// A record is a DQ if it's explicitly flagged, or if it simply has no time.
export function isDQ(r) {
  return r.status === "DQ" || r.time == null;
}

// Friendly display for a result cell: "DQ" or the formatted swim time.
export function resultDisplay(r) {
  return isDQ(r) ? "DQ" : formatSwimTime(r.time);
}

// Summer Swim <-> SCM (meters), PVS <-> SCY (yards). Used for filter labels.
export function courseLabel(course) {
  if (course === "SCM") return "Summer Swim (Meters)";
  if (course === "SCY") return "PVS (Yards)";
  return course || "—";
}

export function compareRows(a, b, field) {
  if (field === "date") return new Date(a.date) - new Date(b.date);
  if (field === "time") {
    const at = a.time == null ? Infinity : a.time;
    const bt = b.time == null ? Infinity : b.time;
    return at - bt;
  }
  if (field === "year" || field === "distance")
    return Number(a[field]) - Number(b[field]);
  return String(a[field] ?? "").localeCompare(
    String(b[field] ?? ""),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}
export function unique(arr) {
  return [...new Set(arr)];
}
export function latestRecord(records) {
  return (
    records.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0] ||
    null
  );
}
export function pbMap(records) {
  const m = new Map();
  for (const r of records) {
    if (isDQ(r)) continue;
    const k = eventKey(r);
    if (!m.has(k) || r.time < m.get(k).time) m.set(k, r);
  }
  return m;
}
export function firstRecord(records, stroke, course, distance) {
  return (
    records
      .filter(
        (r) =>
          r.stroke === stroke &&
          r.course === course &&
          Number(r.distance) === Number(distance) &&
          !isDQ(r),
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null
  );
}