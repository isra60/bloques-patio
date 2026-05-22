# Bloques Patio

App web para sustituir el Excel de existencias y reservas de bloques por una base de datos sencilla con actualizaciones en tiempo real.

## Que incluye

- Listado por tipo de bloque y variante.
- Conteo de palets en stock, reservados y disponibles.
- Pedidos/reservas por comercial, cliente/obra y palets.
- Alta y borrado de pedidos.
- Edicion rapida de stock por variante.
- Sin usuarios individuales: todos entran con la misma clave y ven/modifican los mismos datos.
- Realtime con Supabase para que los cambios aparezcan en otras pantallas abiertas.

## Arquitectura

- Frontend estatico: `index.html`, `assets/app.js`, `assets/styles.css`.
- Backend: Cloudflare Pages Functions.
- Base de datos: Cloudflare D1.
- Acceso: contrasena compartida en `BLOQUES_PASSWORD`, sin usuarios individuales.
- Publicacion: Cloudflare Pages.

La app refresca los datos automaticamente cada pocos segundos para que los cambios aparezcan en otras pantallas abiertas. Para 5 usuarios, este enfoque es suficiente y evita servicios de pago.

## Puesta en marcha

1. Crea una base D1 en Cloudflare.
2. Ejecuta `database/d1-schema.sql`.
3. Ejecuta `database/d1-seed.sql`.
4. Configura `BLOQUES_PASSWORD` como secreto/variable de Cloudflare Pages.
5. Despliega Cloudflare Pages.

## Publicar en Cloudflare Pages

La opcion recomendada para esta app es Cloudflare Pages, porque permite proteger el acceso con una funcion gratuita antes de servir la web.

1. Conecta Cloudflare Pages al repositorio `isra60/bloques-patio`.
2. Usa raiz `/` como carpeta de salida.
3. Configura la variable secreta `BLOQUES_PASSWORD` con la contrasena compartida.
4. La funcion `functions/_middleware.js` pedira esa contrasena antes de cargar la app.
