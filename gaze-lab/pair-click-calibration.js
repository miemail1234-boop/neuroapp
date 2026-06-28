// Manual two-click calibration inside the scene video.
// For the selected calibration point: first click the real target position, then click the corresponding fixation.
(function(){
  let pairMode=false;
  let step='target';
  let targetPoint=null;
  let targetKey=null;
  const EXTREME_KEYS=new Set(['tl','tr','br','bl']);
  function id(x){return document.getElementById(x)}
  function status(title,text,kind='ready'){
    const b=id('statusBand'),t=id('statusTitle'),s=id('statusText');
    if(b&&t&&s){b.className='status-band '+kind;t.textContent=title;s.textContent=text}
  }
  function selectedKey(){return id('calibrationPointSelect')?.value||'tl'}
  function selectedPoint(){return typeof P!=='undefined'?P.find(p=>p.key===selectedKey()):null}
  function label(pt){return pt?.label||selectedKey()}
  function nextKey(k){
    if(typeof P==='undefined')return k;
    const i=P.findIndex(p=>p.key===k);
    return P[Math.min(P.length-1,i+1)]?.key||k;
  }
  function setSelect(k){const s=id('calibrationPointSelect');if(s)s.value=k}
  function nearestFix(p){
    if(typeof S==='undefined')return null;
    let best=null,dist=1e9;
    const t=typeof recTime==='function'?recTime():NaN;
    let list=(S.fix||[]).filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y));
    // Prefer fixation intervals around the current video time, but allow manual click even if timing is slightly off.
    if(Number.isFinite(t)){
      const local=list.filter(f=>{
        if(Number.isFinite(f.start)&&Number.isFinite(f.end))return t>=f.start-.25&&t<=f.end+.25;
        return Math.abs((f.t||0)-t)<.45;
      });
      if(local.length)list=local;
    }
    list.forEach(f=>{const d=Math.hypot(f.x-p.x,f.y-p.y);if(d<dist){dist=d;best=f}});
    return dist<=120?best:null;
  }
  function updateCornersFromTargets(){
    if(typeof S==='undefined')return;
    Object.entries(S.pairs||{}).forEach(([k,pair])=>{
      if(EXTREME_KEYS.has(k)&&pair.target)S.corners[k]={x:pair.target.x,y:pair.target.y};
    });
  }
  function recomputeObs(){
    if(typeof S==='undefined'||typeof Hinv!=='function'||typeof proj!=='function')return false;
    updateCornersFromTargets();
    const hi=Hinv();
    if(!hi)return false;
    Object.values(S.pairs||{}).forEach(pair=>{
      if(pair.fx){const q=proj(hi,pair.fx.x,pair.fx.y);if(q)pair.obs=q;}
    });
    return true;
  }
  function setPair(pt,realTarget,fx){
    if(typeof S==='undefined')return;
    if(!S.pairs)S.pairs={};
    S.pairs[pt.key]={pt,target:realTarget,fx,obs:{x:NaN,y:NaN}};
    recomputeObs();
    if(typeof spatial==='function')spatial();
    if(typeof render==='function')render();
    const nk=nextKey(pt.key);
    setSelect(nk);
    status('Coppia salvata',label(pt)+': target reale + fissazione '+fx.id+' salvati. Prossimo punto: '+(typeof P!=='undefined'?P.find(p=>p.key===nk)?.label:nk)+'.');
  }
  function beginPair(){
    pairMode=true;step='target';targetPoint=null;targetKey=selectedKey();
    const pt=selectedPoint();
    status('Clicca target reale','Nel video di scena clicca il punto reale guardato dal soggetto per: '+label(pt)+'.');
  }
  function clickStage(e){
    if(!pairMode)return;
    if(typeof toVid!=='function')return;
    const p=toVid(e);if(!p)return;
    e.preventDefault();e.stopImmediatePropagation();
    const pt=typeof P!=='undefined'?P.find(x=>x.key===targetKey):null;
    if(!pt)return;
    if(step==='target'){
      targetPoint=p;step='fixation';
      status('Clicca fissazione corrispondente','Ora clicca la fissazione osservata che corrisponde a: '+label(pt)+'.');
      return;
    }
    const fx=nearestFix(p);
    if(!fx){
      status('Fissazione non trovata','Clicca più vicino al cerchio della fissazione corrispondente. Il target reale è già stato memorizzato, ora serve solo la fissazione.','warn');
      return;
    }
    setPair(pt,targetPoint,fx);
    pairMode=false;step='target';targetPoint=null;targetKey=null;
  }
  function install(){
    const btn=id('calibrationClickModeBtn');
    if(btn&&!btn.dataset.pairClickReady){
      btn.dataset.pairClickReady='1';
      btn.textContent='Associa target + fissazione';
      btn.title='Primo click sul target reale nel video, secondo click sulla fissazione corrispondente.';
      btn.onclick=beginPair;
    }
    const hint=[...document.querySelectorAll('.panel-card')].find(sec=>sec.textContent.includes('Calibrazione a 9 punti'))?.querySelector('.hint');
    if(hint)hint.textContent='Per ogni punto: seleziona il punto target, premi “Associa target + fissazione”, poi fai due click nel video di scena: prima sul target reale mostrato sullo schermo, poi sulla fissazione osservata corrispondente. I 4 estremi dei 9 punti sono usati automaticamente come angoli dello schermo.';
  }
  const stage=id('videoStage');
  stage?.addEventListener('click',clickStage,true);
  const oldFit=window.fitCal;
  window.fitCal=function(){recomputeObs();if(oldFit)return oldFit();};
  const oldRender=window.render;
  window.render=function(){if(oldRender)oldRender();setTimeout(install,0);};
  setInterval(install,700);
  install();
})();
