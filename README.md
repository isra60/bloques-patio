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
- Base de datos: Supabase Postgres + Realtime.
- Acceso: un usuario tecnico compartido en Supabase Auth. La app solo pide contrasena.
- Publicacion: GitHub Pages puede servir la web.

GitHub Pages no soporta contrasena real de servidor. En esta app el repositorio/pagina puede ser publico, pero los datos quedan protegidos por Supabase Auth y RLS. Si necesitas ocultar tambien el HTML, publica el mismo frontend en Cloudflare Pages, Netlify o Vercel con Basic Auth/Access.

## Puesta en marcha

1. Crea un proyecto en Supabase.
2. En SQL Editor, ejecuta `database/schema.sql`.
3. En Authentication > Users, crea un usuario compartido, por ejemplo `bloques@empresa.local`, con la contrasena que usara todo el equipo.
4. Copia `config.example.js` como `config.js`.
5. Rellena `config.js` con `supabaseUrl`, `supabaseAnonKey` y `sharedEmail`.
6. Abre la web, entra con la contrasena compartida y pulsa `Importar Excel inicial` si la base de datos esta vacia.

## Publicar en GitHub Pages

En GitHub:

1. Crea el repositorio `bloques-patio` en el usuario `isra60`.
2. Sube estos archivos.
3. En Settings > Pages, selecciona Deploy from branch, rama `main`, carpeta `/`.
4. La web quedara en `https://isra60.github.io/bloques-patio/`.

No subas credenciales privadas. El `anon key` de Supabase esta pensado para frontend; la seguridad la ponen RLS y el login compartido.

