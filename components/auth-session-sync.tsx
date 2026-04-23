"use client"

import { useEffect } from "react"
import { onIdTokenChanged } from "firebase/auth"

import { auth } from "@/lib/firebase"

export function AuthSessionSync() {
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        document.cookie = "session=; Path=/; Max-Age=0; SameSite=Lax"
        return
      }

      document.cookie = "session=1; Path=/; Max-Age=604800; SameSite=Lax"
    })

    return unsubscribe
  }, [])

  return null
}
