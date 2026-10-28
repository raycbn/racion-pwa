(() => {
  'use strict';
  const STORAGE_KEY = 'racion.app.v1';
  const OFF_BASE = 'https://world.openfoodfacts.org';
  const $ = (id) => document.getElementById(id);
  const dialogs = ['reviewDialog','searchDialog','quantityDialog','manualDialog','settingsDialog','catalogDialog','barcodeDialog'].reduce((acc,id)=>{acc[id]=$(id);return acc;},{});
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  };
  const fmt = (n, max=1) => Number.isFinite(Number(n)) ? new Intl.NumberFormat('es-ES',{maximumFractionDigits:max}).format(Number(n)) : '—';
  const normalize = s => String(s||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const defaultState = () => ({
    version: 1,
    goals: { kcal: 1650, protein: 130, carbs: 170, fat: 55 },
    products: [{id:'personal-soy', name:'Salsa de soja habitual', brand:'Personal', unit:'ml', kcal:57, protein:null, carbs:null, fat:null, image:'', barcode:'', source:'Dato guardado por el usuario', confidence:'user', updatedAt:new Date().toISOString()}],
    entries: [],
    selectedDate: todayKey()
  });
  function loadState(){
    try { const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(stored && stored.version===1 && Array.isArray(stored.products) && Array.isArray(stored.entries)){ return {...defaultState(),...stored,goals:{...defaultState().goals,...(stored.goals||{})}}; } }
    catch(e){ console.warn('No se pudieron leer los datos locales',e); }
    return defaultState();
  }
  let state=loadState();
  // Always start on the actual local date; historical entries remain preserved.
  state.selectedDate=todayKey();
  let activeMeal='Todos';
  let pendingDrafts=[];
  let selectedProduct=null;
  let currentStream=null;
  let scanTimer=null;
  function saveState(){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }catch(e){ toast('No se pudieron guardar los datos. Exporta una copia o libera espacio.'); console.error(e); } }
  function toast(message){ const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>el.classList.remove('show'),2800); }
  function openDialog(dialog){ if(!dialog.open) dialog.showModal(); }
  function closeDialog(dialog){ if(dialog.open) dialog.close(); }
  function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function kcalFor(product,quantity){ return Number.isFinite(product.kcal) ? product.kcal * quantity/100 : null; }
  function nutrientFor(product,key,quantity){ return Number.isFinite(product[key]) ? product[key]*quantity/100 : null; }
  function fmtKcal(v){return v===null || !Number.isFinite(v) ? '—' : `${fmt(v)} kcal`;}
  function dateText(key){ const [y,m,d]=key.split('-').map(Number);return new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(new Date(y,m-1,d)); }
  function getTodayEntries(){return state.entries.filter(e=>e.date===state.selectedDate);}
  function totals(entries=getTodayEntries()){
    const out={kcal:0,protein:0,carbs:0,fat:0, knownKcal:0, unknownKcal:0, knownMacros:{protein:0,carbs:0,fat:0}, unknownMacros:{protein:0,carbs:0,fat:0}};
    for(const e of entries){
      const k=kcalFor(e.product,e.quantity); if(k===null)out.unknownKcal++; else {out.kcal+=k;out.knownKcal++;}
      for(const key of ['protein','carbs','fat']){const v=nutrientFor(e.product,key,e.quantity);if(v===null)out.unknownMacros[key]++;else {out[key]+=v;out.knownMacros[key]+=v;}}
    }
    return out;
  }
  function setProgress(id,value,goal){ $(id).style.width=`${Math.max(0,Math.min(100,goal>0?value/goal*100:0))}%`; }
  function renderSummary(){
    const entries=getTodayEntries(), t=totals(entries), g=state.goals;
    $('dateText').textContent=dateText(state.selectedDate);$('dayLabel').textContent=state.selectedDate===todayKey()?'TU DIARIO · HOY':'TU DIARIO · '+dateText(state.selectedDate).toLocaleUpperCase('es');
    $('consumedKcal').textContent=`${fmt(t.kcal,0)}${t.unknownKcal?' +':''}`;$('remainingKcal').textContent=`${t.unknownKcal?'Hasta ':''}${fmt(Math.max(0,g.kcal-t.kcal),0)} kcal`;
    $('goalLabel').textContent=`Objetivo ${fmt(g.kcal,0)} kcal`;$('calorieProgress').style.width=`${Math.min(100,g.kcal>0?t.kcal/g.kcal*100:0)}%`;$('percentLabel').textContent=`${Math.round(g.kcal>0?t.kcal/g.kcal*100:0)}%`;
    $('proteinValue').textContent=`${fmt(t.protein)}${t.unknownMacros.protein?' +':''}`;$('carbValue').textContent=`${fmt(t.carbs)}${t.unknownMacros.carbs?' +':''}`;$('fatValue').textContent=`${fmt(t.fat)}${t.unknownMacros.fat?' +':''}`;
    $('proteinGoal').textContent=t.unknownMacros.protein?`Mínimo conocido · ${t.unknownMacros.protein} sin dato`:`Objetivo: ${fmt(g.protein)} g`;$('carbGoal').textContent=t.unknownMacros.carbs?`Mínimo conocido · ${t.unknownMacros.carbs} sin dato`:`Objetivo: ${fmt(g.carbs)} g`;$('fatGoal').textContent=t.unknownMacros.fat?`Mínimo conocido · ${t.unknownMacros.fat} sin dato`:`Objetivo: ${fmt(g.fat)} g`;
    setProgress('proteinProgress',t.protein,g.protein);setProgress('carbProgress',t.carbs,g.carbs);setProgress('fatProgress',t.fat,g.fat);
    $('entryCount').textContent=`${entries.length} ${entries.length===1?'alimento':'alimentos'}`;$('allCount').textContent=entries.length;$('productCount').textContent=state.products.length;
  }
  function renderDiary(){
    const all=getTodayEntries();const entries=activeMeal==='Todos'?all:all.filter(e=>e.meal===activeMeal);
    $('emptyState').hidden=entries.length>0;
    const container=$('diaryList');container.innerHTML='';
    const meals=activeMeal==='Todos'?['Desayuno','Comida','Merienda','Cena','Otros']:[activeMeal];
    for(const meal of meals){const mealEntries=entries.filter(e=>e.meal===meal);if(!mealEntries.length)continue;
      const group=document.createElement('div');group.className='meal-group';const k=mealEntries.reduce((sum,e)=>sum+(kcalFor(e.product,e.quantity)||0),0);
      group.innerHTML=`<div class="meal-group-heading"><strong>${esc(meal)}</strong><span>${fmt(k,0)} kcal · ${mealEntries.length} ${mealEntries.length===1?'alimento':'alimentos'}</span></div>`;
      for(const e of mealEntries){
        const kx=kcalFor(e.product,e.quantity);const image=e.product.image?`<img src="${esc(e.product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span>◉</span>';
        const row=document.createElement('div');row.className='food-row';row.innerHTML=`<div class="food-thumb">${image}</div><div class="food-main"><strong>${esc(e.product.name)}</strong><small>${fmt(e.quantity)} ${e.product.unit} · ${e.product.brand?esc(e.product.brand)+' · ':''}${e.product.source==='Open Food Facts'?'Open Food Facts':e.product.source==='Etiqueta introducida por el usuario'?'Etiqueta propia':e.product.source==='Dato guardado por el usuario'?'Dato personal':'dato nutricional guardado'}</small></div><div class="food-kcal"><strong>${kx===null?'—':fmt(kx,0)}</strong><small>kcal</small></div><button class="delete-entry" aria-label="Eliminar ${esc(e.product.name)}" title="Eliminar" data-delete="${esc(e.id)}">×</button>`;
        group.appendChild(row);
      }
      container.appendChild(group);
    }
    if(entries.length===0) $('emptyState').hidden=false;
  }
  function render(){renderSummary();renderDiary();}
  function mealKcal(meal){return getTodayEntries().filter(e=>e.meal===meal).reduce((sum,e)=>sum+(kcalFor(e.product,e.quantity)||0),0);}
  function makeProduct(raw, source='Open Food Facts'){
    const n=raw.nutriments||{};
    let kcal=numOrNull(n['energy-kcal_100g'] ?? n['energy-kcal_value']);
    if(kcal===null){const kj=numOrNull(n['energy-kj_100g'] ?? n['energy-kj_value']);if(kj!==null)kcal=kj/4.184;}
    return {id:'off-'+(raw.code||crypto.randomUUID()),name:raw.product_name_es||raw.product_name||raw.product_name_en||'Producto sin nombre',brand:raw.brands||'',unit:raw.product_quantity_unit==='ml'?'ml':'g',kcal,protein:numOrNull(n.proteins_100g),carbs:numOrNull(n.carbohydrates_100g),fat:numOrNull(n.fat_100g),image:raw.image_front_small_url||raw.image_front_url||'',barcode:raw.code||'',source,confidence:'external',updatedAt:new Date().toISOString(),ingredients:raw.ingredients_text_es||raw.ingredients_text||'',nutriscore:raw.nutriscore_grade||''};
  }
  function numOrNull(v){if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return null;return Number(v);}
  function isUsableProduct(p){return p && p.name && p.name!=='Producto sin nombre' && (p.kcal!==null || p.barcode || p.image);}
  const SEARCH_CACHE_KEY='racion-search-cache-v4';
  const SEARCH_CACHE_TTL=7*24*60*60*1000;
  const FDC_DEMO_KEY='DEMO_KEY'; // Public USDA demo credential; replaced by a server-side key once Supabase proxy is connected.
  let lastSearchSources=[];
  let searchCache={};
  try{searchCache=JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY)||'{}')||{};}catch{searchCache={};}
  const genericTranslations=[
    ['pechuga de pollo','chicken breast'],['pollo','chicken'],['pechuga de pavo','turkey breast'],['pavo','turkey'],['carne picada de ternera','ground beef'],['ternera','beef'],['carne de vacuno','beef'],['lomo de cerdo','pork loin'],['cerdo','pork'],
    ['leche desnatada','skim milk'],['leche semidesnatada','2% milk'],['leche entera','whole milk'],['leche','milk'],['yogur natural','plain yogurt'],['yogur griego','greek yogurt'],['yogur','yogurt'],['yogurt','yogurt'],['huevos','egg'],['huevo','egg'],['claras de huevo','egg white'],
    ['arroz cocido','cooked rice'],['arroz blanco','white rice'],['arroz','rice'],['pasta cocida','cooked pasta'],['pasta','pasta'],['avena','oats'],['pan integral','whole wheat bread'],['pan blanco','white bread'],['pan','bread'],
    ['patatas cocidas','boiled potatoes'],['patata','potato'],['patatas','potatoes'],['tomate','tomato'],['plátano','banana'],['platano','banana'],['manzana','apple'],['aguacate','avocado'],['aceite de oliva','olive oil'],
    ['salmón','salmon'],['salmon','salmon'],['atún','tuna'],['atun','tuna'],['merluza','hake'],['bacalao','cod'],['lentejas','lentils'],['garbanzos','chickpeas'],['alubias','beans'],['brócoli','broccoli'],['brocoli','broccoli'],['zanahoria','carrot'],['almendras','almonds'],['nueces','walnuts'],['queso fresco','fresh cheese'],['queso','cheese'],['salsa de soja','soy sauce'],['mantequilla','butter'],['café','coffee'],['cafe','coffee'],['naranja','orange'],['fresas','strawberries']
  ];
  const RETAILERS=[
    {key:'mercadona',aliases:['mercadona','hacendado']},
    {key:'carrefour',aliases:['carrefour']},
    {key:'lidl',aliases:['lidl','milbona','vemondo','cien']},
    {key:'aldi',aliases:['aldi','milsani','gut bio']},
    {key:'dia',aliases:['dia','dia lactea']},
    {key:'eroski',aliases:['eroski']},
    {key:'alcampo',aliases:['alcampo','auchan']},
    {key:'consum',aliases:['consum']},
    {key:'ahorramas',aliases:['ahorramas']},
    {key:'el corte ingles',aliases:['el corte ingles','hipercor']},
    {key:'bonpreu',aliases:['bonpreu','esclat']}
  ];
  function retailerIntentForSearch(term){
    const n=' '+normalize(term)+' ';
    for(const retailer of RETAILERS){
      const matched=[retailer.key,...retailer.aliases].find(alias=>n.includes(' '+normalize(alias)+' '));
      if(matched)return {...retailer,matched:normalize(matched)};
    }
    return null;
  }
  function stripRetailerFromSearch(term,retailer){
    return (' '+normalize(term)+' ').replace(' '+(retailer.matched||retailer.key)+' ',' ').replace(/\s+/g,' ').trim();
  }
  function productMatchesRetailer(product,retailer){
    const hay=' '+normalize(String(product.brand||'')+' '+String(product.name||''))+' ';
    return retailer.aliases.some(alias=>hay.includes(' '+normalize(alias)+' '));
  }
  function fdcQueryFor(term){
    const q=' '+normalize(term)+' ';
    const matches=[...genericTranslations].sort((a,b)=>normalize(b[0]).length-normalize(a[0]).length);
    const match=matches.find(pair=>q.includes(' '+normalize(pair[0])+' '));
    return match?match[1]:term;
  }
  async function getJson(url,timeoutMs=9500){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const res=await fetch(url,{method:'GET',headers:{'Accept':'application/json'},signal:controller.signal,cache:'no-store'});
      if(!res.ok)throw new Error('HTTP '+res.status);
      return await res.json();
    }finally{clearTimeout(timer);}
  }
  async function searchOpenFoodFacts(term){
    const params=new URLSearchParams({
      search_terms:term,search_simple:'1',action:'process',json:'1',page_size:'8',page:'1',
      fields:'code,product_name,product_name_es,product_name_en,brands,image_front_small_url,image_front_url,nutriments,product_quantity_unit,ingredients_text,ingredients_text_es,nutriscore_grade'
    });
    const data=await getJson(OFF_BASE+'/cgi/search.pl?'+params.toString(),4500);
    return (data.products||[]).map(raw=>makeProduct(raw,'Open Food Facts')).filter(isUsableProduct);
  }
  function fdcNutrient(raw, ids, names){
    const list=raw.foodNutrients||[];
    const byId=list.find(n=>ids.includes(Number(n.nutrientId ?? n.nutrient?.id)) && numOrNull(n.value ?? n.amount)!==null);
    if(byId)return numOrNull(byId.value ?? byId.amount);
    const byName=list.find(n=>names.some(name=>String(n.nutrientName ?? n.nutrient?.name ?? '').toLowerCase().includes(name)) && numOrNull(n.value ?? n.amount)!==null);
    return byName?numOrNull(byName.value ?? byName.amount):null;
  }
  function makeFdcProduct(raw){
    const unit=String(raw.servingSizeUnit||'').toLowerCase()==='ml'?'ml':'g';
    const barcode=String(raw.gtinUpc||'').replace(/\D/g,'');
    return {
      id:'fdc-'+(raw.fdcId||crypto.randomUUID()),
      name:raw.description||raw.lowercaseDescription||'Alimento sin nombre',
      brand:raw.brandName||raw.brandOwner||'',
      unit,
      kcal:fdcNutrient(raw,[1008,2047,2048],['energy']),
      protein:fdcNutrient(raw,[1003],['protein']),
      carbs:fdcNutrient(raw,[1005],['carbohydrate']),
      fat:fdcNutrient(raw,[1004],['total lipid','total fat']),
      image:'',
      barcode,
      source:'USDA FoodData Central',
      confidence:'external',
      updatedAt:new Date().toISOString(),
      ingredients:raw.ingredients||'',
      fdcId:raw.fdcId||null,
      dataType:raw.dataType||''
    };
  }
  async function searchFoodDataCentral(term){
    const query=fdcQueryFor(term);
    const params=new URLSearchParams({query,pageSize:'8',api_key:FDC_DEMO_KEY});
    const data=await getJson('https://api.nal.usda.gov/fdc/v1/foods/search?'+params.toString(),4500);
    return (data.foods||[]).map(makeFdcProduct).filter(isUsableProduct);
  }
  function mergeProducts(...groups){
    const seen=new Set(),out=[];
    for(const group of groups)for(const p of (group||[])){
      const barcode=String(p.barcode||'').replace(/\D/g,'');
      const key=barcode?'barcode:'+barcode:'name:'+normalize(p.brand+' '+p.name);
      if(!p.name||seen.has(key))continue;
      seen.add(key);out.push(p);
    }
    return out;
  }
  function rememberSearch(term, products, sources){
    lastSearchSources=sources.slice();
    if(!products.length)return;
    searchCache[normalize(term)]={savedAt:Date.now(),sources:sources.slice(),products:products.slice(0,20)};
    const keys=Object.keys(searchCache).sort((a,b)=>(searchCache[b].savedAt||0)-(searchCache[a].savedAt||0));
    for(const key of keys.slice(80))delete searchCache[key];
    try{localStorage.setItem(SEARCH_CACHE_KEY,JSON.stringify(searchCache));}catch(e){console.warn('La caché de búsqueda está llena',e);}
    const byId=new Map(state.products.map(p=>[p.id,p]));
    let changed=false;
    for(const product of products){
      const prior=byId.get(product.id);
      if(!prior){state.products.unshift(product);byId.set(product.id,product);changed=true;}
      else if((prior.kcal===null && product.kcal!==null) || (!prior.image && product.image)){
        Object.assign(prior,product);changed=true;
      }
    }
    if(state.products.length>500)state.products=state.products.slice(0,500);
    if(changed)saveState();
  }
  const SUPABASE_URL='https://xegxzmicbxbqjelkvhlx.supabase.co';
  const SUPABASE_PUBLIC_KEY='sb_publishable_4rSZWrVGGkZ1yfmiTGTChA_lPkLqahd';
  async function searchSharedCatalog(term){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(SUPABASE_URL+'/functions/v1/food-search',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLIC_KEY,'Authorization':'Bearer '+SUPABASE_PUBLIC_KEY},
        body:JSON.stringify({query:String(term||'').trim()}),
        signal:controller.signal
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||('Supabase HTTP '+response.status));
      const products=(data.products||[]).map(p=>({
        id:(p.source||'shared')+'-'+(p.source_product_id||p.id),
        name:p.name||'Producto sin nombre',
        brand:p.brand||'',
        unit:p.unit==='ml'?'ml':'g',
        kcal:numOrNull(p.kcal),
        protein:numOrNull(p.protein),
        carbs:numOrNull(p.carbs),
        fat:numOrNull(p.fat),
        image:p.image_url||'',
        barcode:p.barcode||'',
        source:p.source==='openfoodfacts'?'Open Food Facts':p.source==='usda'?'USDA FoodData Central':'Catálogo compartido de Ración',
        confidence:'external',
        updatedAt:p.updated_at||p.last_seen_at||new Date().toISOString(),
        ingredients:p.ingredients||'',
        sourceLicense:p.source_license||''
      })).filter(isUsableProduct);
      return {products,sources:Array.isArray(data.sources)?data.sources:[],cached:Boolean(data.cached)};
    }finally{clearTimeout(timer);}
  }
  async function offSearch(term){
    const clean=String(term||'').trim();
    if(!clean)return [];
    const key=normalize(clean);
    const retailer=retailerIntentForSearch(clean);
    const cached=searchCache[key];
    if(cached&&Date.now()-cached.savedAt<SEARCH_CACHE_TTL&&Array.isArray(cached.products)){
      const products=retailer?cached.products.filter(p=>productMatchesRetailer(p,retailer)):cached.products;
      if(products.length){lastSearchSources=['Caché local'];return products;}
      // Don't reuse an old fuzzy result for a retailer-specific query.
    }
    const localAll=state.products.filter(p=>normalize(p.name+' '+(p.brand||'')).includes(key)||normalize(p.name)===key);
    const local=retailer?localAll.filter(p=>productMatchesRetailer(p,retailer)).slice(0,8):localAll.slice(0,8);
    try{
      const shared=await searchSharedCatalog(clean);
      const sharedProducts=retailer?shared.products.filter(p=>productMatchesRetailer(p,retailer)):shared.products;
      if(sharedProducts.length){
        const merged=mergeProducts(local,sharedProducts);
        rememberSearch(clean,merged,shared.sources.length?shared.sources:['Catálogo compartido de Ración']);
        lastSearchSources=shared.sources.length?shared.sources:['Catálogo compartido de Ración'];
        return merged.slice(0,12);
      }
      lastSearchSources=shared.sources;
      if(shared.cached)return local;
      if(shared.sources.length)return local;
    }catch(error){console.warn('Catálogo compartido de Ración no disponible; se consultan fuentes externas',error);}
    if(retailer){
      const base=stripRetailerFromSearch(clean,retailer);
      const alternateBrand=retailer.aliases.find(a=>normalize(a)!==retailer.key);
      const preferred=base?(base+' '+(alternateBrand||retailer.key)):clean;
      const terms=[...new Set([preferred,clean].filter(Boolean))].slice(0,2);
      const checks=await Promise.allSettled(terms.map(searchOpenFoodFacts));
      const found=[],errors=[];
      checks.forEach(result=>{
        if(result.status==='fulfilled')found.push(result.value.filter(p=>productMatchesRetailer(p,retailer)));
        else{errors.push(result.reason?.message||'fallo de conexión');console.warn('Búsqueda de producto de supermercado fallida',result.reason);}
      });
      const merged=mergeProducts(local,...found);
      lastSearchSources=checks.some(r=>r.status==='fulfilled')?['Open Food Facts']:[];
      if(merged.length){rememberSearch(clean,merged,lastSearchSources);return merged.slice(0,12);}
      if(errors.length===checks.length)throw new Error('No responde el catálogo de productos de supermercado. Prueba de nuevo o introduce los valores de la etiqueta.');
      return [];
    }
    const checks=await Promise.allSettled([searchOpenFoodFacts(clean),searchFoodDataCentral(clean)]);
    const names=['Open Food Facts','USDA FoodData Central'];
    const sources=[],found=[],errors=[];
    checks.forEach((result,i)=>{
      if(result.status==='fulfilled'){sources.push(names[i]);if(result.value.length)found.push(result.value);}
      else{errors.push(names[i]+': '+(result.reason?.message||'fallo de conexión'));console.warn('Fallo de fuente de alimentos '+names[i],result.reason);}
    });
    const merged=mergeProducts(local,...found);
    if(merged.length){rememberSearch(clean,merged,sources);return merged.slice(0,12);}
    lastSearchSources=sources;
    if(errors.length===checks.length)throw new Error('El catálogo compartido y los dos catálogos externos no han respondido. '+errors.join(' · '));
    return [];
  }
  async function offBarcode(code){
    const local=state.products.find(p=>String(p.barcode||'').replace(/\D/g,'')===String(code).replace(/\D/g,''));
    if(local)return local;
    try{
      const res=await getJson(OFF_BASE+'/api/v2/product/'+encodeURIComponent(code)+'.json?fields=code,product_name,product_name_es,product_name_en,brands,image_front_small_url,image_front_url,nutriments,product_quantity_unit,ingredients_text,ingredients_text_es,nutriscore_grade');
      if(res.status===1&&res.product)return makeProduct(res.product,'Open Food Facts');
    }catch(e){console.warn('Open Food Facts no respondió al consultar el código',e);}
    const candidates=await searchFoodDataCentral(code);
    const exact=candidates.find(p=>String(p.barcode||'').replace(/\D/g,'')===String(code).replace(/\D/g,''));
    if(exact){rememberSearch(code,[exact],['USDA FoodData Central']);return exact;}
    throw new Error('No encontramos ese código en los catálogos disponibles. Puedes crear el producto con su etiqueta nutricional.');
  }
  function existingMatch(term){
    const q=normalize(term);if(!q)return null;
    const exact=state.products.find(p=>normalize(p.name)===q || (p.brand && normalize(`${p.brand} ${p.name}`)===q));if(exact)return exact;
    const candidates=state.products.map(p=>({p,n:normalize(p.name)})).filter(x=>x.n.length>3 && (q.includes(x.n)||x.n.includes(q))).sort((a,b)=>b.n.length-a.n.length);
    return candidates[0]?.p||null;
  }
  function parseFoodText(text){
    const pieces=text.trim().split(/\s+(?:y|\+|;)\s+(?=\d+(?:[.,]\d+)?\s*(?:kg|g|gr|gramos?|ml|l|litros?)\b)|\s*;\s*|\s*,\s*(?=\d+(?:[.,]\d+)?\s*(?:kg|g|gr|gramos?|ml|l|litros?)\b)/i).map(x=>x.trim()).filter(Boolean);
    return pieces.map((piece,index)=>{
      const m=piece.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramos?|ml|l|litros?)\s+(?:de\s+)?(.+)$/i);
      if(!m)return {draftId:`d-${Date.now()}-${index}`,raw:piece,quantity:null,unit:null,query:piece.trim(),product:null,candidates:[],status:'quantity-needed',error:'No hemos detectado la cantidad y unidad. Usa, por ejemplo, «150 g de arroz».',busy:false};
      let quantity=Number(m[1].replace(',','.')),unit=m[2].toLowerCase();
      if(unit==='kg'){quantity*=1000;unit='g';}else if(unit==='l'||unit==='litro'||unit==='litros'){quantity*=1000;unit='ml';}else if(['gr','gramo','gramos'].includes(unit))unit='g';
      const query=m[3].trim().replace(/[.!?]+$/,'');const product=existingMatch(query);
      const draft={draftId:`d-${Date.now()}-${index}`,raw:piece,quantity,unit,query,product:null,candidates:[],status:'searching',error:'',busy:false};
      if(product){if(product.unit!==unit){draft.status='unit-mismatch';draft.error=`El producto guardado usa ${product.unit}, pero has indicado ${unit}. Revisa la unidad.`;}else{draft.product=product;draft.status='matched';}}
      return draft;
    });
  }
  function productCard(p,options={}){
    const wrap=document.createElement('div');wrap.className='result-product';
    const img=p.image?'<img src="'+esc(p.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<div class="result-fallback">◉</div>';
    const macros=[['Proteína',p.protein],['Hidratos',p.carbs],['Grasa',p.fat]].filter(([,v])=>v!==null&&v!==undefined).map(([name,v])=>name+' '+fmt(v)+'g').join(' · ');
    const calories=p.kcal===null?'kcal no disponibles':fmt(p.kcal)+' kcal/100'+p.unit;
    wrap.innerHTML=img+'<div class="result-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(p.brand||'Sin marca')+' · '+esc(p.source||'Fuente no indicada')+' · '+calories+'</small><div class="nutri-chips">'+(p.kcal===null?'<span class="nutri-chip">Sin calorías verificadas</span>':'<span class="nutri-chip">'+fmt(p.kcal)+' kcal</span>')+(macros?'<span class="nutri-chip">'+esc(macros)+'</span>':'')+'</div></div><button type="button">'+esc(options.buttonText||'Seleccionar')+'</button>';
    wrap.querySelector('button').addEventListener('click',()=>options.onSelect?.(p));return wrap;
  }
  async function resolveDrafts(){
    $('draftList').innerHTML='';for(const d of pendingDrafts){if(d.status==='matched' || d.status==='selected')continue;if(d.status==='quantity-needed'||d.status==='unit-mismatch')continue;
      d.busy=true;
      try {d.candidates=await offSearch(d.query);d.status=d.candidates.length?'candidates':'not-found';if(d.candidates.length===1 && normalize(d.candidates[0].name)===normalize(d.query) && d.candidates[0].unit===d.unit){d.status='candidates';}}
      catch(e){d.status='search-error';d.error='No pudimos consultar el catálogo externo. Comprueba tu conexión o crea el producto manualmente.';}
      d.busy=false;
    }
    renderDrafts();
  }
  function renderDrafts(){
    const list=$('draftList');list.innerHTML='';
    for(const d of pendingDrafts){
      const card=document.createElement('article');card.className='draft-card';
      const status=(d.status==='matched'||d.status==='selected')?'<span class="draft-status ok">Producto identificado</span>':d.status==='candidates'?'<span class="draft-status">Elige producto</span>':d.status==='searching'||d.busy?'<span class="draft-status">Buscando…</span>':'<span class="draft-status">Requiere revisión</span>';
      card.innerHTML=`<div class="draft-head"><div class="draft-heading"><strong>${esc(d.query||d.raw)}</strong><small>${d.quantity===null?'Cantidad sin detectar':`${fmt(d.quantity)} ${esc(d.unit)} · ${esc(d.raw)}`}</small></div>${status}</div>`;
      if(d.product){const k=d.quantity===null?null:kcalFor(d.product,d.quantity);card.querySelector('.draft-heading').insertAdjacentHTML('beforeend',`<small>${esc(d.product.name)} · ${d.quantity===null?'cantidad pendiente':`${fmtKcal(k)} por esta cantidad`}${d.product.source==='Dato guardado por el usuario'?' · dato personal':''}</small>`);}
      if(d.error && !d.product) card.insertAdjacentHTML('beforeend',`<p class="draft-note">${esc(d.error)}</p>`);
      if(d.candidates?.length && !d.product){const choices=document.createElement('div');choices.className='candidate-list';d.candidates.slice(0,5).forEach(p=>choices.appendChild(productCard(p,{buttonText:'Elegir',onSelect:selected=>{if(selected.unit!==d.unit){toast(`El producto usa ${selected.unit}. Cambia la cantidad a esa unidad o crea una ficha correcta.`);return;}d.product=selected;d.status='selected';d.error='';addProductIfNeeded(selected);renderDrafts();}})));card.appendChild(choices);}
      const actions=document.createElement('div');actions.className='draft-actions';
      if(!d.product){const manual=document.createElement('button');manual.className='secondary-btn';manual.type='button';manual.textContent='Introducir etiqueta';manual.addEventListener('click',()=>openManualForDraft(d));actions.appendChild(manual);const search=document.createElement('button');search.className='secondary-btn';search.type='button';search.textContent='Buscar otra vez';search.addEventListener('click',async()=>{try{d.candidates=await offSearch(d.query);d.status=d.candidates.length?'candidates':'not-found';d.error=d.candidates.length?'':'No hay resultados para ese nombre.';}catch{d.status='search-error';d.error='No se pudo buscar el producto.';}renderDrafts();});actions.appendChild(search);}
      else {const change=document.createElement('button');change.className='secondary-btn';change.type='button';change.textContent='Cambiar producto';change.addEventListener('click',async()=>{d.product=null;d.status='searching';renderDrafts();try{d.candidates=await offSearch(d.query);d.status=d.candidates.length?'candidates':'not-found';}catch{d.status='search-error';d.error='No se pudo buscar.';}renderDrafts();});actions.appendChild(change);}
      card.appendChild(actions);list.appendChild(card);
    }
    const accepted=pendingDrafts.filter(d=>d.product && d.quantity>0 && d.product.unit===d.unit).length;
    $('reviewSummary').textContent=`${accepted} de ${pendingDrafts.length} alimentos listos para añadir`;
    $('confirmDraftsBtn').disabled=accepted===0;$('confirmDraftsBtn').style.opacity=accepted===0?'.45':'1';
  }
  function addProductIfNeeded(p){if(!state.products.some(x=>x.id===p.id)){state.products.push({...p});saveState();}}
  $('naturalForm').addEventListener('submit',async e=>{
    e.preventDefault();const text=$('naturalInput').value.trim();if(!text)return;
    pendingDrafts=parseFoodText(text);const meal=$('mealSelect').value;pendingDrafts.forEach(d=>d.meal=meal);
    openDialog(dialogs.reviewDialog);renderDrafts();await resolveDrafts();
  });
  $('confirmDraftsBtn').addEventListener('click',()=>{
    const good=pendingDrafts.filter(d=>d.product && d.quantity>0 && d.product.unit===d.unit);
    if(!good.length)return;
    const now=new Date().toISOString();for(const d of good){addProductIfNeeded(d.product);state.entries.push({id:crypto.randomUUID(),date:state.selectedDate,meal:d.meal||$('mealSelect').value,quantity:d.quantity,product:{...d.product},createdAt:now});}
    saveState();render();closeDialog(dialogs.reviewDialog);$('naturalInput').value='';pendingDrafts=[];toast(`${good.length} ${good.length===1?'alimento añadido':'alimentos añadidos'} al diario`);
  });
  $('openSearchBtn').addEventListener('click',()=>{ $('productSearchInput').value='';$('searchResults').innerHTML='<div class="search-placeholder"><span>⌕</span><p>Busca un producto por nombre, marca o código.</p></div>';openDialog(dialogs.searchDialog);setTimeout(()=>$('productSearchInput').focus(),100); });
  $('searchForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const q=$('productSearchInput').value.trim();
    if(!q)return;
    const out=$('searchResults'),status=$('searchSourceStatus');
    const retailer=retailerIntentForSearch(q);
    const matchesQueryScope=p=>!retailer||productMatchesRetailer(p,retailer);
    out.innerHTML='<div class="search-placeholder"><span>◌</span><p>Buscando en el catálogo compartido y las fuentes disponibles…</p></div>';
    if(status)status.textContent='Consultando el catálogo de Ración y las fuentes externas.';
    const local=state.products.filter(p=>normalize((p.brand||'')+' '+p.name).includes(normalize(q))&&matchesQueryScope(p)).slice(0,8);
    try{
      const remote=await offSearch(q);
      const all=mergeProducts(local,remote.filter(matchesQueryScope)).slice(0,12);
      out.innerHTML='';
      if(status)status.textContent='Fuentes: '+(lastSearchSources.length?lastSearchSources.join(' · '):'sin coincidencias')+'. Se guardan localmente solo los resultados válidos.';
      if(!all.length){
        const msg=retailer
          ?'No encontramos productos de '+esc(retailer.key)+' para «'+esc(q)+'». No mostraremos productos de otras marcas. Prueba «'+esc(stripRetailerFromSearch(q,retailer))+' '+esc(retailer.aliases[1]||retailer.key)+'» o introduce los datos de la etiqueta.'
          :'No encontramos una coincidencia para «'+esc(q)+'». Prueba con el nombre genérico, la marca o el código de barras. También puedes crear el producto con su etiqueta.';
        out.innerHTML='<div class="search-placeholder"><span>⌕</span><p>'+msg+'</p></div>';
        return;
      }
      all.forEach(p=>out.appendChild(productCard(p,{onSelect:openQuantityForProduct})));
    }catch(err){
      out.innerHTML='';
      if(local.length){
        local.filter(matchesQueryScope).forEach(p=>out.appendChild(productCard(p,{onSelect:openQuantityForProduct})));
        if(status)status.textContent='Mostrando coincidencias guardadas; las fuentes externas no respondieron.';
      }else{
        out.innerHTML='<div class="search-placeholder"><span>!</span><p>No respondieron los catálogos en este intento. Comprueba la conexión o introduce manualmente la etiqueta nutricional.</p></div>';
        if(status)status.textContent='La búsqueda no se completó. No se ha registrado ningún alimento.';
      }
      console.warn('Búsqueda de productos no disponible',err);
    }
  });
  function openQuantityForProduct(product){
    selectedProduct=product;$('quantityTitle').textContent=product.name;$('quantityUnit').textContent=product.unit;$('quantityInput').value=product.unit==='ml'?'10':'100';$('quantityMeal').value=$('mealSelect').value;const img=product.image?`<img src="${esc(product.image)}" alt="">`:'<div class="result-fallback">◉</div>';$('quantityProduct').innerHTML=`${img}<div><strong>${esc(product.name)}</strong><small>${esc(product.brand||'Sin marca')} · ${product.kcal===null?'Calorías sin dato':`${fmt(product.kcal)} kcal/100${product.unit}`}</small></div>`;renderQuantityPreview();closeDialog(dialogs.searchDialog);closeDialog(dialogs.reviewDialog);openDialog(dialogs.quantityDialog);
  }
  function renderQuantityPreview(){if(!selectedProduct)return;const q=numOrNull($('quantityInput').value)||0;const p=selectedProduct;$('quantityPreview').innerHTML=[['kcal',kcalFor(p,q)],['Proteínas',nutrientFor(p,'protein',q)],['Hidratos',nutrientFor(p,'carbs',q)],['Grasas',nutrientFor(p,'fat',q)]].map(([l,v])=>`<div><strong>${v===null?'—':fmt(v)}</strong><small>${l}</small></div>`).join('');}
  $('quantityInput').addEventListener('input',renderQuantityPreview);
  $('quantityForm').addEventListener('submit',e=>{e.preventDefault();if(!selectedProduct)return;const q=numOrNull($('quantityInput').value);if(q===null||q<=0){toast('Introduce una cantidad válida.');return;}addProductIfNeeded(selectedProduct);state.entries.push({id:crypto.randomUUID(),date:state.selectedDate,meal:$('quantityMeal').value,quantity:q,product:{...selectedProduct},createdAt:new Date().toISOString()});saveState();render();closeDialog(dialogs.quantityDialog);toast('Alimento añadido al diario');selectedProduct=null;});
  $('openManualBtn').addEventListener('click',()=>openManualForDraft(null));
  function openManualForDraft(draft){$('manualForm').dataset.draftId=draft?.draftId||'';$('manualName').value=draft?.query||'';$('manualUnit').value=draft?.unit||'g';$('manualKcal').value='';$('manualProtein').value='';$('manualCarbs').value='';$('manualFat').value='';$('manualBrand').value='';openDialog(dialogs.manualDialog);}
  $('manualForm').addEventListener('submit',e=>{
    e.preventDefault();const p={id:`manual-${crypto.randomUUID()}`,name:$('manualName').value.trim(),brand:$('manualBrand').value.trim(),unit:$('manualUnit').value,kcal:numOrNull($('manualKcal').value),protein:numOrNull($('manualProtein').value),carbs:numOrNull($('manualCarbs').value),fat:numOrNull($('manualFat').value),image:'',barcode:'',source:'Etiqueta introducida por el usuario',confidence:'user',updatedAt:new Date().toISOString()};if(!p.name||p.kcal===null){toast('El nombre y las kcal de la etiqueta son necesarios.');return;}
    state.products.push(p);saveState();const draftId=$('manualForm').dataset.draftId;if(draftId){const d=pendingDrafts.find(x=>x.draftId===draftId);if(d){d.product=p;d.unit=p.unit;d.status='selected';d.error='';renderDrafts();closeDialog(dialogs.manualDialog);openDialog(dialogs.reviewDialog);toast('Producto guardado y vinculado al alimento');return;}}
    closeDialog(dialogs.manualDialog);render();openQuantityForProduct(p);toast('Producto guardado en tu catálogo');
  });
  $('settingsBtn').addEventListener('click',()=>{ $('goalKcal').value=state.goals.kcal;$('goalProtein').value=state.goals.protein;$('goalCarbs').value=state.goals.carbs;$('goalFat').value=state.goals.fat;openDialog(dialogs.settingsDialog);});
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();state.goals={kcal:Number($('goalKcal').value),protein:Number($('goalProtein').value),carbs:Number($('goalCarbs').value),fat:Number($('goalFat').value)};saveState();render();closeDialog(dialogs.settingsDialog);toast('Objetivos actualizados');});
  document.querySelectorAll('.meal-tab').forEach(btn=>btn.addEventListener('click',()=>{activeMeal=btn.dataset.meal;document.querySelectorAll('.meal-tab').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',b===btn?'true':'false');});renderDiary();}));
  $('diaryList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete]');if(!btn)return;state.entries=state.entries.filter(x=>x.id!==btn.dataset.delete);saveState();render();toast('Alimento eliminado del diario');});
  $('emptyAddBtn').addEventListener('click',()=>$('naturalInput').focus());
  function downloadFile(filename,content,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  $('exportBtn').addEventListener('click',()=>{const entries=getTodayEntries();const rows=[['fecha','comida','producto','marca','cantidad','unidad','kcal_por_100','kcal_registradas','proteina_por_100','hidratos_por_100','grasas_por_100','fuente']];for(const e of entries){rows.push([e.date,e.meal,e.product.name,e.product.brand,e.quantity,e.product.unit,e.product.kcal,kcalFor(e.product,e.quantity),e.product.protein,e.product.carbs,e.product.fat,e.product.source]);}const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');downloadFile(`racion-${state.selectedDate}.csv`,csv,'text/csv;charset=utf-8');toast('Diario exportado a CSV');});
  $('backupBtn').addEventListener('click',()=>downloadFile(`racion-copia-${todayKey()}.json`,JSON.stringify(state,null,2),'application/json')); 
  $('resetBtn').addEventListener('click',()=>{if(!confirm('¿Seguro que quieres borrar el diario, productos personalizados y objetivos guardados en este navegador? Esta acción no se puede deshacer. Descarga primero una copia si quieres conservarlos.'))return;state=defaultState();saveState();render();closeDialog(dialogs.settingsDialog);toast('Datos locales borrados');});
  $('catalogBtn').addEventListener('click',renderCatalogAndOpen);$('catalogAddBtn').addEventListener('click',()=>{closeDialog(dialogs.catalogDialog);openManualForDraft(null);});
  function renderCatalogAndOpen(){const list=$('catalogList');list.innerHTML='';if(!state.products.length)list.innerHTML='<div class="search-placeholder">Todavía no tienes productos guardados.</div>';for(const p of state.products){const row=document.createElement('div');row.className='catalog-row';row.innerHTML=`<div class="food-thumb">${p.image?`<img src="${esc(p.image)}" alt="">`:'◉'}</div><div class="catalog-row-copy"><strong>${esc(p.name)}</strong><small>${esc(p.brand||'Sin marca')} · ${p.kcal===null?'kcal sin dato':`${fmt(p.kcal)} kcal/100${p.unit}`}</small></div>${p.id==='personal-soy'?'<span class="draft-status ok">Personal</span>':`<button type="button" data-remove-product="${esc(p.id)}">Eliminar</button>`}`;list.appendChild(row);}openDialog(dialogs.catalogDialog);}
  $('catalogList').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-product]');if(!btn)return;const id=btn.dataset.removeProduct;if(state.entries.some(entry=>entry.product.id===id)){if(!confirm('Este producto aparece en tu historial. Si lo eliminas del catálogo, los registros existentes se conservarán. ¿Continuar?'))return;}state.products=state.products.filter(p=>p.id!==id);saveState();renderSummary();renderCatalogAndOpen();});
  $('openBarcodeBtn').addEventListener('click',()=>{ $('barcodeInput').value='';$('cameraMessage').textContent='Si tu navegador admite el escáner, podrás apuntar al código.';openDialog(dialogs.barcodeDialog);});
  $('barcodeForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('barcodeInput').value.trim();await lookupBarcode(code);});
  async function lookupBarcode(code){try{toast('Consultando el código…');const p=await offBarcode(code);closeDialog(dialogs.barcodeDialog);openQuantityForProduct(p);}catch(e){toast(e.message||'No se encontró el producto.');console.warn(e);}}
  $('startCameraBtn').addEventListener('click',async()=>{
    if(!('BarcodeDetector'in window)){ $('cameraMessage').textContent='Este navegador no incluye BarcodeDetector. Puedes usar el campo de código de barras de abajo.';toast('Escáner de cámara no disponible en este navegador');return; }
    try{currentStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=$('cameraVideo');video.srcObject=currentStream;video.style.display='block';await video.play();$('cameraMessage').textContent='Apunta al código de barras. Mantén el envase quieto.';$('startCameraBtn').textContent='Cámara activa';const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});clearInterval(scanTimer);scanTimer=setInterval(async()=>{try{if(video.readyState<2)return;const codes=await detector.detect(video);if(codes.length&&codes[0].rawValue){$('barcodeInput').value=codes[0].rawValue;stopCamera();await lookupBarcode(codes[0].rawValue);}}catch(e){console.warn('Lectura de código',e);}},350);}
    catch(e){$('cameraMessage').textContent='No se ha podido abrir la cámara. Comprueba los permisos o introduce el código manualmente.';toast('No se pudo abrir la cámara');}
  });
  function stopCamera(){clearInterval(scanTimer);scanTimer=null;if(currentStream){currentStream.getTracks().forEach(t=>t.stop());currentStream=null;}const v=$('cameraVideo');v.pause();v.srcObject=null;v.style.display='none';$('startCameraBtn').textContent='Abrir cámara';}
  dialogs.barcodeDialog.addEventListener('close',stopCamera);
  if('serviceWorker'in navigator && location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('PWA offline no disponible',err)));
  // First-run personalization defaults to the user's already-confirmed soy sauce value; other foods must be identified.
  saveState();render();
})();
