import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MenuIcon } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '#/components/ui/navigation-menu'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '#/components/ui/sheet'

const terminals = [
  {
    title: 'The Gate',
    description: 'Entry terminal for NFC check-in',
    href: '/terminal/gate',
  },
  {
    title: 'The Terminal',
    description: 'Exit terminal with tariff calculation',
    href: '/terminal/exit',
  },
  {
    title: 'The Station',
    description: 'Desktop terminal for top-ups & card ops',
    href: '/terminal/station',
  },
  {
    title: 'The Scout',
    description: 'Mobile admin for field operations',
    href: '/terminal/scout',
  },
] as const

export default function Header() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold no-underline"
        >
          <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
          Koperasi Kegelapan
        </Link>

        {/* Desktop nav */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link to="/">
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  Home
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <Link to="/register">
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  Register
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <Link to="/admin">
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  Admin
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>Terminals</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[340px] gap-1 p-2">
                  {terminals.map((t) => (
                    <li key={t.href}>
                      <Link to={t.href}>
                        <NavigationMenuLink className="flex flex-col gap-1 rounded-md p-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                          <span className="font-medium">{t.title}</span>
                          <span className="text-muted-foreground">
                            {t.description}
                          </span>
                        </NavigationMenuLink>
                      </Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Mobile hamburger */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <MenuIcon className="size-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>

              <div className="flex flex-col gap-1 px-2">
                <SheetClose asChild>
                  <Link
                    to="/"
                    className="rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors hover:bg-accent"
                  >
                    Home
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/register"
                    className="rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors hover:bg-accent"
                  >
                    Register
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    to="/admin"
                    className="rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors hover:bg-accent"
                  >
                    Admin
                  </Link>
                </SheetClose>

                <div className="my-2 border-t" />
                <span className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Terminals
                </span>

                {terminals.map((t) => (
                  <SheetClose asChild key={t.href}>
                    <Link
                      to={t.href}
                      className="rounded-md px-3 py-2 text-sm no-underline transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{t.title}</span>
                      <span className="ml-1 text-muted-foreground">
                        — {t.description}
                      </span>
                    </Link>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
