"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signInWithRedirect } from "firebase/auth"
import { FcGoogle } from "react-icons/fc"
import { useRouter } from "next/navigation"

import { formatFirebaseAuthError } from "@/components/firebase-auth-error"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { auth, googleProvider } from "@/lib/firebase"

export function LoginPanel() {
  const router = useRouter()
  const [status, setStatus] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/home")
        return
      }

      setLoadingAuth(false)
    })

    return unsubscribe
  }, [router])

  async function handleGoogleSignInPopup() {
    try {
      setStatus(null)
      await signInWithPopup(auth, googleProvider)
      router.replace("/home")
    } catch (error) {
      setStatus(formatFirebaseAuthError(error))
    }
  }

  async function handleGoogleSignInRedirect() {
    try {
      setStatus(null)
      await signInWithRedirect(auth, googleProvider)
    } catch (error) {
      setStatus(formatFirebaseAuthError(error))
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/20 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_42%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.09),transparent_45%)]" />

      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Welcome back
          </p>
          <CardTitle className="text-2xl">Task Tracker</CardTitle>
          <CardDescription>
            Sign in to view your tasks, dashboard metrics, and sprint presentations.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {loadingAuth ? (
            <p className="text-sm">Checking auth session...</p>
          ) : (
            <>
              <Button onClick={handleGoogleSignInPopup} className="w-full" size="lg">
                <FcGoogle className="size-4" />
                Login with Google
              </Button>
              <Button
                variant="outline"
                onClick={handleGoogleSignInRedirect}
                className="w-full"
              >
                Having popup issues? Use redirect login
              </Button>
            </>
          )}

          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
