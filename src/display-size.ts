export const displaySizes = [
  { value: 'normal', label: 'Normal', detail: 'Tamaño actual · Predeterminado', scale: 1 },
  { value: 'large', label: 'Grande', detail: 'Textos y elementos un 15 % más grandes', scale: 1.15 },
  { value: 'extra-large', label: 'Muy grande', detail: 'Textos y elementos un 30 % más grandes', scale: 1.3 },
] as const
export type DisplaySize = typeof displaySizes[number]['value']

export function applyDisplaySize(value?: DisplaySize | null) {
  document.documentElement.dataset.displaySize = displaySizes.some(size => size.value === value) ? value! : 'normal'
}
