import { Link } from '@tanstack/react-router'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
        <div>
          <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
            MBC System
          </p>
          <p className="m-0 mt-1 text-xs">
            NFC-powered membership management for cooperatives.
          </p>
        </div>

        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link to="/register" className="hover:text-[var(--sea-ink)]">
            Register
          </Link>
          <Link to="/admin" className="hover:text-[var(--sea-ink)]">
            Admin
          </Link>
          <Link to="/terminal/gate" className="hover:text-[var(--sea-ink)]">
            Gate
          </Link>
          <Link to="/terminal/exit" className="hover:text-[var(--sea-ink)]">
            Terminal
          </Link>
          <Link to="/terminal/station" className="hover:text-[var(--sea-ink)]">
            Station
          </Link>
          <Link to="/terminal/scout" className="hover:text-[var(--sea-ink)]">
            Scout
          </Link>
        </nav>
      </div>

      <div className="page-wrap mt-6 flex flex-col items-center justify-between gap-2 text-xs sm:flex-row">
        <p className="m-0">&copy; {year} MBC System. All rights reserved.</p>
        <p className="island-kicker m-0">Offline-First · Multi-Tenant · Secure</p>
      </div>
    </footer>
  )
}
