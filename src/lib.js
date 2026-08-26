// ---------- Almacenamiento ----------
const LS_RFCS = 'facturapp.rfcs'
const LS_HIST = 'facturapp.historial'

export const cargar = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def }
}
export const guardar = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
}
export const KEYS = { RFCS: LS_RFCS, HIST: LS_HIST }

// ---------- IndexedDB (PDFs de constancias) ----------
const DB = 'facturapp', STORE = 'constancias'
function abrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function guardarPDF(id, dataUrl) {
  const d = await abrir()
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put(dataUrl, id)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
export async function leerPDF(id) {
  const d = await abrir()
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readonly')
    const q = t.objectStore(STORE).get(id)
    q.onsuccess = () => res(q.result || null)
    q.onerror = () => rej(q.error)
  })
}

// ---------- Imagen: comprimir antes de enviar ----------
export function comprimirImagen(file, maxLado = 1568) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width: w, height: h } = img
        const escala = Math.min(1, maxLado / Math.max(w, h))
        w = Math.round(w * escala); h = Math.round(h * escala)
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        res(c.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => rej(new Error('No se pudo abrir esa imagen. Si viene de un iPhone en formato HEIC, ábrela primero en Fotos y compártela como JPG.'))
      img.src = fr.result
    }
    fr.onerror = () => rej(new Error('No se pudo leer el archivo'))
    fr.readAsDataURL(file)
  })
}

export function archivoADataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = () => rej(new Error('No se pudo leer el archivo'))
    fr.readAsDataURL(file)
  })
}

// ---------- Llamada al proxy ----------
export async function pedirAClaude({ content, system, max_tokens }) {
  const r = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, system, max_tokens }),
  })
  let data
  try { data = await r.json() } catch { throw new Error('El servidor no respondió correctamente.') }
  if (!r.ok) throw new Error(data?.error || 'Error al contactar a Claude')
  return data.text
}

export function extraerJSON(texto) {
  if (!texto) throw new Error('Respuesta vacía')
  const limpio = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  const i = limpio.indexOf('{'), f = limpio.lastIndexOf('}')
  if (i === -1 || f === -1) throw new Error('No se pudo interpretar la respuesta')
  return JSON.parse(limpio.slice(i, f + 1))
}

// ---------- Catálogos SAT ----------
export const REGIMENES = [
  ['601', 'General de Ley Personas Morales'],
  ['603', 'Personas Morales con Fines no Lucrativos'],
  ['605', 'Sueldos y Salarios e Ingresos Asimilados'],
  ['606', 'Arrendamiento'],
  ['607', 'Enajenación o Adquisición de Bienes'],
  ['608', 'Demás ingresos'],
  ['610', 'Residentes en el Extranjero sin EP en México'],
  ['611', 'Ingresos por Dividendos'],
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'],
  ['614', 'Ingresos por intereses'],
  ['615', 'Ingresos por obtención de premios'],
  ['616', 'Sin obligaciones fiscales'],
  ['620', 'Sociedades Cooperativas de Producción'],
  ['621', 'Incorporación Fiscal'],
  ['622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras'],
  ['623', 'Opcional para Grupos de Sociedades'],
  ['624', 'Coordinados'],
  ['625', 'Actividades Empresariales vía Plataformas Tecnológicas'],
  ['626', 'Régimen Simplificado de Confianza (RESICO)'],
]

export const USOS_CFDI = [
  ['G01', 'Adquisición de mercancías'],
  ['G02', 'Devoluciones, descuentos o bonificaciones'],
  ['G03', 'Gastos en general'],
  ['I01', 'Construcciones'],
  ['I02', 'Mobiliario y equipo de oficina'],
  ['I03', 'Equipo de transporte'],
  ['I04', 'Equipo de cómputo'],
  ['I08', 'Otra maquinaria y equipo'],
  ['D01', 'Honorarios médicos y gastos hospitalarios'],
  ['D10', 'Pagos por servicios educativos (colegiaturas)'],
  ['S01', 'Sin efectos fiscales'],
]

export const moneda = (n) => {
  const v = Number(String(n ?? '').replace(/[^0-9.-]/g, ''))
  if (!isFinite(v) || v === 0) return ''
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export const idNuevo = () => 'id' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
