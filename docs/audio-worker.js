import {renderAudio} from './engine.js';
self.onmessage=({data})=>{try{const audio=renderAudio(data.config);self.postMessage({id:data.id,audio},[audio.left.buffer,audio.right.buffer]);}catch(error){self.postMessage({id:data.id,error:error.message});}};
