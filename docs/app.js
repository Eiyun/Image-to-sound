import {analyzePixels,featureAt,defaults,encodeWav,clamp} from './engine.js';
import {createDemo} from './demo.js';
const $=id=>document.getElementById(id);
const state={media:null,features:[],mode:'piano',params:structuredClone(defaults),duration:24,space:.35,volume:.65,playing:false,loop:true,offset:0,anchor:0,distortion:false,effect:'wave',intensity:.35,speed:1,audio:null,pending:false,importing:false};
let ctx,gain,source,worker,renderId=0,renderTimer,toastTimer,buffer,history=[],lastHistory=-1,lastFeature=-1;
const canvas=$('visual'),g=canvas.getContext('2d'),wave=$('waveform'),wg=wave.getContext('2d');
const format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let showLights = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let trailStart = 0, lastTrailTime = 0;
const names={noise:'白噪音',piano:'钢琴',synth:'合成器'};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function position(){if(!state.playing||!ctx)return state.offset;const t=state.offset+ctx.currentTime-state.anchor;return state.loop?t%state.duration:Math.min(t,state.duration);}
function stopSource(){if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}}
function updatePlay(){ $('play').setAttribute('aria-label',state.playing?'暂停':'播放');$('play').innerHTML=state.playing?'<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm7 0h4v14h-4z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 5l11 7-11 7z"/></svg>'; }
function makeBuffer(){buffer=ctx.createBuffer(2,state.audio.left.length,state.audio.rate);buffer.copyToChannel(state.audio.left,0);buffer.copyToChannel(state.audio.right,1);}
function startSource(){stopSource();if(!buffer)makeBuffer();source=ctx.createBufferSource();source.buffer=buffer;source.loop=state.loop;source.connect(gain);state.anchor=ctx.currentTime;source.start(0,Math.min(state.offset,state.duration-.001));}
async function play(){
 if(!state.audio||state.importing)return;
 try{if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();gain=ctx.createGain();gain.gain.value=state.volume;gain.connect(ctx.destination);}await ctx.resume();if(ctx.state!=='running')throw new Error('音频未能启动');
 if(state.offset>=state.duration-.01)state.offset=0;state.playing=true;startSource();if(state.media.kind==='video'){state.media.element.currentTime=state.offset;state.media.element.play().catch(()=>{});}updatePlay();$('audio-status').textContent=state.pending?'正在更新声音…':'正在播放';
 }catch(error){state.playing=false;updatePlay();toast('无法启动音频，请在浏览器中再次点击播放。');}
}
function pause(){state.offset=position();state.playing=false;stopSource();if(state.media?.kind==='video')state.media.element.pause();updatePlay();$('audio-status').textContent=state.pending?'正在更新声音…':'已暂停';}
function seek(t){trailStart=clamp(t,0,state.duration);lastTrailTime=trailStart;const was=state.playing;state.offset=clamp(t,0,state.duration);if(was){if(state.offset>=state.duration)state.offset=state.loop?0:state.duration-.001;startSource();}if(state.media?.kind==='video')state.media.element.currentTime=state.offset;history=[];lastHistory=-1;updateProgress();}
function updateProgress(){const t=position();$('current').textContent=format(t);$('seek').value=t;$('seek').setAttribute('aria-valuetext',`${t.toFixed(1)} 秒，共 ${state.duration.toFixed(1)} 秒`);$('playhead').style.left=`${t/state.duration*100}%`;}
function updateDuration(){for(const [id,f] of [['total',1],['time-end',1],['time-quarter',.25],['time-half',.5],['time-three',.75]])$(id).textContent=format(state.duration*f);$('seek').max=state.duration;updateProgress();}
function queueRender(){clearTimeout(renderTimer);++renderId;worker?.terminate();worker=null;state.pending=true;$('export').disabled=true;$('audio-status').textContent='正在更新声音…';renderTimer=setTimeout(render,140);}
function render(){
 if(!state.features.length)return;worker?.terminate();const id=++renderId;worker=new Worker('./audio-worker.js',{type:'module'});
 worker.onmessage=({data})=>{if(data.id!==renderId)return;if(data.error){renderError(data.error);return;}const was=state.playing,t=position();state.audio=data.audio;buffer=null;state.offset=t;state.pending=false;$('play').disabled=state.importing;$('export').disabled=state.importing;if(was)startSource();$('audio-status').textContent=was?'正在播放':'声音已就绪';drawWave();worker.terminate();worker=null;};
 worker.onerror=()=>renderError('音频引擎加载失败，请用本地服务地址打开页面。');
 worker.postMessage({id,config:{features:state.features,mode:state.mode,params:state.params[state.mode],duration:state.duration,space:state.space}});
}
function renderError(message){state.pending=false;$('audio-status').textContent='声音生成失败';$('export').disabled=true;toast(message);worker?.terminate();worker=null;}
function drawWave(){
 const {width,height}=wave.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);wave.width=Math.round(width*dpr);wave.height=Math.round(height*dpr);wg.setTransform(dpr,0,0,dpr,0,0);wg.clearRect(0,0,width,height);if(!state.audio)return;
 const data=state.audio.left,bars=Math.floor(width/5),stride=Math.floor(data.length/bars);let peaks=[];
 for(let b=0;b<bars;b++){let sum=0,n=0;for(let j=b*stride;j<(b+1)*stride;j+=Math.max(1,Math.floor(stride/100))){sum+=data[j]*data[j];n++;}peaks.push(Math.sqrt(sum/n));}
 const max=Math.max(.001,...peaks);for(let i=0;i<bars;i++){const h=3+peaks[i]/max*(height-8);wg.fillStyle=i%5===0?'#c4b0f0':'#83729e';wg.fillRect(i*width/bars,(height-h)/2,2,h);}
}
const slider=(key,label,min,max,value,unit='',step=1)=>`<label class="slider-label" for="param-${key}">${label}<output id="value-${key}">${value}${unit}</output></label><input id="param-${key}" data-param="${key}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
const select=(key,label,value,options)=>`<div class="field-row"><label for="param-${key}">${label}</label><select id="param-${key}" data-param="${key}">${options.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('')}</select></div>`;
function showParams(){
 const p=state.params[state.mode];let html='';
 if(state.mode==='piano'){html=select('style','演奏方式',p.style,[['melody','短旋律'],['scan','自由扫描']])+select('scale','音阶',p.scale,[['pentatonic','五声音阶'],['minor','自然小调'],['major','自然大调']])+slider('bpm','节奏',40,160,p.bpm,' BPM')+slider('density','音符密度',10,100,p.density,'%')+select('octave','起始音区',p.octave,[[2,'低音 · C2'],[3,'中低音 · C3'],[4,'中音 · C4'],[5,'高音 · C5']]);$('engine-description').textContent='将色彩与明暗，谱成一段流动的旋律。';}
 if(state.mode==='noise'){html=select('color','噪声底色',p.color,[['white','白噪音'],['pink','柔和噪音'],['brown','深沉噪音']])+slider('cutoff','滤波频率',200,12000,p.cutoff,' Hz',100)+slider('movement','波动速度',0,100,p.movement,'%');$('engine-description').textContent='以亮度塑造声场，让纹理成为细微的波动。';}
 if(state.mode==='synth'){html=select('wave','振荡波形',p.wave,[['sine','正弦 · Sine'],['triangle','三角 · Triangle'],['saw','柔和锯齿 · Saw']])+slider('cutoff','滤波频率',200,9000,p.cutoff,' Hz',100)+slider('modulation','调制深度',0,100,p.modulation,'%')+select('octave','基础音区',p.octave,[[2,'低音 · C2'],[3,'中低音 · C3'],[4,'中音 · C4']]);$('engine-description').textContent='把色相与纹理，转译为持续变化的电子音色。';}
 $('light-setting').hidden=state.mode!=='piano';
 $('scan-lights').setAttribute('aria-checked',String(showLights));
 $('engine-params').innerHTML=html;
 $('engine-params').querySelectorAll('[data-param]').forEach(el=>el.addEventListener('input',()=>{const key=el.dataset.param;state.params[state.mode][key]=el.type==='range'||key==='octave'?Number(el.value):el.value;if($(`value-${key}`))$(`value-${key}`).textContent=el.value+el.dataset.unit;queueRender();}));
 document.querySelectorAll('[data-engine]').forEach(el=>{const active=el.dataset.engine===state.mode;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',active);});
}
function analyze(element,bins=96,previous=null){const c=document.createElement('canvas');c.width=192;c.height=120;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(element,0,0,c.width,c.height);const pixels=cx.getImageData(0,0,c.width,c.height).data;return {features:analyzePixels(pixels,c.width,c.height,bins,previous),pixels};}
function waitEvent(el,event,action,timeout=10000){return new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);el.removeEventListener(event,success);el.removeEventListener('error',fail);};const success=()=>{done();resolve();};const fail=()=>{done();reject(new Error('浏览器无法解码这个素材，请换用 JPG、PNG 或 H.264 MP4。'));};const timer=setTimeout(()=>{done();reject(new Error('读取素材超时，请换用较小的文件。'));},timeout);el.addEventListener(event,success,{once:true});el.addEventListener('error',fail,{once:true});action?.();});}
async function videoSeek(video,t){if(Math.abs(video.currentTime-t)<.005&&video.readyState>=2)return;await waitEvent(video,'seeked',()=>{video.currentTime=t;});}
function release(media){if(!media)return;if(media.kind==='video'){media.element.pause();media.element.removeAttribute('src');media.element.load();}if(media.url)URL.revokeObjectURL(media.url);}
function setMedia(media,features){
 release(state.media);trailStart=0;lastTrailTime=0;state.media=media;state.features=features;state.offset=0;state.audio=null;buffer=null;history=[];lastHistory=-1;
 state.duration=media.kind==='video'?media.duration:Number($('duration').value)||12;$('duration').disabled=media.kind==='video';
 if(media.kind==='video'){media.element.loop=state.loop;$('duration').querySelectorAll('[data-video]').forEach(el=>el.remove());const option=document.createElement('option');option.value=media.duration;option.textContent=`${media.duration.toFixed(1)} 秒 · 原视频`;option.dataset.video='true';$('duration').append(option);$('duration').value=media.duration;}
 else{$('duration').querySelectorAll('[data-video]').forEach(el=>el.remove());if(!$('duration').value)$('duration').value='12';state.duration=Number($('duration').value);}
 $('media-name').textContent=media.name;$('media-type').textContent=media.kind==='video'?'VIDEO / 视频':media.demo?'STUDY 01 / 示例':'IMAGE / 图片';$('media-meta').textContent=`${media.width} × ${media.height} · ${media.kind==='video'?'原声静音 · 视觉转译':media.demo?'算法粒子':'横向扫描'}`;$('motion-caption').textContent=media.kind==='video'?'帧差 → 调制':'静态图像';updateDuration();queueRender();
}
async function importFile(file){
 if(!file||state.importing)return;
 if(!/^(image|video)\//.test(file.type)){toast('请选择图片或视频文件。');return;}
 if(file.size>100*1024*1024){toast('素材过大，请选择 100 MB 以内的文件。');return;}
 pause();state.importing=true;clearTimeout(renderTimer);++renderId;worker?.terminate();worker=null;$('loading').hidden=false;$('loading-text').textContent='正在读取画面…';$('play').disabled=true;$('export').disabled=true;$('upload').disabled=true;$('demo').disabled=true;
 const url=URL.createObjectURL(file);let element,accepted=false;
 try{
 if(file.type.startsWith('image/')){element=new Image();await waitEvent(element,'load',()=>element.src=url);if(element.naturalWidth*element.naturalHeight>50000000)throw new Error('图片超过 5000 万像素，请缩小后再试。');const {features}=analyze(element);setMedia({kind:'image',element,url,name:file.name,width:element.naturalWidth,height:element.naturalHeight},features);accepted=true;}
 else{element=document.createElement('video');element.muted=true;element.playsInline=true;element.preload='auto';await waitEvent(element,'loadeddata',()=>{element.src=url;element.load();});const duration=element.duration;if(!Number.isFinite(duration)||duration<=0||duration>60.01)throw new Error('第一版支持最长 60 秒的短视频，请先裁剪。');const features=[];let previous=null;const count=Math.max(12,Math.min(96,Math.ceil(duration*2)));
 for(let i=0;i<count;i++){await videoSeek(element,Math.min(Math.max(0,duration-.04),i/(count-1)*duration));const sample=analyze(element,1,previous);features.push(sample.features[0]);previous=sample.pixels;$('loading-text').textContent=`正在分析视频 · ${Math.round((i+1)/count*100)}%`;}
 await videoSeek(element,0);setMedia({kind:'video',element,url,name:file.name,width:element.videoWidth,height:element.videoHeight,duration},features);accepted=true;}
 toast('素材已载入，正在生成它的声音。');
 }catch(error){toast(error.message);if(state.features.length)queueRender();}
 finally{if(!accepted){if(element?.tagName==='VIDEO'){element.removeAttribute('src');element.load();}URL.revokeObjectURL(url);}state.importing=false;$('loading').hidden=true;$('upload').disabled=false;$('demo').disabled=false;$('play').disabled=!state.audio;$('export').disabled=!state.audio||state.pending;$('file').value='';}
}
function loadDemo(){if(state.importing)return;pause();const element=createDemo();setMedia({kind:'image',element,name:'相位环 / Phase Loop',width:element.width,height:element.height,demo:true},analyze(element).features);}
function sizeCanvas(){const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(box.width*dpr)||canvas.height!==Math.round(box.height*dpr)){canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);}return {w:canvas.width,h:canvas.height};}
function drawScanLights(time, x, y, width, height) {
  if (time < lastTrailTime) trailStart = 0;
  lastTrailTime = time;
  if (!showLights || !state.playing || state.mode !== 'piano' || !state.audio?.attacks?.length) return;
  const size = Math.max(1.6, Math.min(width, height) * .006);
  g.save();
  g.beginPath();
  g.rect(x,y,width,height);
  g.clip();
  for (const note of state.audio.attacks) {
    const age = time - note.time;
    if (age < 0) break;
    if (note.time < trailStart || age >= .9) continue;
    const progress = note.time / state.duration;
    const sample = state.features[Math.round(progress * (state.features.length - 1))];
    const px = x + width * (state.media.kind === 'image' ? progress : sample.pointX);
    const py = y + height * sample.pointY;
    const power = Math.min(1, note.velocity * 3);
    for (const [dx,dy,radius] of [[0,0,1],[-1.9,-1.2,.52],[-2.8,1.3,.36]]) {
      g.globalAlpha = (1 - age / .9) ** 1.4 * power;
      g.shadowColor = '#d7bcff';
      g.shadowBlur = size * 2;
      g.fillStyle = '#f6edff';
      g.beginPath();
      g.arc(px + dx * size, py + dy * size, radius * size, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}
$('scan-lights').onclick = () => {
  showLights = !showLights;
  trailStart = position();
  $('scan-lights').setAttribute('aria-checked', String(showLights));
};
function draw(){
 const {w,h}=sizeCanvas();g.clearRect(0,0,w,h);if(!state.media)return;const m=state.media,t=position(),scale=Math.min(w/m.width,h/m.height),dw=m.width*scale,dh=m.height*scale,x=(w-dw)/2,y=(h-dh)/2;
 const e=m.element;if(m.kind==='video'&&e.readyState<2)return;
 if(m.kind==='video'&&state.playing){if(Math.abs(e.currentTime-t)>.16&&!e.seeking)e.currentTime=t;if(t<lastHistory){history=[];lastHistory=-1;}if(t-lastHistory>.1||lastHistory<0){const frame=document.createElement('canvas');const frameScale=Math.min(480/m.width,480/m.height);frame.width=Math.max(1,Math.round(m.width*frameScale));frame.height=Math.max(1,Math.round(m.height*frameScale));frame.getContext('2d').drawImage(e,0,0,frame.width,frame.height);history.unshift(frame);history=history.slice(0,7);lastHistory=t;}}
 g.drawImage(e,x,y,dw,dh);
 if(state.distortion&&state.intensity>0){const f=featureAt(state.features,t/state.duration),a=state.intensity*(.6+f.brightness*.4),clock=t*state.speed;
 g.save();g.beginPath();g.rect(x,y,dw,dh);g.clip();
 if(state.effect==='wave'){const rows=72;for(let i=0;i<rows;i++){const sy=i*m.height/rows,sh=m.height/rows+.5,shift=Math.sin(i*.18-clock*2.5)*a*dw*.027;g.drawImage(e,0,sy,m.width,Math.min(sh,m.height-sy),x+shift,y+i*dh/rows,dw,dh/rows+1);}}
 if(state.effect==='time'){const cols=48;for(let i=0;i<cols;i++){const src=m.kind==='video'&&history.length?history[Math.floor((Math.sin(i*.3-clock)+1)*.5*(history.length-1))]:e;const sw=src.width||m.width,sh=src.height||m.height;const shift=Math.sin(i*.22-clock*1.5)*a*dh*.07;g.drawImage(src,i*sw/cols,0,sw/cols,sh,x+i*dw/cols,y+shift,dw/cols+1,dh);}}
 if(state.effect==='liquid'){const cols=28,rows=24;for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const dx=Math.sin(j*.45+clock*1.6+i*.1)*a*dw*.015,dy=Math.cos(i*.35-clock*1.3+j*.12)*a*dh*.02;g.drawImage(e,i*m.width/cols,j*m.height/rows,m.width/cols,m.height/rows,x+i*dw/cols+dx,y+j*dh/rows+dy,dw/cols+1.5,dh/rows+1.5);}}
 if(state.effect==='echo'){for(let i=3;i>=1;i--){g.globalAlpha=a*.17;const inset=i*a*.035;const dx=Math.sin(clock*1.2+i*.4)*dw*inset*.3;g.drawImage(history[i]||e,x+dw*inset/2+dx,y+dh*inset/2,dw*(1-inset),dh*(1-inset));}}
 g.restore();
 }
 if(state.playing&&m.kind==='image'){const sx=x+dw*t/state.duration;g.strokeStyle='#d8c6ff75';g.lineWidth=1;g.beginPath();g.moveTo(sx,y);g.lineTo(sx,y+dh);g.stroke();}
 drawScanLights(t,x,y,dw,dh);
 if(Math.abs(t-lastFeature)>.08||!state.playing){const f=featureAt(state.features,t/state.duration);for(const key of ['brightness','hue','texture','motion']){const v=f[key];$(`${key}-value`).textContent=key==='hue'?`${Math.round(v*360)}°`:m.kind==='image'&&key==='motion'?'—':`${Math.round(v*100)}%`;$(`${key}-meter`).style.width=`${v*100}%`;}lastFeature=t;}
}
function frame(){if(state.playing&&!state.loop&&position()>=state.duration){pause();state.offset=state.duration;$('audio-status').textContent='播放完成';}updateProgress();draw();requestAnimationFrame(frame);}

$('play').onclick=()=>state.playing?pause():play();$('restart').onclick=()=>seek(0);$('seek').oninput=event=>seek(Number(event.target.value));
$('loop').onclick=()=>{const t=position();state.loop=!state.loop;state.offset=t;if(state.playing)startSource();if(state.media?.kind==='video')state.media.element.loop=state.loop;$('loop').classList.toggle('active',state.loop);$('loop').setAttribute('aria-pressed',state.loop);};
$('volume').oninput=event=>{state.volume=Number(event.target.value)/100;$('volume-value').textContent=event.target.value+'%';if(gain)gain.gain.setTargetAtTime(state.volume,ctx.currentTime,.02);};
$('space').oninput=event=>{state.space=Number(event.target.value)/100;$('space-value').textContent=event.target.value+'%';queueRender();};
$('duration').onchange=event=>{pause();state.duration=Number(event.target.value);state.offset=0;updateDuration();queueRender();};
document.querySelectorAll('[data-engine]').forEach(el=>el.onclick=()=>{state.mode=el.dataset.engine;showParams();queueRender();});
$('distortion').onclick=()=>{state.distortion=!state.distortion;$('distortion').setAttribute('aria-checked',state.distortion);$('effect-controls').disabled=!state.distortion;updateEffect();};
function updateEffect(){const labels={wave:'Wave',time:'Time Warp',liquid:'Liquid',echo:'Echo'};$('effect-badge').innerHTML=`<i></i> ${state.distortion?labels[state.effect]:'原始画面'}`;$('visual-hint').textContent=state.distortion?'形变已开启。关闭后恢复原图，声音继续。':'当前保留原始画面。随时开启，不打断声音。';document.querySelectorAll('[data-effect]').forEach(el=>{const active=el.dataset.effect===state.effect;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',active);});}
document.querySelectorAll('[data-effect]').forEach(el=>el.onclick=()=>{state.effect=el.dataset.effect;updateEffect();});
$('intensity').oninput=event=>{state.intensity=Number(event.target.value)/100;$('intensity-value').textContent=event.target.value+'%';};$('speed').oninput=event=>{state.speed=Number(event.target.value)/100;$('speed-value').textContent=state.speed.toFixed(1)+'×';};
$('upload').onclick=()=>$('file').click();$('file').onchange=event=>importFile(event.target.files[0]);$('demo').onclick=loadDemo;
for(const event of ['dragenter','dragover'])$('stage').addEventListener(event,e=>{e.preventDefault();$('stage').classList.add('dragover');});for(const event of ['dragleave','drop'])$('stage').addEventListener(event,e=>{e.preventDefault();$('stage').classList.remove('dragover');if(event==='drop')importFile(e.dataTransfer.files[0]);});
$('export').onclick=()=>{if(!state.audio||state.pending)return;const wav=encodeWav(state.audio,state.volume);const url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));const a=document.createElement('a');a.href=url;a.download=`图·声-${state.mode}-${new Date().toISOString().slice(0,10)}.wav`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast(`WAV 已导出 · ${state.duration.toFixed(1)} 秒 · 44.1 kHz 立体声`);};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else toast('当前浏览器不支持画布全屏，可使用横屏查看。');}catch{toast('当前浏览器无法进入全屏。');}};
$('help').onclick=()=>$('guide').showModal();$('close-guide').onclick=()=>$('guide').close();$('guide').addEventListener('click',event=>{if(event.target===$('guide')){const r=$('guide').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('guide').close();}});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(event.target.tagName)&&!$('guide').open){event.preventDefault();state.playing?pause():play();}});
new ResizeObserver(drawWave).observe(wave);window.addEventListener('beforeunload',()=>{worker?.terminate();release(state.media);ctx?.close();});
if(matchMedia('(max-width:767px)').matches){$('sound-panel').open=false;$('visual-panel').open=false;}
showParams();updateEffect();loadDemo();requestAnimationFrame(frame);
