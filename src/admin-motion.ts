import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)
export { gsap, useGSAP }

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

// One delegated interaction layer also covers forms and rows loaded asynchronously.
export function useAdminMotion(root: RefObject<HTMLDivElement | null>) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  useGSAP((_context, contextSafe) => {
    const element = root.current
    if (!element || reducedMotion || !contextSafe) return
    const entered = new WeakSet<Element>()
    const messages = new WeakMap<Element, string>()
    const selector = '.manage-editor, .manage-records > article, .manage-widgets > article, .admin-user-row, .dashboard-shortcut, .falls-content'
    const reveal = contextSafe((nodes: Element[]) => {
      const fresh = nodes.filter(node => !entered.has(node))
      fresh.forEach(node => entered.add(node))
      if (!fresh.length) return
      gsap.fromTo(fresh, { y: 18, opacity: 0 }, {
        y: 0, opacity: 1, duration: .42, stagger: { each: .045, amount: Math.min(.3, fresh.length * .045) },
        ease: 'power3.out', clearProps: 'transform,opacity',
      })
      for (const node of fresh) {
        if (node.matches('.manage-editor')) {
          const labels = node.querySelectorAll('.manage-form-fields:not([hidden]) > label')
          if (labels.length) gsap.fromTo(labels, { y: 10, opacity: 0 }, {
            y: 0, opacity: 1, duration: .32, stagger: .018, delay: .08, clearProps: 'transform,opacity',
          })
        }
        const counter = node.querySelector<HTMLElement>('[data-count]')
        if (counter) gsap.fromTo(counter, { textContent: 0 }, {
          textContent: Number(counter.dataset.count), snap: { textContent: 1 }, duration: .85, ease: 'power2.out',
        })
      }
    })
    const announce = contextSafe((node: Element) => {
      const content = node.textContent?.trim() || ''
      if (!content || messages.get(node) === content) return
      messages.set(node, content)
      gsap.fromTo(node, { y: -7, opacity: .25, scale: .985 }, {
        y: 0, opacity: 1, scale: 1, duration: .35, ease: 'back.out(1.2)', clearProps: 'transform,opacity', overwrite: true,
      })
    })
    reveal([...element.querySelectorAll(selector)])
    const observer = new MutationObserver(records => {
      const added = new Set<Element>()
      const notices = new Set<Element>()
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        const notice = target?.closest('.manage-message, .admin-message')
        if (notice) notices.add(notice)
        for (const node of record.addedNodes) if (node instanceof Element) {
          if (node.matches(selector)) added.add(node)
          node.querySelectorAll(selector).forEach(child => added.add(child))
          if (node.matches('.manage-message, .admin-message')) notices.add(node)
        }
      }
      reveal([...added]); notices.forEach(announce)
    })
    observer.observe(element, { childList: true, subtree: true, characterData: true })
    const buttonFor = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>('button:not(:disabled), a[href]') : null
    const click = contextSafe((event: MouseEvent) => {
      const button = buttonFor(event)
      if (!button || !element.contains(button)) return
      const bounds = button.getBoundingClientRect()
      const size = Math.max(bounds.width, bounds.height) * 2
      const ripple = document.createElement('span')
      ripple.className = 'panel-click-wave'; ripple.setAttribute('aria-hidden', 'true')
      Object.assign(ripple.style, {
        width: `${size}px`, height: `${size}px`,
        left: `${(event.detail ? event.clientX - bounds.left : bounds.width / 2) - size / 2}px`,
        top: `${(event.detail ? event.clientY - bounds.top : bounds.height / 2) - size / 2}px`,
      })
      button.append(ripple)
      gsap.fromTo(ripple, { scale: 0, opacity: .22 }, { scale: 1, opacity: 0, duration: .6, ease: 'power2.out', onComplete: () => ripple.remove() })
      gsap.timeline().to(button, { scale: .96, duration: .09, overwrite: 'auto' })
        .to(button, { scale: 1, duration: .35, ease: 'back.out(2)', clearProps: 'scale' })
    })
    const over = contextSafe((event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const button = buttonFor(event)
      if (!button || button.contains(event.relatedTarget as Node)) return
      gsap.to(button, { y: -2, duration: .2, overwrite: 'auto' })
    })
    const out = contextSafe((event: PointerEvent) => {
      const button = buttonFor(event)
      if (button && !button.contains(event.relatedTarget as Node)) gsap.to(button, { y: 0, duration: .25, overwrite: 'auto', clearProps: 'y' })
      const card = event.target instanceof Element ? event.target.closest('.manage-widgets article, .dashboard-shortcut:not(:disabled)') : null
      if (card && !card.contains(event.relatedTarget as Node)) gsap.to(card, { rotationX: 0, rotationY: 0, duration: .4, overwrite: 'auto', clearProps: 'transform' })
    })
    const move = contextSafe((event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.manage-widgets article, .dashboard-shortcut:not(:disabled)') : null
      if (!card) return
      const box = card.getBoundingClientRect()
      gsap.to(card, { rotationY: ((event.clientX - box.left) / box.width - .5) * 6,
        rotationX: -((event.clientY - box.top) / box.height - .5) * 6,
        transformPerspective: 700, duration: .3, overwrite: 'auto' })
    })
    element.addEventListener('click', click)
    element.addEventListener('pointerover', over)
    element.addEventListener('pointerout', out)
    element.addEventListener('pointermove', move)
    return () => {
      observer.disconnect()
      element.removeEventListener('click', click)
      element.removeEventListener('pointerover', over)
      element.removeEventListener('pointerout', out)
      element.removeEventListener('pointermove', move)
      element.querySelectorAll('.panel-click-wave').forEach(node => node.remove())
    }
  }, { scope: root, dependencies: [reducedMotion], revertOnUpdate: true })
  return reducedMotion
}
