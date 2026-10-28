# Ración — diario nutricional

Aplicación web instalable (PWA) para registrar comidas y calcular calorías y macronutrientes a partir de datos disponibles, sin inventar los valores que falten.

## Funciones actuales
- Diario por fecha con resumen de calorías y macros conocidos.
- Interpretación básica de texto en español y confirmación antes de guardar.
- Búsqueda paralela en Open Food Facts y USDA FoodData Central, con traducciones de alimentos genéricos frecuentes del español al inglés.
- Búsqueda de producto por código de barras mediante Open Food Facts, con fallback a USDA cuando el código está disponible allí.
- Caché de resultados por siete días y catálogo de los productos consultados guardado localmente para acelerar siguientes búsquedas.
- Registro manual de valores por 100 g o 100 ml a partir de la etiqueta.
- Producto guardado «Salsa de soja habitual»: 57 kcal/100 ml, valor aportado por el usuario.
- Exportación del diario y del catálogo a JSON.
- Datos del diario y catálogo personal en el navegador; no requiere cuenta ni API de IA de pago.
- Manifiesto PWA e instalación en dispositivos compatibles.

## Publicación
El workflow `.github/workflows/pages.yml` valida la sintaxis de JavaScript y despliega el contenido del repositorio a GitHub Pages en cada push a `main`. En el primer uso, puede ser necesario entrar en **Settings → Pages** y seleccionar **GitHub Actions** como fuente de publicación.

## Precisión y privacidad
Open Food Facts es una base colaborativa: puede haber productos ausentes o incompletos y no cubre necesariamente todos los productos de todos los supermercados de España. USDA FoodData Central ofrece otro catálogo, especialmente útil para alimentos genéricos y algunos productos de marca, pero puede devolver productos de EE. UU. Comprueba que el resultado coincida con el envase. Los valores no disponibles se muestran como desconocidos. El diario y los productos personalizados se guardan en el almacenamiento local del navegador; las búsquedas se envían a los catálogos externos. Actualmente no hay una base compartida de Supabase: esa integración queda pendiente de seleccionar la cuenta de Supabase adecuada.

## Fuentes y licencias
- [Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/): datos bajo ODbL/DbCL; las bases derivadas deben cumplir los requisitos de atribución y compartir por igual aplicables.
- [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/): datos de dominio público bajo CC0; la API requiere clave y la clave de demostración tiene límites reducidos.
- [Open Food Facts](https://world.openfoodfacts.org/)
