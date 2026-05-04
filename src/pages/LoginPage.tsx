import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('austin.dircks@improving.com')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // Field-level validation
    let valid = true
    if (!email.trim()) {
      setEmailError('Please enter your email address.')
      valid = false
    } else {
      setEmailError('')
    }
    if (!password.trim()) {
      setPasswordError('Please enter your password.')
      valid = false
    } else {
      setPasswordError('')
    }
    if (!valid) return

    setFormError('')
    setSubmitting(true)
    try {
      await auth.login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-logo">
          <img src="/assets/improving-logo-full.png" alt="Improving" />
        </div>
        <div className="login-title">Project Portal</div>
        <p className="login-subtitle">Sign in to continue</p>

        {formError && <div className="login-form-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value)
                if (emailError) setEmailError('')
              }}
              className={emailError ? 'invalid' : ''}
            />
            {emailError && <div className="field-error">{emailError}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={e => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError('')
              }}
              className={passwordError ? 'invalid' : ''}
            />
            {passwordError && <div className="field-error">{passwordError}</div>}
          </div>

          <button type="submit" className="btn-login" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
