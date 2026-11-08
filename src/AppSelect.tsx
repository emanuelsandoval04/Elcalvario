import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import './app-select.css'

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'>
type Choice = { value: string; label: string; disabled: boolean }
const text = (nodes: ReactNode): string => Children.toArray(nodes).map(node => isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : String(node)).join('')
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function choicesFrom(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap(node => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(node)) return []
    if (node.type === Fragment) return choicesFrom(node.props.children)
    if (node.type !== 'option') return []
    const label = node.props.label ?? text(node.props.children)
    return [{ value: String(node.props.value ?? label), label, disabled: Boolean(node.props.disabled) }]
  })
}

/** Keeps native form values/validation, while the visible picker belongs to the app. */
export default function AppSelect({ children, value, defaultValue, onChange, onInvalid, disabled, id, className, ...props }: Props) {
  const generatedId = useId()
  const controlId = id || `select-${generatedId}`
  const dialogId = `${controlId}-picker`
  const options = choicesFrom(children)
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ''))
  const selected = String(value ?? internal)
  const current = options.find(option => option.value === selected) || options[0]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')
  const [title, setTitle] = useState('Selecciona una opción')
  const [invalid, setInvalid] = useState(false)
  const native = useRef<HTMLSelectElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const searchable = options.length > 7
  const filtered = options.filter(option => normalize(option.label).includes(normalize(query)))
  const enabled = filtered.filter(option => !option.disabled)
  const activeIndex = filtered.findIndex(option => option.value === active)

  function close() {
    dialog.current?.close()
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  function show() {
    if (disabled) return
    const label = props['aria-labelledby']?.split(/\s+/).map(key => document.getElementById(key)?.textContent || '').join(' ')
    const wrappingLabel = trigger.current?.labels?.[0]?.cloneNode(true) as HTMLElement | undefined
    wrappingLabel?.querySelectorAll('.app-select').forEach(node => node.remove())
    setTitle(props['aria-label'] || label || wrappingLabel?.textContent?.trim() || 'Selecciona una opción')
    setQuery('')
    setActive(current && !current.disabled ? current.value : options.find(option => !option.disabled)?.value ?? '')
    setOpen(true)
  }

  function choose(option: Choice) {
    if (option.disabled || disabled || !native.current) return
    // Dispatch through the native control so parent onChange and FormData keep working.
    native.current.value = option.value
    native.current.dispatchEvent(new Event('change', { bubbles: true }))
    close()
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && enabled.length) {
      if ((event.key === 'Home' || event.key === 'End') && event.target === search.current) return
      event.preventDefault()
      const index = enabled.findIndex(option => option.value === active)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (index + 1) % enabled.length : (index - 1 + enabled.length) % enabled.length
      setActive(enabled[next].value)
    } else if ((event.key === 'Enter' && event.target !== dialog.current?.querySelector('.app-select-close')) || (event.key === ' ' && event.target === list.current)) {
      event.preventDefault()
      const option = enabled.find(option => option.value === active)
      if (option) choose(option)
    } else if (event.target === list.current && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const index = enabled.findIndex(option => option.value === active)
      const ordered = [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)]
      const match = ordered.find(option => normalize(option.label).startsWith(normalize(event.key)))
      if (match) setActive(match.value)
    }
  }

  useEffect(() => {
    const form = native.current?.form
    const reset = () => { setInternal(String(defaultValue ?? options[0]?.value ?? '')); setInvalid(false) }
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [defaultValue, children])

  useEffect(() => { if (disabled && open) close() }, [disabled, open])

  useEffect(() => {
    if (!open || !dialog.current || !trigger.current) return
    const picker = dialog.current
    const position = () => {
      if (!trigger.current || window.matchMedia('(max-width: 600px)').matches) {
        picker.style.removeProperty('left'); picker.style.removeProperty('top'); picker.style.removeProperty('width')
        return
      }
      const bounds = trigger.current.getBoundingClientRect()
      const width = Math.min(Math.max(bounds.width, 300), window.innerWidth - 24)
      picker.style.width = `${width}px`
      const height = picker.getBoundingClientRect().height || Math.min(430, window.innerHeight - 32)
      picker.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`
      picker.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - height - 12))}px`
    }
    position()
    if (!picker.open) picker.showModal()
    position()
    const focusTarget = searchable ? search.current : list.current
    focusTarget?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    window.addEventListener('resize', position)
    viewport?.addEventListener('resize', position)
    return () => {
      window.removeEventListener('resize', position)
      viewport?.removeEventListener('resize', position)
      picker.close()
    }
  }, [open, searchable])

  useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${dialogId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, dialogId])

  const activeId = activeIndex >= 0 ? `${dialogId}-option-${activeIndex}` : undefined
  return <span className={`app-select ${className || ''}`}>
    <button ref={trigger} id={controlId} type="button" role="combobox" className="app-select-trigger" disabled={disabled}
      aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']}
      aria-expanded={open} aria-controls={dialogId} aria-haspopup="dialog" aria-required={props.required || undefined} aria-invalid={invalid || props['aria-invalid'] || undefined}
      data-state={(props as Props & { 'data-state'?: string })['data-state']}
      onClick={show} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() } }}>
      <span className="app-select-value">{current?.label || 'Selecciona…'}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
    </button>
    <select {...props} ref={native} hidden tabIndex={-1} aria-hidden="true" aria-label={undefined} aria-labelledby={undefined} disabled={disabled} value={selected}
      onInvalid={event => { event.preventDefault(); setInvalid(true); onInvalid?.(event); show() }}
      onChange={event => { setInternal(event.target.value); setInvalid(false); onChange?.(event) }}>{children}</select>
    {open && createPortal(<dialog ref={dialog} id={dialogId} className="app-select-dialog" aria-labelledby={`${dialogId}-title`}
      onCancel={event => { event.preventDefault(); close() }} onClose={() => setOpen(false)} onKeyDown={keyboard}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close() } }}>
      <div className="app-select-handle" aria-hidden="true"/>
      <div className="app-select-heading"><h2 id={`${dialogId}-title`}>{title}</h2><button type="button" className="app-select-close" aria-label="Cerrar opciones" onClick={close}>×</button></div>
      {searchable && <input ref={search} className="app-select-search" type="search" aria-label="Buscar opciones" placeholder="Buscar opción…" autoComplete="off" role="combobox" aria-expanded="true" aria-controls={`${dialogId}-list`} aria-activedescendant={activeId}
        value={query} onChange={event => { setQuery(event.target.value); setActive(options.find(option => !option.disabled && normalize(option.label).includes(normalize(event.target.value)))?.value ?? '') }}/>}
      <div ref={list} id={`${dialogId}-list`} className="app-select-options" role="listbox" aria-labelledby={`${dialogId}-title`} tabIndex={0} aria-activedescendant={activeId}>
        {filtered.map((option, index) => <div key={option.value} id={`${dialogId}-option-${index}`} role="option" aria-selected={option.value === current?.value} aria-disabled={option.disabled || undefined}
          className={`app-select-option${option.value === active ? ' is-active' : ''}`} onPointerMove={() => { if (!option.disabled) setActive(option.value) }} onClick={() => choose(option)}>
          <span>{option.label}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m4 10 4 4 8-8"/></svg>
        </div>)}
        {!filtered.length && <p className="app-select-empty" role="status">No encontramos opciones.</p>}
      </div>
    </dialog>, document.body)}
  </span>
}
