// Open-source Ukrainian neural TTS. Runs outside the UI thread.
let synthesizerPromise;
async function getSynthesizer(){if(!synthesizerPromise){synthesizerPromise=(async()=>{
 postMessage({type:'status',text:'Завантаження нейромоделі MMS із Hugging Face. Зачекайте, будь ласка...'});
 const {pipeline}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
 return pipeline('text-to-speech','payam1394/traxlate-mms-tts-ukr',{dtype:'fp32'});
})().catch(e=>{synthesizerPromise=null;throw e})}return synthesizerPromise}
self.onmessage=async event=>{let {type,id,text}=event.data;try{
 if(type==='load'){await getSynthesizer();postMessage({type:'ready'});return}
 if(type==='synthesize'){
  let synth=await getSynthesizer(),raw=await synth(text),samples=raw.audio;
  postMessage({type:'audio',id,samples:samples.buffer,sampleRate:raw.sampling_rate},[samples.buffer]);
 }
}catch(e){let message=String(e?.message||e);postMessage(type==='load'?{type:'load-error',message}:{type:'error',id,message})}};
