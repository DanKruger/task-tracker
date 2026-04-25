"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

import { auth, db } from "@/lib/firebase"

export type TimeDisplayUnit = "minutes" | "hours"

type UserSettingsContextValue = {
  timeUnit: TimeDisplayUnit
  loadingSettings: boolean
  updateTimeUnit: (nextUnit: TimeDisplayUnit) => Promise<void>
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null)

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [timeUnit, setTimeUnit] = useState<TimeDisplayUnit>("minutes")
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setTimeUnit("minutes")
        setLoadingSettings(false)
        return
      }

      try {
        const settingsRef = doc(db, "users", user.uid)
        const snapshot = await getDoc(settingsRef)
        const data = snapshot.data() as { timeUnit?: TimeDisplayUnit } | undefined

        if (data?.timeUnit === "hours" || data?.timeUnit === "minutes") {
          setTimeUnit(data.timeUnit)
        } else {
          setTimeUnit("minutes")
        }
      } catch {
        setTimeUnit("minutes")
      } finally {
        setLoadingSettings(false)
      }
    })

    return unsubscribe
  }, [])

  const updateTimeUnit = useCallback(async (nextUnit: TimeDisplayUnit) => {
    const user = auth.currentUser
    if (!user) return

    const prevUnit = timeUnit
    setTimeUnit(nextUnit)

    try {
      const settingsRef = doc(db, "users", user.uid)
      await setDoc(
        settingsRef,
        {
          timeUnit: nextUnit,
          settingsUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch {
      setTimeUnit(prevUnit)
    }
  }, [timeUnit])

  const value = useMemo(
    () => ({ timeUnit, loadingSettings, updateTimeUnit }),
    [loadingSettings, timeUnit, updateTimeUnit]
  )

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  )
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext)
  if (!context) {
    throw new Error("useUserSettings must be used within UserSettingsProvider")
  }
  return context
}
