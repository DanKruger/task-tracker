"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { GearSix } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type TimeDisplayUnit,
  useUserSettings,
} from "@/components/user-settings-provider"
import { auth } from "@/lib/firebase"

export function SettingsPanel() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const { timeUnit, loadingSettings, updateTimeUnit } = useUserSettings()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoadingAuth(false)

      if (!nextUser) {
        router.replace("/login")
      }
    })

    return unsubscribe
  }, [router])

  async function handleSignOut() {
    try {
      await signOut(auth)
      router.replace("/login")
    } catch {
      setStatusMessage("Sign-out failed.")
    }
  }

  async function handleTimeUnitChange(next: TimeDisplayUnit) {
    setStatusMessage(null)
    await updateTimeUnit(next)
    setStatusMessage("Settings saved.")
  }

  return (
    <AppShell
      userEmail={user?.email}
      userName={user?.displayName}
      userAvatarUrl={user?.photoURL}
      onLogout={handleSignOut}
    >
      {loadingAuth ? (
        <div className="mb-4 rounded-lg border p-4">
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GearSix className="size-5" />
            Settings
          </CardTitle>
          <CardDescription>
            Configure how information is displayed across your app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-64" />
            </div>
          ) : (
            <div className="max-w-md space-y-3">
              <Label htmlFor="time-unit-setting">Time display unit</Label>
              <select
                id="time-unit-setting"
                value={timeUnit}
                onChange={(event) =>
                  void handleTimeUnitChange(event.target.value as TimeDisplayUnit)
                }
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
              <p className="text-xs text-muted-foreground">
                This controls time display in Home, Dashboard, and Presentations.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {statusMessage ? <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p> : null}
    </AppShell>
  )
}
