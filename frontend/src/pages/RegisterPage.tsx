import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/providers/auth'
import handIcon from '@/assets/hand-a.png'
import { clearPendingInviteToken, getPendingInviteToken } from '@/lib/pendingInvite'
import { normalizePersonName, validatePersonName } from '@/lib/personName'
import { toUrlUuid } from '@/utils/uuid'

export const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [pendingInviteToken, setPendingInviteToken] = useState(() => getPendingInviteToken())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      alert('Passwords do not match')
      return
    }

    const isInviteSignup = Boolean(pendingInviteToken)
    let normalizedName: string | undefined
    if (!isInviteSignup) {
      const validationMessage = validatePersonName(name)
      if (validationMessage) {
        setNameError(validationMessage)
        return
      }

      normalizedName = normalizePersonName(name)
      setNameError(null)
    }

    setIsLoading(true)

    try {
      const result = await register(email, password, normalizedName)
      if (result.workspaceId) {
        navigate(`/w/${toUrlUuid(result.workspaceId)}`, { replace: true })
      } else {
        navigate('/')
      }
    } catch {
      // Error is handled by AuthProvider with toast
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setIsLoading(true)
    try {
      await loginWithGoogle()
    } catch {
      // Error is handled by AuthProvider with toast
      setIsLoading(false)
    }
  }

  const base = import.meta.env.BASE_URL
  const posterSrc = `${base}background-login-poster.jpg`
  const videoSrc = `${base}background-login.webm`
  const inputClass =
    'w-full appearance-none px-3.5 py-2.5 rounded-[10px] text-sm text-foreground bg-canvas placeholder:text-foreground-muted/60 border border-[#dcd2bf] focus:outline-none focus:ring-1 focus:ring-focused-content'

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-6 font-['Inter',system-ui,sans-serif] overflow-hidden"
      style={{
        backgroundImage: `url(${posterSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        poster={posterSrc}
        className="absolute inset-0 w-full h-full object-cover"
        src={videoSrc}
      />

      <div
        className="relative z-10 w-full max-w-[440px] rounded-[20px] px-8 py-9 bg-canvas border-2 border-[#dcd2bf]"
        style={{ boxShadow: '0 18px 64px rgb(86 75 44 / 60%)' }}
      >
        {pendingInviteToken && (
          <div className="mb-6 flex items-start gap-3 rounded-[12px] border border-focused-content/20 bg-focused/60 px-3 py-2.5">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-focused-content/20 text-focused-content">
              <i className="fa-solid fa-envelope-open-text text-[9px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.08em] text-foreground-muted">Invite in progress</p>
              <p className="mt-0.5 text-[11px] text-foreground-muted">Create your account to accept the team invite.</p>
            </div>
            <button
              type="button"
              className="text-[11px] font-medium text-focused-content hover:opacity-75 transition-opacity cursor-pointer"
              onClick={() => {
                clearPendingInviteToken()
                setPendingInviteToken(null)
              }}
            >
              Clear
            </button>
          </div>
        )}

        <div className="mb-7 flex flex-col items-center gap-2">
          <img src={handIcon} alt="" className="h-8 w-auto mb-1" />
          <h1 className="text-[22px] font-semibold text-foreground tracking-[-0.01em]">Create your Kanwas account</h1>
          <p className="text-[13px] text-foreground-muted text-center leading-snug">
            Start with Google or create an account with email
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignup}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-[10px] text-sm font-medium text-foreground bg-[var(--palette-cool-gray)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity hover:opacity-80"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {isLoading ? 'Creating account...' : 'Sign up with Google'}
        </button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#dcd2bf]" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 text-[12px] text-foreground-muted bg-canvas">or continue with email</span>
          </div>
        </div>

        <form className="space-y-2.5" onSubmit={handleSubmit}>
          {!pendingInviteToken && (
            <div>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) {
                    setNameError(null)
                  }
                }}
                className={inputClass}
                placeholder="Your name"
                aria-label="Name"
              />
              {nameError && <p className="mt-1.5 text-xs text-status-error">{nameError}</p>}
            </div>
          )}

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Your email address"
            aria-label="Email address"
          />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Password"
            aria-label="Password"
          />
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="Confirm password"
            aria-label="Confirm password"
          />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-[10px] text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90 cursor-pointer"
            style={{ background: 'linear-gradient(180deg, #5a5a5a 0%, #2e2e2e 100%)', border: '1px solid #525252' }}
          >
            {isLoading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] text-foreground-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground hover:opacity-70 transition-opacity">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
