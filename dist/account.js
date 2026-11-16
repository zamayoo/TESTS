/* Account UI and authenticated synchronization. No API keys in browser code. */
window.testsAccount = (() => {
  const el = id => document.getElementById(id);
  const courseNames={audit:'Аудит і державний фінансовий контроль',analytical:'Оперативні та аналітичні здібності',procurement:'Публічні закупівлі'};
  let user = null, timer = null, authMode = 'login', onProgressLoaded = null;
  async function api(path, options={}) {
    const response = await fetch('/api/'+path, {credentials:'same-origin',
      headers:{'Content-Type':'application/json'}, ...options});
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if(!response.ok) throw Error(typeof result.detail==='string'?result.detail:'Сервер недоступний ('+response.status+').');
    return result;
  }
  const safe = t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function demoChecksum(value) {
    let hash=2166136261;
    for(const ch of String(value)){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
    return (hash>>>0).toString(16).toUpperCase().padStart(8,'0').replace(/(.{4})(.{4})/,'$1·$2');
  }
  function demoSecurityMatrix(value) {
    const size=17,cells=[];
    let seed=Array.from(String(value)).reduce((sum,ch)=>(Math.imul(sum,33)^ch.charCodeAt(0))>>>0,5381);
    const finder=(x,y,ox,oy)=>x>=ox&&x<ox+5&&y>=oy&&y<oy+5&&(
      x===ox||x===ox+4||y===oy||y===oy+4||(x>=ox+2&&x<=ox+2&&y>=oy+2&&y<=oy+2));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      if(finder(x,y,0,0)||finder(x,y,size-5,0)||finder(x,y,0,size-5)||(seed>>>29)%2)
        cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
    return `<svg viewBox="0 0 ${size} ${size}" aria-label="Візуальна матриця демонстраційного сертифіката" role="img"><rect width="${size}" height="${size}" class="matrix-paper"/>${cells.join('')}</svg>`;
  }
  function show(open=true) {
    if(window.testsNavigate)window.testsNavigate(open?'account':'catalog');
    else el('accountView').hidden=!open;
  }
  function mode(which) {
    authMode=which; el('nameAuthWrap').hidden=which!=='register';
    el('passwordAuthWrap').hidden=which==='forgot';
    el('authPassword').required=which!=='forgot';
    el('authSubmit').textContent={login:'Увійти',register:'Зареєструватися',forgot:'Надіслати посилання',reset:'Змінити пароль'}[which];
    el('googleLogin').hidden=which==='reset';
    el('authNotice').textContent='';
  }
  function render() {
    el('guestAccount').hidden=!!user; el('memberAccount').hidden=!user;
    el('accountTitle').textContent=user?'Мій профіль':'Вхід і реєстрація';
    el('profileBtn').textContent=user?'👤 '+(user.name||user.email):'👤 Особистий кабінет';
    if(!user)return;
    document.querySelector('.profile-summary').innerHTML=`
      <div class="profile-avatar" aria-hidden="true">${safe((user.name||user.email||'T').charAt(0).toLocaleUpperCase('uk-UA'))}</div>
      <form id="profileForm" class="profile-form">
        <label>Ім’я та прізвище<input id="profileName" value="${safe(user.name||'')}" autocomplete="name" required minlength="2" maxlength="120"></label>
        <label>Електронна пошта<input id="profileEmail" value="${safe(user.email)}" type="email" readonly aria-readonly="true"></label>
        <div class="profile-form-actions"><button id="profileSave" class="primary" type="submit">Зберегти зміни</button><span id="profileNotice" role="status" aria-live="polite"></span></div>
      </form>`;
    el('profileForm').onsubmit=async event=>{
      event.preventDefault();
      const button=el('profileSave'),name=el('profileName').value.trim();
      button.disabled=true;el('profileNotice').textContent='Зберігаємо…';
      try{const result=await api('profile',{method:'PUT',body:JSON.stringify({name})});user.name=result.name;el('profileNotice').textContent='Зміни збережено.';el('profileBtn').textContent='○ '+result.name;}
      catch(error){el('profileNotice').textContent=error.message}
      finally{button.disabled=false}
    };
    const answers=user.progress?.answers||{};
    const taken=Object.values(answers), correct=taken.filter(x=>x?.correct).length;
    const certificates=user.certificates||[];
    el('accountStats').innerHTML=`<div class="stat"><div><small>ОПРАЦЬОВАНО</small><strong>${taken.length}</strong></div></div><div class="stat"><div><small>ПРАВИЛЬНИХ</small><strong>${correct}</strong></div></div><div class="stat"><div><small>ТОЧНІСТЬ</small><strong>${taken.length?Math.round(correct/taken.length*100):0}%</strong></div></div><div class="stat"><div><small>ТЕСТУВАНЬ</small><strong>${certificates.length}</strong></div></div>`;
    el('accountCertificates').innerHTML=certificates.length?certificates.map(c=>`<div class="certificate-row" data-course="${safe(c.course_id||'audit')}"><span>${safe(courseNames[c.course_id]||courseNames.audit)}<small>${safe(c.name)} · ${new Date(c.created_at*1000).toLocaleDateString('uk-UA')}</small></span><strong>${c.score} балів · ${c.passed?'Успішно':'Не пройдено'}<small><a href="/verify/${encodeURIComponent(c.id)}" target="_blank" rel="noopener noreferrer">Перевірити в реєстрі ↗</a></small></strong></div>`).join(''):'<p>Ще немає результатів сертифікаційного тестування.</p>';

    const demo=user.demo_certificates?.[0];
    el('demoCertificateSection').hidden=!demo;
    if(demo){
      const issued=new Date(demo.created_at*1000).toLocaleDateString('uk-UA');
      const code=safe(demo.code),checksum=demoChecksum(demo.code);
      el('demoCertificateCanvas').innerHTML=`
        <div class="demo-cert-security-field" aria-hidden="true">
          <svg viewBox="0 0 1200 760" preserveAspectRatio="none">
            <defs>
              <pattern id="demoFineLines" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(31)"><path d="M0 0V22"/></pattern>
              <pattern id="demoMicroGrid" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="11"/><circle cx="17" cy="17" r="5"/></pattern>
            </defs>
            <rect width="1200" height="760" fill="url(#demoFineLines)"/>
            <ellipse cx="930" cy="365" rx="350" ry="205" fill="url(#demoMicroGrid)"/>
            <path d="M-90 515C210 220 425 825 730 480S1120 255 1320 500"/>
            <path d="M-80 548C220 255 440 850 745 505S1125 285 1310 525"/>
          </svg>
        </div>
        <div class="demo-cert-latent" aria-hidden="true">TESTS</div>
        <div class="demo-cert-microframe" aria-hidden="true">TESTS · EDUCATIONAL CREDENTIAL · DEMONSTRATION ONLY · VISUAL INTEGRITY SERIES · ${code} · TESTS · EDUCATIONAL CREDENTIAL · DEMONSTRATION ONLY ·</div>
        <i class="demo-registration demo-registration-tl" aria-hidden="true"></i><i class="demo-registration demo-registration-tr" aria-hidden="true"></i><i class="demo-registration demo-registration-bl" aria-hidden="true"></i><i class="demo-registration demo-registration-br" aria-hidden="true"></i>

        <header class="demo-cert-header">
          <div class="demo-cert-brand"><span class="demo-brand-mark" aria-hidden="true"><i></i></span><span><strong>TESTS</strong><small>НАВЧАЛЬНА ПЛАТФОРМА</small></span></div>
          <div class="demo-cert-classification"><span>СЕРІЯ D–01</span><strong>ВІЗУАЛЬНО ЗАХИЩЕНИЙ ЗРАЗОК</strong></div>
        </header>

        <div class="demo-cert-hero">
          <div class="demo-cert-heading">
            <div class="demo-cert-kicker"><span>ДЕМОНСТРАЦІЙНИЙ ДОКУМЕНТ</span><i></i></div>
            <div class="demo-cert-title">Сертифікат</div>
            <div class="demo-cert-subtitle">ознайомлення з навчальною платформою</div>
          </div>
          <div class="demo-cert-rosette" aria-hidden="true"><span class="rosette-orbit orbit-a"></span><span class="rosette-orbit orbit-b"></span><span class="rosette-orbit orbit-c"></span><span class="rosette-core"><b>T</b><small>DEMO</small></span></div>
        </div>

        <section class="demo-cert-recipient">
          <span class="demo-recipient-label">ПЕРСОНАЛЬНО ПРЕДСТАВЛЕНО</span>
          <strong>${safe(user.name||user.email)}</strong>
          <div class="demo-recipient-rule"><span>IDENTITY · VISUAL SAMPLE · IDENTITY · VISUAL SAMPLE · IDENTITY · VISUAL SAMPLE</span></div>
        </section>

        <p class="demo-cert-description">Цей сертифікат демонструє стандарт оформлення документів платформи TESTS. Він не засвідчує складання іспиту, результат тестування, кваліфікацію або офіційний статус.</p>

        <div class="demo-security-index" aria-label="Дванадцять візуальних рівнів захисту">
          <span data-security-layer="01">гiльйош</span><span data-security-layer="02">мікротекст</span><span data-security-layer="03">тонка сітка</span><span data-security-layer="04">розетка</span><span data-security-layer="05">водяний знак</span><span data-security-layer="06">серійний код</span><span data-security-layer="07">контрольна сума</span><span data-security-layer="08">матриця</span><span data-security-layer="09">реєстрові мітки</span><span data-security-layer="10">OVD-смуга</span><span data-security-layer="11">антикопі-сітка</span><span data-security-layer="12">мікрорамка</span>
        </div>

        <footer class="demo-cert-footer">
          <div class="demo-cert-data"><span>УНІКАЛЬНИЙ НОМЕР</span><strong>${code}</strong><small>CHECK ${checksum}</small></div>
          <div class="demo-cert-matrix"><a href="/verify/${encodeURIComponent(demo.code)}" target="_blank" rel="noopener noreferrer" aria-label="Перевірити демонстраційний сертифікат у реєстрі"><img src="/api/certificates/qr/${encodeURIComponent(demo.code)}" alt="QR-код перевірки сертифіката" width="104" height="104"></a><span>СКАНУЙТЕ ДЛЯ<br>ПЕРЕВІРКИ У РЕЄСТРІ</span></div>
          <div class="demo-cert-data demo-cert-date"><span>ДАТА ФОРМУВАННЯ</span><strong>${issued}</strong><small>КИЇВ · UA</small></div>
        </footer>

        <div class="demo-cert-ovd" aria-hidden="true"><span>TESTS</span><span>DEMO</span><span>${code}</span><span>TESTS</span></div>
        <div class="demo-cert-warning"><span>НЕОФІЦІЙНИЙ ДЕМОНСТРАЦІЙНИЙ ДОКУМЕНТ</span><small>не має юридичної сили</small></div>`;
    }
  }
  async function refresh() {
    try { user=await api('me'); render(); if(user.progress&&onProgressLoaded)onProgressLoaded(user.progress); }
    catch { user=null; render(); }
    return user;
  }
  function sync(progress) {
    if(!user)return;
    clearTimeout(timer);
    timer=setTimeout(async()=>{try { await api('progress',{method:'PUT',body:JSON.stringify({payload:progress})});user.progress=progress;render(); }
      catch(e) { el('authNotice').textContent='Не вдалося синхронізувати прогрес: '+e.message; }},900);
  }
  async function submitExam(courseId,name,cards) {
    if(!user)return null;
    let result=await api('exams',{method:'POST',body:JSON.stringify({course_id:courseId,name,answers:cards.map(c=>({id:c.q.id,answer:c.chosen===null?'':c.quiz.choices[c.chosen]}))})});
    await refresh();return result;
  }
  function setup(onLoaded) {
    onProgressLoaded=onLoaded;
    el('profileBtn').onclick=()=>{render();show()};
    el('accountClose').onclick=()=>show(false);
    el('showLogin').onclick=()=>mode('login');
    el('showRegister').onclick=()=>mode('register');
    el('showForgot').onclick=()=>mode('forgot');
    let printRoot=null;
    const clearPrint=()=>{
      document.body.classList.remove('print-demo-certificate');
      printRoot?.remove();
      printRoot=null;
    };
    el('printDemoCertificate').onclick=async()=>{
      const source=el('demoCertificateCanvas');
      if(!source || el('demoCertificateSection').hidden)return;
      clearPrint();
      printRoot=document.createElement('div');
      printRoot.id='certificatePrintRoot';
      const copy=source.cloneNode(true);
      copy.removeAttribute('id');
      copy.setAttribute('aria-label','Демонстраційний сертифікат для друку');
      printRoot.appendChild(copy);
      document.body.appendChild(printRoot);
      document.body.classList.add('print-demo-certificate');
      try{
        await Promise.all(Array.from(copy.querySelectorAll('img')).map(img=>img.decode().catch(()=>{})));
        window.print();
      }catch(error){
        el('authNotice').textContent='Не вдалося відкрити друк: '+error.message;
        clearPrint();
      }
    };
    window.addEventListener('afterprint',clearPrint);

    el('accountLogout').onclick=async()=>{try{await api('logout',{method:'POST'});user=null;render();el('authNotice').textContent='Ви вийшли з кабінету.';}catch(e){el('authNotice').textContent=e.message}};
    const params=new URLSearchParams(location.search);
    if(params.has('reset')){mode('reset'); el('authEmail').closest('label').hidden=true;show();}
    else if(params.get('auth')==='verified'){mode('login');show();el('authNotice').textContent='Пошту підтверджено. Тепер увійдіть.';}
    else if(params.get('auth')==='expired'){mode('login');show();el('authNotice').textContent='Посилання недійсне або термін дії минув.';}
    else mode('login');
    el('authForm').onsubmit=async(e)=>{e.preventDefault();let email=el('authEmail').value.trim(),password=el('authPassword').value;
      let body=authMode==='reset'?{token:params.get('reset'),password}:authMode==='forgot'?{email}:authMode==='register'?{email,password,name:el('authName').value.trim()}:{email,password};
      el('authSubmit').disabled=true;el('authNotice').textContent='Обробляємо запит…';
      try {const result=await api(authMode,{method:'POST',body:JSON.stringify(body)});
        if(authMode==='login') {await refresh();el('authNotice').textContent='Вхід виконано. Прогрес синхронізується.';}
        else {el('authNotice').textContent=result.message||'Готово.';if(authMode==='reset'){history.replaceState(null,'','/');el('authEmail').closest('label').hidden=false;mode('login')}}
      } catch(err) {el('authNotice').textContent=err.message;}
      finally {el('authSubmit').disabled=false;}
    };
    return refresh();
  }
  function blockedUntil(courseId) { if(!user)return null; const until=Math.max(0,...(user.certificates||[]).filter(c=>!c.passed&&(c.course_id||'audit')===courseId).map(c=>c.next_allowed_at||0));return until*1000>Date.now()?new Date(until*1000):null; }
  return {setup,sync,submitExam,refresh,show,blockedUntil,isLoggedIn:()=>!!user};
})();
