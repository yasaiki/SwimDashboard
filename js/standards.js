import {currentAge,standardDistanceKey} from './utils.js';
export function getAgeBracket(age,standards){return (standards.ageBrackets||[]).find(b=>(b.minAge===undefined||age>=b.minAge)&&(b.maxAge===undefined||age<=b.maxAge))||null}
export function getStandardTable(recordOrGoal,profile,standards,ageOverride=null){
  const age=ageOverride ?? recordOrGoal.age ?? currentAge(profile); if(age==null||!profile.gender)return null;
  const bracket=getAgeBracket(age,standards);if(!bracket)return null;
  const c=recordOrGoal.course, key=standardDistanceKey(recordOrGoal);
  return standards.courses?.[c]?.[profile.gender]?.[bracket.key]?.[recordOrGoal.stroke]?.[key]||null;
}
export function evaluateStandard(time,table,standards){if(!table||time==null)return null;const levels=standards.levels||[];let achieved=null,idx=-1;levels.forEach((l,i)=>{const cut=table[l];if(typeof cut==='number'&&time<=cut){achieved=l;idx=i}});const next=idx+1<levels.length?levels[idx+1]:null;const nextCutoff=next?table[next]:null;const gap=next&&typeof nextCutoff==='number'?Math.max(0,time-nextCutoff):null;return {level:achieved,next,nextCutoff,gap}}
export function badgeHtml(result){if(!result)return '<span class="badge sb-none">N/A</span>';const lvl=result.level||'Below B';const cls=result.level?`sb-${result.level}`:'sb-none';return `<span class="badge ${cls}">${lvl}</span>`}
