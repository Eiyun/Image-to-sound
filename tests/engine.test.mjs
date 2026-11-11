import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePixels,featureAt,renderAudio,encodeWav,defaults} from '../docs/engine.js';
const pixels=(w,h,fn)=>{const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d.set([...fn(x,y),255],(y*w+x)*4);return d;};
const flat=rgb=>analyzePixels(pixels(32,16,()=>rgb),32,16,8);
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
test('pixel analysis: brightness, hue and texture reflect actual pixels',()=>{
 const black=flat([0,0,0]),white=flat([255,255,255]),red=flat([255,0,0]),green=flat([0,255,0]);
 assert.equal(black[0].brightness,0);assert.ok(Math.abs(white[0].brightness-1)<1e-6);assert.ok(Math.abs(red[0].hue)<1e-6);assert.ok(Math.abs(green[0].hue-1/3)<1e-6);
 const checker=analyzePixels(pixels(32,16,(x,y)=>(x+y)%2?[255,255,255]:[0,0,0]),32,16,8);
 assert.ok(checker[0].texture>.9);assert.ok(white[0].texture<1e-12);
});
test('video motion uses adjacent-frame differences, not a synthetic timer',()=>{
 const a=pixels(32,16,()=>[0,0,0]),b=pixels(32,16,()=>[255,255,255]);
 assert.equal(analyzePixels(a,32,16,1,a)[0].motion,0);assert.equal(analyzePixels(b,32,16,1,a)[0].motion,1);
});
test('hue interpolation wraps at red without jumping through cyan',()=>{
 const f={brightness:.4,saturation:1,texture:0,motion:0};const h=featureAt([{...f,hue:.98},{...f,hue:.02}],.5).hue;assert.ok(h<.001||h>.999);
});
for(const mode of ['noise','piano','synth'])test(`${mode}: deterministic non-silent stereo, bounded output and pixel sensitivity`,()=>{
 const config={features:flat([30,160,100]),mode,params:defaults[mode],duration:1,space:.35};
 const a=renderAudio(config),b=renderAudio(config),c=renderAudio({...config,features:flat([240,50,40])});
 assert.equal(a.left.length,44100);assert.equal(a.right.length,44100);assert.deepEqual(a,b);assert.ok(rms(a.left)>.005);assert.notDeepEqual(a.left,c.left);assert.ok(a.left.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));assert.equal(a.left[0],0);assert.ok(Math.abs(a.left.at(-1))<.001);
});
test('all mode controls change the resulting sound',()=>{
 for(const [mode,changes] of Object.entries({noise:[{cutoff:800},{movement:100},{color:'brown'}],piano:[{bpm:140},{density:100},{octave:2},{scale:'minor'}],synth:[{cutoff:400},{modulation:90},{wave:'triangle'},{octave:2}]})){
 const varied=analyzePixels(pixels(96,16,(x,y)=>[x*2.6,255-x*2.6,(x*13)%255]),96,16,32); const config={features:varied,mode,params:defaults[mode],duration:2,space:.35};const a=renderAudio(config);
 for(const change of changes){const b=renderAudio({...config,params:{...defaults[mode],...change}});assert.notDeepEqual(a.left,b.left,`${mode} ${JSON.stringify(change)}`);}
 }
});
test('WAV header, duration, channel interleave and export volume are valid',()=>{
 const audio=renderAudio({features:flat([30,160,100]),mode:'piano',params:defaults.piano,duration:1,space:.35});const wav=encodeWav(audio,.65),v=new DataView(wav);
 assert.equal(Buffer.from(wav).toString('ascii',0,4),'RIFF');assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint16(34,true),16);assert.equal(wav.byteLength,44+44100*4);assert.equal(v.getUint32(40,true)/v.getUint32(28,true),1);
 for(const i of [1000,10000,20000]){assert.equal(v.getInt16(44+i*4,true),Math.round(audio.left[i]*.65*32767));assert.equal(v.getInt16(46+i*4,true),Math.round(audio.right[i]*.65*32767));}
});
test('renderer rejects unbounded or absent media',()=>{assert.throws(()=>renderAudio({features:[],duration:1}));assert.throws(()=>renderAudio({features:flat([0,0,0]),duration:61}));});

test('short melody repeats its three-beat rhythm and shares exact attacks with playback', () => {
  const config = { features: flat([40, 90, 150]), mode: 'piano', duration: 8,
    params: { ...defaults.piano, bpm: 60 }, space: 0 };
  const melody = renderAudio(config, 8000);
  assert.deepEqual(melody.attacks.map(note => note.time), [0, 1, 2, 4, 5, 6]);
  assert.ok(melody.attacks[0].velocity > melody.attacks[1].velocity);
  const scan = renderAudio({ ...config, params: { ...config.params, style: 'scan' } }, 8000);
  assert.notDeepEqual(scan.left, melody.left);
  assert.notDeepEqual(scan.attacks, melody.attacks);
  const edge = analyzePixels(pixels(16, 16, (x,y) => y < 12 ? [0,0,0] : [255,255,255]),16,16,4);
  assert.ok(edge.every(f => f.pointY === 12.5 / 16));
});
