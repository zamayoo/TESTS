/* Тести на державну службу: source texts remain separate from generated options. */
const $=id=>document.getElementById(id);
const STORAGE='audit-trainer-progress-v1';
const icons={legislation:'⚖',isa:'◈',intosai:'◇',accounting:'▦',analysis:'⌁'};
const letters=['A','B','C','D'];
// Only citations checked against official legal texts are allowed in explanations.
const verifiedNorms={
 'legislation-1':{name:'Бюджетний кодекс України, стаття 22',url:'https://zakon.rada.gov.ua/laws/show/2456-17#Text'},
 'legislation-2':{name:'Бюджетний кодекс України, стаття 58',url:'https://zakon.rada.gov.ua/laws/show/2456-17#Text'},
 'legislation-3':{name:'Конституція України, стаття 85, частина перша, пункт 4',url:'https://zakon.rada.gov.ua/laws/show/254%D0%BA/96-%D0%B2%D1%80#Text'},
 'legislation-4':{name:'Бюджетний кодекс України, стаття 7',url:'https://zakon.rada.gov.ua/laws/show/2456-17#Text'},
 'legislation-5':{name:'Закон України «Про Рахункову палату», стаття 18',url:'https://zakon.rada.gov.ua/laws/show/576-19#Text'},
 'legislation-6':{name:'Закон України «Про Рахункову палату», стаття 3',url:'https://zakon.rada.gov.ua/laws/show/576-19#Text'}
};
const normPending='Точне посилання на чинну норму для цього запитання ще не перевірене. Щоб не вводити вас в оману, пояснення без підтвердженого нормативного джерела не надається.';
function normativeExplanation(q,opt){let norm=verifiedNorms[q.id];if(!norm)return normPending;return (opt.explanation||'') .replace(/\s*(Старий текст PDF[^.]*\.|У попередньому чат-тесті[^.]*\.|Відповідь зі старого PDF[^.]*\.|Застарілий перелік у PDF[^.]*\.)/g,'')+'\n\nНорма: '+norm.name+'\n'+norm.url}
let data,items=[],activeGroup='legislation',active=0,filter='all',query='',state={answers:{},notes:{},bookmarks:{},font:1};
let appMode='study',exam=null,examIndex=0;
try{state={...state,...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{};window.testsAccount?.sync(state)}
function safe(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function rnd(n){let x=(n*1664525+1013904223)>>>0;return ()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296}}
function short(s,max=230){s=String(s).replace(/^[-•\s]+/,'').trim();return s.length>max?s.slice(0,max).replace(/\s+\S*$/,'')+'…':s}
function terms(s){let stop=new Set(['та','для','що','які','яка','про','при','від','або','через','згідно','відповідно','україни','української','цей','вони','як','його','вона','може','також','під','або','таке','тільки','всі','всіх','їх','цього','інших','іншого','таких','після','своїх','своєї','бути','яким','якій','яких','вони','не']);return new Set(String(s).toLowerCase().match(/[а-яіїєґa-z]{4,}/g)?.filter(w=>!stop.has(w))||[])}
const overrides={
 'legislation-1':{choices:['Виключно Міністерство фінансів України.','Бюджетні установи в особі їх керівників, уповноважені на бюджетні асигнування, зобов’язання та видатки.','Лише Державна казначейська служба України.','Всі юридичні особи, що сплачують податки.'],correct:1,hint:'Зверніть увагу: розпорядник має повноваження брати бюджетні зобов’язання.',explanation:'Стаття 22 Бюджетного кодексу України: розпорядниками бюджетних коштів є бюджетні установи в особі їх керівників. Їх поділяють на головних та нижчого рівня.'},
 'legislation-2':{choices:['Виключно звітність Рахункової палати.','Лише бюджетну звітність.','Виключно фінансову звітність.','Фінансову та бюджетну звітність.'],correct:3,hint:'Відрізняйте облік виконання бюджету від фінансового стану.',explanation:'Частина перша статті 58 Бюджетного кодексу встановлює, що звітність про виконання Державного бюджету України включає фінансову та бюджетну звітність.',updated:true},
 'legislation-3':{choices:['Кабінет Міністрів України.','Міністерство фінансів України.','Верховна Рада України.','Рахункова палата.'],correct:2,hint:'Хто ухвалює закон про Державний бюджет?',explanation:'Пункт 4 частини першої статті 85 Конституції України відносить затвердження Державного бюджету до повноважень Верховної Ради.'},
 'legislation-4':{choices:['Єдності, централізації, прибутковості.','Єдності, збалансованості, самостійності.','Самостійності, конфіденційності, субсидіарності.','Повноти, пріоритетності доходів, закритості.'],correct:1,hint:'Шукайте всі три принципи, які прямо перелічені у статті 7 Кодексу.',explanation:'Стаття 7 Бюджетного кодексу України прямо називає принципи єдності, збалансованості й самостійності, а також інші сім принципів.'},
 'legislation-5':{choices:['На всіх членів Рахункової палати та всіх працівників її апарату.','Лише на державних аудиторів апарату.','На інших посадових осіб апарату, крім Секретаря, його заступника, державних аудиторів і радників членів Палати.','Лише на Секретаря Палати та його заступника.'],correct:2,hint:'Закон 2024 року передбачив окремий статус для аудиторів, Секретаря та радників.',explanation:'Стаття 18 Закону «Про Рахункову палату»: інші посадові особи апарату є державними службовцями. Секретар, його заступник, державні аудитори, радники та члени Палати не підпадають під Закон «Про державну службу».',updated:true},
 'legislation-6':{choices:['Законність, незалежність, політична доцільність.','Об’єктивність, гласність, підпорядкованість Уряду.','Безсторонність, неупередженість, комерційна ефективність.','Законність, незалежність, об’єктивність, безсторонність, гласність та неупередженість.'],correct:3,hint:'Рахункова палата повинна здійснювати зовнішній аудит незалежно та неупереджено.',explanation:'Стаття 3 Закону «Про Рахункову палату» закріплює шість принципів: законність, незалежність, об’єктивність, безсторонність, гласність, неупередженість.',updated:true}
};
function makeQuiz(q){if(q.missing)return null;if(overrides[q.id])return overrides[q.id];
 const rng=rnd(q.number*131+q.group.length),others=data.questions.filter(x=>x.group===q.group&&!x.missing&&x.id!==q.id&&x.answer.length>8);
 const correct=short(q.answer,205);let used=new Set([correct.toLowerCase()]);let alternatives=[];
 // Rank genuine alternative source answers for topical similarity. They are
 // training distractors, not independently verified official MCQ choices.
 const questionTerms=terms(q.question),answerTerms=terms(q.answer);
 const ranked=others.map(other=>{const target=terms(other.question+' '+other.answer);let score=0;
  for(let w of questionTerms)if(target.has(w))score+=3;
  for(let w of answerTerms)if(target.has(w))score+=1;
  score-=Math.abs(short(other.answer,205).length-correct.length)/100;
  score+=(rng()-.5)*.1;
  return{other,score};}).sort((a,b)=>b.score-a.score);
 for(const {other} of ranked){if(alternatives.length===3)break;let candidate=short(other.answer,205);if(!used.has(candidate.toLowerCase())){used.add(candidate.toLowerCase());alternatives.push(candidate)}}
 for(const p of others){if(alternatives.length>=3)break;let v=short(p.answer,205);if(!used.has(v.toLowerCase())){used.add(v.toLowerCase());alternatives.push(v)}}
 let correctIndex=Math.floor(rng()*4),choices=[],idx=0;
 for(let i=0;i<4;i++)choices.push(i===correctIndex?correct:alternatives[idx++]);
 return{choices,correct:correctIndex,hint:'Зіставте зміст варіантів із запитанням. Точність нормативного обґрунтування перевіряйте окремо.',explanation:normPending,generated:true};
}
function currentList(){return items.filter(q=>{
 if(activeGroup!=='all'&&q.group!==activeGroup)return false;
 if(query&&!String(q.number+' '+q.question+' '+q.answer).toLowerCase().includes(query.toLowerCase()))return false;
 const v=state.answers[q.id];
 if(filter==='unanswered'&&v)return false;
 if(filter==='wrong'&&(!v||v.correct))return false;
 if(filter==='bookmarked'&&!state.bookmarks[q.id])return false;
 if(filter==='missing'&&!q.missing)return false;
 return true;
 })}
function getCurrent(){let list=currentList();if(active>=list.length)active=Math.max(0,list.length-1);return list[active]}
function renderBlocks(){let groups=[{id:'all',title:'Усі питання'}].concat(data.groups);
 $('blocks').innerHTML=groups.map(g=>{let questions=items.filter(q=>g.id==='all'||q.group===g.id);let answered=questions.filter(q=>state.answers[q.id]).length;return `<button class="block ${activeGroup===g.id?'active':''}" data-group="${g.id}"><span class="block-ico">${icons[g.id]||'▤'}</span><span><strong>${safe(g.title)}</strong><small>${answered} / ${questions.filter(q=>!q.missing).length} опрацьовано</small><span class="block-progress"><span style="width:${questions.filter(q=>!q.missing).length?Math.round(answered/questions.filter(q=>!q.missing).length*100):0}%"></span></span></span></button>`}).join('');
 document.querySelectorAll('.block').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.group;active=0;query='';filter='all';$('search').value='';$('filter').value='all';render();navigate('learning')});
 const cards=$('topicCards');if(cards){cards.innerHTML=groups.map(g=>{const questions=items.filter(q=>g.id==='all'||q.group===g.id&&!q.missing),done=questions.filter(q=>state.answers[q.id]).length,total=questions.length,percent=total?Math.round(done/total*100):0;return `<button class="topic-card ${activeGroup===g.id?'active':''}" data-topic="${safe(g.id)}" type="button"><span class="topic-card-icon">${icons[g.id]||'▤'}</span><span class="topic-card-copy"><strong>${safe(g.title)}</strong><small>${total} питань</small></span><span class="topic-ring" style="--pct:${percent}%">${percent}%</span><span class="topic-arrow">›</span></button>`}).join('');cards.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.topic;active=0;query='';filter='all';$('search').value='';$('filter').value='all';render();navigate('learning');$('questionCard').scrollIntoView({behavior:'smooth',block:'start'})})}
}
function renderStats(){let present=items.filter(q=>!q.missing);let taken=present.filter(q=>state.answers[q.id]);let correct=taken.filter(q=>state.answers[q.id].correct);let wrong=taken.length-correct.length;
 const bits=[['ОПРАЦЬОВАНО',taken.length,'▤'],['ПРАВИЛЬНИХ',correct.length,'✓'],['ПОМИЛОК',wrong,'↺'],['ТОЧНІСТЬ',taken.length?Math.round(correct.length/taken.length*100)+'%':'0%','◎']];$('stats').innerHTML=bits.map(a=>`<div class="stat"><div><small>${a[0]}</small><strong>${a[1]}</strong></div><div class="stat-icon">${a[2]}</div></div>`).join('')}
function hidePanels(){for(let id of ['hintPanel','explainPanel','sourcePanel'])$(id).hidden=true}
function render(){renderBlocks();renderStats();let list=currentList(),q=getCurrent();let group=data.groups.find(x=>x.id===activeGroup);
 $('currentTitle').textContent=group?group.title:'Усі тематичні блоки';$('blockEyebrow').textContent=activeGroup==='all'?'УСІ НАВЧАЛЬНІ БЛОКИ':'ТЕМАТИЧНИЙ БЛОК';
 $('position').textContent=q?'Питання '+q.number:'Немає питань';$('counter').textContent=' / '+(activeGroup==='all'?items.length:items.filter(x=>x.group===activeGroup).length);$('answeredInBlock').textContent=list.length+' у поточному списку';
 let base=items.filter(x=>activeGroup==='all'||x.group===activeGroup);$('progressBar').style.width=(base.length?100*base.filter(x=>state.answers[x.id]).length/base.filter(x=>!x.missing).length:0)+'%';
 $('prevBtn').disabled=active===0;$('nextBtn').disabled=active>=list.length-1;$('jumpInput').value=q?.number||'';hidePanels();
 if(!q){$('questionText').textContent='У цій вибірці немає запитань.';$('answers').innerHTML='';$('tag').textContent='ПОРОЖНІЙ СПИСОК';$('feedback').hidden=true;return}
 let opt=makeQuiz(q),result=state.answers[q.id];$('tag').textContent='ПИТАННЯ № '+q.number+(q.missing?' · ВІДСУТНЄ':opt.updated?' · ОНОВЛЕНО ЗАКОН':'');$('questionText').textContent=q.question;
 $('bookmarkBtn').textContent=state.bookmarks[q.id]?'★':'☆';$('bookmarkBtn').classList.toggle('saved',!!state.bookmarks[q.id]);$('bookmarkBtn').onclick=()=>{state.bookmarks[q.id]=!state.bookmarks[q.id];save();render()};
 $('noteInput').value=state.notes[q.id]||'';$('noteInput').oninput=()=>{state.notes[q.id]=$('noteInput').value;save();$('noteSaved').textContent='Збережено в цьому браузері'};
 if(q.missing){$('answers').innerHTML='<div class="empty">Текст цього номера відсутній у навчальних матеріалах. Питання та відповідь не вигадувалися. Ви можете додати коментар або перейти далі.</div>';$('feedback').hidden=true}
 else{
  $('answers').innerHTML=opt.choices.map((txt,i)=>`<button class="answer ${result?(i===opt.correct?'right':i===result.choice?'wrong':''):''}" data-choice="${i}" ${result?'disabled':''}><span class="letter">${letters[i]}</span><span>${safe(txt)}</span></button>`).join('');
  document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>answer(q,Number(b.dataset.choice)));
  $('feedback').hidden=!result;if(result){$('feedback').className='feedback '+(result.correct?'':'bad');$('feedback').innerHTML=`<strong>${result.correct?'✓ Правильно!':'✕ Не зовсім. Правильний варіант — '+letters[opt.correct]+'.'}</strong><div>${safe(normativeExplanation(q,opt))}</div>`}
 }
 $('hintBtn').onclick=()=>toggle('hintPanel',opt?.hint||'Підказка недоступна для відсутньої картки.');
 $('explainBtn').onclick=()=>toggle('explainPanel',opt?normativeExplanation(q,opt):'Текст запитання відсутній.');
 $('sourceBtn').onclick=()=>toggle('sourcePanel',q.missing?'Відсутній початковий текст':q.answer);
}
function toggle(id,msg){let el=$(id);if(el.hidden){el.textContent=msg;el.hidden=false}else el.hidden=true}
function answer(q,choice){let opt=makeQuiz(q);state.answers[q.id]={choice,correct:choice===opt.correct,at:new Date().toISOString()};save();render();if(!state.answers[q.id].correct)$('feedback').scrollIntoView({block:'nearest',behavior:'smooth'})}
function shift(n){let next=active+n;if(next>=0&&next<currentList().length){active=next;stop();render();window.scrollTo({top:document.querySelector('.workspace-head').offsetTop-30,behavior:'smooth'})}}
let speechGeneration=0,playingAudio=null,playingSource=null,soundContext=null,neuralWorker=null,neuralWorkerReady=null,requestId=0,waiters=new Map(),lastBlobUrl=null;
function setSpeechStatus(message){$('ttsStatus').textContent=message}
function stop(){speechGeneration++;if('speechSynthesis'in window)speechSynthesis.cancel();if(playingSource){try{playingSource.stop()}catch{}playingSource=null}if(playingAudio){playingAudio.pause();playingAudio.src='';playingAudio=null}if($('lastAudio'))$('lastAudio').pause();setSpeechStatus('Озвучення зупинено. Можна запустити ще раз.')}
function unlockSound(){let Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('Ваш браузер не підтримує Web Audio');if(!soundContext)soundContext=new Context();let promise=soundContext.resume();return promise}
async function playNeuralSamples(samples,sampleRate,token){if(token!==speechGeneration)return;await soundContext.resume();if(token!==speechGeneration)return;let buffer=soundContext.createBuffer(1,samples.length,sampleRate);buffer.copyToChannel(samples,0);await new Promise((resolve,reject)=>{let source=soundContext.createBufferSource();source.buffer=buffer;source.playbackRate.value=Number($('ttsRate').value)||.9;source.connect(soundContext.destination);playingSource=source;source.onended=()=>{if(playingSource===source)playingSource=null;resolve()};try{source.start()}catch(error){reject(error)}})}
function asSpeech(s){return String(s||'').replace(/№\s*(\d+)/g,'номер $1').replace(/\bНАДС\b/g,'Національного агентства України з питань державної служби').replace(/\s+/g,' ').replace(/\s+([,.!?;:])/g,'$1').trim()}
function speechChunks(text,max=210){let sentences=asSpeech(text).match(/[^.!?;:]+[.!?;:]*/g)||[text],chunks=[],part='';for(let sentence of sentences){sentence=sentence.trim();if(!sentence)continue;if(part.length+sentence.length>max&&part){chunks.push(part);part=''}if(sentence.length>max){let pieces=sentence.match(/.{1,160}(?:\s|$)|.{1,160}/g)||[sentence];for(let p of pieces){if(part){chunks.push(part);part=''}chunks.push(p.trim())}}else part+=(part?' ':'')+sentence}if(part)chunks.push(part);return chunks}
function chosenVoice(){let voices=window.speechSynthesis?.getVoices()||[];return voices.find(v=>v.voiceURI===$('voiceSelect').value)||voices.find(v=>/^uk/i.test(v.lang))||voices[0]}
function listVoices(){if(!('speechSynthesis'in window))return;let voices=speechSynthesis.getVoices(),uk=voices.filter(v=>/^uk/i.test(v.lang));let ordered=[...uk,...voices.filter(v=>!uk.includes(v))];$('voiceSelect').innerHTML=ordered.map(v=>`<option value="${safe(v.voiceURI)}">${safe(v.name+' · '+v.lang)}</option>`).join('');let saved=state.ttsVoice;if(saved&&ordered.some(v=>v.voiceURI===saved))$('voiceSelect').value=saved;else if(uk.length)$('voiceSelect').value=uk[0].voiceURI;else if(!ordered.length)$('voiceSelect').innerHTML='<option value="">Голоси не завантажені</option>'}
async function browserSpeech(text,token){
  if(!('speechSynthesis' in window))throw Error('Браузер не підтримує синтез мовлення');
  let chunks=speechChunks(text,190);
  setSpeechStatus('Відтворюю голос пристрою. Українські наголоси залежать від установленого голосу.');
  speechSynthesis.cancel();
  for(let chunk of chunks){
    if(token!==speechGeneration)return;
    await new Promise((resolve,reject)=>{
      let utterance=new SpeechSynthesisUtterance(chunk),settled=false;
      utterance.lang='uk-UA';utterance.rate=Number($('ttsRate').value)||.9;
      utterance.pitch=1;utterance.voice=chosenVoice()||null;
      const timeout=setTimeout(()=>finish(Error('Голос пристрою не відповідає')),30000);
      function finish(error){if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolve();}
      utterance.onend=()=>finish();
      utterance.onerror=e=>finish(Error('Помилка голосу пристрою: '+(e.error||'невідома')));
      try{speechSynthesis.speak(utterance);}catch(error){finish(error);}
    });
  }
}
function wavBlob(samples,sampleRate){let view=new DataView(new ArrayBuffer(44+samples.length*2)),str=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};str(0,'RIFF');view.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++){let x=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,x<0?x*32768:x*32767,true)}return new Blob([view.buffer],{type:'audio/wav'})}
function workerRequest(type,text){return new Promise((resolve,reject)=>{let id=++requestId;waiters.set(id,{resolve,reject});neuralWorker.postMessage({type,id,text})})}
function startNeuralWorker(){if(neuralWorkerReady)return neuralWorkerReady;neuralWorkerReady=new Promise((resolve,reject)=>{try{neuralWorker=new Worker('./tts-worker.js?v=5',{type:'module'});neuralWorker.onmessage=e=>{let m=e.data;if(m.type==='ready')resolve();if(m.type==='status')setSpeechStatus(m.text);if(m.type==='audio'||m.type==='error'){let p=waiters.get(m.id);if(p){waiters.delete(m.id);m.type==='error'?p.reject(Error(m.message)):p.resolve(m)}}if(m.type==='load-error'){neuralWorkerReady=null;reject(Error(m.message))}};neuralWorker.onerror=e=>{neuralWorkerReady=null;reject(Error(e.message||'Не вдалося запустити фоновий потік'))};neuralWorker.postMessage({type:'load'})}catch(err){neuralWorkerReady=null;reject(err)}});return neuralWorkerReady}
async function neuralSpeech(text,token){setSpeechStatus('Завантажую українську нейромодель. Перший запуск може тривати кілька хвилин.');await startNeuralWorker();if(token!==speechGeneration)return;let chunks=speechChunks(text,170),parts=[],rate=16000;for(let i=0;i<chunks.length;i++){if(token!==speechGeneration)return;setSpeechStatus('Створюю аудіозапис: '+(i+1)+' із '+chunks.length+' фрагментів…');let result=await workerRequest('synthesize',chunks[i]);if(token!==speechGeneration)return;rate=result.sampleRate;parts.push(new Float32Array(result.samples))}let pause=Math.round(rate*.28),count=parts.reduce((s,p)=>s+p.length,0)+pause*(parts.length-1),samples=new Float32Array(count),cursor=0;for(let part of parts){samples.set(part,cursor);cursor+=part.length+pause}if(!samples.length||!samples.some(x=>Math.abs(x)>.0001))throw Error('Модель повернула порожній або беззвучний запис');let blob=wavBlob(samples,rate);if(lastBlobUrl)URL.revokeObjectURL(lastBlobUrl);lastBlobUrl=URL.createObjectURL(blob);$('lastAudio').src=lastBlobUrl;$('lastAudio').load();$('downloadAudio').href=lastBlobUrl;$('audioReplay').hidden=false;setSpeechStatus('Аудіозапис згенеровано ('+Math.round(samples.length/rate)+' с). Натисніть ▶ Play у плеєрі нижче.');try{await $('lastAudio').play();if(token!==speechGeneration)$('lastAudio').pause()}catch{setSpeechStatus('Аудіозапис готовий. Браузер заблокував автоматичний запуск — натисніть ▶ Play у плеєрі нижче.')}}
async function serverSpeech(text,token){
  setSpeechStatus('Готую озвучення українським голосом Тетяна…');
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),95000);
  let response;
  try {response=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,1800)}),signal:controller.signal});}
  finally {clearTimeout(timeout);}
  if(!response.ok){let detail=await response.json().catch(()=>({}));throw Error(detail.detail||'Сервер озвучення не відповідає: '+response.status);}
  let blob=await response.blob();
  if(!blob.size || !/audio\/|application\/octet-stream/.test(response.headers.get('content-type')||''))throw Error('Сервер повернув не аудіофайл');
  if(token!==speechGeneration)return;
  if(lastBlobUrl)URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl=URL.createObjectURL(blob);
  const player=$('lastAudio');player.pause();player.src=lastBlobUrl;player.load();
  player.playbackRate=Number($('ttsRate').value)||1;
  $('downloadAudio').href=lastBlobUrl;$('audioReplay').hidden=false;
  setSpeechStatus('Аудіо готове. Натисніть Play, якщо звук не почався.');
  try{await player.play();if(token!==speechGeneration)player.pause();}
  catch{setSpeechStatus('Аудіо готове. Браузер обмежив автовідтворення — натисніть Play у плеєрі.');}
}
async function speak(){let card=appMode==='exam'&&exam&&!exam.finished?exam.cards[examIndex]:null,q=card?.q||getCurrent();if(!q)return;stop();let token=speechGeneration,opt=card?card.quiz:makeQuiz(q),text='Питання номер '+q.number+'. '+q.question+(opt?' Варіанти відповідей: '+opt.choices.map((v,i)=>' Варіант '+(i+1)+': '+v+'\n').join(' '):' Питання відсутнє у джерелі.');try{if($('ttsMode').value==='server')await serverSpeech(text,token);else if($('ttsMode').value==='neural'){await unlockSound();await neuralSpeech(text,token)}else await browserSpeech(text,token);if(token===speechGeneration&&$('ttsMode').value==='browser')setSpeechStatus('Озвучення голосом пристрою завершено.')}catch(err){
  if(token!==speechGeneration)return;
  if($('ttsMode').value==='server' && 'speechSynthesis' in window){
    setSpeechStatus('Голос Тетяна недоступний: '+err.message+'. Пробую резервний голос пристрою…');
    try{await browserSpeech(text,token);if(token===speechGeneration)setSpeechStatus('Резервне озвучення завершено. Серверний голос потребує налаштування.');}
    catch(e){setSpeechStatus('Озвучення недоступне: '+e.message);}
  }else setSpeechStatus('Помилка озвучення: '+err.message);
}}
function copy(){let q=getCurrent(),o=q&&makeQuiz(q);if(!q)return;let txt='Питання '+q.number+'. '+q.question+'\n'+(o?o.choices.map((v,i)=>`${i+1}. ${v}`).join('\n'):'Питання відсутнє у джерелі.');navigator.clipboard?.writeText(txt).then(()=>{let btn=$('copyBtn');btn.textContent='✓ Скопійовано';setTimeout(()=>btn.textContent='▢ Скопіювати запитання',1600)}).catch(()=>prompt('Скопіюйте запитання:',txt))}
function randomOrder(list){let a=[...list];for(let i=a.length-1;i>0;i--){let bytes=new Uint32Array(1);crypto.getRandomValues(bytes);let j=bytes[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function setMode(mode){appMode=mode;stop();$('studyArea').hidden=mode!=='study';$('examSetup').hidden=mode!=='exam'||!!exam;$('examActive').hidden=mode!=='exam'||!exam||exam.finished;$('examResult').hidden=mode!=='exam'||!exam||!exam.finished;$('studyModeBtn').classList.toggle('selected',mode==='study');$('examModeBtn').classList.toggle('selected',mode==='exam');if(mode==='exam'&&exam&&!exam.finished)renderExam();if(mode==='exam'&&exam?.finished)renderResult()}
function attemptKey(person){return 'civil-service-exam-'+person.toLocaleLowerCase('uk-UA').replace(/\s+/g,'-')}
function retryDate(person){try{let record=JSON.parse(localStorage.getItem(attemptKey(person))||'null');return record?.nextAllowedAt&&Date.now()<Date.parse(record.nextAllowedAt)?new Date(record.nextAllowedAt):null}catch{return null}}
function startExam(){let names=['surname','givenName','patronymic'].map(id=>$(id).value.trim().replace(/\s+/g,' '));if(names.some(v=>!v)||names.some(v=>!/^[А-Яа-яІіЇїЄєҐґ’'\- ]+$/.test(v))){$('examSetupError').textContent='Введіть прізвище, ім’я та по батькові українськими літерами.';return}let person=names.join(' '),next=window.testsAccount?.blockedUntil()||retryDate(person);if(next){$('examSetupError').textContent='Повторне тестування буде доступне з '+next.toLocaleString('uk-UA')+'. До цього часу можете навчатися в режимі «Навчання».';return}let available=items.filter(q=>!q.missing);if(available.length<40){$('examSetupError').textContent='Недостатньо питань для тесту.';return}let cards=randomOrder(available).slice(0,40).map(q=>{let base=makeQuiz(q),order=randomOrder([0,1,2,3]);return{q,quiz:{...base,choices:order.map(i=>base.choices[i]),correct:order.indexOf(base.correct)},chosen:null}});exam={person,cards,finished:false,startedAt:new Date().toISOString()};examIndex=0;$('examSetupError').textContent='';setMode('exam')}
function renderExam(){if(!exam||exam.finished)return;let card=exam.cards[examIndex];$('examPerson').textContent=exam.person;$('examProgress').textContent=`Питання ${examIndex+1} із 40 · Відповіли на ${exam.cards.filter(c=>c.chosen!==null).length}`;$('examProgressBar').style.width=(100*exam.cards.filter(c=>c.chosen!==null).length/40)+'%';$('examQuestion').textContent=card.q.question;$('examAnswers').innerHTML=card.quiz.choices.map((v,i)=>`<button class="answer ${card.chosen===i?'chosen':''}" data-exam-choice="${i}"><span class="letter">${letters[i]}</span><span>${safe(v)}</span></button>`).join('');document.querySelectorAll('[data-exam-choice]').forEach(btn=>btn.onclick=()=>{card.chosen=Number(btn.dataset.examChoice);renderExam()});$('examPrevious').disabled=examIndex===0;$('examNext').hidden=examIndex===39;$('examFinish').hidden=examIndex!==39}
async function finishExam(){if(!exam)return;let answered=exam.cards.filter(c=>c.chosen!==null).length;if(answered<40&&!confirm(`Ви відповіли на ${answered} із 40 питань. Завершити тест зараз?`))return;let percent=Math.round(100*exam.cards.filter(c=>c.chosen===c.quiz.correct).length/40);if(window.testsAccount?.isLoggedIn()){try{$('examFinish').disabled=true;const serverResult=await window.testsAccount.submitExam(exam.person,exam.cards);percent=serverResult.score;exam.serverId=serverResult.id;if(serverResult.next_allowed_at)exam.nextAllowedAt=new Date(serverResult.next_allowed_at*1000).toISOString()}catch(err){$('examSetupError').textContent='Не вдалося зберегти результат: '+err.message;alert('Помилка збереження результату: '+err.message);$('examFinish').disabled=false;return}finally{$('examFinish').disabled=false}}exam.finished=true;exam.completedAt=new Date().toISOString();if(percent<70){let next=exam.nextAllowedAt?new Date(exam.nextAllowedAt):new Date(Date.now()+15*86400000);exam.nextAllowedAt=next.toISOString();try{localStorage.setItem(attemptKey(exam.person),JSON.stringify({score:percent,failedAt:exam.completedAt,nextAllowedAt:exam.nextAllowedAt}))}catch{}}else{try{localStorage.removeItem(attemptKey(exam.person))}catch{}}setMode('exam')}
function renderResult(){if(!exam?.finished)return;let correct=exam.cards.filter(c=>c.chosen===c.quiz.correct).length,wrong=40-correct,percent=Math.round(correct/40*100),passed=percent>=70;$('resultPerson').textContent=exam.person;$('resultScore').textContent=`${correct} / 40 · ${percent} балів зі 100`;$('certificateKind').textContent=passed?'НАВЧАЛЬНИЙ СЕРТИФІКАТ':'ДОВІДКА ПРО РЕЗУЛЬТАТ';$('resultVerdict').textContent=passed?'✓ Тестування успішно пройдено':'✕ Тестування не пройдено';$('resultDetails').textContent=`Правильних відповідей: ${correct}. Помилок і пропусків: ${wrong}. Прохідний бал: 70 зі 100.`;$('resultDate').textContent='Дата: '+new Date(exam.completedAt).toLocaleString('uk-UA');$('retakeInfo').textContent=passed?'Можна пройти новий тест для тренування.':'Повторне сертифікаційне тестування доступне з '+new Date(exam.nextAllowedAt).toLocaleString('uk-UA')+'.';$('newExam').disabled=!passed;$('examReview').hidden=true;$('examReview').innerHTML=exam.cards.map((c,i)=>{let right=c.chosen===c.quiz.correct;return `<div class="review-item"><strong>${i+1}. ${safe(c.q.question)}</strong><p class="${right?'good':'bad-text'}">${right?'✓ Правильно':'✕ Помилка або пропуск'} · Правильна відповідь: ${letters[c.quiz.correct]}. ${safe(c.quiz.choices[c.quiz.correct])}</p><p>${safe(normativeExplanation(c.q,c.quiz))}</p></div>`}).join('')}
function initializeExam(){let count=items.filter(q=>!q.missing).length;$('totalQuestionCount').textContent=count.toLocaleString('uk-UA');$('studyModeBtn').onclick=()=>setMode('study');$('examModeBtn').onclick=()=>setMode('exam');$('startExam').onclick=startExam;$('examPrevious').onclick=()=>{if(examIndex>0){examIndex--;renderExam()}};$('examNext').onclick=()=>{if(examIndex<39){examIndex++;renderExam()}};$('examFinish').onclick=finishExam;$('reviewMistakes').onclick=()=>{$('examReview').hidden=!$('examReview').hidden};$('newExam').onclick=()=>{exam=null;setMode('exam')};$('printCertificate').onclick=()=>window.print();$('testSound').onclick=async()=>{
  stop();
  const token=speechGeneration;
  const phrase='Вітаю! Перевіряємо українське озвучення. Слухайте, будь ласка, природне звучання голосу.';
  try{
    if($('ttsMode').value==='server'){
      const response=await fetch('/api/voice/status',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw Error('Статус голосового сервера: HTTP '+response.status);
      const info=await response.json();
      if(!info.ready)throw Error('Модель Piper ще не готова на сервері');
      await serverSpeech(phrase,token);
    }else if($('ttsMode').value==='neural'){
      await unlockSound();await neuralSpeech(phrase,token);
    }else await browserSpeech(phrase,token);
  }catch(error){
    if(token!==speechGeneration)return;
    setSpeechStatus('Помилка голосового тесту: '+error.message+'. Пробую резервний голос.');
    try{await browserSpeech(phrase,token);if(token===speechGeneration)setSpeechStatus('Перевірку завершено резервним голосом пристрою.');}
    catch(e){if(token===speechGeneration)setSpeechStatus('Голосовий тест не пройдено: '+e.message);}
  }
}}

// Separate, addressable SPA workspaces, while preserving existing quiz and exam engines.
function navigate(view,{scroll=true,record=true}={}){
 const pages=['home','catalog','learning','certification','account'];
 if(!pages.includes(view))view='home';
 document.querySelectorAll('.spa-view').forEach(node=>node.hidden=node.id!=='view-'+view);
 document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));
 document.body.dataset.activeView=view;
 if(view==='learning')setMode('study');
 if(view==='certification')setMode('exam');
 if(scroll)window.scrollTo({top:0,behavior:'instant'});
 const url=new URL(location.href);url.searchParams.set('view',view);
 if(record && new URLSearchParams(location.search).get('view')!==view)history.pushState({view},'',url.pathname+url.search+url.hash);
 else if(record)history.replaceState({view},'',url.pathname+url.search+url.hash);
}
window.testsNavigate=navigate;
function installNavigation(){
 document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
 const route=new URLSearchParams(location.search).get('view')||'home';
 navigate(route,{scroll:false,record:false});
 window.addEventListener('popstate',()=>navigate(new URLSearchParams(location.search).get('view')||'home',{scroll:false,record:false}));
}

async function init(){let response=await fetch('questions.json');data=await response.json();items=data.questions;await window.testsAccount?.setup(serverProgress=>{state={...state,...serverProgress};try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{};render()});render();initializeExam();$('prevBtn').onclick=()=>shift(-1);$('nextBtn').onclick=()=>shift(1);$('speakBtn').onclick=speak;$('speechTop').onclick=speak;$('stopBtn').onclick=stop;$('copyBtn').onclick=copy;
 $('ttsMode').value=state.ttsMode||'server';$('voiceWrap').hidden=$('ttsMode').value!=='browser';$('ttsRate').value=String(state.ttsRate||.9);$('ttsMode').onchange=()=>{stop();state.ttsMode=$('ttsMode').value;$('voiceWrap').hidden=state.ttsMode!=='browser';save();setSpeechStatus(state.ttsMode==='server'?'Тетяна · жіночий український голос на сервері.':state.ttsMode==='neural'?'Резервна модель MMS завантажується в браузер.':'Виберіть один із голосів, доступних у браузері.')};$('ttsRate').onchange=()=>{state.ttsRate=Number($('ttsRate').value);save()};$('voiceSelect').onchange=()=>{state.ttsVoice=$('voiceSelect').value;save()};listVoices();if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=listVoices;
 $('fontBtn').onclick=()=>{state.font=state.font>=1.36?1:Math.round((state.font+.12)*100)/100;document.documentElement.style.setProperty('--scale',state.font);save()};document.documentElement.style.setProperty('--scale',state.font||1);
 $('search').oninput=e=>{query=e.target.value;active=0;render()};$('filter').onchange=e=>{filter=e.target.value;active=0;render()};
 $('jumpBtn').onclick=()=>{let n=Number($('jumpInput').value),q=items.find(x=>x.number===n);if(q){activeGroup=q.group;filter='all';query='';$('search').value='';$('filter').value='all';active=items.filter(x=>x.group===activeGroup).findIndex(x=>x.number===n);render()}};
 $('exportBtn').onclick=()=>{let b=new Blob([JSON.stringify({format:'audit-trainer-progress-v1',state,exported:new Date().toISOString()},null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='audit-trainer-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
 $('importFile').onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{let p=JSON.parse(await f.text());if(p.format!=='audit-trainer-progress-v1'||!p.state)throw Error('Некоректний формат');if(!confirm('Замінити поточний прогрес даними з файлу?'))return;state=p.state;save();render();alert('Прогрес завантажено.')}catch(err){alert('Не вдалося імпортувати: '+err.message)}};
 installNavigation();
 $('resetBtn').onclick=()=>{if(confirm('Видалити всі відповіді, позначки та коментарі в цьому браузері?')){state={answers:{},notes:{},bookmarks:{},font:1};save();render()}};
}
init().catch(err=>{$('questionText').textContent='Помилка завантаження запитань: '+err.message});
