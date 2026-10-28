(() => {
  'use strict';
  const modernKey = 'racion.app.v1';
  if (localStorage.getItem(modernKey)) return;
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const numeric = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const today = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const oldCatalog = read('racion-products-v1') || {};
  const oldMeals = read('racion-meals-v1') || {};
  const oldTarget = numeric(read('racion-target-v1'));
  const seed = {id:'personal-soy',name:'Salsa de soja habitual',brand:'Personal',unit:'ml',kcal:57,protein:null,carbs:null,fat:null,image:'',barcode:'',source:'Dato guardado por el usuario',confidence:'user',updatedAt:new Date().toISOString()};
  const state = {version:1,goals:{kcal:oldTarget>0?oldTarget:1650,protein:130,carbs:170,fat:55},products:[seed],entries:[],selectedDate:today()};
  const byName = new Map([[seed.name.toLocaleLowerCase('es'),seed]]);
  const idFor = value => 'legacy-'+String(value||'product').replace(/[^a-zA-Z0-9_-]/g,'-');
  const makeProduct = (item,key) => ({id:idFor(item.id||key||item.name),name:String(item.name||'Producto guardado'),brand:String(item.brand||''),unit:item.unit==='ml'?'ml':'g',kcal:numeric(item.kcal),protein:numeric(item.protein),carbs:numeric(item.carbs),fat:numeric(item.fat),image:String(item.image||''),barcode:String(item.barcode||''),source:String(item.source||'Importado del diario anterior'),confidence:'legacy',updatedAt:new Date().toISOString()});
  for (const [key,item] of Object.entries(oldCatalog)) {
    if (!item || !item.name) continue;
    const product=makeProduct(item,key);
    byName.set(product.name.toLocaleLowerCase('es'),product);
    if(!state.products.some(p=>p.id===product.id))state.products.push(product);
  }
  for (const [date,records] of Object.entries(oldMeals)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(records)) continue;
    for (const record of records) {
      if (!record || !record.name || !(Number(record.qty)>0)) continue;
      const key=String(record.name).toLocaleLowerCase('es');
      let product=byName.get(key);
      if (!product) { product=makeProduct(record,'meal-'+date+'-'+record.name);byName.set(key,product);state.products.push(product); }
      else for (const nutrient of ['kcal','protein','carbs','fat']) if (product[nutrient]===null && numeric(record[nutrient])!==null) product[nutrient]=numeric(record[nutrient]);
      state.entries.push({id:'legacy-entry-'+(state.entries.length+1),date,meal:'Otros',quantity:Number(record.qty),product:{...product},createdAt:new Date().toISOString()});
    }
  }
  if (state.entries.length || Object.keys(oldCatalog).length || oldTarget>0) {
    try { localStorage.setItem(modernKey,JSON.stringify(state)); console.info('Ración: migrados '+state.entries.length+' registros del diario anterior; se conservan los datos originales.'); }
    catch (error) { console.warn('No se pudieron migrar automáticamente los datos anteriores',error); }
  }
})();