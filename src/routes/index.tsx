import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
        <p className="island-kicker mb-3">Membership Benefit Card</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          NFC-powered membership for cooperatives.
        </h1>
        <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
          Manage members, process check-ins and check-outs, handle top-ups, and
          track revenue — all with offline-first NFC card operations across
          multiple cooperatives.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/register"
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
          >
            Member Registration
          </Link>
          <Link
            to="/admin"
            className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
          >
            Admin Dashboard
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            'The Gate',
            'Entry terminal for NFC check-in with balance validation and tenant verification.',
            '/terminal/gate',
          ],
          [
            'The Terminal',
            'Exit terminal with automatic tariff calculation and balance deduction.',
            '/terminal/exit',
          ],
          [
            'The Station',
            'Desktop terminal for top-ups, card issuance, status resets, and card viewing.',
            '/terminal/station',
          ],
          [
            'The Scout',
            'Mobile admin terminal for field operations with multi-tenant support.',
            '/terminal/scout',
          ],
        ].map(([title, desc, href], index) => (
          <Link
            key={title}
            to={href!}
            className="island-shell feature-card rise-in block rounded-2xl p-5 no-underline"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
              {title}
            </h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{desc}</p>
          </Link>
        ))}
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          [
            'Offline-First',
            'Card operations work without network. Transactions sync automatically when connectivity returns.',
          ],
          [
            'Multi-Tenant',
            'Each cooperative manages its own members, terminals, tariffs, and encryption keys.',
          ],
          [
            'Secure by Design',
            'AES-GCM encrypted card data with HMAC tamper detection and key rotation support.',
          ],
        ].map(([title, desc], index) => (
          <article
            key={title}
            className="island-shell rise-in rounded-2xl p-5"
            style={{ animationDelay: `${index * 90 + 440}ms` }}
          >
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
              {title}
            </h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{desc}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
