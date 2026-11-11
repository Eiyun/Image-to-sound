export const SAMPLE_RATE = 44100;
export const defaults = {
  noise:{cutoff:3600,movement:40,color:'white'},
  piano:{bpm:82,density:55,octave:4,scale:'pentatonic',style:'melody'},
  synth:{cutoff:2200,modulation:40,wave:'sine',octave:3}
};
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));

// Analyze real RGBA pixels. Horizontal bins become a static image's timeline.
export function analyzePixels(data,width,height,bins=96,previous=null){
  const features=[];
  for(let bin=0;bin<bins;bin++){
    const start=Math.floor(bin*width/bins),end=Math.max(start+1,Math.floor((bin+1)*width/bins));
    let light=0,sat=0,hx=0,hy=0,edge=0,motion=0,n=0;
    let strongestEdge=0, pointX=(start+end)/(2*width), pointY=.5;
    for(let y=0;y<height;y++)for(let x=start;x<Math.min(end,width);x++){
      const i=(y*width+x)*4,alpha=data[i+3]/255;
      const r=data[i]/255*alpha,g=data[i+1]/255*alpha,b=data[i+2]/255*alpha;
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo;
      const l=.2126*r+.7152*g+.0722*b,s=hi?delta/hi:0;
      let h=0;if(delta){h=hi===r?((g-b)/delta+6)%6:hi===g?(b-r)/delta+2:(r-g)/delta+4;h/=6;}
      light+=l;sat+=s;hx+=Math.cos(h*Math.PI*2)*s;hy+=Math.sin(h*Math.PI*2)*s;
      if(x>0){const j=i-4;edge+=Math.abs(l-(.2126*data[j]+.7152*data[j+1]+.0722*data[j+2])/255*(data[j+3]/255));}
      if(y>0){
        const j=i-width*4;
        const contrast=Math.abs(l-(.2126*data[j]+.7152*data[j+1]+.0722*data[j+2])/255*(data[j+3]/255));
        edge+=contrast;
        if(contrast>strongestEdge){
          strongestEdge=contrast;
          pointX=(x+.5)/width;
          pointY=(y+.5)/height;
        }
      }
      if(previous)motion+=(Math.abs(data[i]-previous[i])+Math.abs(data[i+1]-previous[i+1])+Math.abs(data[i+2]-previous[i+2]))/(255*3);
      n++;
    }
    features.push({brightness:light/n,hue:((Math.atan2(hy,hx)/(Math.PI*2)+1)%1),saturation:sat/n,texture:clamp(edge/n*3),motion:clamp(motion/n*3),pointX,pointY});
  }
  return features;
}
export function featureAt(features,progress){
  const x=clamp(progress)*(features.length-1),i=Math.floor(x),f=x-i,a=features[i],b=features[Math.min(i+1,features.length-1)];
  const hueDelta=((b.hue-a.hue+1.5)%1)-.5;
  return {brightness:a.brightness+(b.brightness-a.brightness)*f,hue:(a.hue+hueDelta*f+1)%1,saturation:a.saturation+(b.saturation-a.saturation)*f,texture:a.texture+(b.texture-a.texture)*f,motion:a.motion+(b.motion-a.motion)*f};
}
const scales={pentatonic:[0,2,4,7,9],minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11]};
function noteFrequency(f,octave,scale='pentatonic'){
  const notes=scales[scale],index=Math.floor(f.hue*notes.length*2+f.brightness*3);
  const midi=(Number(octave)+1)*12+notes[index%notes.length]+12*Math.floor(index/notes.length);
  return 440*2**((midi-69)/12);
}
// Four-beat motifs: the answer repeats the opening and resolves the last note.
function melodyNotes(features, p, duration, rate) {
  const notes = [];
  const scale = scales[p.scale];
  const beat = 60 / p.bpm;
  const feature = time => featureAt(features, time / duration);
  for (let bar = 0; bar * 4 * beat < duration; bar++) {
    const start = bar * 4 * beat;
    const theme = feature(Math.floor(bar / 2) * 8 * beat);
    const local = feature(start + 2 * beat);
    const root = Math.floor(theme.hue * scale.length);
    const third = 2 + Math.round(theme.brightness * 2);
    const ending = bar % 2 ? (local.brightness > .7 ? 1 : 0) : third;
    const steps = [[0, 0], [1, 1 + Math.round(theme.texture)], [2, ending]];
    if (p.density < 35) steps.splice(1, 1);
    if (p.density + local.texture * 25 > 72) steps.splice(1, 0, [.5, 1]);
    if (p.density > 85) steps.push([3, bar % 2 ? 0 : 1]);
    for (const [offset, interval] of steps) {
      const sample = Math.round((start + offset * beat) * rate);
      if (sample >= Math.round(duration * rate)) break;
      const degree = root + interval;
      const midi = (p.octave + 1) * 12 + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length);
      const f = feature(sample / rate);
      notes.push({start:sample, freq:440 * 2 ** ((midi - 69) / 12),
        velocity:(.16 + f.brightness * .2) * (offset === 0 ? 1 : .85), decay:.48 + f.saturation * .5});
    }
  }
  return notes;
}
export function renderAudio({features,mode,params,duration,space=.35},rate=SAMPLE_RATE){
  if(!features?.length||!Number.isFinite(duration)||duration<=0||duration>60)throw new Error('Invalid render input');
  const length=Math.round(duration*rate),left=new Float32Array(length),right=new Float32Array(length);
  let seed=317923;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  let low=0,phase=0,phase2=0,voices=[],nextNote=0,f=features[0],freq=220,filter=.2;
  const p={...defaults[mode],...params},tau=2*Math.PI,delayA=Math.floor(rate*.173),delayB=Math.floor(rate*.281);
  const melody = mode==='piano' && p.style==='melody' ? melodyNotes(features,p,duration,rate) : null;
  const attacks=[];
  let melodyIndex=0;
  for(let i=0;i<length;i++){
    const t=i/rate;
    if(i%128===0){f=featureAt(features,t/duration);freq=noteFrequency(f,p.octave||3,p.scale);filter=1-Math.exp(-tau*clamp(p.cutoff*(.2+.8*f.brightness),80,rate*.4)/rate);}
    let v=0;
    if(mode==='noise'){
      const white=random()*2-1;low+=filter*(white-low);
      v=(p.color==='pink'?low*.65+white*.08:p.color==='brown'?low*.35:low);
      v*=.23*(.25+f.brightness*.75)*(1+.32*Math.sin(t*tau*(.15+p.movement/80+f.motion*2)))*(1+f.texture*.5);
    }else if(mode==='piano'){
      let note;
      if(melody){
        if(melody[melodyIndex]?.start===i) note=melody[melodyIndex++];
      }else if(i>=nextNote){
        const beat=60/p.bpm,interval=beat/(p.density>65?2:1);
        nextNote=i+Math.floor(interval*rate);
        if(random()<.35+p.density/140+f.texture*.3) note={start:i,freq:noteFrequency(f,p.octave,p.scale),velocity:.16+f.brightness*.2,decay:.65+f.saturation*1.1};
      }
      if(note){
        voices.push(note);
        attacks.push({time:t,velocity:note.velocity});
      }
      if(voices.length && i-voices[0].start>=rate*3.5) voices.shift();
      for(const n of voices){const age=(i-n.start)/rate,a=tau*n.freq*age;
        // Decaying, slightly inharmonic partials and a brief hammer transient.
        const env=Math.min(1,age/.006)*Math.exp(-age/n.decay);
        v+=(Math.sin(a)+.34*Math.sin(a*2.002)*Math.exp(-age*1.5)+.16*Math.sin(a*3.008)*Math.exp(-age*3)+.06*Math.sin(a*4.018)*Math.exp(-age*5))*env*n.velocity*.52;
      }
    }else{
      const mod=Math.sin(t*tau*(.12+f.motion*3))*p.modulation*.08;
      phase=(phase+freq*2**(mod/12)/rate)%1;phase2=(phase2+freq*1.003/rate)%1;
      const osc=(phase)=>p.wave==='triangle'?1-4*Math.abs(phase-.5):p.wave==='saw'?(.7*Math.sin(tau*phase)+.3*Math.sin(tau*phase*2)+.16*Math.sin(tau*phase*3)+.08*Math.sin(tau*phase*4)):Math.sin(tau*phase);
      const raw=(osc(phase)+osc(phase2))*.5;low+=filter*(raw-low);
      v=low*.25*(.3+f.brightness*.7)*(1+Math.sin(t*tau*(.3+f.texture*5))*.12*p.modulation/100);
    }
    const pan=Math.sin(t/duration*Math.PI*2)*.18;
    // Short stereo feedback network; same samples used by playback and WAV.
    const wetL=(i>=delayA?right[i-delayA]:0)*space*.38+(i>=delayB?left[i-delayB]:0)*space*.24;
    const wetR=(i>=delayB?left[i-delayB]:0)*space*.38+(i>=delayA?right[i-delayA]:0)*space*.24;
    const fade=Math.min(1,t/.02,(duration-t)/.08);
    left[i]=Math.tanh(v*(1-pan)+wetL)*fade;right[i]=Math.tanh(v*(1+pan)+wetR)*fade;
  }
  return {left,right,rate,attacks};
}
export function encodeWav({left,right,rate},volume=1){
  const out=new ArrayBuffer(44+left.length*4),v=new DataView(out);
  const str=(at,s)=>[...s].forEach((c,j)=>v.setUint8(at+j,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,36+left.length*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,left.length*4,true);
  for(let i=0;i<left.length;i++){v.setInt16(44+i*4,Math.round(clamp(left[i]*volume,-1,1)*32767),true);v.setInt16(46+i*4,Math.round(clamp(right[i]*volume,-1,1)*32767),true);}
  return out;
}
