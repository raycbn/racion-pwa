const endpoint = "https://xegxzmicbxbqjelkvhlx.supabase.co/functions/v1/food-search";
const publishableKey = "sb_publishable_4rSZWrVGGkZ1yfmiTGTChA_lPkLqahd";

const terms = [
  "leche",
  "yogur",
  "leche sin lactosa", "huevos", "arroz", "pasta", "pollo",
  "pan", "aceite de oliva", "queso", "tomate", "manzana",
  "Yogur Hacendado", "Leche Hacendado", "Yogur Carrefour",
  "Yogur Condis", "Leche Bonarea", "Yogur Plusfresc",
  "Yogur Ametller", "Yogur Bonpreu", "Yogur Makro",
  "Yogur Masymas", "Leche Gadis",
  "Yogur El Corte Inglés", "Leche El Corte Inglés",
  "Queso El Corte Inglés", "Huevos El Corte Inglés",
  "Yogur Hipercor", "Leche Hipercor",
  "Yogur Supercor", "Leche Supercor"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(query + ": HTTP " + response.status + " " + JSON.stringify(payload));
  }
  if (!payload || !Array.isArray(payload.products) || !Array.isArray(payload.sourceStats)) {
    throw new Error(query + ": unexpected search response");
  }
  return payload;
}

let errors = 0;
for (let i = 0; i < terms.length; i++) {
  const query = terms[i];
  try {
    const data = await search(query);
    const stats = data.sourceStats.map(item => ({
      source: item.source,
      status: item.status,
      products: item.products,
      error: item.error || undefined
    }));
    const found = stats.filter(item => String(item.status || "").endsWith("ok") && item.products > 0).length;
    console.log(JSON.stringify({
      query,
      visibleProducts: data.products.length,
      sourcesWithMatches: found,
      sourceStats: stats
    }));
    if (found === 0) errors++;
  } catch (error) {
    errors++;
    console.error(JSON.stringify({ query, error: String(error) }));
  }
  if (i < terms.length - 1) await sleep(7200);
}
if (errors === terms.length) {
  throw new Error("All catalog warm-up queries failed or returned no usable source matches.");
}
console.log("Catalog warm-up finished; inspect per-source diagnostics above.");
