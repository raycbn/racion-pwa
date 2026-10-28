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
const notYogurt = broad.products.filter(product =>
  !/^(yogur|yogurt|yoghurt|yoghourt)( |$)/.test(normalize(product.name))
);
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

const enriched = broad.products.filter(product => product.nutrition_source);
console.log("Diagnóstico de nutrientes por código de barras:", enriched.length,
  "productos enlazados a una fuente nutricional.");

const commonFoods = [
  {query:"huevos", pattern:/egg|huevo/i},
  {query:"arroz", pattern:/rice|arroz/i},
  {query:"aceite de oliva", pattern:/olive|oliva|aceite.*oil/i}
];
for (const check of commonFoods) {
  const data = await search(check.query);
  const wrong = data.products.filter(product => !check.pattern.test(product.name));
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
  {query:"Leche Plusfresc", key:"plusfresc", label:"Plusfresc"}
];
for (const check of addedStores) {
  const data = await search(check.query);
  const stat = (data.sourceStats || []).find(item => item.source === check.label);
  if (!stat) {
    throw new Error(check.label + " no aparece en el diagnóstico: " +
      JSON.stringify(data.sourceStats || data.sources));
  }
  const direct = data.products.filter(product => product.source === check.key);
  if (stat.status === "error" || stat.products === 0 || direct.length === 0) {
    throw new Error(check.label + " no devolvió productos del catálogo propio: " +
      JSON.stringify({stat, sourceStats:data.sourceStats, products:data.products.slice(0,3)}));
  }
  console.log("OK cadena nueva", check.label, "→", direct.length,
    "productos propios; fuentes:", JSON.stringify(data.sourceStats));
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
