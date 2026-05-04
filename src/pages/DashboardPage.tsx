import { useNavigate } from 'react-router-dom'
import AppTile from '../components/AppTile'
import NavBar from '../components/NavBar'
import { useAuth } from '../context/AuthContext'

const APPS = [
  {
    icon: '📈',
    name: 'Project Revenue Forecasting',
    href: 'https://revenue-analysis-app-production.up.railway.app',
  },
  {
    icon: '👥',
    name: 'Consultant Directory',
    href: 'https://consultant-directory-app-production.up.railway.app',
  },
]

export default function DashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    auth.logout()
    navigate('/')
  }

  // AuthGuard ensures user is non-null by the time we reach this page
  const user = auth.user!

  return (
    <div className="dashboard-root">
      <div className="container">
        <NavBar appName="Project Portal" user={user} onSignOut={handleSignOut} />

        <div className="welcome">
          <div className="welcome-title">Welcome back</div>
          <p className="welcome-sub">Select an application to get started.</p>
        </div>

        <div className="apps-label">Applications</div>
        <div className="app-grid">
          {APPS.map(app => (
            <AppTile key={app.href} icon={app.icon} name={app.name} href={app.href} />
          ))}
        </div>
      </div>
    </div>
  )
}
