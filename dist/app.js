/* Тести на державну службу: source texts remain separate from generated options. */
const $=id=>document.getElementById(id);
const STORAGE='audit-trainer-progress-v1';
const icons={legislation:'⚖',isa:'◈',intosai:'◇',accounting:'▦',analysis:'⌁'};
const letters=['A','B','C','D','E','F','G','H','I'];
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
let courses=[],course,data,items=[],activeGroup='legislation',active=0,filter='all',query='',state={answers:{},notes:{},bookmarks:{},font:1};
let appMode='study',exam=null,examIndex=0,examTimer=null;
const routeMeta={
 catalog:['НАВЧАЛЬНА ПЛАТФОРМА','Каталог напрямів'],
 learning:['КУРС · ДЕРЖАВНА СЛУЖБА','Навчання'],
 certification:['КУРС · ДЕРЖАВНА СЛУЖБА','Сертифікація'],
 account:['ОСОБИСТИЙ ПРОСТІР','Особистий кабінет'],
 settings:['НАЛАШТУВАННЯ','Озвучення та параметри']
};
function routeFromLocation(){
 const route=location.hash.replace(/^#\/?/,'').split('/')[0];
 return routeMeta[route]?route:'catalog';
}
function closeMobileMenu(){
 $('sidebar')?.classList.remove('open');
 $('sidebarScrim').hidden=true;
 $('menuBtn')?.setAttribute('aria-expanded','false');
}
function navigate(route,{replace=false,focus=true}={}){
 if(!routeMeta[route])route='catalog';
 document.querySelectorAll('[data-view]').forEach(view=>view.hidden=view.dataset.view!==route);
 document.querySelectorAll('.app-nav-item').forEach(button=>{
  const selected=button.dataset.route===route;
  button.classList.toggle('active',selected);
  if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 $('learningNavigation').hidden=route!=='learning';
 document.body.dataset.route=route;
 let [eyebrow,title]=routeMeta[route];
 if(course&&route==='learning')eyebrow='КУРС · '+course.code;
 if(course&&route==='certification')eyebrow='СЕРТИФІКАЦІЯ · '+course.code;
 $('routeEyebrow').textContent=eyebrow;
 $('routeTitle').textContent=title;
 document.title=title+' — TESTS';
 appMode=route==='certification'?'exam':'study';
 if(route==='certification'){
  $('examSetup').hidden=!!exam;
  $('examActive').hidden=!exam||exam.finished;
  $('examResult').hidden=!exam||!exam.finished;
  if(exam&&!exam.finished)renderExam();
  if(exam?.finished)renderResult();
 }
 const nextHash='#/'+route;
 if(location.hash!==nextHash)history[replace?'replaceState':'pushState'](null,'',nextHash);
 closeMobileMenu();
 if(focus){window.scrollTo({top:0,behavior:'smooth'});$('mainContent')?.focus({preventScroll:true})}
}
window.testsNavigate=(route,options)=>navigate(route,options);
try{state={...state,...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{};window.testsAccount?.sync(state)}
// Preferences are intentionally separate from cloud learning progress and exam results.
const PREFS_KEY='tests-ui-preferences-v1';
const PREFS_DEFAULT={theme:'system',density:'comfortable',contrast:false,font:100,
  motion:false,progress:true,rememberTopic:true,autoNext:false};
function loadPrefs(){
 try{
  const v=JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');
  if(!v||typeof v!=='object'||Array.isArray(v))return {...PREFS_DEFAULT};
  return {...PREFS_DEFAULT,
   theme:['system','light','dark'].includes(v.theme)?v.theme:'system',
   density:['comfortable','compact'].includes(v.density)?v.density:'comfortable',
   contrast:v.contrast===true,font:Math.min(150,Math.max(85,Number(v.font)||100)),
   motion:v.motion===true,progress:v.progress!==false,
   rememberTopic:v.rememberTopic!==false,autoNext:v.autoNext===true};
 }catch{return {...PREFS_DEFAULT}}
}
let prefs=loadPrefs();
function applyPrefs(){
 const root=document.documentElement;
 root.dataset.theme=prefs.theme;
 root.dataset.density=prefs.density;
 root.dataset.contrast=prefs.contrast?'high':'normal';
 root.dataset.motion=prefs.motion?'reduced':'normal';
 root.dataset.showProgress=prefs.progress?'yes':'no';
 root.style.setProperty('--scale',String(prefs.font/100));
 if($('prefFontValue'))$('prefFontValue').textContent=prefs.font+'%';
}
function updatePref(key,value){
 prefs[key]=value;
 try{localStorage.setItem(PREFS_KEY,JSON.stringify(prefs))}catch{}
 applyPrefs();
 if($('prefNotice'))$('prefNotice').textContent='Параметри збережено у браузері.';
}
function setupPreferences(){
 const fields={prefTheme:'theme',prefDensity:'density',prefContrast:'contrast',
  prefFont:'font',prefMotion:'motion',prefProgress:'progress',
  prefRememberTopic:'rememberTopic',prefAutoNext:'autoNext'};
 for(const [id,key] of Object.entries(fields)){
  const el=$(id);if(!el)throw Error('Немає елемента налаштувань '+id);
  if(el.type==='checkbox')el.checked=!!prefs[key];
  else el.value=String(prefs[key]);
  el.addEventListener(el.type==='range'?'input':'change',()=>{
    updatePref(key,el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value);
  });
 }
 $('prefReset').onclick=()=>{
  prefs={...PREFS_DEFAULT};
  try{localStorage.setItem(PREFS_KEY,JSON.stringify(prefs));localStorage.removeItem('tests-last-topic')}catch{}
  setupPreferencesValues();applyPrefs();
  $('prefNotice').textContent='Стандартні налаштування відновлено. Навчальний прогрес збережено.';
 };
 setupPreferencesValues();applyPrefs();
}
function setupPreferencesValues(){
 const fields={prefTheme:'theme',prefDensity:'density',prefContrast:'contrast',
  prefFont:'font',prefMotion:'motion',prefProgress:'progress',
  prefRememberTopic:'rememberTopic',prefAutoNext:'autoNext'};
 for(const [id,key] of Object.entries(fields)){const el=$(id);if(!el)continue;
  if(el.type==='checkbox')el.checked=!!prefs[key];else el.value=String(prefs[key]);}
}
function rememberCurrentTopic(){
 if(!prefs.rememberTopic)return;
 try{localStorage.setItem('tests-last-topic',activeGroup)}catch{}
}
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
function questionExplanation(q,opt){
 if(q.source)return `Джерело: ${q.source.title}\n${q.source.url}`;
 return normativeExplanation(q,opt);
}
function makeQuiz(q){if(q.missing)return null;if(q.choices?.length)return{choices:q.choices,correct:q.correct,hint:'Проаналізуйте умову та відкиньте варіанти, що їй суперечать.',explanation:q.source?`Джерело: ${q.source.title}`:''};if(overrides[q.id])return overrides[q.id];
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
 document.querySelectorAll('.block').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.group;rememberCurrentTopic();active=0;query='';filter='all';$('search').value='';$('filter').value='all';render();navigate('learning')});
 const cards=$('topicCards');if(cards){cards.innerHTML=groups.map(g=>{const questions=items.filter(q=>g.id==='all'||q.group===g.id&&!q.missing),done=questions.filter(q=>state.answers[q.id]).length,total=questions.length,percent=total?Math.round(done/total*100):0;return `<button class="topic-card ${activeGroup===g.id?'active':''}" data-topic="${safe(g.id)}" type="button"><span class="topic-card-icon">${icons[g.id]||'▤'}</span><span class="topic-card-copy"><strong>${safe(g.title)}</strong><small>${total} питань</small></span><span class="topic-ring" style="--pct:${percent}%">${percent}%</span><span class="topic-arrow">›</span></button>`}).join('');cards.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.topic;rememberCurrentTopic();active=0;query='';filter='all';$('search').value='';$('filter').value='all';render();navigate('learning');$('questionCard').scrollIntoView({behavior:'smooth',block:'start'})})}
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
 let opt=makeQuiz(q),result=state.answers[q.id];$('tag').textContent='ПИТАННЯ № '+q.number+(q.missing?' · ВІДСУТНЄ':opt.updated?' · ОНОВЛЕНО ЗАКОН':'');$('questionText').innerHTML=safe(q.question)+(q.image?`<img class="question-image" src="${safe(q.image)}" alt="Ілюстрація до завдання ${q.number}">`:'');
 $('bookmarkBtn').textContent=state.bookmarks[q.id]?'★':'☆';$('bookmarkBtn').classList.toggle('saved',!!state.bookmarks[q.id]);$('bookmarkBtn').onclick=()=>{state.bookmarks[q.id]=!state.bookmarks[q.id];save();render()};
 $('noteInput').value=state.notes[q.id]||'';$('noteInput').oninput=()=>{state.notes[q.id]=$('noteInput').value;save();$('noteSaved').textContent='Збережено в цьому браузері'};
 if(q.missing){$('answers').innerHTML='<div class="empty">Текст цього номера відсутній у навчальних матеріалах. Питання та відповідь не вигадувалися. Ви можете додати коментар або перейти далі.</div>';$('feedback').hidden=true}
 else{
  $('answers').innerHTML=opt.choices.map((txt,i)=>`<button class="answer ${result?(i===opt.correct?'right':i===result.choice?'wrong':''):''}" data-choice="${i}" ${result?'disabled':''}><span class="letter">${letters[i]}</span><span>${safe(txt)}</span></button>`).join('');
  document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>answer(q,Number(b.dataset.choice)));
  $('feedback').hidden=!result;if(result){$('feedback').className='feedback '+(result.correct?'':'bad');$('feedback').innerHTML=`<strong>${result.correct?'✓ Правильно!':'✕ Не зовсім. Правильний варіант — '+letters[opt.correct]+'.'}</strong><div>${safe(questionExplanation(q,opt))}</div>`}
 }
 $('hintBtn').onclick=()=>toggle('hintPanel',opt?.hint||'Підказка недоступна для відсутньої картки.');
 $('explainBtn').onclick=()=>toggle('explainPanel',opt?questionExplanation(q,opt):'Текст запитання відсутній.');
 $('sourceBtn').onclick=()=>toggle('sourcePanel',q.missing?'Відсутній початковий текст':q.answer);
}
function toggle(id,msg){let el=$(id);if(el.hidden){el.textContent=msg;el.hidden=false}else el.hidden=true}
function answer(q,choice){
 const opt=makeQuiz(q);
 state.answers[q.id]={choice,correct:choice===opt.correct,at:new Date().toISOString()};
 save();render();
 if(!state.answers[q.id].correct){$('feedback').scrollIntoView({block:'nearest',behavior:'smooth'});return}
 if(prefs.autoNext && appMode==='study' && document.body.dataset.route==='learning'){
  const id=q.id;const position=active;
  setTimeout(()=>{if(prefs.autoNext && appMode==='study' && document.body.dataset.route==='learning'
   && active===position && getCurrent()?.id===id)shift(1)},1500);
 }
}
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
function setMode(mode){
 appMode=mode;stop();
 $('studyModeBtn').classList.toggle('selected',mode==='study');
 $('examModeBtn').classList.toggle('selected',mode==='exam');
 navigate(mode==='exam'?'certification':'learning');
}
function attemptKey(person){return `tests-exam-${course.id}-`+person.toLocaleLowerCase('uk-UA').replace(/\s+/g,'-')}
function retryDate(person){try{let record=JSON.parse(localStorage.getItem(attemptKey(person))||'null');return record?.nextAllowedAt&&Date.now()<Date.parse(record.nextAllowedAt)?new Date(record.nextAllowedAt):null}catch{return null}}
function startExam(){let names=['surname','givenName','patronymic'].map(id=>$(id).value.trim().replace(/\s+/g,' '));if(names.some(v=>!v)||names.some(v=>!/^[А-Яа-яІіЇїЄєҐґ’'\- ]+$/.test(v))){$('examSetupError').textContent='Введіть прізвище, ім’я та по батькові українськими літерами.';return}let person=names.join(' '),next=window.testsAccount?.blockedUntil(course.id)||retryDate(person);if(next){$('examSetupError').textContent='Повторне тестування буде доступне з '+next.toLocaleString('uk-UA')+'. До цього часу можете навчатися в режимі «Навчання».';return}let available=items.filter(q=>!q.missing),size=course.examSize;if(available.length<size){$('examSetupError').textContent='Недостатньо питань для тесту.';return}let cards=randomOrder(available).slice(0,size).map(q=>{let base=makeQuiz(q),order=randomOrder(base.choices.map((_,i)=>i));return{q,quiz:{...base,choices:order.map(i=>base.choices[i]),correct:order.indexOf(base.correct)},chosen:null}});exam={courseId:course.id,person,cards,finished:false,startedAt:new Date().toISOString(),deadline:course.timeLimitMinutes?Date.now()+course.timeLimitMinutes*60000:null};examIndex=0;$('examSetupError').textContent='';startExamClock();setMode('exam')}
function startExamClock(){clearInterval(examTimer);if(!exam?.deadline)return;examTimer=setInterval(()=>{if(!exam||exam.finished){clearInterval(examTimer);return}if(Date.now()>=exam.deadline){clearInterval(examTimer);finishExam(true);return}renderExam()},1000)}
function renderExam(){if(!exam||exam.finished)return;let card=exam.cards[examIndex],size=exam.cards.length,answered=exam.cards.filter(c=>c.chosen!==null).length,time='';if(exam.deadline){let left=Math.max(0,exam.deadline-Date.now()),minutes=Math.floor(left/60000),seconds=Math.floor(left%60000/1000);time=` · ${minutes}:${String(seconds).padStart(2,'0')}`}$('examPerson').textContent=exam.person;$('examProgress').textContent=`Питання ${examIndex+1} із ${size} · Відповіли на ${answered}${time}`;$('examProgressBar').style.width=(100*answered/size)+'%';$('examQuestion').innerHTML=safe(card.q.question)+(card.q.image?`<img class="question-image" src="${safe(card.q.image)}" alt="Ілюстрація до завдання ${card.q.number}">`:'');$('examAnswers').innerHTML=card.quiz.choices.map((v,i)=>`<button class="answer ${card.chosen===i?'chosen':''}" data-exam-choice="${i}"><span class="letter">${letters[i]}</span><span>${safe(v)}</span></button>`).join('');document.querySelectorAll('[data-exam-choice]').forEach(btn=>btn.onclick=()=>{card.chosen=Number(btn.dataset.examChoice);renderExam()});$('examPrevious').disabled=examIndex===0;$('examNext').hidden=examIndex===size-1;$('examFinish').hidden=examIndex!==size-1}
async function finishExam(forced=false){if(!exam)return;let size=exam.cards.length,answered=exam.cards.filter(c=>c.chosen!==null).length;if(!forced&&answered<size&&!confirm(`Ви відповіли на ${answered} із ${size} питань. Завершити тест зараз?`))return;clearInterval(examTimer);let correct=exam.cards.filter(c=>c.chosen===c.quiz.correct).length,percent=Math.round(100*correct/size),passed=correct>=(course.passCorrect||Math.ceil(size*course.passPercent/100));if(window.testsAccount?.isLoggedIn()){try{$('examFinish').disabled=true;const serverResult=await window.testsAccount.submitExam(course.id,exam.person,exam.cards);percent=serverResult.score;passed=serverResult.passed;exam.serverId=serverResult.id;if(serverResult.next_allowed_at)exam.nextAllowedAt=new Date(serverResult.next_allowed_at*1000).toISOString()}catch(err){$('examSetupError').textContent='Не вдалося зберегти результат: '+err.message;alert('Помилка збереження результату: '+err.message);$('examFinish').disabled=false;return}finally{$('examFinish').disabled=false}}exam.finished=true;exam.completedAt=new Date().toISOString();exam.passed=passed;if(!passed){let next=exam.nextAllowedAt?new Date(exam.nextAllowedAt):new Date(Date.now()+15*86400000);exam.nextAllowedAt=next.toISOString();try{localStorage.setItem(attemptKey(exam.person),JSON.stringify({score:percent,failedAt:exam.completedAt,nextAllowedAt:exam.nextAllowedAt}))}catch{}}else{try{localStorage.removeItem(attemptKey(exam.person))}catch{}}setMode('exam')}
function renderResult(){if(!exam?.finished)return;let size=exam.cards.length,correct=exam.cards.filter(c=>c.chosen===c.quiz.correct).length,wrong=size-correct,percent=Math.round(correct/size*100),threshold=course.passCorrect||Math.ceil(size*course.passPercent/100),passed=exam.passed??correct>=threshold;$('resultPerson').textContent=exam.person;$('resultScore').textContent=`${correct} / ${size} · ${percent} балів зі 100`;$('certificateKind').textContent=passed?'НАВЧАЛЬНИЙ СЕРТИФІКАТ':'ДОВІДКА ПРО РЕЗУЛЬТАТ';$('certificateTitle').textContent=course.certificateTitle;$('certificateDisclaimer').textContent=course.disclaimer;$('certificate').dataset.course=course.id;$('resultVerdict').textContent=passed?'✓ Тестування успішно пройдено':'✕ Тестування не пройдено';$('resultDetails').textContent=`Правильних відповідей: ${correct}. Помилок і пропусків: ${wrong}. Прохідний результат: ${threshold} із ${size}.`;$('resultDate').textContent='Дата: '+new Date(exam.completedAt).toLocaleString('uk-UA');$('retakeInfo').textContent=passed?'Можна пройти новий тест для тренування.':'Повторне сертифікаційне тестування доступне з '+new Date(exam.nextAllowedAt).toLocaleString('uk-UA')+'.';$('newExam').disabled=!passed;
const verification=$('examVerification');
if(exam.serverId){
  const id=encodeURIComponent(exam.serverId);
  verification.hidden=false;
  verification.innerHTML=`<a href="/verify/${id}" target="_blank" rel="noopener noreferrer"><img src="/api/certificates/qr/${id}" width="100" height="100" alt="QR-код перевірки результату"></a><div><strong>Перевірити у реєстрі TESTS</strong><small>№ ${safe(exam.serverId)} · скануйте код для перевірки результату</small></div>`;
}else{
  verification.hidden=true;
  verification.replaceChildren();
}
$('examReview').hidden=true;$('examReview').innerHTML=exam.cards.map((c,i)=>{let right=c.chosen===c.quiz.correct;return `<div class="review-item"><strong>${i+1}. ${safe(c.q.question)}</strong><p class="${right?'good':'bad-text'}">${right?'✓ Правильно':'✕ Помилка або пропуск'} · Правильна відповідь: ${letters[c.quiz.correct]}. ${safe(c.quiz.choices[c.quiz.correct])}</p><p>${safe(questionExplanation(c.q,c.quiz))}</p></div>`}).join('')}
async function printExamCertificate(){
  const source=$('certificate');
  if(!source)return;
  document.getElementById('examCertificatePrintRoot')?.remove();
  const root=document.createElement('div');
  root.id='examCertificatePrintRoot';
  const copy=source.cloneNode(true);
  copy.removeAttribute('id');
  root.appendChild(copy);
  document.body.appendChild(root);
  document.body.classList.add('print-exam-certificate');
  const cleanup=()=>{
    document.body.classList.remove('print-exam-certificate');
    root.remove();
    window.removeEventListener('afterprint',cleanup);
  };
  window.addEventListener('afterprint',cleanup);
  try{
    await Promise.all(Array.from(copy.querySelectorAll('img')).map(img=>img.decode().catch(()=>{})));
    window.print();
  }catch(error){
    cleanup();
    alert('Не вдалося підготувати друк: '+error.message);
  }
}

function initializeExam(){let count=items.filter(q=>!q.missing).length,size=course.examSize,threshold=course.passCorrect||Math.ceil(size*course.passPercent/100);$('totalQuestionCount').textContent=count.toLocaleString('uk-UA');$('examQuestionCount').textContent=size;$('examQuestionCountSetup').textContent=size;$('examThreshold').textContent=`${threshold} із ${size}`;$('examTimeRule').textContent=course.timeLimitMinutes?`${course.timeLimitMinutes} хвилин`:'не обмежено';$('studyModeBtn').onclick=()=>setMode('study');$('examModeBtn').onclick=()=>setMode('exam');$('startExam').onclick=startExam;$('examPrevious').onclick=()=>{if(examIndex>0){examIndex--;renderExam()}};$('examNext').onclick=()=>{if(examIndex<exam.cards.length-1){examIndex++;renderExam()}};$('examFinish').onclick=()=>finishExam(false);$('reviewMistakes').onclick=()=>{$('examReview').hidden=!$('examReview').hidden};$('newExam').onclick=()=>{exam=null;setMode('exam')};$('printCertificate').onclick=printExamCertificate;$('testSound').onclick=async()=>{
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
async function loadCourse(courseId,{go=true}={}){
 const selected=courses.find(item=>item.id===courseId)||courses[0];
 const response=await fetch(selected.file,{cache:'no-store'});
 if(!response.ok)throw Error('Не вдалося завантажити напрям: '+response.status);
 course=selected;data=await response.json();items=data.questions;activeGroup=data.groups[0]?.id||'all';active=0;filter='all';query='';exam=null;clearInterval(examTimer);
 try{localStorage.setItem('tests-active-course-v1',course.id)}catch{}
 $('courseHeaderEyebrow').textContent='КУРС · '+course.code;
 $('courseHeaderTitle').textContent=course.title;
 $('courseHeaderDescription').textContent=course.description;
 $('certHeaderEyebrow').textContent='СЕРТИФІКАЦІЯ · '+course.code;
 $('certHeaderTitle').textContent=course.certificateTitle;
 $('sourceNotice').textContent=course.disclaimer;
 renderCourseCatalog();render();initializeExam();
 if(go)navigate('learning');
}
function renderCourseCatalog(){
 $('courseGrid').innerHTML=courses.map(item=>`<article class="course-card ${course?.id===item.id?'featured':''}" data-course="${safe((item.code+' '+item.title).toLocaleLowerCase('uk-UA'))}"><div class="course-card-top"><span class="course-code">${safe(item.code)}</span><span class="active-pill">Доступно</span></div><div class="course-glyph" aria-hidden="true">${safe(item.glyph)}</div><h3>${safe(item.title)}</h3><p>${safe(item.description)}</p><div class="course-card-stats"><span><strong>${item.questionCount}</strong> питань</span><span><strong>${item.examSize}</strong> в іспиті</span></div><button class="text-button" type="button" data-select-course="${safe(item.id)}">Відкрити напрям →</button></article>`).join('');
 document.querySelectorAll('[data-select-course]').forEach(button=>button.onclick=()=>loadCourse(button.dataset.selectCourse));
}
async function init(){
 applyPrefs();
 courses=await (await fetch('courses.json',{cache:'no-store'})).json();
 let savedCourse='audit';try{savedCourse=localStorage.getItem('tests-active-course-v1')||savedCourse}catch{}
 course=courses.find(item=>item.id===savedCourse)||courses[0];
 let response=await fetch(course.file,{cache:'no-store'});data=await response.json();items=data.questions;activeGroup=data.groups[0]?.id||'all';
 $('courseHeaderEyebrow').textContent='КУРС · '+course.code;$('courseHeaderTitle').textContent=course.title;$('courseHeaderDescription').textContent=course.description;$('certHeaderEyebrow').textContent='СЕРТИФІКАЦІЯ · '+course.code;$('certHeaderTitle').textContent=course.certificateTitle;$('sourceNotice').textContent=course.disclaimer;
 if(prefs.rememberTopic){try{
  const stored=localStorage.getItem('tests-last-topic');
  if(stored==='all'||data.groups.some(g=>g.id===stored))activeGroup=stored;
 }catch{}}
 await window.testsAccount?.setup(serverProgress=>{state={...state,...serverProgress};try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{};render()});
 renderCourseCatalog();render();initializeExam();
 document.querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.route));
 document.querySelectorAll('[data-course-action]').forEach(button=>button.onclick=()=>navigate(button.dataset.courseAction));
 $('courseSearch').oninput=event=>{
  const term=event.target.value.trim().toLocaleLowerCase('uk-UA');
  let visible=0;
  document.querySelectorAll('[data-course]').forEach(card=>{const show=!term||card.dataset.course.includes(term)||card.textContent.toLocaleLowerCase('uk-UA').includes(term);card.hidden=!show;if(show)visible++});
  $('courseEmpty').hidden=visible>0;
 };
 $('menuBtn').onclick=()=>{
  const open=!$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open',open);$('sidebarScrim').hidden=!open;$('menuBtn').setAttribute('aria-expanded',String(open));
 };
 $('sidebarScrim').onclick=closeMobileMenu;
 window.addEventListener('hashchange',()=>navigate(routeFromLocation(),{replace:true,focus:false}));
 navigate(routeFromLocation(),{replace:true,focus:false});
 $('prevBtn').onclick=()=>shift(-1);$('nextBtn').onclick=()=>shift(1);$('speakBtn').onclick=speak;$('speechTop').onclick=speak;$('stopBtn').onclick=stop;$('copyBtn').onclick=copy;
 $('ttsMode').value=state.ttsMode||'server';$('voiceWrap').hidden=$('ttsMode').value!=='browser';$('ttsRate').value=String(state.ttsRate||.9);$('ttsMode').onchange=()=>{stop();state.ttsMode=$('ttsMode').value;$('voiceWrap').hidden=state.ttsMode!=='browser';save();setSpeechStatus(state.ttsMode==='server'?'Тетяна · жіночий український голос на сервері.':state.ttsMode==='neural'?'Резервна модель MMS завантажується в браузер.':'Виберіть один із голосів, доступних у браузері.')};$('ttsRate').onchange=()=>{state.ttsRate=Number($('ttsRate').value);save()};$('voiceSelect').onchange=()=>{state.ttsVoice=$('voiceSelect').value;save()};listVoices();if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=listVoices;
 $('fontBtn').onclick=()=>{updatePref('font',prefs.font>=150?100:Math.min(150,prefs.font+10));$('prefFont').value=String(prefs.font)};
 setupPreferences();
 $('search').oninput=e=>{query=e.target.value;active=0;render()};$('filter').onchange=e=>{filter=e.target.value;active=0;render()};
 $('jumpBtn').onclick=()=>{let n=Number($('jumpInput').value),q=items.find(x=>x.number===n);if(q){activeGroup=q.group;filter='all';query='';$('search').value='';$('filter').value='all';active=items.filter(x=>x.group===activeGroup).findIndex(x=>x.number===n);render()}};
 $('exportBtn').onclick=()=>{let b=new Blob([JSON.stringify({format:'audit-trainer-progress-v1',state,exported:new Date().toISOString()},null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='audit-trainer-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
 $('importFile').onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{let p=JSON.parse(await f.text());if(p.format!=='audit-trainer-progress-v1'||!p.state)throw Error('Некоректний формат');if(!confirm('Замінити поточний прогрес даними з файлу?'))return;state=p.state;save();render();alert('Прогрес завантажено.')}catch(err){alert('Не вдалося імпортувати: '+err.message)}};
 $('resetBtn').onclick=()=>{if(confirm('Видалити всі відповіді, позначки та коментарі в цьому браузері?')){state={answers:{},notes:{},bookmarks:{},font:1};save();render()}};
}
init().catch(err=>{$('questionText').textContent='Помилка завантаження запитань: '+err.message});
