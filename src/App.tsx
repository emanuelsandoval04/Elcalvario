import { lazy, Suspense, useEffect, useState } from 'react'
import Navbar from './Navbar'
import HeroSlideshow from './HeroSlideshow'
import CommunityIcon from './CommunityIcon'
import Events from './Events'
import Ministries from './Ministries'
import Institution from './Institution'
import { authRequest } from './auth'
import ScreenBoundary, { ScreenLoading } from './ScreenBoundary'

const Login = lazy(() => import('./Login'))
const PasswordRecovery = lazy(() => import('./PasswordRecovery'))
const AdminUsers = lazy(() => import('./AdminUsers'))
const Management = lazy(() => import('./Management'))
const CheckIn = lazy(() => import('./CheckIn'))
// Opened from an event's attendance QR: #asistencia/<token>.
const checkinToken = (hash: string) => /^#asistencia\/([A-Za-z0-9_-]{32})$/.exec(hash)?.[1] || null
const isAccessRoute = () => window.location.hash === '#usuarios' || window.location.hash.startsWith('#usuarios/') || /^#gestion\/(permissions|users)(\/|$)/.test(window.location.hash)

const churchMapsUrl = 'https://www.google.com/maps/search/?api=1&query=Carrera%2016%20%2322-28%2C%20Barrio%20Ol%C3%ADmpico%2C%20Villavicencio%2C%20Meta'

export default function App() {
  useEffect(() => {
    // Private screens and login already check their session when they mount.
    const route = window.location.hash
    if (!isAccessRoute() && route !== '#gestion' && !route.startsWith('#gestion/') && !['#login', '#registro'].includes(route) && !checkinToken(route)) void authRequest('me').catch(() => {})
  }, [])
  const [selected, setSelected] = useState('Inicio')
  const [recoveryRoute, setRecoveryRoute] = useState(() => window.location.hash)
  const [loginOpen, setLoginOpen] = useState(() => ['#login', '#registro'].includes(window.location.hash))
  const [adminOpen, setAdminOpen] = useState(isAccessRoute)
  const [managementOpen, setManagementOpen] = useState(() => !isAccessRoute() && (window.location.hash === '#gestion' || window.location.hash.startsWith('#gestion/')))
  useEffect(() => {
    const updatePage = () => {
      if (/^#gestion\/permissions(\/|$)/.test(window.location.hash)) { window.location.replace('#usuarios/perfiles'); return }
      if (/^#gestion\/users(\/|$)/.test(window.location.hash)) { window.location.replace('#usuarios'); return }
      setRecoveryRoute(window.location.hash)
      setLoginOpen(['#login', '#registro'].includes(window.location.hash))
      if (window.location.hash === '#registro') window.location.replace('#login')
      setAdminOpen(isAccessRoute())
      setManagementOpen(!isAccessRoute() && (window.location.hash === '#gestion' || window.location.hash.startsWith('#gestion/')))
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
  const checkin = !managementOpen && !adminOpen ? checkinToken(recoveryRoute) : null
  return (
    <>
    {!managementOpen && !adminOpen && !checkin && <Navbar onNavigate={setSelected} />}
    <ScreenBoundary key={managementOpen ? 'management' : adminOpen ? 'users' : checkin ? `checkin-${checkin}` : loginOpen ? 'login' : ['#recuperar', '#restablecer'].includes(recoveryRoute.split('?')[0]) ? recoveryRoute : 'public'}>
    <Suspense fallback={<ScreenLoading />}>
    {managementOpen ? <Management /> : adminOpen ? <AdminUsers /> : checkin ? <CheckIn token={checkin} /> : ['#recuperar', '#restablecer'].includes(recoveryRoute.split('?')[0]) ? <PasswordRecovery key={recoveryRoute} reset={recoveryRoute.split('?')[0] === '#restablecer'} /> : loginOpen ? <Login /> : (
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
    </Suspense>
    </ScreenBoundary>
    </>
  )
}
