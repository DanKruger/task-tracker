"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AppShellProps = {
  userEmail?: string | null
  userName?: string | null
  userAvatarUrl?: string | null
  onLogout: () => Promise<void> | void
  children: React.ReactNode
}

const navItems = [
  { href: "/home", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/presentations", label: "Presentations" },
]

function initialsFromUser(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase()
}

export function AppShell({
  userEmail,
  userName,
  userAvatarUrl,
  onLogout,
  children,
}: AppShellProps) {
  const pathname = usePathname()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = initialsFromUser(userName, userEmail)

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
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] w-full max-w-[1600px] overflow-hidden rounded-2xl border bg-background shadow-sm md:min-h-[calc(100svh-3rem)]">
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
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatarUrl}
                  alt="User avatar"
                  className="size-9 rounded-full border object-cover"
                />
              ) : (
                <div className="flex size-9 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName || "Signed in user"}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail ?? "..."}</p>
              </div>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="mt-2 rounded-lg border bg-popover p-1 shadow-sm"
              >
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
