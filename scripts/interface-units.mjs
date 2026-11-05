// Keep authored pixels and breakpoints readable while using root-relative lengths
// for user-controlled text, controls, icons and spacing in both dev and builds.
export default function interfaceUnits() {
  return {
    postcssPlugin: 'calvario-interface-units',
    Declaration(declaration) {
      if (declaration.source?.input.file?.includes('node_modules')) return
      if (/^(?:border(?:-.+)?|outline(?:-.+)?|box-shadow|text-shadow|letter-spacing|stroke-width)$/.test(declaration.prop)) return
      // The viewport's lower bound must stay 320px even when content is enlarged.
      if (declaration.prop === 'min-width' && declaration.parent.selector === 'body') return
      declaration.value = declaration.value.replace(/(-?(?:\d*\.)?\d+)px\b/g, (_match, pixels) => `${Number(pixels) / 16}rem`)
    },
  }
}
