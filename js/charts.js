import {STROKE_ORDER,eventLabel,eventKey,formatDate,formatSwimTime,formatTimeOnly} from './utils.js';
const palette=['#1565C0','#D32F2F','#2E7D32','#6A1B9A','#EF6C00','#00838F','#AD1457','#5D4037','#283593','#9E9D24','#C62828','#00796B','#4527A0','#F9A825','#0277BD','#558B2F'];
let progressChart,pbChart,radarChart;
function legend(id,datasets){const el=document.getElementById(id);if(!el)return;el.innerHTML=datasets.map(d=>`<div class="legend-item"><span class="legend-swatch" style="background:${d.borderColor}"></span><span class="legend-label" title="${d.label}">${d.label}</span></div>`).join('')}
function sortEvents(a,b){const sa=STROKE_ORDER.indexOf(a.stroke)-STROKE_ORDER.indexOf(b.stroke);if(sa)return sa;return Number(a.distance)-Number(b.distance)}
export function renderProgressChart(records,courseSuffix){
  const course=courseSuffix==='Y'?'SCY':'SCM';const filtered=records.filter(r=>r.course===course);const groups=new Map();
  for(const r of filtered){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const entries=[...groups.values()].sort((a,b)=>sortEvents(a[0],b[0]));
  const datasets=entries.map((rows,i)=>{rows=rows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));const color=palette[i%palette.length];return {label:`${rows[0].stroke} · ${eventLabel(rows[0])}`,data:rows.map(r=>({x:formatDate(r.date),y:r.time,meet:r.meet})),parsing:false,borderColor:color,backgroundColor:color,tension:.2,fill:false,pointRadius:5,pointHoverRadius:7}});
  legend('progressLegend',datasets);if(progressChart)progressChart.destroy();
  progressChart=new Chart(document.getElementById('progressChart'),{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,parsing:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${formatSwimTime(i.raw.y)} — ${i.raw.meet}`}}},scales:{x:{type:'category',title:{display:true,text:'Meet Date'}},y:{ticks:{callback:formatTimeOnly},title:{display:true,text:'Swim Time (Lower Is Faster)'}}}}});
}
export function renderPBProgress(records){
  const groups=new Map();for(const r of records){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const entries=[...groups.values()].sort((a,b)=>sortEvents(a[0],b[0]));
  const datasets=entries.map((rows,i)=>{rows=rows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));let best=Infinity;const pts=[];for(const r of rows){if(r.time<best){best=r.time;pts.push({x:formatDate(r.date),y:r.time,meet:r.meet})}}const color=palette[i%palette.length];return {label:`${rows[0].stroke} · ${eventLabel(rows[0])} PB`,data:pts,parsing:false,borderColor:color,backgroundColor:color,stepped:'after',fill:false,pointRadius:5}});
  legend('pbLegend',datasets);if(pbChart)pbChart.destroy();
  pbChart=new Chart(document.getElementById('pbProgressChart'),{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,parsing:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:i=>`${i.dataset.label}: ${formatSwimTime(i.raw.y)} — ${i.raw.meet}`}}},scales:{x:{type:'category',title:{display:true,text:'PB Date'}},y:{ticks:{callback:formatTimeOnly},title:{display:true,text:'Personal Best Time'}}}}});
}
export function renderRadar(goals,progressFn){const vals=STROKE_ORDER.map(s=>{const gs=goals.filter(g=>g.stroke===s);return gs.length?Math.round(gs.reduce((sum,g)=>sum+progressFn(g).percent,0)/gs.length):0});if(radarChart)radarChart.destroy();radarChart=new Chart(document.getElementById('strokeRadarChart'),{type:'radar',data:{labels:STROKE_ORDER.map(s=>s==='Individual Medley'?'IM':s),datasets:[{label:'Goal Completion %',data:vals,borderColor:'#1976d2',backgroundColor:'rgba(25,118,210,.16)',pointBackgroundColor:'#1976d2'}]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:100,ticks:{stepSize:20,backdropColor:'transparent'}}}}})}
export function resizeCharts(){progressChart?.resize();pbChart?.resize();radarChart?.resize()}
