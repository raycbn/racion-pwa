# Ración — diario nutricional

Aplicación web instalable (PWA) para registrar comidas y calcular calorías y macronutrientes a partir de datos disponibles, sin inventar los valores que falten.

## Funciones actuales
- Diario por fecha con resumen de calorías y macros conocidos.
- Interpretación básica de texto en español y confirmación antes de guardar.
- Búsqueda de productos y códigos de barras con la API pública de Open Food Facts.
- Registro manual de valores por 100 g o 100 ml a partir de la etiqueta.
- Producto guardado «Salsa de soja habitual»: 57 kcal/100 ml, valor aportado por el usuario.
- Exportación del diario y del catálogo a JSON.
- Datos locales en el navegador; no requiere cuenta, backend ni API de IA de pago.
- Manifiesto PWA e instalación en dispositivos compatibles.

## Publicación
El workflow `.github/workflows/pages.yml` despliega el contenido del repositorio a GitHub Pages en cada push a `main`. En el primer uso, puede ser necesario entrar en **Settings → Pages** y seleccionar **GitHub Actions** como fuente de publicación.

## Precisión y privacidad
Open Food Facts es una base colaborativa: puede haber productos ausentes o incompletos y no cubre necesariamente todos los productos de todos los supermercados de España. Verifica que el resultado coincida con el envase. Los valores no disponibles se muestran como desconocidos. Los registros del diario y los productos personalizados se guardan en el almacenamiento local del navegador; las búsquedas se envían a Open Food Facts. Exporta una copia antes de borrar los datos del navegador o cambiar de dispositivo.

## Fuente de productos
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/
- https://world.openfoodfacts.org/
