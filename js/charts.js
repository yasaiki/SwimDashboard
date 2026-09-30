import {STROKE_ORDER,eventLabel,eventKey,formatDate,formatSwimTime,formatTimeOnly} from './utils.js';

const palette=['#1565C0','#D32F2F','#2E7D32','#6A1B9A','#EF6C00','#00838F','#AD1457','#5D4037','#283593','#9E9D24','#C62828','#00796B','#4527A0','#F9A825','#0277BD','#558B2F'];
let progressChart,pbChart,radarChart;

function legend(id,datasets,emptyText='No data matches the current filters.'){
  const el=document.getElementById(id);
  if(!el)return;
  el.innerHTML=datasets.length
    ? datasets.map(d=>`<div class="legend-item"><span class="legend-swatch" style="background:${d.borderColor}"></span><span class="legend-label" title="${d.label}">${d.label}</span></div>`).join('')
    : `<div class="empty">${emptyText}</div>`;
}

function sortEvents(a,b){
  const sa=STROKE_ORDER.indexOf(a.stroke)-STROKE_ORDER.indexOf(b.stroke);
  if(sa)return sa;
  if(a.course!==b.course)return a.course==='SCM'?-1:1;
  return Number(a.distance)-Number(b.distance);
}
function chartX(record){return new Date(`${record.date}T00:00:00`).getTime()}
function shortAxisDate(value){const d=new Date(Number(value));if(Number.isNaN(d.getTime()))return '';return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${String(d.getFullYear()).slice(-2)}`}
function chronologicalScale(title){return {type:'linear',title:{display:true,text:title},ticks:{maxTicksLimit:9,callback:value=>shortAxisDate(value)}}}

export function renderProgressChart(records){
  const groups=new Map();
  for(const r of records){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const entries=[...groups.values()].sort((a,b)=>sortEvents(a[0],b[0]));
  const datasets=entries.map((sourceRows,i)=>{
    const rows=sourceRows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const color=palette[i%palette.length];
    return {label:`${rows[0].stroke} · ${eventLabel(rows[0])}`,data:rows.map(r=>({x:chartX(r),y:r.time,date:r.date,meet:r.meet})),parsing:false,borderColor:color,backgroundColor:color,tension:.18,fill:false,pointRadius:4,pointHoverRadius:7,spanGaps:false};
  });
  legend('progressLegend',datasets);
  progressChart?.destroy();progressChart=null;
  const canvas=document.getElementById('progressChart');if(!canvas||!datasets.length)return;
  progressChart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,parsing:false,normalized:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items.length?formatDate(items[0].raw.date):'',label:i=>`${i.dataset.label}: ${formatSwimTime(i.raw.y)} — ${i.raw.meet}`}}},scales:{x:chronologicalScale('Meet Date'),y:{ticks:{callback:formatTimeOnly},title:{display:true,text:'Swim Time (Lower Is Faster)'}}}}});
}

export function renderPBProgress(records){
  const groups=new Map();for(const r of records){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const entries=[...groups.values()].sort((a,b)=>sortEvents(a[0],b[0]));
  const datasets=entries.map((sourceRows,i)=>{
    const rows=sourceRows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));let best=Infinity;const pts=[];
    for(const r of rows){if(r.time<best){best=r.time;pts.push({x:chartX(r),y:r.time,date:r.date,meet:r.meet})}}
    const color=palette[i%palette.length];
    return {label:`${rows[0].stroke} · ${eventLabel(rows[0])} PB`,data:pts,parsing:false,borderColor:color,backgroundColor:color,stepped:'after',fill:false,pointRadius:4,pointHoverRadius:7};
  });
  legend('pbLegend',datasets);
  pbChart?.destroy();pbChart=null;
  const canvas=document.getElementById('pbProgressChart');if(!canvas||!datasets.length)return;
  pbChart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,parsing:false,normalized:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items.length?formatDate(items[0].raw.date):'',label:i=>`${i.dataset.label}: ${formatSwimTime(i.raw.y)} — ${i.raw.meet}`}}},scales:{x:chronologicalScale('PB Date'),y:{ticks:{callback:formatTimeOnly},title:{display:true,text:'Personal Best Time'}}}}});
}

function strokeImprovement(records,stroke){
  const groups=new Map();
  for(const r of records.filter(x=>x.stroke===stroke)){const k=eventKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const improvements=[];
  for(const rows of groups.values()){
    const sorted=rows.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));if(!sorted.length)continue;
    const first=Number(sorted[0].time),best=Math.min(...sorted.map(r=>Number(r.time)));
    if(first>0&&Number.isFinite(best))improvements.push(Math.max(0,((first-best)/first)*100));
  }
  return improvements.length?improvements.reduce((a,b)=>a+b,0)/improvements.length:null;
}

export function renderRadar(records){
  const raw=STROKE_ORDER.map(stroke=>strokeImprovement(records,stroke));
  const values=raw.map(v=>v==null?0:Number(v.toFixed(1)));
  const hasData=raw.some(v=>v!=null);
  radarChart?.destroy();radarChart=null;
  const canvas=document.getElementById('strokeRadarChart');if(!canvas)return;
  if(!hasData){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.fillStyle='#6b7280';ctx.textAlign='center';ctx.font='14px Arial';ctx.fillText('No stroke data matches the current filters.',canvas.width/2,Math.max(30,canvas.height/2));ctx.restore();return;
  }
  const maxValue=Math.max(...values,10),suggestedMax=Math.min(100,Math.max(20,Math.ceil(maxValue/10)*10));
  radarChart=new Chart(canvas,{type:'radar',data:{labels:STROKE_ORDER.map(s=>s==='Individual Medley'?'IM':s),datasets:[{label:'PB Improvement %',data:values,borderColor:'#1976d2',backgroundColor:'rgba(25,118,210,.16)',pointBackgroundColor:'#1976d2',pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:item=>`${item.label}: ${item.raw.toFixed(1)}% improvement`}}},scales:{r:{min:0,suggestedMax,ticks:{stepSize:Math.max(5,suggestedMax/4),backdropColor:'transparent'},pointLabels:{font:{size:12}}}}}});
}
export function resizeCharts(){progressChart?.resize();pbChart?.resize();radarChart?.resize()}
