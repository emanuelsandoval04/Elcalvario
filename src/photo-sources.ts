export function photoSources(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '')
  return {
    src: `/media/${stem}-960.webp`,
    srcSet: [480, 960, 1280].map(width => `/media/${stem}-${width}.webp ${width}w`).join(', '),
  }
}
