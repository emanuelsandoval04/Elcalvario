// Avoid overlapping requests and the focus + visibilitychange burst on tab return.
export function pollWhileVisible(task: () => Promise<unknown>, interval: number) {
  let active = true, running = false, lastStarted = -Infinity
  const refresh = async () => {
    if (!active || running || document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastStarted < 1000) return
    running = true
    lastStarted = Date.now()
    try { await task() } finally { running = false }
  }
  const resume = () => { void refresh() }
  resume()
  const timer = window.setInterval(resume, interval)
  window.addEventListener('focus', resume)
  window.addEventListener('online', resume)
  document.addEventListener('visibilitychange', resume)
  return () => {
    active = false
    window.clearInterval(timer)
    window.removeEventListener('focus', resume)
    window.removeEventListener('online', resume)
    document.removeEventListener('visibilitychange', resume)
  }
}
