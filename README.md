# Ración — diario nutricional

Ración es una aplicación web instalable (PWA) para registrar comidas y calcular calorías y macronutrientes usando datos disponibles. **No inventa los valores nutricionales ausentes.**

## Funciones

- Diario por fecha con resumen de calorías y macronutrientes conocidos.
- Entrada de alimentos en español y confirmación del producto antes de añadirlo.
- Búsqueda federada: consulta el catálogo compartido de Supabase, bases de datos externas y varios catálogos de supermercados españoles.
- Búsqueda por código de barras y enriquecimiento nutricional cuando coincide con una ficha fiable.
- Caché local de búsquedas y caché compartida con control de errores por fuente, para acelerar consultas repetidas y evitar insistir contra catálogos que están temporalmente caídos.
- Productos manuales a partir de la etiqueta, exportación del diario y copia de seguridad JSON.
- El diario personal sigue en el navegador. Las búsquedas se envían a los servicios externos; no se sube el historial personal de comidas a Supabase.
- Valor personal configurado: «Salsa de soja habitual», 57 kcal/100 ml, según dato aportado por el usuario.

## Catálogos conectados

### Fuentes nutricionales

- [Open Food Facts](https://world.openfoodfacts.org/) — productos y etiquetas colaborativos; datos separados en la tabla `openfoodfacts_catalog` y etiquetados con licencia ODbL.
- [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) — especialmente útil para alimentos genéricos; las búsquedas pueden devolver productos de EE. UU.

### Adaptadores de catálogo de supermercados

La función de búsqueda contiene adaptadores para **Mercadona, Consum, DIA, ALDI España, Lidl España, Condis, Bonàrea, Plusfresc, Gadis, Eroski, Alcampo, Masymas, Makro España, Ametller Origen y Bonpreu i Esclat**.

La disponibilidad no es uniforme: depende de la tienda, la consulta y las respuestas de sus servicios en ese momento. En la última prueba automática, Mercadona, Consum, DIA, ALDI, Condis, Bonàrea, Plusfresc, Gadis, Masymas y Ametller Origen devolvieron coincidencias para «Yogur». Lidl respondió con HTTP 503 y Eroski con HTTP 403; Alcampo, Makro y Bonpreu no devolvieron coincidencias para esa consulta. Estos estados pueden cambiar. Ración no intenta eludir sistemas anti-bots ni considera una tienda plenamente integrada hasta verificar que devuelve productos reales.

**Carrefour y El Corte Inglés/Hipercor:** en este momento se buscan coincidencias de marca en Open Food Facts cuando existen. No se afirma que exista una integración directa con el catálogo privado de esas cadenas. Los adaptadores directos y los catálogos públicos que sí respondan se pueden ampliar por separado.

### Base compartida en Supabase

Proyecto: `racion-food-catalog`.

- `food_catalog`: catálogo interno por fuente de supermercado, con índices de búsqueda. Las consultas de lectura/escritura pasan por la Edge Function; la tabla no permite lectura pública directa.
- `openfoodfacts_catalog`: separado para preservar la atribución y la licencia ODbL de Open Food Facts.
- `food_search_source_cache`: conserva el resultado y el estado de cada fuente por consulta para acelerar búsquedas repetidas y aplicar backoff cuando falla un servicio.
- La Edge Function `food-search` consulta las fuentes, filtra por tipo de alimento y supermercado, intenta vincular nutrientes por código de barras y guarda los resultados con su procedencia.

No se copian claves de servicio de Supabase al frontend. La aplicación usa únicamente una clave publicable y las escrituras privilegiadas se realizan en servidor.

## Calidad de datos y límites

- La disponibilidad de calorías y macros varía por catálogo. Muchos supermercados publican el nombre del producto, pero no la etiqueta nutricional completa mediante su endpoint de búsqueda.
- Los valores nutricionales que falten se muestran como desconocidos. Cuando un código de barras coincide con una ficha de Open Food Facts, Ración puede completar los nutrientes ausentes y conserva la atribución de la fuente nutricional.
- Los catálogos de tiendas pueden cambiar, requerir una ubicación o dejar de responder. Los endpoints usados son los que las tiendas exponen actualmente a la web y no constituyen un compromiso de disponibilidad.
- La AESAN publica una base de datos de 29.575 alimentos y bebidas comercializados en España durante 2022 ([fuente oficial](https://www.aesan.gob.es/nutricion/composicion-reformulacion-mejora/composicion-alimentos-bebidas)). Todavía no se ha importado de forma masiva: antes hay que confirmar las condiciones de reutilización del archivo y mapear correctamente sus campos.
- No se incluyen catálogos privados completos de tiendas cuando no hay una vía de acceso pública y permitida. Una página web pública no significa que se pueda replicar sin límites toda su base de datos.

## Publicación y pruebas

- Aplicación: https://raycbn.github.io/racion-pwa/
- Repositorio: https://github.com/raycbn/racion-pwa
- GitHub Actions despliega la PWA y ejecuta un smoke test contra la Edge Function: sintaxis, búsqueda federada, relevancia de resultados, coincidencias por tienda, caché y fusión de una ficha de supermercado con nutrientes por código de barras.
- Ejecución reciente de referencia: https://github.com/raycbn/racion-pwa/actions/runs/40726261316

## Fuentes y licencias

- [Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/): datos bajo ODbL/DbCL; las bases derivadas deben respetar los requisitos aplicables de atribución y compartir por igual.
- [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/): los datos son de dominio público (CC0); la API demo tiene límites reducidos.
- Cada adaptador de tienda conserva su origen y enlace cuando están disponibles. La integración y la retención de cada catálogo deben seguir las condiciones aplicables del proveedor.
