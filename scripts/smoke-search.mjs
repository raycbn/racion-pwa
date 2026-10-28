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
