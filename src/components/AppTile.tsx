interface AppTileProps {
  icon: string
  name: string
  href: string
}

export default function AppTile({ icon, name, href }: AppTileProps) {
  return (
    <a href={href} className="app-tile">
      <div className="app-tile-icon">{icon}</div>
      <div className="app-tile-name">{name}</div>
    </a>
  )
}
