import { useState, useRef, useEffect } from 'react'
import {
  cargar, guardar, KEYS, guardarPDF, leerPDF,
  comprimirImagen, archivoADataUrl, pedirAClaude, extraerJSON,
  REGIMENES, USOS_CFDI, moneda, idNuevo,
} from './lib'

const SYS_TICKET = `Eres un asistente que lee tickets de compra mexicanos. Devuelve SOLO un objeto JSON, sin texto adicional y sin bloques de código.

Estructura exacta:
{
  "comercio": "",
  "sucursal": "",
  "rfcEmisor": "",
  "fecha": "",
  "hora": "",
  "folio": "",
  "subtotal": "",
  "iva": "",
  "total": "",
  "formaPago": "",
  "ultimos4": "",
  "portalFacturacion": "",
  "correoFacturacion": "",
  "conceptos": [{"descripcion": "", "cantidad": "", "importe": ""}],
  "confianza": "alta|media|baja",
  "notas": ""
}

Reglas:
- "fecha" en formato AAAA-MM-DD. Si el ticket usa DD/MM/AAAA, conviértelo.
- Montos como número plano con punto decimal, sin símbolo de moneda ni comas. Ejemplo: "1234.50".
- "folio" es el número de ticket, transacción, nota o remisión que pide el comercio para facturar.
- "portalFacturacion": si el ticket imprime una página web de autofacturación, ponla completa.
- "correoFacturacion": solo si el ticket imprime un correo para solicitar facturas.
- "formaPago": efectivo, tarjeta de débito, tarjeta de crédito, transferencia, etc.
- "ultimos4": los últimos 4 dígitos de la tarjeta si aparecen.
- Si un dato no aparece en el ticket, deja la cadena vacía "". NUNCA inventes datos.
- "notas": si la foto está borrosa, cortada o falta un dato clave para facturar, dilo en una frase corta en español.`

const SYS_CONSTANCIA = `Lees Constancias de Situación Fiscal del SAT (México). Devuelve SOLO un objeto JSON, sin texto adicional y sin bloques de código.

{
  "rfc": "",
  "razonSocial": "",
  "cp": "",
  "regimenCodigo": "",
  "regimenNombre": "",
  "tipoPersona": "fisica|moral",
  "notas": ""
}

Reglas:
- "razonSocial": para persona física es el nombre completo tal como aparece (nombre y apellidos). Para persona moral la denominación social sin el régimen societario duplicado.
- "cp": el Código Postal del domicilio fiscal (5 dígitos).
- "regimenCodigo": la clave numérica de 3 dígitos del régimen vigente (ej. 612, 626, 601). Si hay varios regímenes vigentes, elige el principal de actividad y menciona los otros en "notas".
- Si un dato no aparece, deja "". NUNCA inventes.`

export default function App() {
  const [vista, setVista] = useState('inicio')
  const [rfcs, setRfcs] = useState(() => cargar(KEYS.RFCS, []))
  const [historial, setHistorial] = useState(() => cargar(KEYS.HIST, []))

  useEffect(() => guardar(KEYS.RFCS, rfcs), [rfcs])
  useEffect(() => guardar(KEYS.HIST, historial), [historial])

  return (
    <div className="app">
      <header className="top">
        <div className="marca">
          <span className="logo">🧾</span>
          <div>
            <h1>Facturapp</h1>
            <p>Factura tus tickets en México</p>
          </div>
        </div>
      </header>

      <main>
        {vista === 'inicio' && (
          <Escanear rfcs={rfcs} irARfcs={() => setVista('rfcs')} onFacturado={(e) => setHistorial((h) => [e, ...h])} />
        )}
        {vista === 'rfcs' && <MisRfcs rfcs={rfcs} setRfcs={setRfcs} />}
        {vista === 'historial' && <Historial historial={historial} setHistorial={setHistorial} />}
      </main>

      <nav className="tabs">
        <button className={vista === 'inicio' ? 'on' : ''} onClick={() => setVista('inicio')}>
          <span>📷</span>Escanear
        </button>
        <button className={vista === 'rfcs' ? 'on' : ''} onClick={() => setVista('rfcs')}>
          <span>🪪</span>Mis RFCs{rfcs.length > 0 && <em>{rfcs.length}</em>}
        </button>
        <button className={vista === 'historial' ? 'on' : ''} onClick={() => setVista('historial')}>
          <span>🗂️</span>Historial{historial.length > 0 && <em>{historial.length}</em>}
        </button>
      </nav>
    </div>
  )
}

/* ============================ ESCANEAR ============================ */

function Escanear({ rfcs, irARfcs, onFacturado }) {
  const [imagen, setImagen] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState(null)
  const camara = useRef(null)
  const galeria = useRef(null)

  async function elegir(file) {
    if (!file) return
    setError(''); setTicket(null)
    try {
      setImagen(await comprimirImagen(file))
    } catch (e) {
      setError(e.message)
    }
  }

  async function leer() {
    setLeyendo(true); setError('')
    try {
      const base64 = imagen.split(',')[1]
      const texto = await pedirAClaude({
        system: SYS_TICKET,
        max_tokens: 2000,
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Lee este ticket de compra y extrae los datos para facturarlo.' },
        ],
      })
      setTicket(extraerJSON(texto))
    } catch (e) {
      setError(e.message || 'No se pudo leer el ticket')
    } finally {
      setLeyendo(false)
    }
  }

  function reiniciar() {
    setImagen(null); setTicket(null); setError('')
  }

  if (ticket) {
    return (
      <Resultado
        ticket={ticket} setTicket={setTicket} imagen={imagen}
        rfcs={rfcs} irARfcs={irARfcs} onFacturado={onFacturado} onNuevo={reiniciar}
      />
    )
  }

  return (
    <div className="pantalla">
      {!imagen && (
        <>
          <div className="hero">
            <div className="heroIcono">🧾</div>
            <h2>Toma una foto de tu ticket</h2>
            <p>Claude lee el comercio, la fecha, el folio y el total, y prepara la solicitud de factura.</p>
          </div>

          <div className="botonesFoto">
            <button className="grande primario" onClick={() => camara.current.click()}>
              <span>📷</span>
              <b>Tomar foto</b>
              <small>Abre la cámara</small>
            </button>
            <button className="grande secundario" onClick={() => galeria.current.click()}>
              <span>🖼️</span>
              <b>Cargar foto</b>
              <small>Abre tus fotos</small>
            </button>
          </div>

          <input ref={camara} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => elegir(e.target.files[0])} />
          <input ref={galeria} type="file" accept="image/*" hidden
            onChange={(e) => elegir(e.target.files[0])} />

          {rfcs.length === 0 && (
            <div className="aviso">
              Aún no tienes RFCs guardados.{' '}
              <button className="enlace" onClick={irARfcs}>Agrega el primero</button> para poder facturar.
            </div>
          )}
        </>
      )}

      {imagen && (
        <>
          <div className="preview">
            <img src={imagen} alt="Ticket" />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="acciones">
            <button className="btn primario ancho" onClick={leer} disabled={leyendo}>
              {leyendo ? 'Leyendo el ticket…' : '✨ Leer ticket'}
            </button>
            <button className="btn plano ancho" onClick={reiniciar} disabled={leyendo}>
              Elegir otra foto
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ============================ RESULTADO ============================ */

function Resultado({ ticket, setTicket, imagen, rfcs, irARfcs, onFacturado, onNuevo }) {
  const [rfcId, setRfcId] = useState(rfcs[0]?.id || '')
  const [uso, setUso] = useState('G03')
  const [correoDestino, setCorreoDestino] = useState(ticket.correoFacturacion || '')
  const [copiado, setCopiado] = useState('')

  const set = (k) => (e) => setTicket({ ...ticket, [k]: e.target.value })
  const rfc = rfcs.find((r) => r.id === rfcId)
  const faltaFolio = !ticket.folio
  const faltaTotal = !ticket.total

  const asunto = `Solicitud de factura — Ticket ${ticket.folio || '(sin folio)'} — ${ticket.fecha || ''} — ${moneda(ticket.total) || ''}`

  const cuerpo = [
    'Buen día,',
    '',
    'Solicito la factura del siguiente ticket de compra:',
    '',
    `• Comercio: ${ticket.comercio || '—'}`,
    ticket.sucursal ? `• Sucursal: ${ticket.sucursal}` : null,
    `• Fecha: ${ticket.fecha || '—'}${ticket.hora ? ` ${ticket.hora}` : ''}`,
    `• Folio / No. de ticket: ${ticket.folio || '—'}`,
    ticket.subtotal ? `• Subtotal: ${moneda(ticket.subtotal)}` : null,
    ticket.iva ? `• IVA: ${moneda(ticket.iva)}` : null,
    `• Total: ${moneda(ticket.total) || '—'}`,
    ticket.formaPago ? `• Forma de pago: ${ticket.formaPago}${ticket.ultimos4 ? ` (terminación ${ticket.ultimos4})` : ''}` : null,
    '',
    'Datos fiscales para la factura:',
    '',
    `• RFC: ${rfc?.rfc || '—'}`,
    `• Nombre / Razón social: ${rfc?.razonSocial || '—'}`,
    `• Código postal fiscal: ${rfc?.cp || '—'}`,
    `• Régimen fiscal: ${rfc?.regimenCodigo || '—'}${rfc?.regimenNombre ? ` — ${rfc.regimenNombre}` : ''}`,
    `• Uso del CFDI: ${uso} — ${(USOS_CFDI.find((u) => u[0] === uso) || [])[1] || ''}`,
    '',
    rfc?.tieneConstancia
      ? 'Adjunto mi Constancia de Situación Fiscal y la foto del ticket.'
      : 'Adjunto la foto del ticket.',
    '',
    'Agradezco me envíen el XML y el PDF de la factura a este mismo correo.',
    '',
    'Saludos.',
  ].filter(Boolean).join('\n')

  const soloDatos = [
    `RFC: ${rfc?.rfc || ''}`,
    `Nombre / Razón social: ${rfc?.razonSocial || ''}`,
    `CP: ${rfc?.cp || ''}`,
    `Régimen: ${rfc?.regimenCodigo || ''} ${rfc?.regimenNombre || ''}`,
    `Uso CFDI: ${uso}`,
  ].join('\n')

  async function copiar(texto, etiqueta) {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = texto; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); ta.remove()
    }
    setCopiado(etiqueta)
    setTimeout(() => setCopiado(''), 2000)
  }

  function registrar() {
    onFacturado({
      id: idNuevo(),
      creado: new Date().toISOString(),
      comercio: ticket.comercio, fecha: ticket.fecha, folio: ticket.folio,
      total: ticket.total, rfc: rfc?.rfc || '', razonSocial: rfc?.razonSocial || '',
      uso, destino: correoDestino || ticket.portalFacturacion || '',
      estado: 'solicitada',
    })
  }

  function abrirCorreo() {
    registrar()
    const url = `mailto:${encodeURIComponent(correoDestino)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    window.location.href = url
  }

  function descargarTicket() {
    const a = document.createElement('a')
    a.href = imagen
    a.download = `ticket-${ticket.folio || ticket.fecha || 'compra'}.jpg`
    a.click()
  }

  async function descargarConstancia() {
    const d = await leerPDF(rfc.id)
    if (!d) return alert('No hay constancia guardada para este RFC.')
    const a = document.createElement('a')
    a.href = d
    a.download = rfc.constanciaNombre || `constancia-${rfc.rfc}.pdf`
    a.click()
  }

  return (
    <div className="pantalla">
      <div className="encabezadoResultado">
        <h2>Datos del ticket</h2>
        <button className="enlace" onClick={onNuevo}>Otro ticket</button>
      </div>

      {ticket.confianza === 'baja' && (
        <div className="aviso warn">La foto quedó difícil de leer. Revisa bien los datos antes de enviar.</div>
      )}
      {ticket.notas && <div className="aviso">{ticket.notas}</div>}
      {(faltaFolio || faltaTotal) && (
        <div className="aviso warn">
          Falta {faltaFolio ? 'el folio' : ''}{faltaFolio && faltaTotal ? ' y ' : ''}{faltaTotal ? 'el total' : ''}.
          Complétalo abajo — casi todos los comercios lo piden.
        </div>
      )}

      <div className="tarjeta">
        <div className="campos">
          <Campo l="Comercio" v={ticket.comercio} on={set('comercio')} />
          <Campo l="Sucursal" v={ticket.sucursal} on={set('sucursal')} />
          <div className="fila">
            <Campo l="Fecha" v={ticket.fecha} on={set('fecha')} ph="AAAA-MM-DD" />
            <Campo l="Hora" v={ticket.hora} on={set('hora')} />
          </div>
          <Campo l="Folio / No. de ticket" v={ticket.folio} on={set('folio')} destacado={faltaFolio} />
          <div className="fila">
            <Campo l="Subtotal" v={ticket.subtotal} on={set('subtotal')} />
            <Campo l="IVA" v={ticket.iva} on={set('iva')} />
          </div>
          <Campo l="Total" v={ticket.total} on={set('total')} destacado={faltaTotal} />
          <div className="fila">
            <Campo l="Forma de pago" v={ticket.formaPago} on={set('formaPago')} />
            <Campo l="Term. tarjeta" v={ticket.ultimos4} on={set('ultimos4')} />
          </div>
          <Campo l="RFC del comercio" v={ticket.rfcEmisor} on={set('rfcEmisor')} />
        </div>
      </div>

      {ticket.portalFacturacion && (
        <a className="btn portal ancho" href={ticket.portalFacturacion.startsWith('http') ? ticket.portalFacturacion : 'https://' + ticket.portalFacturacion}
           target="_blank" rel="noreferrer" onClick={registrar}>
          🌐 Abrir el portal de autofacturación
        </a>
      )}

      <h3 className="seccion">Facturar a</h3>

      {rfcs.length === 0 ? (
        <div className="aviso">
          No tienes RFCs guardados. <button className="enlace" onClick={irARfcs}>Agregar uno</button>
        </div>
      ) : (
        <div className="tarjeta">
          <label className="etq">RFC</label>
          <select className="input" value={rfcId} onChange={(e) => setRfcId(e.target.value)}>
            {rfcs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfc} — {r.razonSocial}{r.tieneConstancia ? ' ✓' : ''}
              </option>
            ))}
          </select>

          <label className="etq">Uso del CFDI</label>
          <select className="input" value={uso} onChange={(e) => setUso(e.target.value)}>
            {USOS_CFDI.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
          </select>

          <label className="etq">Correo del comercio para facturación</label>
          <input className="input" type="email" inputMode="email" placeholder="facturacion@comercio.com"
            value={correoDestino} onChange={(e) => setCorreoDestino(e.target.value)} />
          {ticket.correoFacturacion && <p className="pista">Tomado del ticket.</p>}
        </div>
      )}

      <h3 className="seccion">Correo listo para enviar</h3>
      <div className="tarjeta correo">
        <div className="asunto"><b>Asunto:</b> {asunto}</div>
        <pre>{cuerpo}</pre>
      </div>

      <div className="acciones">
        <button className="btn primario ancho" onClick={abrirCorreo} disabled={!correoDestino || !rfc}>
          ✉️ Abrir correo listo para enviar
        </button>
        <button className="btn ancho" onClick={() => copiar(cuerpo, 'correo')}>
          {copiado === 'correo' ? '✓ Copiado' : '📋 Copiar el correo'}
        </button>
        <button className="btn ancho" onClick={() => copiar(soloDatos, 'datos')} disabled={!rfc}>
          {copiado === 'datos' ? '✓ Copiado' : '🪪 Copiar solo los datos fiscales'}
        </button>
        <div className="fila">
          <button className="btn plano" onClick={descargarTicket}>⬇️ Foto del ticket</button>
          <button className="btn plano" onClick={descargarConstancia} disabled={!rfc?.tieneConstancia}>
            ⬇️ Constancia
          </button>
        </div>
        <p className="pista center">
          El correo se abre en tu app de correo con todo escrito. Adjunta ahí la foto del ticket y la constancia, y tú le das enviar.
        </p>
      </div>
    </div>
  )
}

function Campo({ l, v, on, ph, destacado }) {
  return (
    <div className="campo">
      <label className="etq">{l}</label>
      <input className={'input' + (destacado ? ' falta' : '')} value={v || ''} onChange={on} placeholder={ph || ''} />
    </div>
  )
}

/* ============================ MIS RFCs ============================ */

function MisRfcs({ rfcs, setRfcs }) {
  const [editando, setEditando] = useState(null)

  function guardarRfc(r) {
    setRfcs((prev) => {
      const i = prev.findIndex((x) => x.id === r.id)
      if (i === -1) return [...prev, r]
      const copia = [...prev]; copia[i] = r; return copia
    })
    setEditando(null)
  }

  function eliminar(id) {
    if (!confirm('¿Eliminar este RFC?')) return
    setRfcs((prev) => prev.filter((r) => r.id !== id))
  }

  if (editando) {
    return <FormRfc inicial={editando} onGuardar={guardarRfc} onCancelar={() => setEditando(null)} />
  }

  return (
    <div className="pantalla">
      <div className="encabezadoResultado">
        <h2>Mis RFCs</h2>
        <button className="btn chico primario" onClick={() => setEditando({ id: idNuevo(), nuevo: true })}>+ Agregar</button>
      </div>

      {rfcs.length === 0 && (
        <div className="hero">
          <div className="heroIcono">🪪</div>
          <h2>Guarda tus datos fiscales</h2>
          <p>Sube tu Constancia de Situación Fiscal en PDF y Claude llena todo solo. Se guarda una vez y ya.</p>
        </div>
      )}

      {rfcs.map((r) => (
        <div className="tarjeta rfcCard" key={r.id}>
          <div className="rfcTop">
            <div>
              <div className="rfcNum">{r.rfc}</div>
              <div className="rfcNombre">{r.razonSocial}</div>
            </div>
            {r.tieneConstancia
              ? <span className="badge ok">Con constancia</span>
              : <span className="badge">Sin constancia</span>}
          </div>
          <div className="rfcDatos">
            <span>CP {r.cp || '—'}</span>
            <span>Régimen {r.regimenCodigo || '—'}</span>
          </div>
          {r.regimenNombre && <div className="pista">{r.regimenNombre}</div>}
          <div className="fila">
            <button className="btn plano" onClick={() => setEditando(r)}>✏️ Editar</button>
            <button className="btn plano peligro" onClick={() => eliminar(r.id)}>🗑️ Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function FormRfc({ inicial, onGuardar, onCancelar }) {
  const [d, setD] = useState({
    id: inicial.id,
    rfc: inicial.rfc || '', razonSocial: inicial.razonSocial || '',
    cp: inicial.cp || '', regimenCodigo: inicial.regimenCodigo || '',
    regimenNombre: inicial.regimenNombre || '',
    tieneConstancia: inicial.tieneConstancia || false,
    constanciaNombre: inicial.constanciaNombre || '',
  })
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const pdfRef = useRef(null)

  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })

  async function subirConstancia(file) {
    if (!file) return
    setError(''); setLeyendo(true)
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('El PDF pesa más de 3 MB. Vuelve a descargar tu constancia desde el SAT (suelen pesar menos de 500 KB) o comprímela.')
      const dataUrl = await archivoADataUrl(file)
      const base64 = dataUrl.split(',')[1]
      const texto = await pedirAClaude({
        system: SYS_CONSTANCIA,
        max_tokens: 1200,
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Extrae los datos fiscales de esta Constancia de Situación Fiscal.' },
        ],
      })
      const j = extraerJSON(texto)
      await guardarPDF(d.id, dataUrl)
      setD((prev) => ({
        ...prev,
        rfc: j.rfc || prev.rfc,
        razonSocial: j.razonSocial || prev.razonSocial,
        cp: j.cp || prev.cp,
        regimenCodigo: j.regimenCodigo || prev.regimenCodigo,
        regimenNombre: j.regimenNombre || (REGIMENES.find((x) => x[0] === j.regimenCodigo) || [])[1] || prev.regimenNombre,
        tieneConstancia: true,
        constanciaNombre: file.name,
      }))
      if (j.notas) setError(j.notas)
    } catch (e) {
      setError(e.message || 'No se pudo leer la constancia')
    } finally {
      setLeyendo(false)
    }
  }

  function elegirRegimen(e) {
    const c = e.target.value
    setD({ ...d, regimenCodigo: c, regimenNombre: (REGIMENES.find((x) => x[0] === c) || [])[1] || '' })
  }

  const valido = d.rfc.trim().length >= 12 && d.razonSocial.trim() && d.cp.trim().length === 5

  return (
    <div className="pantalla">
      <div className="encabezadoResultado">
        <h2>{inicial.nuevo ? 'Nuevo RFC' : 'Editar RFC'}</h2>
        <button className="enlace" onClick={onCancelar}>Cancelar</button>
      </div>

      <div className="tarjeta zonaPdf">
        <div className="pdfIcono">📄</div>
        <b>Constancia de Situación Fiscal</b>
        <p>Sube el PDF y Claude llena el RFC, nombre, CP y régimen automáticamente.</p>
        <button className="btn primario" onClick={() => pdfRef.current.click()} disabled={leyendo}>
          {leyendo ? 'Leyendo la constancia…' : d.tieneConstancia ? 'Cambiar constancia' : 'Subir constancia (PDF)'}
        </button>
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden
          onChange={(e) => subirConstancia(e.target.files[0])} />
        {d.tieneConstancia && <div className="badge ok mt">✓ {d.constanciaNombre || 'Constancia guardada'}</div>}
      </div>

      {error && <div className="aviso warn">{error}</div>}

      <div className="tarjeta">
        <Campo l="RFC" v={d.rfc} on={(e) => setD({ ...d, rfc: e.target.value.toUpperCase().trim() })} ph="XAXX010101000" />
        <Campo l="Nombre o Razón social" v={d.razonSocial} on={set('razonSocial')} />
        <Campo l="Código postal fiscal" v={d.cp} on={set('cp')} ph="34000" />
        <label className="etq">Régimen fiscal</label>
        <select className="input" value={d.regimenCodigo} onChange={elegirRegimen}>
          <option value="">Selecciona…</option>
          {REGIMENES.map(([c, n]) => <option key={c} value={c}>{c} — {n}</option>)}
        </select>
      </div>

      <div className="acciones">
        <button className="btn primario ancho" disabled={!valido} onClick={() => onGuardar(d)}>
          Guardar
        </button>
        {!valido && <p className="pista center">Necesitas RFC, nombre y código postal de 5 dígitos.</p>}
      </div>
    </div>
  )
}

/* ============================ HISTORIAL ============================ */

function Historial({ historial, setHistorial }) {
  function alternar(id) {
    setHistorial((h) => h.map((x) => x.id === id ? { ...x, estado: x.estado === 'recibida' ? 'solicitada' : 'recibida' } : x))
  }
  function borrar(id) {
    if (!confirm('¿Quitar del historial?')) return
    setHistorial((h) => h.filter((x) => x.id !== id))
  }

  if (historial.length === 0) {
    return (
      <div className="pantalla">
        <div className="hero">
          <div className="heroIcono">🗂️</div>
          <h2>Historial vacío</h2>
          <p>Aquí aparecerán los tickets que mandes a facturar, para que sepas cuáles ya te llegaron.</p>
        </div>
      </div>
    )
  }

  const pendientes = historial.filter((h) => h.estado !== 'recibida').length

  return (
    <div className="pantalla">
      <div className="encabezadoResultado">
        <h2>Historial</h2>
        {pendientes > 0 && <span className="badge">{pendientes} pendientes</span>}
      </div>
      {historial.map((h) => (
        <div className="tarjeta histCard" key={h.id}>
          <div className="rfcTop">
            <div>
              <div className="rfcNum">{h.comercio || 'Comercio'}</div>
              <div className="rfcNombre">{h.fecha} · Folio {h.folio || '—'}</div>
            </div>
            <div className="montoHist">{moneda(h.total)}</div>
          </div>
          <div className="rfcDatos">
            <span>{h.rfc}</span>
            <span>Uso {h.uso}</span>
          </div>
          {h.destino && <div className="pista">Enviado a {h.destino}</div>}
          <div className="fila">
            <button className={'btn plano' + (h.estado === 'recibida' ? ' hecho' : '')} onClick={() => alternar(h.id)}>
              {h.estado === 'recibida' ? '✓ Factura recibida' : 'Marcar como recibida'}
            </button>
            <button className="btn plano peligro" onClick={() => borrar(h.id)}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  )
}
