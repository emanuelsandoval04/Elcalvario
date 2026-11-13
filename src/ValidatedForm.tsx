import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import type { FormHTMLAttributes, ReactElement, ReactNode } from 'react'
import './form-feedback.css'
import { birthDateError, emailError, phoneError } from './contact-rules'

export class RequestError extends Error {
  fieldErrors?: Record<string,string>
  constructor(message:string, fields?:Record<string,string>) { super(message);this.fieldErrors=fields }
}
export const requestFieldErrors=(error:unknown)=>error instanceof RequestError?error.fieldErrors:undefined
export function reportFormErrors(form:HTMLFormElement,error:unknown) {
  const fields=error instanceof RequestError ? error.fieldErrors : null
  if(!fields || !Object.keys(fields).length)return false
  requestAnimationFrame(()=>form.dispatchEvent(new CustomEvent('calvario-form-errors',{detail:fields})))
  return true
}
type Control=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement
function target(form:HTMLFormElement,name:string) {
  const field=[...form.elements].find(element=>(element as Control).name===name) as Control|undefined
  return field?.closest('.app-select')?.querySelector<HTMLButtonElement>('.app-select-trigger') || field
}
function focusField(form:HTMLFormElement,name:string) {target(form,name)?.focus();target(form,name)?.scrollIntoView({block:'center',behavior:'smooth'})}
function fieldLabel(form:HTMLFormElement|null,name:string) {
  const field=form ? [...form.elements].find(element=>(element as Control).name===name) as Control|undefined : undefined
  const label=field?.labels?.[0]
  return label?.querySelector(':scope > span')?.textContent || (label ? [...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ').trim() : '') || field?.getAttribute('aria-label') || name.replaceAll('_',' ')
}
function validate(form:HTMLFormElement) {
  const errors:Record<string,string>={}
  for(const field of [...form.elements] as Control[]) {
    if(!field.name || field.disabled || !field.willValidate || field.closest('fieldset[hidden]'))continue
    const validity=field.validity
    if(validity.valueMissing)errors[field.name]='Completa este campo.'
    else if(validity.typeMismatch)errors[field.name]=field.type==='email'?'Escribe un correo válido, por ejemplo nombre@correo.com.':'Escribe una dirección válida.'
    else if(validity.tooShort)errors[field.name]=`Usa al menos ${(field as HTMLInputElement).minLength} caracteres.`
    else if(validity.patternMismatch)errors[field.name]=field.title || 'Revisa el formato de este dato.'
    else if(!validity.valid)errors[field.name]='Revisa el formato y los límites de este dato.'
    // Registration fields marked with data-rule (celular, correo, fecha de nacimiento).
    const rule=field.dataset.rule,value=field.value.trim()
    // An unchanged email is kept as it was: the provider rule applies when it is written or changed.
    const unchangedEmail=rule==='email' && 'defaultValue' in field && value.toLowerCase()===String(field.defaultValue).trim().toLowerCase()
    if(value && !validity.valueMissing && !unchangedEmail) {
      const message=rule==='phone'?phoneError(value):rule==='email'?emailError(value):rule==='birthdate'?birthDateError(value):''
      if(message)errors[field.name]=message
    }
  }
  for(const [password,confirmation] of [['password','confirmation'],['newPassword','confirmation'],['account_password','account_confirmation']]) {
    const first=form.elements.namedItem(password) as Control|null,second=form.elements.namedItem(confirmation) as Control|null
    if(first&&second&&!second.closest('fieldset[hidden]')&&second.value && first.value!==second.value)errors[confirmation]='Las contraseñas no coinciden.'
  }
  return errors
}
function controlName(nodes:ReactNode):string|undefined {
  for(const node of Children.toArray(nodes))if(isValidElement<Record<string,unknown>>(node)) {
    if(typeof node.props.name==='string' && node.props.type!=='hidden')return node.props.name
    const found=controlName(node.props.children as ReactNode);if(found)return found
  }
}

export default function ValidatedForm({children,onSubmit,...props}:FormHTMLAttributes<HTMLFormElement>) {
  const [errors,setErrors]=useState<Record<string,string>>({})
  const formRef=useRef<HTMLFormElement>(null),summary=useRef<HTMLDivElement>(null)
  const id=useId(),errorId=(name:string)=>`${id}-${name}-error`
  useEffect(()=>{
    const form=formRef.current
    const receive=(event:Event)=>{setErrors((event as CustomEvent<Record<string,string>>).detail);requestAnimationFrame(()=>summary.current?.focus())}
    form?.addEventListener('calvario-form-errors',receive)
    return()=>form?.removeEventListener('calvario-form-errors',receive)
  },[])
  function decorate(nodes:ReactNode):ReactNode {
    return Children.map(nodes,node=>{
      if(!isValidElement<Record<string,unknown>>(node))return node
      const element=node as ReactElement<Record<string,unknown>>
      const name=typeof element.props.name==='string'?element.props.name:undefined
      const next:Record<string,unknown>={}
      if(name && errors[name]){next['aria-invalid']=true;next['aria-describedby']=[element.props['aria-describedby'],errorId(name)].filter(Boolean).join(' ')}
      if(element.props.children)next.children=decorate(element.props.children as ReactNode)
      const cloned=cloneElement(element,next)
      const fieldName=controlName(element.props.children as ReactNode)
      if(element.type==='label' && fieldName && !String(element.props.className||'').split(' ').includes('display-size-choice')) {
        return <div className={`form-feedback-field ${element.props.className || ''}`}>{cloned}{errors[fieldName]&&<span className="field-feedback" id={errorId(fieldName)}>{errors[fieldName]}</span>}</div>
      }
      if(element.type==='div' && String(element.props.className||'').split(' ').includes('login-field')&&fieldName)return cloneElement(cloned,{},next.children as ReactNode,errors[fieldName]?<span className="field-feedback" id={errorId(fieldName)}>{errors[fieldName]}</span>:null)
      return cloned
    })
  }
  function submit(event:Parameters<NonNullable<FormHTMLAttributes<HTMLFormElement>['onSubmit']>>[0]) {
    const failures=validate(event.currentTarget)
    setErrors(failures)
    if(Object.keys(failures).length){event.preventDefault();requestAnimationFrame(()=>summary.current?.focus());return}
    onSubmit?.(event)
  }
  return <form {...props} ref={formRef} noValidate onSubmit={submit} onInput={event=>{props.onInput?.(event);const name=(event.target as Control).name;if(name)setErrors(previous=>{const next={...previous};delete next[name];return next})}}>
    {Object.keys(errors).length>0&&<div ref={summary} tabIndex={-1} className="form-error-summary manage-wide" role="alert"><strong>Revisa los campos indicados antes de continuar.</strong><ul>{Object.entries(errors).map(([name,message])=><li key={name}><a href={`#${errorId(name)}`} onClick={event=>{event.preventDefault();if(formRef.current)focusField(formRef.current,name)}}>{fieldLabel(formRef.current,name)}: {message}</a></li>)}</ul></div>}
    {decorate(children)}
  </form>
}
