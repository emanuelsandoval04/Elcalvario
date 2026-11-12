import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// Crisp SVG QR (medium error correction, 4-module quiet zone) that scales to any size.
export default function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`
    return { size: count + 8, path: d }
  }, [value])
  return <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff"/><path d={path} fill="#111"/></svg>
}
