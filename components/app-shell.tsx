"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AppShellProps = {
  userEmail?: string | null
  onLogout: () => Promise<void> | void
  children: React.ReactNode
}

const navItems = [
  { href: "/home", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/presentations", label: "Presentations" },
]

export function AppShell({ userEmail, onLogout, children }: AppShellProps) {
  const pathname = usePathname()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  return (
    <div className="min-h-svh bg-muted/20 p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] w-full max-w-7xl overflow-hidden rounded-2xl border bg-background shadow-sm md:min-h-[calc(100svh-3rem)]">
        <aside className="flex w-full max-w-72 flex-col border-r p-4 md:p-5">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
            <h1 className="mt-1 text-lg font-semibold">Task Tracker</h1>
            <p className="text-sm text-muted-foreground">Placeholder title</p>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="truncate text-sm font-medium">{userEmail ?? "..."}</p>
            </button>

            {menuOpen ? (
              <div className="mt-2 rounded-lg border bg-popover p-1 shadow-sm">
                <Button
                  variant="ghost"
                  className="h-8 w-full justify-start rounded-md text-sm"
                  onClick={() => {
                    setMenuOpen(false)
                    void onLogout()
                  }}
                >
                  Logout
                </Button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
