import { useEffect, useState } from 'react'

const slides = [
  { file: '759164415_122322370706230206_3842902114533129357_n.jpg', alt: 'Pastor de El Calvario compartiendo un mensaje con la congregación', position: '50% 22%' },
  { file: '757596657_122322370652230206_6627544883344177250_n.jpg', alt: 'Predicación junto al púlpito de El Calvario', position: '39% 50%' },
  { file: '754579914_122321841752230206_8530800205667427058_n.jpg', alt: 'Comunidad de El Calvario en un momento de oración', position: '50% 50%' },
  { file: '782489488_122328946886230206_4056265163921276503_n.jpg', alt: 'Discípulos de la comunidad compartiendo un momento de oración', position: '62% 50%' },
  { file: '784310039_122328947084230206_3426012668473809244_n.jpg', alt: 'Mensaje durante una reunión con la bandera de Colombia', position: '76% 50%' },
  { file: '784197648_122328947036230206_1156999774695897129_n.jpg', alt: 'Congregación reunida en El Calvario con la bandera de Colombia', position: '52% 50%' },
  { file: '710755312_122311632608230206_6300269705794013852_n.jpg', alt: 'Celebración de una integrante de la comunidad de El Calvario', position: '50% 50%' },
  { file: '660789788_122300754752230206_1313097966135355932_n.jpg', alt: 'Fotografía de la comunidad de El Calvario reunida en el escenario', position: '50% 50%' },
]

export default function HeroSlideshow() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <figure className="hero-visual">
      <div className="hero-slideshow" role="region" aria-roledescription="carrusel" aria-label="Nuestra comunidad">
        {slides.map((slide, index) => (
          <img key={slide.file} className={`hero-slide${index === active ? ' is-active' : ''}${index === 0 ? ' hero-slide-portrait' : ''}`} src={`/${slide.file}`} alt={slide.alt} aria-hidden={index !== active} style={{ objectPosition: slide.position }} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
        ))}
        <button className="slideshow-pause" type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar fotografías' : 'Pausar fotografías'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paused ? <path d="m8 5 11 7-11 7V5Z"/> : <path d="M7 5h4v14H7zM14 5h4v14h-4z"/>}</svg>
        </button>
      </div>
      <figcaption>Una familia en la fe. Un lugar para ti.</figcaption>
    </figure>
  )
}
