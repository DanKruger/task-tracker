"use client"

import { useEffect, useState } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { formatFirebaseAuthError } from "@/components/firebase-auth-error"
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
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Google to continue.
        </p>

        <div className="mt-6 space-y-2">
          {loadingAuth ? (
            <p className="text-sm">Checking auth session...</p>
          ) : (
            <>
              <Button onClick={handleGoogleSignInPopup} className="w-full">
                Sign in with Google (Popup)
              </Button>
              <Button
                variant="outline"
                onClick={handleGoogleSignInRedirect}
                className="w-full"
              >
                Sign in with Google (Redirect)
              </Button>
            </>
          )}
        </div>

        {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
      </div>
    </div>
  )
}
