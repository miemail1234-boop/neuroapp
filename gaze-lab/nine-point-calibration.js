// Nine-point calibration workflow.
// The subject visits 9 calibration points in a fixed order; the 4 extreme points are the screen corners.
(function(){
  const ORDER=['tl','tc','tr','cr','c','cl','bl','bc','br'];
  const LABELS={tl:'alto sinistra',tc:'alto centro',tr:'alto destra',cr:'centro destra',c:'centro',cl:'centro sinistra',bl:'basso sinistra',bc:'basso centro',br:'basso destra'};
  function id(x){return document.getElementById(x)}
  function status(title,text,kind='ready'){
    const b=id('statusBand'),t=id('statusTitle'),s=id('statusText');
    if(b&&t&&s){b.className='status-band '+kind;t.textContent=title;s.textContent=text}
  }
  function finite(x){return Number.isFinite(Number(x))}
  function byKey(k){return typeof P!=='undefined'?P.find(p=>p.key===k):null}
  function calStart(){return Number(String(id('calStartSec')?.value??'').replace(',','.'))}
  function calEnd(){return Number(String(id('calEndSec')?.value??'').replace(',','.'))}
  function inWindow(f){
    const a=calStart(),b=calEnd();
    if(!Number.isFinite(a)||!Number.isFinite(b))return false;
    return f.t>=Math.min(a,b)&&f.t<=Math.max(a,b);
  }
  function candidates(){
    if(typeof S==='undefined')return [];
    return (S.fix||[]).filter(inWindow).filter(f=>finite(f.x)&&finite(f.y)).sort((a,b)=>(a.start??a.t)-(b.start??b.t));
  }
  function chooseNine(list){
    if(list.length<=9)return list.slice(0,9);
    const a=calStart(),b=calEnd(),lo=Math.min(a,b),hi=Math.max(a,b),span=(hi-lo)/9;
    const picked=[],used=new Set();
    for(let i=0;i<9;i++){
      const x0=lo+i*span,x1=lo+(i+1)*span;
      const bin=list.filter(f=>!used.has(f.id)&&f.t>=x0&&f.t<=x1);
      let best=(bin.length?bin:list.filter(f=>!used.has(f.id))).sort((u,v)=>(v.dur||0)-(u.dur||0))[0];
      if(best){picked.push(best);used.add(best.id)}
    }
    return picked.sort((a,b)=>(a.start??a.t)-(b.start??b.t)).slice(0,9);
  }
  function setCornersFromPairs(){
    if(typeof S==='undefined')return;
    ['tl','tr','br','bl'].forEach(k=>{const fx=S.pairs?.[k]?.fx;if(fx)S.corners[k]={x:fx.x,y:fx.y}});
  }
  function computeObsWithCorners(){
    if(typeof Hinv!=='function'||typeof proj!=='function'||typeof S==='undefined')return false;
    const hi=Hinv();
    if(!hi)return false;
    Object.values(S.pairs||{}).forEach(pair=>{if(pair.fx){const q=proj(hi,pair.fx.x,pair.fx.y);if(q)pair.obs=q}});
    return true;
  }
  function suggestNineByOrder(){
    if(typeof S==='undefined'||typeof P==='undefined')return;
    const list=chooseNine(candidates());
    if(list.length<9){
      status('Fissazioni insufficienti','Nella finestra di calibrazione ho trovato '+list.length+' fissazioni utili. Allarga o correggi la finestra inizio/fine calibrazione.','warn');
      return;
    }
    S.pairs={};
    ORDER.forEach((key,i)=>{const pt=byKey(key),fx=list[i];S.pairs[key]={pt,fx,obs:{x:NaN,y:NaN}}});
    setCornersFromPairs();
    computeObsWithCorners();
    if(typeof spatial==='function')spatial();
    if(typeof render==='function')render();
    status('9 punti suggeriti','Ho associato le fissazioni in ordine temporale: alto sinistra, alto centro, alto destra, centro destra, centro, centro sinistra, basso sinistra, basso centro, basso destra. I 4 estremi sono usati automaticamente come angoli dello schermo.');
  }
  function install(){
    const oldBtn=id('suggestCalPairsBtn');
    if(oldBtn){oldBtn.textContent='Suggerisci 9 punti in ordine';oldBtn.title='Usa le fissazioni nella finestra di calibrazione, ordinate temporalmente secondo il protocollo a 9 punti.';oldBtn.onclick=suggestNineByOrder}
    const section2=[...document.querySelectorAll('.panel-card')].find(sec=>sec.textContent.includes('Area della griglia nel video')||sec.textContent.includes('Griglia di calibrazione nel video'));
    if(section2){
      section2.style.display='none';
    }
    const h=[...document.querySelectorAll('h2')].find(x=>x.textContent.includes('Calibrazione a 9 punti'));
    if(h){
      const p=h.closest('.panel-card')?.querySelector('.hint');
      if(p)p.textContent='Imposta la finestra della calibrazione a 9 punti. Poi usa “Suggerisci 9 punti in ordine”: l’app associa le fissazioni secondo l’ordine del protocollo e usa automaticamente i 4 punti estremi come angoli dello schermo.';
    }
  }
  const oldFit=window.fitCal;
  window.fitCal=function(){
    if(typeof S!=='undefined'&&Object.keys(S.pairs||{}).length>=4){
      setCornersFromPairs();
      computeObsWithCorners();
    }
    if(oldFit)return oldFit();
  };
  const oldRender=window.render;
  window.render=function(){if(oldRender)oldRender();setTimeout(install,0)};
  setInterval(install,700);
  install();
})();
