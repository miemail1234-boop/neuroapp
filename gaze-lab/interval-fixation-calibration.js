// Calibration by interval and sequential selection of the 9 observed fixations.
(function(){
  const ORDER=['tl','tc','tr','cr','c','cl','bl','bc','br'];
  let showInterval=false;
  let selecting=false;
  let selected=[];
  function id(x){return document.getElementById(x)}
  function n(v){const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:NaN}
  function fmt(x){return Number.isFinite(x)?Number(x).toFixed(3):''}
  function point(k){return typeof P!=='undefined'?P.find(p=>p.key===k):null}
  function labelForIndex(i){const p=point(ORDER[i]);return p?p.label:ORDER[i]}
  function status(title,text,kind='ready'){const b=id('statusBand'),t=id('statusTitle'),s=id('statusText');if(b&&t&&s){b.className='status-band '+kind;t.textContent=title;s.textContent=text}}
  function calStart(){return n(id('calStartSec')?.value)}
  function calEnd(){return n(id('calEndSec')?.value)}
  function inInterval(f){const a=calStart(),b=calEnd();if(!Number.isFinite(a)||!Number.isFinite(b))return false;return f.t>=Math.min(a,b)&&f.t<=Math.max(a,b)}
  function candidates(){return typeof S==='undefined'?[]:(S.fix||[]).filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&inInterval(f)).sort((a,b)=>(a.start??a.t)-(b.start??b.t))}
  function currentVideoTime(){return typeof recTime==='function'?recTime():id('sceneVideo')?.currentTime||0}
  function setCurrentAsStart(){const el=id('calStartSec');if(el){el.value=fmt(currentVideoTime());el.dispatchEvent(new Event('change',{bubbles:true}))}showAll()}
  function setCurrentAsEnd(){const el=id('calEndSec');if(el){el.value=fmt(currentVideoTime());el.dispatchEvent(new Event('change',{bubbles:true}))}showAll()}
  function showAll(){showInterval=true;selecting=false;selected=[];drawNow();status('Fissazioni calibrazione','Mostro nel video principale tutte le fissazioni comprese nell’intervallo: '+candidates().length+'.')}
  function startSelection(){const list=candidates();if(!list.length)return status('Intervallo vuoto','Imposta un intervallo che contenga le fissazioni dei 9 punti di calibrazione.','warn');selected=[];selecting=true;showInterval=true;drawNow();status('Seleziona 9 fissazioni','Clicca nel video principale la fissazione corrispondente a: '+labelForIndex(0)+'.')}
  function clearSelection(){selected=[];selecting=false;showInterval=true;if(typeof S!=='undefined'){S.pairs={};S.model=null}drawNow();if(typeof render==='function')render();status('Selezione cancellata','Puoi ripartire dalla prima fissazione della calibrazione.')}
  function nearestCandidate(p){let best=null,bd=1e9;const used=new Set(selected.map(x=>x.id));candidates().forEach(f=>{if(used.has(f.id))return;const d=Math.hypot(f.x-p.x,f.y-p.y);if(d<bd){bd=d;best=f}});return bd<=120?best:null}
  function applyPairs(){if(typeof S==='undefined'||typeof P==='undefined')return;S.pairs={};selected.forEach((fx,i)=>{const pt=point(ORDER[i]);if(pt)S.pairs[pt.key]={pt,fx,obs:{x:NaN,y:NaN}}});const get=k=>S.pairs[k]?.fx;if(get('tl')&&get('tr')&&get('br')&&get('bl')){S.corners={tl:{x:get('tl').x,y:get('tl').y},tr:{x:get('tr').x,y:get('tr').y},br:{x:get('br').x,y:get('br').y},bl:{x:get('bl').x,y:get('bl').y}};if(typeof Hinv==='function'&&typeof proj==='function'){const hi=Hinv();if(hi)Object.values(S.pairs).forEach(pair=>{const q=proj(hi,pair.fx.x,pair.fx.y);if(q)pair.obs=q})}if(typeof spatial==='function')spatial();}
  function clickMain(e){if(!selecting)return;if(typeof toVid!=='function')return;const p=toVid(e);if(!p)return;e.preventDefault();e.stopImmediatePropagation();const fx=nearestCandidate(p);if(!fx)return status('Nessuna fissazione vicina','Clicca più vicino a uno dei punti di fissazione mostrati nel video principale.','warn');selected.push(fx);applyPairs();drawNow();if(selected.length>=9){selecting=false;if(typeof render==='function')render();status('9 fissazioni selezionate','Ora premi “Calcola correzione” per applicare la calibrazione.');return}status('Fissazione selezionata',selected.length+'/9 salvate. Ora clicca: '+labelForIndex(selected.length)+'.')}
  function mark(ctx,p,color,label){if(!p||typeof toCan!=='function')return;const q=toCan(p);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(q.x,q.y,3,0,Math.PI*2);ctx.fill();if(label){ctx.fillStyle='white';ctx.font='700 11px system-ui';ctx.fillText(label,q.x+9,q.y-7)}ctx.restore()}
  const baseDraw=window.draw;
  window.draw=function(){if(baseDraw)baseDraw();if(showInterval||selecting)drawIntervalOverlay()}
  function drawNow(){if(typeof window.draw==='function')window.draw();updateCount()}
  function drawIntervalOverlay(){const c=id('overlayCanvas');if(!c)return;const ctx=c.getContext('2d');const used=new Map(selected.map((f,i)=>[f.id,i+1]));candidates().forEach(f=>{const num=used.get(f.id);mark(ctx,f,num?'#00c285':'#ff9f43',num?String(num):'')})}
  function updateCount(){const x=id('selectedFixCount');if(x)x.textContent=selected.length+'/9';const y=id('intervalFixCount');if(y)y.textContent=String(candidates().length)}
  function bindButtons(){
    const a=id('setCalStartBtn'),b=id('setCalEndBtn'),c=id('showIntervalFixBtn'),d=id('startNineFixSelectBtn'),e=id('clearCalibrationBtn'),f=id('fitCalibrationBtn');
    if(a)a.onclick=setCurrentAsStart;if(b)b.onclick=setCurrentAsEnd;if(c)c.onclick=showAll;if(d)d.onclick=startSelection;if(e)e.onclick=clearSelection;if(f)f.onclick=()=>{applyPairs();if(typeof fitCal==='function')fitCal()};
    ['calStartSec','calEndSec'].forEach(k=>{const el=id(k);if(el&&!el.dataset.boundInterval){el.dataset.boundInterval='1';el.addEventListener('input',()=>{showInterval=true;updateCount();drawNow()});el.addEventListener('change',()=>{showInterval=true;updateCount();drawNow()})}})
  }
  function installUI(){
    const old=[...document.querySelectorAll('.panel-card')].find(sec=>sec.querySelector('.corner-grid'));
    if(old&&!old.dataset.intervalCalReady){old.dataset.intervalCalReady='1';old.innerHTML='<div class="panel-head"><h2>2. Intervallo di calibrazione</h2></div><p class="hint">Imposta l’inizio e la fine della fase in cui il soggetto guarda i 9 punti. Puoi scrivere i secondi manualmente oppure usare il tempo corrente del video.</p><div class="form-grid"><label>Inizio calibrazione (s)<input id="calStartSec" type="number" step="0.001" placeholder="es. 12.345" /></label><label>Fine calibrazione (s)<input id="calEndSec" type="number" step="0.001" placeholder="es. 18.900" /></label></div><div class="button-row"><button id="setCalStartBtn" type="button">Usa tempo video come inizio</button><button id="setCalEndBtn" type="button">Usa tempo video come fine</button><button id="showIntervalFixBtn" type="button" class="primary">Mostra fissazioni intervallo</button></div><div class="readout">Fissazioni nell’intervallo: <strong id="intervalFixCount">0</strong></div>'}
    const sec=[...document.querySelectorAll('.panel-card')].find(s=>s.querySelector('#calibrationPointSelect'));
    if(sec&&!sec.dataset.intervalSelectReady){sec.dataset.intervalSelectReady='1';const h=sec.querySelector('h2');if(h)h.textContent='3. Selezione delle 9 fissazioni';const p=sec.querySelector('.hint');if(p)p.textContent='Dopo aver mostrato le fissazioni dell’intervallo, clicca nel video principale le 9 fissazioni corrispondenti ai 9 punti reali, nello stesso ordine del protocollo: alto sinistra, alto centro, alto destra, centro destra, centro, centro sinistra, basso sinistra, basso centro, basso destra.';const row=sec.querySelector('.button-row');if(row)row.innerHTML='<button id="startNineFixSelectBtn" type="button" class="primary">Seleziona 9 fissazioni</button><button id="fitCalibrationBtn" class="primary">Calcola correzione</button><button id="clearCalibrationBtn" class="ghost">Cancella</button>';const r=sec.querySelector('.readout');if(r)r.innerHTML='Fissazioni selezionate: <strong id="selectedFixCount">0/9</strong>'}
    bindButtons();updateCount();
  }
  id('videoStage')?.addEventListener('click',clickMain,true);
  const oldRender=window.render;window.render=function(){if(oldRender)oldRender();setTimeout(installUI,0);setTimeout(updateCount,0)};
  setInterval(()=>{installUI();if(showInterval||selecting)drawNow()},600);
  installUI();
})();
