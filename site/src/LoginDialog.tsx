import { useEffect, useRef, useState, type FormEvent } from 'react'
import { saveToken } from './auth'
import { validateToken } from './gitlab'
import { tokenSettingsUrl, type Hub } from './hubs'

interface Props {
  hub: Hub
  onClose: () => void
  onDone: () => void
}

export function LoginDialog({ hub, onClose, onDone }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => controller.current?.abort()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = token.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    controller.current?.abort()
    const ctl = new AbortController()
    controller.current = ctl
    try {
      await validateToken({ hub, token: value }, ctl.signal)
      if (ctl.signal.aborted) return
      saveToken(hub, value, remember)
      setToken('')
      onDone()
    } catch (e) {
      if (ctl.signal.aborted) return
      setError(e instanceof Error ? e.message : 'The token could not be checked.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={() => { controller.current?.abort(); onClose() }} aria-labelledby="login-title">
      <form onSubmit={submit}>
        <h2 id="login-title">Log in to {hub.name}</h2>
        <p>
          Paste a personal access token with the <code>read_api</code> scope to see your private ARCs.{' '}
          <a href={tokenSettingsUrl(hub)} target="_blank" rel="noopener noreferrer">Create one on {hub.name}</a>.
        </p>
        <p className="hint">The token is only sent to {new URL(hub.origin).host} and stays in this browser.</p>
        <label className="field">
          <span>Access token</span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            autoComplete="off" spellCheck={false} autoFocus required />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember on this device</span>
        </label>
        <p className="hint">Stored in this browser for arc-rdg.github.io. Use a token with read_api scope and an expiry date.</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !token.trim()}>{busy ? 'Checking…' : 'Log in'}</button>
        </div>
      </form>
    </dialog>
  )
}
