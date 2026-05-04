interface NavBarProps {
  appName: string
  user: { name: string; email: string }
  onSignOut: () => void
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

export default function NavBar({ appName, user, onSignOut }: NavBarProps) {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <img
          src="/assets/improving-logo-simple.png"
          alt="Improving"
          className="nav-brand-logo"
        />
        <span className="nav-brand-sep" />
        <span className="nav-brand-app">{appName}</span>
      </div>
      <div className="nav-right">
        <div className="btn-user">
          <div className="btn-user-avatar">{initials(user.name)}</div>
          {user.name}
        </div>
        <button className="btn-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
