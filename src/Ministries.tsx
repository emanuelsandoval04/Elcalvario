import CommunityIcon from './CommunityIcon'
import type { IconName } from './CommunityIcon'
import './ministries.css'
import { useEffect, useState } from 'react'

const ministries = [
  { name: 'Alabanza / Adoración', description: null as string | null, icon: 'music' },
  { name: 'Multimedia', description: null as string | null, icon: 'camera' },
  { name: 'Servidores / Ujieres', description: null as string | null, icon: 'sparkles' },
] as const

export default function Ministries() {
  const [items, setItems] = useState<{ name: string; description: string | null; icon: IconName }[]>([...ministries])
  useEffect(() => { const controller = new AbortController(); fetch('/api/public/ministries', { signal: controller.signal }).then(async response => { if (!response.ok) return; const data = await response.json(); setItems(data.items.map((item: { nombre: string; descripcion: string | null }) => ({ name: item.nombre, description: item.descripcion, icon: ministries.find(ministry => ministry.name === item.nombre)?.icon || 'sparkles' }))) }).catch(() => {}); return () => controller.abort() }, [])
  return (
    <section className="ministries-section" id="ministerios" aria-labelledby="ministries-title">
      <div className="ministries-container">
        <div className="ministries-heading">
          <span className="ministries-eyebrow">Ministerios</span>
          <h2 id="ministries-title">Servimos con nuestros <em>dones.</em></h2>
          <p>Cada persona tiene algo que aportar. Conoce las áreas en las que puedes crecer, servir y formar parte de nuestra comunidad.</p>
        </div>
        <div className="ministries-grid">
          {items.map(({ name, description, icon }, index) => (
            <article className="ministry-card" key={name}>
              <div className="ministry-card-top">
                <span className="ministry-icon"><CommunityIcon name={icon} /></span>
                <span className="ministry-number" aria-hidden="true">0{index + 1}</span>
              </div>
              <h3>{name}</h3>
              {description && <p>{description}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
