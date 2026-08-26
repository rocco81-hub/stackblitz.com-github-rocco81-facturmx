# Facturapp

App para facturar tickets de compra en México. Tomas la foto del ticket, Claude
lee los datos, eliges a cuál de tus RFCs quieres la factura y la app arma el
correo listo para el comercio.

## Cómo funciona

- **Escanear** — foto del ticket (cámara o galería). Claude extrae comercio,
  fecha, folio, subtotal, IVA, total, forma de pago y, si el ticket lo trae,
  el portal de autofacturación o el correo de facturación.
- **Mis RFCs** — subes tu Constancia de Situación Fiscal en PDF una sola vez y
  Claude llena RFC, nombre, código postal y régimen. Se guarda en el dispositivo.
- **Historial** — cada ticket que mandas a facturar queda registrado para que
  marques cuáles ya te llegaron.

## Seguridad de la API key

La llave de Anthropic vive **solo** en el servidor, como variable de entorno
(`ANTHROPIC_API_KEY`), y se usa dentro de `api/claude.js`. El navegador nunca
la ve. Nunca pongas la llave en un archivo `.env` con prefijo `VITE_`: eso la
mete dentro del código que se descarga al navegador y queda pública.

## Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com → **Add New → Project** → importa el repositorio.
3. En **Environment Variables** agrega:
   - `ANTHROPIC_API_KEY` = tu llave de console.anthropic.com
   - (opcional) `CLAUDE_MODEL` = `claude-sonnet-5`
4. **Deploy**. Vercel detecta Vite solo y publica también la función `api/claude`.

## Correr localmente

```
npm install
npm i -g vercel
vercel dev
```

`vercel dev` levanta el front y la función `api/` juntos. Con `npm run dev`
solo (Vite) la ruta `/api/claude` no existe y la lectura de tickets falla.

## Dónde se guardan los datos

Todo vive en el navegador del dispositivo: los RFCs y el historial en
`localStorage`, los PDF de las constancias en `IndexedDB`. No hay base de
datos ni servidor que guarde nada. Si cambias de teléfono o borras los datos
del sitio, se pierden — vuelve a subir la constancia y listo.
