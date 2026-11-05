export async function downloadReport(path: string, filename: string) {
  const response = await fetch(`/api/management/${path}`, { credentials: 'same-origin', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error((await response.json()).error || 'No pudimos generar el reporte.')
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
}
