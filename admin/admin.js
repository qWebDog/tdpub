(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const ui = {
    connection:byId('connectionPanel'), connectionTitle:byId('connectionTitle'), connectionText:byId('connectionText'), retry:byId('retryButton'), help:byId('setupHelp'),
    login:byId('loginPanel'), loginForm:byId('loginForm'), loginButton:byId('loginButton'), password:byId('adminPassword'), logout:byId('logoutButton'),
    status:byId('globalStatus'), form:byId('contentForm'), fields:byId('workspaceFields'), save:byId('saveButton'), dirty:byId('dirtyLabel'), saveHint:byId('saveHint'), reload:byId('reloadButton'),
    photosTab:byId('photosTab'), pricesTab:byId('pricesTab'), photos:byId('photosPanel'), prices:byId('pricesPanel'), tabCount:byId('tabPhotoCount'),
    upload:byId('photoUpload'), uploadButton:byId('uploadButton'), uploadStatus:byId('uploadStatus'),
    inventory:byId('photoInventory'), inventoryCount:byId('inventoryCount'), inventoryEmpty:byId('inventoryEmpty'),
    selected:byId('selectedList'), selectedEmpty:byId('selectedEmpty'), selectedCount:byId('selectedCount'), galleryStatus:byId('galleryStatus'), minimum:byId('minimumPrice')
  };
  const priceFields = {
    base:{input:byId('priceBase'),error:byId('priceBaseError')},
    generatorDiscount:{input:byId('priceGenerator'),error:byId('priceGeneratorError')},
    barrelDiscount:{input:byId('priceBarrel'),error:byId('priceBarrelError')},
    extraHour:{input:byId('priceHour'),error:byId('priceHourError')},
    extraKeg:{input:byId('priceKeg'),error:byId('priceKegError')}
  };
  const priceKeys = Object.keys(priceFields);
  const state = {csrf:null,authenticated:false,content:null,revision:null,files:[],baseline:'',busy:false,dirty:false,dragged:null,conflict:false};
  const money = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n) + ' ₽';
  const clone = value => JSON.parse(JSON.stringify(value));
  const validFile = value => typeof value === 'string' && value.length > 0 && value.length <= 255 && !value.startsWith('.') && !value.includes('..') && !/[\/\\\x00-\x1f\x7f]/.test(value) && /\.(?:jpe?g|png|webp)$/i.test(value);
  const safeText = value => typeof value === 'string' ? value : '';
  class ApiError extends Error {
    constructor(message,status=0,code='') { super(message); this.status=status; this.code=code; }
  }
  async function request(action, {method='GET',body,form=false} = {}) {
    const url = new URL('api.php',window.location.href);
    url.searchParams.set('action',action);
    const headers = {Accept:'application/json'};
    if (method !== 'GET' && action !== 'login' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(url.href,{method,headers,credentials:'same-origin',cache:'no-store',body:body === undefined ? undefined : form ? body : JSON.stringify(body)});
    } catch (_) {
      throw new ApiError('Не удалось связаться с хостингом. Проверьте подключение и попробуйте ещё раз.');
    }
    let data;
    try { data = JSON.parse(await response.text()); }
    catch (_) { throw new ApiError('Админке нужен хостинг с PHP 8.1 или новее. На GitHub Pages сохранение недоступно. Если сайт уже перенесён, проверьте настройку PHP.',response.status,'php_unavailable'); }
    if (!response.ok || !data || data.ok !== true) {
      const message = typeof data?.error === 'string' ? data.error.slice(0,600) : 'Хостинг не подтвердил выполнение операции. Попробуйте ещё раз.';
      throw new ApiError(message,response.status,safeText(data?.code));
    }
    return data;
  }
  function message(text,kind='') {
    ui.status.textContent = text;
    ui.status.className = 'notice' + (kind ? ' notice-' + kind : '');
    ui.status.hidden = !text;
  }
  function uploadMessage(text,kind='') {
    ui.uploadStatus.textContent = text;
    ui.uploadStatus.className = 'notice' + (kind ? ' notice-' + kind : '');
    ui.uploadStatus.hidden = !text;
  }
  function setBusy(busy) {
    state.busy = busy;
    ui.fields.disabled = busy;
    ui.logout.disabled = busy;
    ui.loginButton.disabled = busy;
    ui.password.disabled = busy;
    ui.retry.disabled = busy;
    updateDirty();
  }
  function updateDirty() {
    state.dirty = Boolean(state.content && JSON.stringify(state.content) !== state.baseline);
    ui.save.disabled = state.busy || !state.dirty || !state.authenticated;
    ui.dirty.textContent = state.busy ? 'Дождитесь завершения операции…' : state.dirty ? 'Есть несохранённые изменения' : 'Изменений нет';
    ui.save.closest('.save-bar').classList.toggle('is-dirty',state.dirty);
    ui.saveHint.textContent = state.conflict ? 'На сайте появилась новая версия. Ваши правки остаются в этой вкладке.' : 'Настройки сохраняются для всего сайта.';
    ui.reload.hidden = !state.conflict;
  }
  function markChanged() { updateDirty(); }
  function setTab(which,focus=false) {
    const photos = which === 'photos';
    ui.photos.hidden = !photos; ui.prices.hidden = photos;
    for (const [button,active] of [[ui.photosTab,photos],[ui.pricesTab,!photos]]) {
      button.classList.toggle('is-active',active); button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1;
    }
    if (focus) (photos?ui.photosTab:ui.pricesTab).focus();
  }
  function cleanFiles(files) {
    const map = new Map();
    for (const file of Array.isArray(files)?files:[]) {
      if (file && validFile(file.file)) map.set(file.file,{file:file.file,width:Number(file.width)||0,height:Number(file.height)||0,bytes:Number(file.bytes)||0});
    }
    return [...map.values()].sort((a,b)=>a.file.localeCompare(b.file,'ru',{numeric:true,sensitivity:'base'}));
  }
  function imageURL(file) {
    return new URL('../media/gallery/photos/' + encodeURIComponent(file),window.location.href).href;
  }
  function readContent(value) {
    if (!value || value.schemaVersion !== 1 || !value.pricing || !Array.isArray(value.gallery?.items)) throw new ApiError('Настройки сайта имеют неподдерживаемый формат. Проверьте файл данных на хостинге.');
    const items = [], seen = new Set();
    for (const item of value.gallery.items) {
      if (!item || !validFile(item.file) || seen.has(item.file)) throw new ApiError('В настройках галереи есть неверное имя файла или повторяющееся фото.');
      items.push({file:item.file,caption:safeText(item.caption),alt:safeText(item.alt)}); seen.add(item.file);
    }
    return {schemaVersion:1,pricing:Object.fromEntries(priceKeys.map(key=>[key,value.pricing[key]])),gallery:{items}};
  }
  function create(tag,className,text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function chosen(file) { return state.content.gallery.items.some(item=>item.file===file); }
  function renderInventory() {
    ui.inventory.replaceChildren();
    ui.inventoryEmpty.hidden = state.files.length > 0;
    ui.inventoryCount.textContent = state.files.length + ' ' + noun(state.files.length,'файл','файла','файлов');
    for (const file of state.files) {
      const label=create('label','photo-choice');label.classList.toggle('is-selected',chosen(file.file));
      const img=create('img');img.src=imageURL(file.file);img.alt='';img.loading='lazy';img.decoding='async';
      const meta=create('span','photo-choice-meta'),checkbox=create('input');checkbox.type='checkbox';checkbox.checked=chosen(file.file);checkbox.dataset.file=file.file;checkbox.setAttribute('aria-label','Показать в галерее: '+file.file);
      const copy=create('span'),name=create('span','photo-choice-name',file.file);name.title=file.file;
      copy.append(name,create('span','photo-choice-dimensions',file.width&&file.height?file.width+' × '+file.height:'Фотография'));
      meta.append(checkbox,copy);label.append(img,meta);ui.inventory.append(label);
      checkbox.addEventListener('change',()=>{
        if (checkbox.checked && !chosen(file.file)) {
          if (state.content.gallery.items.length >= 100) { checkbox.checked=false; message('В галерее можно выбрать до 100 фотографий.','error'); return; }
          state.content.gallery.items.push({file:file.file,caption:'',alt:''});
        }
        else if (!checkbox.checked) state.content.gallery.items=state.content.gallery.items.filter(item=>item.file!==file.file);
        label.classList.toggle('is-selected',checkbox.checked);renderSelected();markChanged();
      });
    }
  }
  function noun(n,one,few,many) { const x=n%100;return x>=11&&x<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many; }
  function updateInventorySelection() {
    ui.inventory.querySelectorAll('input[data-file]').forEach(input=>{input.checked=chosen(input.dataset.file);input.closest('.photo-choice').classList.toggle('is-selected',input.checked);});
  }
  function refocusPhoto(file,action='caption') {
    const row=[...ui.selected.children].find(element=>element.dataset.file===file);
    if (!row) return;
    let target=row.querySelector('[data-action="'+action+'"]');
    if (!target || target.disabled) target=row.querySelector('[data-action="caption"]');
    target?.focus({preventScroll:true});
  }
  function movePhoto(file,position,focusAction='caption') {
    const items=state.content.gallery.items,from=items.findIndex(item=>item.file===file);
    const target=Math.max(0,Math.min(items.length-1,position));
    if (from<0 || from===target) return;
    items.splice(target,0,items.splice(from,1)[0]);renderSelected();markChanged();refocusPhoto(file,focusAction);
    ui.galleryStatus.textContent='Фотография перемещена на место '+(target+1)+' из '+items.length+'.';
  }
  function removePhoto(file) {
    const index=state.content.gallery.items.findIndex(item=>item.file===file);
    state.content.gallery.items=state.content.gallery.items.filter(item=>item.file!==file);
    renderSelected();updateInventorySelection();markChanged();
    const following=state.content.gallery.items[Math.min(index,state.content.gallery.items.length-1)];
    if (following) refocusPhoto(following.file);else ui.photosTab.focus({preventScroll:true});
    ui.galleryStatus.textContent='Фотография убрана из галереи. Файл остался в папке.';
  }
  function renderSelected() {
    const items=state.content.gallery.items;
    ui.selected.replaceChildren();ui.selectedEmpty.hidden=items.length>0;
    ui.selectedCount.textContent=items.length?items.length+' '+noun(items.length,'фотография','фотографии','фотографий'):'Не выбрано ни одной фотографии';
    ui.tabCount.textContent=String(items.length);
    items.forEach((item,index)=>{
      const row=create('li','selected-photo');row.dataset.file=item.file;
      const handle=create('span','photo-drag-handle','⋮⋮');handle.draggable=true;handle.setAttribute('aria-hidden','true');
      handle.addEventListener('dragstart',event=>{state.dragged=item.file;row.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.file);}});
      handle.addEventListener('dragend',()=>{state.dragged=null;ui.selected.querySelectorAll('.selected-photo').forEach(n=>n.classList.remove('is-dragging','is-drop-target'));});
      row.addEventListener('dragover',event=>{if(state.dragged&&state.dragged!==item.file){event.preventDefault();row.classList.add('is-drop-target');if(event.dataTransfer)event.dataTransfer.dropEffect='move';}});
      row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))row.classList.remove('is-drop-target');});
      row.addEventListener('drop',event=>{if(!state.dragged)return;event.preventDefault();const file=state.dragged;state.dragged=null;movePhoto(file,index);});
      const img=create('img');img.src=imageURL(item.file);img.alt='';img.loading='lazy';img.decoding='async';
      const fields=create('div','photo-fields'),position=create('p','photo-position');
      position.append(create('span','',index===0?'Главный кадр':index<3?'Кадр в коллаже':'В полноэкранном просмотре'));
      const filename=create('span','photo-filename',item.file);filename.title=item.file;position.append(filename);fields.append(position);
      for(const [key,title,max,className]of [['caption','Подпись',120,'photo-caption-label'],['alt','Описание для доступности',240,'photo-alt-label']]){
        const label=create('label',className,title),input=create('input');input.type='text';input.maxLength=max;input.value=item[key];input.dataset.action=key;
        input.placeholder=key==='caption'?'Короткая подпись к кадру':'Что изображено на фото';
        input.addEventListener('input',()=>{item[key]=input.value;markChanged();});label.append(input);fields.append(label);
      }
      const actions=create('div','photo-row-actions');
      for(const [action,text,disabled]of [['earlier','Раньше',index===0],['later','Позже',index===items.length-1],['remove','Убрать',false]]){
        const button=create('button','button button-quiet'+(action==='remove'?' remove-photo':''),text);button.type='button';button.disabled=disabled;button.dataset.action=action;
        button.setAttribute('aria-label',(action==='remove'?'Убрать из галереи':action==='earlier'?'Переместить раньше':'Переместить позже')+': '+(item.caption||item.file));
        button.addEventListener('click',()=>action==='remove'?removePhoto(item.file):movePhoto(item.file,index+(action==='earlier'?-1:1),action));actions.append(button);
      }
      row.append(handle,img,fields,actions);ui.selected.append(row);
    });
  }
  function numberValue(input) {
    const value=input.value.trim();
    if(!/^\d+$/.test(value))return null;
    const number=Number(value);return Number.isSafeInteger(number)?number:null;
  }
  function validatePricing(showErrors=false) {
    const pricing={},errors={};
    for(const key of priceKeys){const n=numberValue(priceFields[key].input),min=key==='extraKeg'?1:0;if(n===null||n<min||n>100000000)errors[key]=key==='extraKeg'?'Введите целую сумму от 1 до 100 000 000 ₽.':'Введите целую сумму от 0 до 100 000 000 ₽.';else pricing[key]=n;}
    if(!errors.base&&!errors.generatorDiscount&&!errors.barrelDiscount&&pricing.base<pricing.generatorDiscount+7*pricing.barrelDiscount)errors.base='Цена комплекта должна покрывать уменьшение за генератор и все семь столов-бочек.';
    if(showErrors)for(const key of priceKeys){const error=errors[key]||'';priceFields[key].error.textContent=error;priceFields[key].error.hidden=!error;priceFields[key].input.setAttribute('aria-invalid',String(Boolean(error)));priceFields[key].input.setCustomValidity(error);}
    const min=pricing.base-pricing.generatorDiscount-7*pricing.barrelDiscount;
    ui.minimum.textContent=Object.keys(errors).length?'—':money(min);
    return {pricing,errors};
  }
  function renderPrices() {
    for(const key of priceKeys){priceFields[key].input.value=String(state.content.pricing[key]??'');priceFields[key].error.hidden=true;priceFields[key].input.setAttribute('aria-invalid','false');priceFields[key].input.setCustomValidity('');}
    validatePricing();
  }
  function showWorkspace() {
    ui.connection.hidden=true;ui.login.hidden=true;ui.form.hidden=false;ui.logout.hidden=false;
  }
  function showLogin() {
    ui.connection.hidden=true;ui.login.hidden=false;ui.form.hidden=true;ui.logout.hidden=true;
    ui.password.value='';
  }
  function handleAuthError(error) {
    if(error.status!==401)return false;
    state.authenticated=false;state.csrf=null;showLogin();ui.password.focus();
    message('Сеанс завершён. Войдите снова — несохранённые изменения остаются в этой вкладке.','error');return true;
  }
  async function loadContent(preserveDraft=false) {
    const data=await request('content');
    const next=readContent(data.content);
    if(typeof data.revision!=='string'||!data.revision)throw new ApiError('Хостинг не передал версию настроек. Сохранение пока недоступно.');
    state.files=cleanFiles(data.files);
    if(preserveDraft&&state.content){state.conflict=data.revision!==state.revision;}
    else{state.content=next;state.revision=data.revision;state.baseline=JSON.stringify(next);state.conflict=false;}
    renderInventory();renderSelected();renderPrices();showWorkspace();updateDirty();
  }
  async function bootstrap() {
    ui.connection.hidden=false;ui.login.hidden=true;ui.form.hidden=true;ui.logout.hidden=true;
    ui.connectionTitle.textContent='Проверяем доступ';ui.connectionText.textContent='Соединяемся с настройками сайта…';ui.retry.hidden=true;ui.help.hidden=true;message('');setBusy(true);
    try{
      const session=await request('session');
      if(session.configured!==true){ui.connectionTitle.textContent='Сначала настройте доступ';ui.connectionText.textContent='Создайте пароль админки на PHP-хостинге по инструкции. До настройки вход и сохранение закрыты.';ui.help.hidden=false;ui.retry.hidden=false;state.authenticated=false;return;}
      state.authenticated=session.authenticated===true;state.csrf=typeof session.csrf==='string'?session.csrf:null;
      if(state.authenticated){await loadContent(state.dirty);if(state.conflict)message('На сайте появилась другая версия настроек. Ваши правки сохранены в этой вкладке.','error');}
      else showLogin();
    }catch(error){state.authenticated=false;ui.connection.hidden=false;ui.connectionTitle.textContent='Сохранение пока недоступно';ui.connectionText.textContent=error.message;ui.retry.hidden=false;ui.help.hidden=false;}
    finally{setBusy(false);}
  }
  ui.loginForm.addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||!ui.password.reportValidity())return;
    const password=ui.password.value;setBusy(true);message('Входим…');
    try{const data=await request('login',{method:'POST',body:{password}});if(data.authenticated!==true||typeof data.csrf!=='string'||!data.csrf)throw new ApiError('Хостинг не подтвердил вход. Попробуйте снова.');state.authenticated=true;state.csrf=data.csrf;ui.password.value='';await loadContent(state.dirty);message(state.conflict?'Вы вошли. На сайте появилась новая версия; ваши несохранённые правки остались в этой вкладке.':state.dirty?'Вы вошли. Можно продолжить с несохранёнными изменениями.':'');}
    catch(error){message(error.message,'error');}
    finally{setBusy(false);}
  });
  ui.logout.addEventListener('click',async()=>{
    if(state.busy||state.dirty&&!window.confirm('Выйти без сохранения изменений?'))return;
    setBusy(true);
    try{await request('logout',{method:'POST',body:{}});state.authenticated=false;state.csrf=null;state.content=null;state.revision=null;state.files=[];state.baseline='';state.dirty=false;state.conflict=false;ui.selected.replaceChildren();ui.inventory.replaceChildren();showLogin();message('Вы вышли из админки.');}
    catch(error){if(!handleAuthError(error))message(error.message,'error');}
    finally{setBusy(false);}
  });
  ui.form.addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||!state.dirty)return;
    const {pricing,errors}=validatePricing(true),first=priceKeys.find(key=>errors[key]);
    if(first){setTab('prices');priceFields[first].input.focus();message('Проверьте выделенные цены.','error');return;}
    const missing=state.content.gallery.items.find(item=>!state.files.some(file=>file.file===item.file));
    if(missing){setTab('photos');message('Файл «'+missing.file+'» больше не найден в папке. Уберите его из выбранных или загрузите заново.','error');return;}
    const content={schemaVersion:1,pricing,gallery:{items:state.content.gallery.items.map(item=>({file:item.file,caption:item.caption,alt:item.alt}))}};
    if(content.gallery.items.length>100){setTab('photos');message('В галерее можно выбрать до 100 фотографий.','error');return;}
    if(content.gallery.items.some(item=>[...item.caption].length>120||[...item.alt].length>240)){setTab('photos');message('Сократите подписи до 120 символов, описания — до 240.','error');return;}
    setBusy(true);message('Сохраняем галерею и цены…');
    try{const data=await request('save',{method:'POST',body:{content,revision:state.revision}});const next=readContent(data.content);if(typeof data.revision!=='string'||!data.revision)throw new ApiError('Хостинг не подтвердил новую версию. Проверьте настройки перед повторным сохранением.');state.content=next;state.revision=data.revision;state.baseline=JSON.stringify(next);state.conflict=false;if(Array.isArray(data.files))state.files=cleanFiles(data.files);renderInventory();renderSelected();renderPrices();message('Изменения сохранены. Галерея и цены обновлены на сайте.','success');}
    catch(error){if(error.status===409)state.conflict=true;if(!handleAuthError(error))message(error.status===409?'На сайте уже сохранена другая версия. Ваши правки не потеряны. Загрузите актуальную версию, чтобы продолжить.':error.message,'error');}
    finally{setBusy(false);}
  });
  ui.uploadButton.addEventListener('click',()=>{if(!state.busy)ui.upload.click();});
  ui.upload.addEventListener('change',async()=>{
    const files=[...ui.upload.files];ui.upload.value='';if(!files.length||state.busy)return;
    if(files.length>10){uploadMessage('За один раз можно загрузить до 10 фотографий.','error');return;}
    if(files.some(file=>(!/\.(?:jpe?g|png|webp)$/i.test(file.name)||(file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type)))||!file.size||file.size>10*1024*1024)){uploadMessage('Выберите JPG, PNG или WebP размером не более 10 МБ каждый.','error');return;}
    if(files.reduce((sum,file)=>sum+file.size,0)>40*1024*1024){uploadMessage('Суммарный размер загрузки — не больше 40 МБ. Выберите меньше фотографий.','error');return;}
    const form=new FormData();files.forEach(file=>form.append('photos[]',file));setBusy(true);uploadMessage('Загружаем фотографии…');
    try{const data=await request('upload',{method:'POST',body:form,form:true});const added=cleanFiles(data.files);if(!added.length)throw new ApiError('Хостинг не подтвердил добавление файлов. Проверьте папку и попробуйте ещё раз.');state.files=cleanFiles([...state.files,...added]);renderInventory();uploadMessage('Добавлено '+added.length+' '+noun(added.length,'фото','фото','фото')+'. Выберите нужные кадры и сохраните изменения.','success');}
    catch(error){if(!handleAuthError(error))uploadMessage(error.message,'error');}
    finally{setBusy(false);}
  });
  for(const key of priceKeys)priceFields[key].input.addEventListener('input',()=>{
    if(!state.content)return;const input=priceFields[key].input,n=numberValue(input);state.content.pricing[key]=n===null?input.value:n;priceFields[key].error.hidden=true;input.setAttribute('aria-invalid','false');input.setCustomValidity('');validatePricing();markChanged();
  });
  for(const [button,which]of [[ui.photosTab,'photos'],[ui.pricesTab,'prices']]){
    button.addEventListener('click',()=>setTab(which));
    button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setTab(event.key==='Home'?'photos':event.key==='End'?'prices':which==='photos'?'prices':'photos',true);}});
  }
  ui.reload.addEventListener('click',async()=>{
    if(state.busy||state.dirty&&!window.confirm('Загрузить настройки с сайта? Несохранённые изменения в этой вкладке будут отменены.'))return;
    setBusy(true);message('Загружаем актуальную версию…');
    try{await loadContent(false);message('Актуальные настройки загружены.');}catch(error){if(!handleAuthError(error))message(error.message,'error');}finally{setBusy(false);}
  });
  ui.retry.addEventListener('click',bootstrap);
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  bootstrap();
})();
