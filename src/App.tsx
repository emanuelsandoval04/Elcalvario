import { useEffect, useState } from 'react'
import Navbar from './Navbar'
import HeroSlideshow from './HeroSlideshow'
import CommunityIcon from './CommunityIcon'
import Login from './Login'
import Events from './Events'
import AdminUsers from './AdminUsers'
import Ministries from './Ministries'
import Management from './Management'
import Institution from './Institution'
import { authRequest } from './auth'

const churchMapsUrl = 'https://www.google.com/maps/search/?api=1&query=Carrera%2016%20%2322-28%2C%20Barrio%20Ol%C3%ADmpico%2C%20Villavicencio%2C%20Meta'

export default function App() {
  useEffect(() => { void authRequest('me').catch(() => {}) }, [])
  const [selected, setSelected] = useState('Inicio')
  const [loginOpen, setLoginOpen] = useState(() => ['#login', '#registro'].includes(window.location.hash))
  const [registration, setRegistration] = useState(() => window.location.hash === '#registro')
  const [adminOpen, setAdminOpen] = useState(() => window.location.hash === '#usuarios')
  const [managementOpen, setManagementOpen] = useState(() => window.location.hash === '#gestion' || window.location.hash.startsWith('#gestion/'))
  useEffect(() => {
    const updatePage = () => {
      setLoginOpen(['#login', '#registro'].includes(window.location.hash))
      setRegistration(window.location.hash === '#registro')
      setAdminOpen(window.location.hash === '#usuarios')
      setManagementOpen(window.location.hash === '#gestion' || window.location.hash.startsWith('#gestion/'))
      if (window.location.hash === '#inicio') setSelected('Inicio')
      window.requestAnimationFrame(() => {
        if (['#eventos', '#ministerios', '#nosotros', '#grupos-de-comunion', '#contacto'].includes(window.location.hash)) {
          document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'instant', block: 'start' })
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' })
        }
      })
    }
    window.addEventListener('hashchange', updatePage)
    updatePage()
    return () => window.removeEventListener('hashchange', updatePage)
  }, [])
  return (
    <>
    {!managementOpen && !adminOpen && <Navbar onNavigate={setSelected} />}
    {managementOpen ? <Management /> : adminOpen ? <AdminUsers /> : loginOpen ? <Login key={registration ? 'register' : 'login'} registration={registration} /> : (
    <main>
    <section className="welcome" id="inicio" aria-label="Bienvenidos a El Calvario">
      <div className="hero-copy">
      <h1>Un lugar para creer, crecer y encontrarte con Dios</h1>
      <p className="hero-description">Somos una iglesia en Villavicencio, Meta, donde compartimos la fe en Jesús, crecemos en su Palabra y vivimos en comunidad. Aquí hay un lugar para ti.</p>
      <address className="hero-location">
        <a href={churchMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir la dirección de la iglesia en Google Maps (nueva pestaña)">
        <CommunityIcon name="location" />
        <span><strong>Villavicencio, Meta</strong><br />Carrera 16 #22-28, Barrio Olímpico</span>
        </a>
        <a className="nav-login location-directions" href={churchMapsUrl} target="_blank" rel="noopener noreferrer"><CommunityIcon name="location" />Cómo llegar</a>
      </address>
      <div className="hero-verse">
        <p>Propósito: PRESENTAR A TODO HOMBRE PERFECTO EN CRISTO JESÚS</p>
        <cite>Versículo de nuestra iglesia: Éxodo 25:40</cite>
      </div>
      <ul className="hero-features" aria-label="Vida en comunidad">
        <li><CommunityIcon name="book" /><span>Discipulados</span></li>
        <li><CommunityIcon name="people" /><span>Grupos de<br />Comunión</span></li>
        <li><CommunityIcon name="calendar" /><span>Eventos</span></li>
        <li><CommunityIcon name="sparkles" /><span>Mucho más</span></li>
      </ul>
      <div className="navigation-feedback" role="status" aria-live="polite">
        <span className="sr-only">{selected}</span>
      </div>
      </div>
      <HeroSlideshow />
    </section>
    <Institution />
    <Events />
    <Ministries />
    <footer className="institution-footer">Misión Cristiana El Calvario Villavicencio · Desarrollada por Nexus Corp</footer>
    </main>
    )}
    </>
  )
}
