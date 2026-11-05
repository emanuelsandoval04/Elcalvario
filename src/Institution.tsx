import { useEffect, useState } from 'react'
import './institution.css'

type Schedule = { nombre: string; dia: string; horas: string[]; modalidad: string; plataformas: string }
const confirmed = {
  nombre: 'Misión Cristiana El Calvario Villavicencio', vision: 'ESTABLECER EL REINO DE DIOS EN LA TIERRA',
  mision: 'ALCANZAR LAS NACIONES PARA CRISTO', proposito: 'PRESENTAR A TODO HOMBRE PERFECTO EN CRISTO JESÚS', versiculo: 'Éxodo 25:40',
  ciudad: 'Villavicencio, Meta', direccion: 'Carrera 16 #22-28, Barrio Olímpico', grupos_confirmados: 5,
  horarios: [
    { nombre: 'Servicio General', dia: 'Domingos', horas: ['09:00'], modalidad: 'Presencial y virtual', plataformas: 'YouTube y Facebook' },
    { nombre: 'Discipulados', dia: 'Lunes', horas: ['19:30', '20:30'], modalidad: 'Solo virtual', plataformas: 'Zoom' },
    { nombre: 'Adiestramiento', dia: 'Jueves', horas: ['19:30'], modalidad: 'Presencial y virtual', plataformas: 'Zoom' },
  ] as Schedule[],
}
function displayTime(value: string) { const [hour, minute] = value.split(':').map(Number); return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}` }
export default function Institution() {
  const [data, setData] = useState(confirmed)
  useEffect(() => { const controller = new AbortController(); fetch('/api/public/institution', { signal: controller.signal }).then(async response => { if (!response.ok) return; const result = await response.json(); if (result?.nombre && Array.isArray(result.horarios)) setData(result) }).catch(() => {}); return () => controller.abort() }, [])
  return <div className="institution-container">
    <section className="institution-section" id="nosotros" aria-labelledby="institution-title"><span className="events-eyebrow">NUESTRA IGLESIA</span><h2 id="institution-title">{data.nombre}</h2><div className="institution-grid">{[['Visión', data.vision], ['Misión', data.mision], ['Propósito', data.proposito]].map(([label, value]) => <article key={label}><h3>{label}</h3><p>{value}</p></article>)}</div><p className="institution-reference">{data.versiculo}</p></section>
    <section className="institution-section" aria-labelledby="schedule-title"><span className="events-eyebrow">NOS REUNIMOS</span><h2 id="schedule-title">Horarios de nuestros encuentros</h2><div className="institution-grid">{data.horarios.map(schedule => <article key={schedule.nombre}><h3>{schedule.nombre}</h3><p><strong>{schedule.dia} · {schedule.horas.map(displayTime).join(' y ')}</strong></p><p>{schedule.modalidad}<br />{schedule.plataformas}</p></article>)}</div><p>Horarios de Colombia.</p></section>
    <section className="institution-section institution-community" id="grupos-de-comunion" aria-labelledby="groups-title"><div><span className="events-eyebrow">CERCA DE CADA FAMILIA</span><h2 id="groups-title">Grupos de Comunión Familiar</h2><p>Actualmente contamos con {data.grupos_confirmados} grupos. Su propósito es crecer en comunidad y abrir una nueva iglesia.</p><p>Consulta con la iglesia para conocer el grupo al que puedes asistir.</p></div><strong aria-label={`${data.grupos_confirmados} grupos de comunión`}>{data.grupos_confirmados}</strong></section>
    <section className="institution-section" id="contacto" aria-labelledby="contact-title"><span className="events-eyebrow">TE ESPERAMOS</span><h2 id="contact-title">Encuéntranos en {data.ciudad}</h2><address>{data.direccion}</address><a className="facebook-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.direccion}, ${data.ciudad}`)}`} target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a></section>
  </div>
}
