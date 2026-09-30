const jsonCache = new Map();
async function getJson(path){
  if(jsonCache.has(path)) return jsonCache.get(path);
  const p=fetch(path).then(r=>{if(!r.ok) throw new Error(`Unable to load ${path} (${r.status})`);return r.json()});
  jsonCache.set(path,p); return p;
}
export const loadDirectory=()=>getJson('data/swimmers.json');
export const loadAppConfig=()=>getJson('data/app-config.json');
export async function loadSwimmer(id){
  const directory=await loadDirectory();
  const entry=directory.swimmers.find(s=>s.id===id);
  if(!entry) throw new Error(`Unknown swimmer: ${id}`);
  return getJson(entry.dataFile);
}
export async function loadGoals(id){
  try{return await getJson(`data/goals/${id}.json`)}catch{return {swimmerId:id,goals:[]}}
}
export async function loadStandards(){const c=await loadAppConfig();return getJson(c.standardsFile)}
export async function loadDashboardData(id){
  const [swimmer,goals,standards,directory]=await Promise.all([loadSwimmer(id),loadGoals(id),loadStandards(),loadDirectory()]);
  return {swimmer,goals:goals.goals||[],standards,directory};
}
