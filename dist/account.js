/* Account UI and authenticated synchronization. No API keys in browser code. */
window.testsAccount = (() => {
  const el = id => document.getElementById(id);
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
  function show(open=true) { el('accountArea').hidden=!open; if(open)el('accountArea').scrollIntoView({behavior:'smooth',block:'start'}); }
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
    el('memberEmail').textContent=[user.name,user.email].filter(Boolean).join(' · ');
    const answers=user.progress?.answers||{};
    const taken=Object.values(answers), correct=taken.filter(x=>x?.correct).length;
    const certificates=user.certificates||[];
    el('accountStats').innerHTML=`<div class="stat"><div><small>ОПРАЦЬОВАНО</small><strong>${taken.length}</strong></div></div><div class="stat"><div><small>ПРАВИЛЬНИХ</small><strong>${correct}</strong></div></div><div class="stat"><div><small>ТОЧНІСТЬ</small><strong>${taken.length?Math.round(correct/taken.length*100):0}%</strong></div></div><div class="stat"><div><small>ТЕСТУВАНЬ</small><strong>${certificates.length}</strong></div></div>`;
    el('accountCertificates').innerHTML=certificates.length?certificates.map(c=>`<div class="certificate-row"><span>${safe(c.name)}<small>${new Date(c.created_at*1000).toLocaleDateString('uk-UA')}</small></span><strong>${c.score} балів · ${c.passed?'Успішно':'Не пройдено'}</strong></div>`).join(''):'<p>Ще немає результатів сертифікаційного тестування.</p>';

    const demo=user.demo_certificates?.[0];
    el('demoCertificateSection').hidden=!demo;
    if(demo){
      const issued=new Date(demo.created_at*1000).toLocaleDateString('uk-UA');
      el('demoCertificateCanvas').innerHTML=`<div class="demo-cert-top">◈ <strong>TESTS</strong><span>НАВЧАЛЬНА ПЛАТФОРМА</span></div>
        <div class="demo-cert-watermark">ДЕМОНСТРАЦІЙНИЙ ЗРАЗОК</div>
        <div class="demo-cert-title">СЕРТИФІКАТ</div>
        <div class="demo-cert-subtitle">ознайомлення з навчальною платформою</div>
        <div class="demo-cert-name">${safe(user.name||user.email)}</div>
        <p class="demo-cert-description">Цей зразок демонструє оформлення персональних сертифікатів у TESTS.<br>Не підтверджує проходження іспиту, результати тестування чи професійну кваліфікацію.</p>
        <div class="demo-cert-bottom"><span>Номер: ${safe(demo.code)}</span><span>Дата: ${issued}</span></div>
        <div class="demo-cert-warning">ДЕМО · НЕОФІЦІЙНИЙ ДОКУМЕНТ</div>`;
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
  async function submitExam(name,cards) {
    if(!user)return null;
    let result=await api('exams',{method:'POST',body:JSON.stringify({name,answers:cards.map(c=>({id:c.q.id,answer:c.chosen===null?'':c.quiz.choices[c.chosen]}))})});
    await refresh();return result;
  }
  function setup(onLoaded) {
    onProgressLoaded=onLoaded;
    el('profileBtn').onclick=()=>{render();show()};
    el('accountClose').onclick=()=>show(false);
    el('showLogin').onclick=()=>mode('login');
    el('showRegister').onclick=()=>mode('register');
    el('showForgot').onclick=()=>mode('forgot');
    el('printDemoCertificate').onclick=()=>{
      document.body.classList.add('print-demo-certificate');
      window.print();
    };
    window.addEventListener('afterprint',()=>document.body.classList.remove('print-demo-certificate'));
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
  function blockedUntil() { if(!user)return null; const until=Math.max(0,...(user.certificates||[]).filter(c=>!c.passed).map(c=>c.next_allowed_at||0));return until*1000>Date.now()?new Date(until*1000):null; }
  return {setup,sync,submitExam,refresh,show,blockedUntil,isLoggedIn:()=>!!user};
})();
