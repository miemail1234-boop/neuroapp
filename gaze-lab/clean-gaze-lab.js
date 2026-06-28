// Clean Gaze Lab runtime: independent from old patch stack.
(function(){
  const $=id=>document.getElementById(id);
  const ORDER=[
    ['tl','Alto sinistra'],['tc','Alto centro'],['tr','Alto destra'],
    ['cr','Centro destra'],['c','Centro'],['cl','Centro sinistra'],
    ['bl','Basso sinistra'],['bc','Basso centro'],['br','Basso destra']
  ];
  const S={gaze:[],fix:[],sac:[],blink:[],events:[],pairs:[],selecting:false,showInterval:false,step:'target',pendingTarget:null,videoUrl:null};

  function num(v){const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:NaN}
  function text(id,v){const el=$(id);if(el)el.textContent=v}
  function status(title,msg,kind='ready'){text('statusTitle',title);text('statusText',msg);const b=$('statusBand');if(b)b.className='status-band '+kind}
  function readFile(file){return file?file.text():Promise.resolve('')}
  function lowerName(f){return (f.webkitRelativePath||f.name||'').toLowerCase()}
  function pick(files,name){name=name.toLowerCase();return files.find(f=>f.name.toLowerCase()===name)||files.find(f=>lowerName(f).endsWith('/'+name))}
  function val(row,names){const keys=Object.keys(row||{});for(const n of names){if(row[n]!==undefined&&row[n]!=='')return row[n];const k=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9]/g,'')===n.toLowerCase().replace(/[^a-z0-9]/g,''));if(k&&row[k]!=='')return row[k]}return ''}
  function sec(raw,t0){const x=num(raw);if(!Number.isFinite(x))return NaN;if(Number.isFinite(t0))return (x-t0)/1e9;return x>1e6?x/1e9:x}
  function csv(txt){
    if(!txt)return[];const rows=[];let row=[],s='',q=false;
    for(let i=0;i<txt.length;i++){const c=txt[i],n=txt[i+1];
      if(c==='"'){if(q&&n==='"'){s+='"';i++}else q=!q;continue}
      if(c===','&&!q){row.push(s);s='';continue}
      if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(s);if(row.some(x=>x.trim()))rows.push(row);row=[];s='';continue}
      s+=c;
    }
    row.push(s);if(row.some(x=>x.trim()))rows.push(row);if(!rows.length)return[];
    const h=rows[0].map(x=>x.trim());
    return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]??'').trim()])));
  }
  function parseGaze(rows,t0){return rows.map((r,i)=>({
    t:sec(val(r,['timestamp [ns]','timestamp_ns','timestamp']),t0)||i/200,
    x:num(val(r,['gaze x [px]','gaze_x_px','scene_camera_frame_pixel_x','gaze_point_2d_x'])),
    y:num(val(r,['gaze y [px]','gaze_y_px','scene_camera_frame_pixel_y','gaze_point_2d_y'])),
    worn:num(val(r,['worn']))
  })).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.t-b.t)}
  function parseFix(rows,t0){return rows.map((r,i)=>{const a=sec(val(r,['start timestamp [ns]','start_timestamp_ns','start timestamp']),t0),b=sec(val(r,['end timestamp [ns]','end_timestamp_ns','end timestamp']),t0);return{
    id:i+1,start:a,end:b,t:Number.isFinite(a+b)?(a+b)/2:a,
    x:num(val(r,['fixation x [px]','fixation_x_px','x [px]','x'])),
    y:num(val(r,['fixation y [px]','fixation_y_px','y [px]','y'])),
    dur:num(val(r,['duration [ms]','duration_ms','duration']))
  }}).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.t-b.t)}
  function parseInt(rows,t0){return rows.map(r=>({start:sec(val(r,['start timestamp [ns]','start_timestamp_ns']),t0),end:sec(val(r,['end timestamp [ns]','end_timestamp_ns']),t0)})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end))}
  function setCounts(){text('sampleCount',S.gaze.length);text('fixationCount',S.fix.length);text('saccadeCount',S.sac.length);text('blinkCount',S.blink.length);text('trialCount','0')}
  function loadVideo(file){if(!file)return;if(S.videoUrl)URL.revokeObjectURL(S.videoUrl);S.videoUrl=URL.createObjectURL(file);$('sceneVideo').src=S.videoUrl;$('sceneVideo').addEventListener('loadedmetadata',draw,{once:true})}
  async function loadFolder(ev){
    try{
      const files=[...(ev.target.files||[])];
      if(!files.length)throw Error('Nessun file selezionato.');
      const g=pick(files,'gaze.csv'); if(!g)throw Error('gaze.csv non trovato nella cartella.');
      const events=csv(await readFile(pick(files,'events.csv')));
      const begin=events.find(r=>/begin/i.test(val(r,['name','event','type'])||''));
      const t0=begin?num(val(begin,['timestamp [ns]','timestamp_ns','timestamp'])):NaN;
      S.events=events;
      S.gaze=parseGaze(csv(await readFile(g)),t0);
      S.fix=parseFix(csv(await readFile(pick(files,'fixations.csv'))),t0);
      S.sac=parseInt(csv(await readFile(pick(files,'saccades.csv'))),t0);
      S.blink=parseInt(csv(await readFile(pick(files,'blinks.csv'))),t0);
      const v=files.find(f=>/\.(mp4|mov|webm|m4v)$/i.test(f.name)); if(v)loadVideo(v);
      S.pairs=[];S.selecting=false;S.showInterval=false;S.step='target';S.pendingTarget=null;
      setCounts(); updateCalCounts(); draw();
      status('Dati caricati',`${S.gaze.length} gaze, ${S.fix.length} fissazioni, ${S.sac.length} saccadi, ${S.blink.length} blink.`);
    }catch(e){status('Errore upload',e.message,'bad')}
  }
  function recTime(){return ($('sceneVideo')?.currentTime||0)+num($('syncOffsetMs')?.value||0)/1000}
  function rect(){const st=$('videoStage'),v=$('sceneVideo');const r=st.getBoundingClientRect(),vw=v.videoWidth||1600,vh=v.videoHeight||900,k=Math.min(r.width/vw,r.height/vh);return{x:(r.width-vw*k)/2,y:(r.height-vh*k)/2,k,vw,vh}}
  function toCan(p){const r=rect();return{x:r.x+p.x*r.k,y:r.y+p.y*r.k}}
  function toVid(e){const c=$('overlayCanvas'),r0=c.getBoundingClientRect(),r=rect(),x=e.clientX-r0.left,y=e.clientY-r0.top;if(x<r.x||y<r.y||x>r.x+r.vw*r.k||y>r.y+r.vh*r.k)return null;return{x:(x-r.x)/r.k,y:(y-r.y)/r.k}}
  function nearTime(arr,t){let best=null,bd=Infinity;for(const p of arr){const d=Math.abs(p.t-t);if(d<bd){bd=d;best=p}}return bd<0.08?best:null}
  function currentFix(t){return S.fix.filter(f=>Number.isFinite(f.start)&&Number.isFinite(f.end)?t>=f.start-0.08&&t<=f.end+0.08:Math.abs(f.t-t)<0.12)}
  function calStart(){return num($('calStartSec')?.value)}
  function calEnd(){return num($('calEndSec')?.value)}
  function validInterval(){return Number.isFinite(calStart())&&Number.isFinite(calEnd())}
  function candidates(){if(!validInterval())return[];const a=Math.min(calStart(),calEnd()),b=Math.max(calStart(),calEnd());return S.fix.filter(f=>f.t>=a&&f.t<=b)}
  function updateCalCounts(){text('intervalFixCount',candidates().length);text('selectedFixCount',S.pairs.length+'/9')}
  function mark(ctx,p,color,label,r=8){const q=toCan(p);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(q.x,q.y,3,0,Math.PI*2);ctx.fill();if(label){ctx.fillStyle='white';ctx.font='700 12px system-ui';ctx.fillText(label,q.x+10,q.y-8)}ctx.restore()}
  function draw(){
    const c=$('overlayCanvas'),st=$('videoStage');if(!c||!st)return;const r=st.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=Math.max(1,r.width*dpr);c.height=Math.max(1,r.height*dpr);c.style.width=r.width+'px';c.style.height=r.height+'px';const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
    const t=recTime();
    if($('showTrail')?.checked){const g=nearTime(S.gaze,t);if(g)mark(ctx,g,'#4aa3ff','G',7)}
    if($('showFixations')?.checked&&!S.showInterval&&!S.selecting){currentFix(t).forEach(f=>mark(ctx,f,'#ff9f43','F'))}
    if(S.showInterval||S.selecting){
      const used=new Map(S.pairs.map((p,i)=>[p.fix.id,i+1]));
      candidates().forEach(f=>mark(ctx,f,used.has(f.id)?'#00c285':'#ff9f43',used.has(f.id)?String(used.get(f.id)):''));
      S.pairs.forEach((p,i)=>{mark(ctx,p.target,'#7bdff2','T'+(i+1),6);});
      if(S.pendingTarget)mark(ctx,S.pendingTarget,'#7bdff2','T?',6);
    }
    text('videoTimeLabel',($('sceneVideo')?.currentTime||0).toFixed(3)+' s'); text('gazeTimeLabel',t.toFixed(3)+' s'); text('interactionModeLabel',S.selecting?(S.step==='target'?'clicca punto reale':'clicca fissazione'):'navigazione');
  }
  function showInterval(){
    if(!validInterval())return status('Intervallo mancante','Inserisci secondi inizio e secondi fine calibrazione. Usa il punto decimale, es. 12.345.','warn');
    S.showInterval=true;S.selecting=false;S.step='target';S.pendingTarget=null;updateCalCounts();draw();
    const n=candidates().length;
    status('Fissazioni intervallo',n?('Mostro '+n+' fissazioni nel video principale.'):('Intervallo valido, ma contiene 0 fissazioni. Controlla i secondi inseriti.'));
  }
  function startSelect(){
    if(!validInterval())return status('Intervallo mancante','Inserisci prima secondi inizio e secondi fine calibrazione.','warn');
    if(!candidates().length)return status('Intervallo vuoto','Nessuna fissazione trovata in questo intervallo.','warn');
    S.pairs=[];S.showInterval=true;S.selecting=true;S.step='target';S.pendingTarget=null;updateCalCounts();draw();
    status('Seleziona coppie','Coppia 1/9, '+ORDER[0][1]+': clicca prima il punto reale mostrato nel video.');
  }
  function nearestCandidate(p){let best=null,bd=Infinity;const used=new Set(S.pairs.map(x=>x.fix.id));for(const f of candidates()){if(used.has(f.id))continue;const d=Math.hypot(f.x-p.x,f.y-p.y);if(d<bd){bd=d;best=f}}return bd<=120?best:null}
  function clickOverlay(e){
    if(!S.selecting)return;const p=toVid(e);if(!p)return;
    const idx=S.pairs.length, label=ORDER[idx]?.[1]||('punto '+(idx+1));
    if(S.step==='target'){
      S.pendingTarget=p;S.step='fix';draw();
      status('Punto reale salvato','Ora clicca la fissazione corrispondente a '+label+' tra i punti arancioni.');
      return;
    }
    const fx=nearestCandidate(p);
    if(!fx)return status('Nessuna fissazione vicina','Clicca più vicino a un punto di fissazione arancione.','warn');
    S.pairs.push({target:S.pendingTarget,fix:fx,label});
    S.pendingTarget=null;S.step='target';updateCalCounts();draw();
    if(S.pairs.length>=9){S.selecting=false;status('9 coppie selezionate','Hai selezionato 9 coppie punto reale + fissazione. Premi Calcola correzione.');return}
    status('Coppia salvata','Coppia '+S.pairs.length+'/9 salvata. Ora '+ORDER[S.pairs.length][1]+': clicca il punto reale.');
  }
  function clearCal(){S.pairs=[];S.selecting=false;S.showInterval=false;S.step='target';S.pendingTarget=null;updateCalCounts();draw();status('Calibrazione cancellata','Selezione delle coppie azzerata.')}
  function fitCal(){if(S.pairs.length<4)return status('Calibrazione incompleta','Seleziona almeno 4 coppie, meglio tutte e 9.','warn');status('Calibrazione pronta','Sono state memorizzate '+S.pairs.length+' coppie punto reale + fissazione. I 4 estremi derivano dalle coppie 1, 3, 7 e 9.');}
  function init(){
    $('folderInput').addEventListener('change',loadFolder);
    $('videoInput').addEventListener('change',e=>e.target.files[0]&&loadVideo(e.target.files[0]));
    $('showIntervalFixBtn').addEventListener('click',showInterval);
    $('startNineFixSelectBtn').addEventListener('click',startSelect);
    $('clearCalibrationBtn').addEventListener('click',clearCal);
    $('fitCalibrationBtn').addEventListener('click',fitCal);
    $('overlayCanvas').addEventListener('click',clickOverlay);
    $('sceneVideo').addEventListener('timeupdate',draw);
    ['showTrail','showFixations','showTarget','syncOffsetMs','calStartSec','calEndSec'].forEach(k=>$(k)?.addEventListener('input',()=>{updateCalCounts();draw()}));
    const btn=$('startNineFixSelectBtn'); if(btn)btn.textContent='Seleziona 9 coppie';
    window.addEventListener('resize',draw); setCounts(); updateCalCounts(); status('Nessun dato caricato','Carica la cartella export con il pulsante Importa cartella.');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
