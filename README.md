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

La disponibilidad no es uniforme: depende de la tienda, la consulta y las respuestas de sus servicios en ese momento. En la última prueba automática, las búsquedas específicas devolvieron productos propios de Mercadona, Consum, DIA, ALDI, Condis, Bonàrea, Plusfresc, Gadis, Alcampo, Masymas, Makro España, Ametller Origen y Bonpreu i Esclat. Lidl respondió con HTTP 503 y Eroski con HTTP 403 desde el entorno de Supabase; se indican como fuentes temporalmente no disponibles y no se intentan eludir sus protecciones. Los estados pueden cambiar y una respuesta vacía no se considera una integración verificada.

**Carrefour y El Corte Inglés/Hipercor:** en este momento se buscan coincidencias de marca en Open Food Facts cuando existen. No se afirma que exista una integración directa con el catálogo privado de esas cadenas. Los adaptadores directos y los catálogos públicos que sí respondan se pueden ampliar por separado.

### Base compartida en Supabase

Proyecto: `racion-food-catalog`.

- `food_catalog`: catálogo interno de productos por cadena, con índices de búsqueda y lectura directa cerrada al público. Se amplía al buscar y al precargar términos frecuentes.
- `openfoodfacts_catalog`: tabla separada para respetar la atribución y las obligaciones de la licencia ODbL.
- `aesan_catalog`: 29.113 registros del fichero AESAN 2022, con EAN, marca, ingredientes, kcal y macros cuando existen. Se conserva el año y la fuente para distinguirlos de los catálogos actuales.
- `food_search_source_cache`: estado y duración de la caché por fuente y consulta; también aplica un backoff global para endpoints que fallan repetidamente.
- Las búsquedas al catálogo compartido usan sinónimos ES/EN/CAT en una sola consulta por base de datos (por ejemplo, `manzana`/`apple`/`poma` e `yogur`/`iogurt`) para recuperar productos que ya están guardados con nombres locales.
- La Edge Function `food-search` consulta las fuentes, filtra por tipo de alimento y supermercado, intenta vincular nutrientes por código de barras y guarda los resultados con su procedencia.

No se copian claves de servicio de Supabase al frontend. La aplicación usa únicamente una clave publicable y las escrituras privilegiadas se realizan en servidor.


## El Corte Inglés, Hipercor y Supercor

Ración contiene una **muestra curada de 18 fichas de producto** de El Corte Inglés e Hipercor consultadas el 28 de octubre de 2026. Los registros incluyen identificador de la ficha oficial, enlace de origen, EAN, nutrientes, tamaño de envase y precio observado cuando esos campos están disponibles. La muestra cubre yogures de marca propia, leches, arroz y aceite; no equivale al catálogo completo.

**Límite verificado:** las fichas y categorías públicas se pueden consultar con un navegador, pero desde la Edge Function de Supabase las páginas de El Corte Inglés e Hipercor respondieron HTTP 403, incluidas las fichas individuales. No se elude ese bloqueo ni se llama a su API interna. Por eso esta muestra **no es el catálogo completo ni se actualiza sola desde la web del grupo**. Para una importación completa y recurrente necesitamos un feed oficial, una API documentada o permiso de acceso.

Los precios se guardan como **precio web observado el 28/10/2026**, no como precio garantizado en toda España: pueden variar por código postal, entrega, tienda y promoción. Las tarjetas muestran la fecha de observación y enlazan la ficha oficial de ECI/Hipercor.

**Supercor:** no hemos encontrado un catálogo SKU público accesible de forma permitida. Si una búsqueda «Yogur Supercor» muestra alternativas de ECI, se etiquetan como productos de El Corte Inglés y se advierte que no confirman el stock en Supercor. El enlace oficial de Supercor lleva a sus catálogos de ofertas, no a un inventario SKU.

**AESAN 2022:** la tabla histórica contiene 29.113 fichas válidas de los productos comercializados en España en 2022, con 27.593 que incluyen calorías y 29.113 con EAN. Es una fuente de respaldo nutricional por código de barras, no una relación actual de productos disponibles en 2026.

## Calidad de datos y límites

- La disponibilidad de calorías y macros varía por catálogo. Muchos supermercados publican el nombre del producto, pero no la etiqueta nutricional completa mediante su endpoint de búsqueda.
- Los valores nutricionales que falten se muestran como desconocidos. Cuando un código de barras coincide con una ficha de Open Food Facts, Ración puede completar los nutrientes ausentes. Si Open Food Facts no ofrece datos útiles y el EAN aparece en AESAN, utiliza AESAN 2022 como respaldo histórico; la interfaz conserva el supermercado como origen del producto y la fuente nutricional por separado.
- Los catálogos de tiendas pueden cambiar, requerir una ubicación o dejar de responder. Los endpoints usados son los que las tiendas exponen actualmente a la web y no constituyen un compromiso de disponibilidad.
- **AESAN 2022** ([fuente oficial](https://www.aesan.gob.es/nutricion/composicion-reformulacion-mejora/composicion-alimentos-bebidas)): importadas **29.113 fichas** con EAN y nutrientes cuando están disponibles, en la tabla independiente `aesan_catalog`. De ellas, 27.593 incluyen kcal y 29.108 ingredientes. 462 filas del Excel no produjeron un nombre comercial válido y se dejaron fuera hasta validar su estructura. La fuente es una fotografía de mercado de 2022, no el surtido actual de una tienda.
- No se incluyen catálogos privados completos de tiendas cuando no hay una vía de acceso pública y permitida. Una página web pública no significa que se pueda replicar sin límites toda su base de datos.

## Publicación y pruebas

- Aplicación: https://raycbn.github.io/racion-pwa/
- Repositorio: https://github.com/raycbn/racion-pwa
- GitHub Actions despliega la PWA y ejecuta un smoke test contra la Edge Function: sintaxis, búsqueda federada, relevancia de resultados, coincidencias por tienda, caché y fusión de una ficha de supermercado con nutrientes por código de barras.
- Última prueba automatizada correcta: https://github.com/raycbn/racion-pwa/actions/runs/40737489089
- Último despliegue de Pages correcto: https://github.com/raycbn/racion-pwa/actions/runs/40737489239

## Fuentes y licencias

- [Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/): datos bajo ODbL/DbCL; las bases derivadas deben respetar los requisitos aplicables de atribución y compartir por igual.
- [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/): los datos son de dominio público (CC0); la API demo tiene límites reducidos.
- Cada adaptador de tienda conserva su origen y enlace cuando están disponibles. La integración y la retención de cada catálogo deben seguir las condiciones aplicables del proveedor.
