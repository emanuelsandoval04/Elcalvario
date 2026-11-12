// Each Grupo de Comunión gets a stable color from its name (same name, same color on every screen).
const palette = ['#e4572e', '#2e86ab', '#3bb273', '#9b5de5', '#f4a259', '#d1495b', '#00a6a6', '#7a6c5d', '#c2185b', '#5c6bc0', '#8bc34a', '#ff8f00']

export function groupColor(name: unknown) {
  const text = String(name || '').trim().toLowerCase()
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return palette[hash % palette.length]
}
