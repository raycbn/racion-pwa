import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
if (!appSource.includes("Consultar NUTRIFEN actualizado (requiere registro)")) {
  throw new Error("La búsqueda ECI no enlaza la fuente nutricional actualizada NUTRIFEN");
}
if (!appSource.includes("ficha de la fuente modificada") ||
    !appSource.includes("candidato nutricional; disponibilidad en ") ||
    !appSource.includes("sourceUpdatedAt:p.source_modified_at")) {
  throw new Error("La interfaz no muestra la frescura nutricional ni la disponibilidad no verificada");
}
if (!appSource.includes("feed autorizado") ||
    !appSource.includes("permiso escrito") ||
    appSource.includes("Ración incluye una muestra de fichas públicas de El Corte Inglés")) {
  throw new Error("El texto ECI/Hipercor no refleja que hace falta un feed o permiso autorizado");
}
if (!appSource.includes("racion-search-cache-v19")) {
  throw new Error("La caché local no se ha invalidado tras retirar las muestras antiguas");
}
const mergeStart = appSource.indexOf("  function productNutritionScore(");
const mergeEnd = appSource.indexOf("  function rememberSearch", mergeStart);
if (mergeStart < 0 || mergeEnd < 0) throw new Error("mergeProducts helper not found");
const mergeContext = {
  normalize: value => String(value ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ")
};
runInNewContext(appSource.slice(mergeStart, mergeEnd) +
  "\nglobalThis.__mergeProducts = mergeProducts;", mergeContext);
const mergeProductsTest = mergeContext.__mergeProducts;
const storeProduct = {
  name:"Yogur natural Hacendado", brand:"Hacendado", source:"Mercadona",
  storeKey:"mercadona", barcode:"8410000000012",
  kcal:null, protein:null, carbs:null, fat:null
};
const nutrientProduct = {
  name:"Yogur natural Hacendado", brand:"Hacendado", source:"Open Food Facts",
  barcode:"8410000000012", kcal:61, protein:3.8, carbs:5, fat:3.1,
  sourceLicense:"ODbL-1.0"
};
const mergedTest = mergeProductsTest([storeProduct], [nutrientProduct]);
if (mergedTest.length !== 1) throw new Error("The same barcode must produce one result card");
if (mergedTest[0].storeKey !== "mercadona" || mergedTest[0].source !== "Mercadona") {
  throw new Error("Nutrition merging must preserve retailer provenance");
}
if (mergedTest[0].kcal !== 61 || mergedTest[0].protein !== 3.8 ||
    mergedTest[0].carbs !== 5 || mergedTest[0].fat !== 3.1) {
  throw new Error("Nutrition merging discarded known nutrient values");
}
if (mergedTest[0].nutritionSource !== "Open Food Facts") {
  throw new Error("Nutrition source was not recorded after merging");
}
console.log("OK deduplicación por código de barras → conserva tienda y nutrientes ODbL");

const localNutritionProduct = {
  name:"Yogur natural",brand:"Marca conocida",source:"Producto guardado",
  barcode:"8410000000099",kcal:61,protein:3.8,carbs:5,fat:3.1
};
const hipercorNutritionCandidate = {
  name:"Yogur natural",brand:"Marca conocida",source:"Open Food Facts",
  barcode:"8410000000099",kcal:61,protein:null,carbs:null,fat:null,
  retailerAvailability:"unverified",targetRetailer:"hipercor",retailerMatchStatus:"nutrition-candidate"
};
const mergedCandidate = mergeProductsTest([localNutritionProduct],[hipercorNutritionCandidate]);
if (mergedCandidate.length !== 1 ||
    mergedCandidate[0].retailerAvailability !== "unverified" ||
    mergedCandidate[0].targetRetailer !== "hipercor") {
  throw new Error("La deduplicación perdió la advertencia de disponibilidad no verificada");
}
console.log("OK fusión ECI/Hipercor/Supercor → conserva la advertencia de disponibilidad");


console.log("Smoke catalog version: no unauthorized ECI/Hipercor/Supercor product-list extraction; official links + open nutrition sources");

const endpoint = "https://xegxzmicbxbqjelkvhlx.supabase.co/functions/v1/food-search";
const publishableKey = "sb_publishable_4rSZWrVGGkZ1yfmiTGTChA_lPkLqahd";

const normalize = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

async function search(query) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: "Bearer " + publishableKey
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(25000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(query + ": HTTP " + response.status + " " + JSON.stringify(body));
  }
  if (!body || !Array.isArray(body.products) || !Array.isArray(body.sources)) {
    throw new Error(query + ": respuesta JSON inesperada");
  }
  for (const item of body.products) {
    if (!item.name || !item.source) throw new Error(query + ": producto sin nombre o fuente");
    for (const field of ["kcal", "protein", "carbs", "fat"]) {
      if (item[field] !== null && item[field] !== undefined &&
          (!Number.isFinite(Number(item[field])) || Number(item[field]) < 0)) {
        throw new Error(query + ": nutriente inválido " + field + " en " + item.name);
      }
    }
  }
  return body;
}

const broad = await search("Yogur");
if (!Array.isArray(broad.sourceStats) || broad.sourceStats.length === 0) {
  throw new Error("La búsqueda no devuelve diagnóstico por fuente; no se pueden detectar catálogos vacíos.");
}
const expandedSources = ["Ametller Origen", "Bonpreu i Esclat"];
const missingExpandedSources = expandedSources.filter(source =>
  !broad.sourceStats.some(stat => stat.source === source)
);
if (missingExpandedSources.length) {
  throw new Error("No se registraron las nuevas fuentes: " + missingExpandedSources.join(", "));
}
const yogurtTokens = new Set(["yogur","yogures","yogurt","yoghurt","yoghourt","iogurt"]);
const nonYogurtPrefixes = new Set([
  "fruta","frutas","bizcocho","tarta","pastel","galleta","galletas","barrita",
  "barritas","cereal","cereales","helado","pan","bolleria","bollo","magdalena",
  "snack","masa","brownie"
]);
const notYogurt = broad.products.filter(product => {
  const words=normalize(product.name).split(/\s+/);
  const yogurtIndex=words.findIndex(word => yogurtTokens.has(word));
  return yogurtIndex < 0 ||
    words.slice(0,yogurtIndex).some(word => nonYogurtPrefixes.has(word));
});
const badYogurtMentions = broad.products.filter(product => {
  const name=normalize(product.name);
  return /^(fruta|frutas|bizcocho|tarta|pastel|galleta|galletas|barrita|barritas|cereal|cereales|helado|pan|bolleria|bollo|magdalena|snack|masa|brownie)\b/.test(name) &&
    [...yogurtTokens].some(token => name.includes(token));
});
if (badYogurtMentions.length) {
  throw new Error("Se mezclaron alimentos que solo mencionan yogur como ingrediente: " +
    badYogurtMentions.map(p => p.name).join("; "));
}

if (notYogurt.length) {
  throw new Error("La búsqueda general mezcló otros alimentos: " +
    notYogurt.map(p => p.name).join("; "));
}
if (broad.products.length === 0) {
  throw new Error("La búsqueda federada de yogur no devolvió productos; sources=" +
    broad.sources.join(", "));
}
console.log("OK búsqueda federada de yogur →", broad.products.length,
  "productos; diagnóstico por fuente:", JSON.stringify(broad.sourceStats || broad.sources));

const aesanStat = broad.sourceStats.find(stat => stat.source === "AESAN (2022)");
if (!aesanStat || !String(aesanStat.status).startsWith("cached-") || Number(aesanStat.products) === 0) {
  throw new Error("AESAN 2022 no está integrado en el diagnóstico de búsqueda: " +
    JSON.stringify(aesanStat || broad.sourceStats));
}
// Deduplication may display a retailer card instead of a duplicate AESAN row.
console.log("OK catálogo AESAN 2022 →", aesanStat.products,
  "coincidencias de catálogo; el EAN y el respaldo nutricional se prueban abajo.");

const knownAesanBarcode = "8410500027766";
const barcodeLookup = await search(knownAesanBarcode);
const matchedAesanBarcode = barcodeLookup.products.find(product =>
  product.source === "aesan" && String(product.barcode || "").replace(/\D/g, "") === knownAesanBarcode
);
if (!matchedAesanBarcode || Number(matchedAesanBarcode.kcal) !== 31) {
  throw new Error("El EAN de prueba AESAN no devuelve las calorías esperadas: " +
    JSON.stringify({products:barcodeLookup.products, sourceStats:barcodeLookup.sourceStats}));
}
console.log("OK EAN AESAN", knownAesanBarcode, "→", matchedAesanBarcode.name,
  matchedAesanBarcode.kcal, "kcal/100", matchedAesanBarcode.unit);

const matchedStoreBarcode = "8414807548313";
const storeLookup = await search(matchedStoreBarcode);
const enrichedStoreProduct = storeLookup.products.find(product =>
  product.source === "consum" &&
  String(product.barcode || "").replace(/\D/g, "") === matchedStoreBarcode
);
if (!enrichedStoreProduct ||
    Number(enrichedStoreProduct.kcal) !== 20 ||
    !["AESAN (2022)","Open Food Facts"].includes(enrichedStoreProduct.nutrition_source)) {
  throw new Error("El producto de Consum no obtuvo respaldo nutricional AESAN por EAN: " +
    JSON.stringify({products:storeLookup.products,sourceStats:storeLookup.sourceStats}));
}
console.log("OK nutrición de tienda por EAN →",
  enrichedStoreProduct.name, enrichedStoreProduct.kcal, "kcal/100; fuente:", enrichedStoreProduct.nutrition_source);


const enriched = broad.products.filter(product => product.nutrition_source);
console.log("Diagnóstico de nutrientes por código de barras:", enriched.length,
  "productos enlazados a una fuente nutricional.");

const commonFoods = [
  {query:"huevos", pattern:/egg|huevo|ous/i},
  {query:"arroz", pattern:/rice|arroz|arros/i},
  {query:"aceite de oliva", pattern:/olive|oliva|aceite.*oil|oli/i}
];
for (const check of commonFoods) {
  const data = await search(check.query);
  const wrong = data.products.filter(product => !check.pattern.test(normalize(product.name)));
  if (wrong.length) {
    throw new Error(check.query + " devolvió productos no relacionados: " +
      wrong.map(p => p.name).join("; "));
  }
  if (data.products.length === 0) {
    throw new Error(check.query + " no devolvió productos; fuentes=" +
      JSON.stringify(data.sourceStats || data.sources));
  }
  console.log("OK", check.query, "→", data.products.length, "productos");
}


const repeated = await search("Yogur");
const cachedSourceCount = Array.isArray(repeated.sourceStats)
  ? repeated.sourceStats.filter(stat => String(stat.status).startsWith("cached-")).length
  : 0;
if (cachedSourceCount < 5) {
  throw new Error("La segunda búsqueda no reutilizó suficientes fuentes cacheadas (" +
    cachedSourceCount + "): " + JSON.stringify(repeated.sourceStats || repeated));
}
console.log("OK caché compartida →", cachedSourceCount, "fuentes reutilizadas; las fuentes con error pueden reintentarse al vencer su backoff");

const addedStores = [
  {query:"Yogur Condis", key:"condis", label:"Condis"},
  {query:"Leche Bonarea", key:"bonarea", label:"Bonàrea"},
  {query:"Leche Plusfresc", key:"plusfresc", label:"Plusfresc"},
  {query:"Manzana Bonpreu", key:"bonpreu", label:"Bonpreu i Esclat"},
  {query:"Poma Bonpreu", key:"bonpreu", label:"Bonpreu i Esclat"},
  {query:"Yogur Ametller", key:"ametller", label:"Ametller Origen"},
  {query:"Leche Alcampo", key:"alcampo", label:"Alcampo"},
  {query:"Leche Makro", key:"makro", label:"Makro España"}
];
for (const check of addedStores) {
  const data = await search(check.query);
  const stat = (data.sourceStats || []).find(item => item.source === check.label);
  if (!stat) {
    throw new Error(check.label + " no aparece en el diagnóstico: " +
      JSON.stringify(data.sourceStats || data.sources));
  }
  const expectedSource = check.key === "supercor" ? "elcorteingles" : check.key;
  const direct = data.products.filter(product => product.source === expectedSource);
  if (stat.status === "error" || stat.products === 0 || direct.length === 0) {
    throw new Error(check.label + " no devolvió productos del catálogo esperado: " +
      JSON.stringify({stat, sourceStats:data.sourceStats, products:data.products.slice(0,3)}));
  }
  if (check.key === "supercor" && !String(stat.source).includes("no verificado")) {
    throw new Error("La búsqueda Supercor debe advertir que el stock en tienda no está verificado.");
  }
  console.log("OK cadena nueva", check.label, "→", direct.length,
    "productos propios; fuentes:", JSON.stringify(data.sourceStats));
}

const eciChecks = [
  {query:"Yogur El Corte Inglés",key:"elcorteingles",label:"El Corte Inglés",aliases:["el corte ingles","corte ingles","elcorteingles","eci"]},
  {query:"Leche Hipercor",key:"hipercor",label:"Hipercor",aliases:["hipercor"]},
  {query:"Yogur Supercor",key:"supercor",label:"Supercor",aliases:["supercor"]}
];
for(const check of eciChecks) {
  const data=await search(check.query);
  const legacy=data.products.filter(product =>
    ["elcorteingles","hipercor","supercor"].includes(String(product.source||"").toLowerCase()) ||
    ["elcorteingles","hipercor","supercor"].includes(String(product.storeKey||"").toLowerCase())
  );
  if(legacy.length) {
    throw new Error(check.label+" devolvió fichas de un catálogo comercial no autorizado: "+
      JSON.stringify(legacy.slice(0,3)));
  }
  if(data.catalogMode!=="nutrition-candidates-not-store-inventory") {
    throw new Error(check.label+" no está marcado como búsqueda nutricional sin inventario confirmado: "+
      JSON.stringify({catalogMode:data.catalogMode,sourceStats:data.sourceStats}));
  }
  const notice=(data.sourceStats||[]).find(stat =>
    stat.status==="not-integrated" && Number(stat.products)===0
  );
  if(!notice) {
    throw new Error(check.label+" debe mostrar explícitamente que no hay catálogo de tienda autorizado conectado.");
  }
  const wronglyUnlabeled=data.products.filter(product => {
    const text=normalize(String(product.brand||"")+" "+String(product.name||""));
    const brandMatches=check.aliases.some(alias=>text.includes(normalize(alias)));
    return !brandMatches &&
      (product.retailer_availability!=="unverified" || product.target_retailer!==check.key);
  });
  if(wronglyUnlabeled.length) {
    throw new Error(check.label+" devolvió candidatos nutricionales sin advertencia de disponibilidad: "+
      JSON.stringify(wronglyUnlabeled.slice(0,3)));
  }
  console.log("OK política",check.label,"→ candidatos nutricionales etiquetados; no se presenta como surtido ni stock.");
}

const checks = [
  {
    query: "Yogur Carrefour",
    allow: product => normalize(product.brand + " " + product.name).includes("carrefour")
  },
  {
    query: "Yogur Mercadona",
    allow: product =>
      product.source === "mercadona" ||
      /mercadona|hacendado/.test(normalize(product.brand + " " + product.name))
  }
];

for (const check of checks) {
  const data = await search(check.query);
  const wrong = data.products.filter(product => !check.allow(product));
  if (wrong.length) {
    throw new Error(check.query + " devolvió productos de otra cadena: " +
      wrong.map(p => p.name + " [" + p.brand + "]").join("; "));
  }
  if (data.products.length === 0) {
    throw new Error(check.query + " no devolvió productos; sources=" + data.sources.join(", "));
  }
  console.log("OK", check.query, "→", data.products.length, "productos; fuentes:", data.sources.join(", "));
}
