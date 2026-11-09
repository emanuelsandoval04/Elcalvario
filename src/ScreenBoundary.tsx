import { Component } from 'react'
import type { ReactNode } from 'react'

export function ScreenLoading() {
  return <main className="screen-feedback" role="status" aria-live="polite"><p>Cargando…</p></main>
}

// A failed chunk download (offline or after a deployment) must leave a recovery action.
export default class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="screen-feedback" role="alert">
      <h1>No pudimos abrir esta sección</h1>
      <p>Comprueba tu conexión y vuelve a intentarlo.</p>
      <button type="button" onClick={() => window.location.reload()}>Volver a cargar</button>
      <a href="#inicio">Ir al inicio</a>
    </main>
    return this.props.children
  }
}
