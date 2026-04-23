"use client"

import { useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { collection, getDocs } from "firebase/firestore"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { auth, db } from "@/lib/firebase"

type TaskStatus = "in_progress" | "testing" | "done"

type TaskItem = {
  id: string
  title: string
  status: TaskStatus
  durationMinutes: number
  createdAt: string
}

type TaskDayDoc = {
  date?: string
  tasks?: TaskItem[]
}

type DayMetric = {
  date: string
  count: number
  minutes: number
}

type TaskWithDate = TaskItem & {
  dayDate: string
}

type PeriodMetric = {
  label: string
  count: number
  minutes: number
}

function monthLabel(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  })
}

function mondayOfWeek(dateString: string) {
  const base = new Date(`${dateString}T00:00:00`)
  const day = base.getDay()
  const diff = (day + 6) % 7
  base.setDate(base.getDate() - diff)
  return base
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function DashboardPanel() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskWithDate[]>([])
  const [dailyMetrics, setDailyMetrics] = useState<DayMetric[]>([])

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

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    async function loadMetrics() {
      setLoading(true)
      setStatusMessage(null)

      try {
        const dayCollection = collection(db, "users", uid, "taskDays")
        const snapshot = await getDocs(dayCollection)

        const allTasks: TaskWithDate[] = []
        const byDay: DayMetric[] = []

        snapshot.forEach((dayDoc) => {
          const data = dayDoc.data() as TaskDayDoc
          const dayTasks = Array.isArray(data.tasks) ? data.tasks : []
          const date = data.date ?? dayDoc.id
          const minutes = dayTasks.reduce(
            (sum, task) => sum + (Number(task.durationMinutes) || 0),
            0
          )

          byDay.push({ date, count: dayTasks.length, minutes })
          allTasks.push(...dayTasks.map((task) => ({ ...task, dayDate: date })))
        })

        byDay.sort((a, b) => b.date.localeCompare(a.date))
        allTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

        setDailyMetrics(byDay)
        setTasks(allTasks)
      } catch {
        setStatusMessage("Failed to load dashboard metrics.")
      } finally {
        setLoading(false)
      }
    }

    void loadMetrics()
  }, [user])

  const totalTasks = tasks.length
  const totalMinutes = useMemo(
    () => tasks.reduce((sum, task) => sum + (Number(task.durationMinutes) || 0), 0),
    [tasks]
  )
  const avgMinutes = totalTasks > 0 ? Math.round(totalMinutes / totalTasks) : 0

  const doneCount = tasks.filter((task) => task.status === "done").length
  const testingCount = tasks.filter((task) => task.status === "testing").length
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length
  const doneRate = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0

  const weeklyMetrics = useMemo(() => {
    const byWeek = new Map<string, PeriodMetric>()

    tasks.forEach((task) => {
      const monday = mondayOfWeek(task.dayDate)
      const key = dateKey(monday)
      const existing = byWeek.get(key)

      if (existing) {
        existing.count += 1
        existing.minutes += Number(task.durationMinutes) || 0
      } else {
        byWeek.set(key, {
          label: key,
          count: 1,
          minutes: Number(task.durationMinutes) || 0,
        })
      }
    })

    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([, value]) => value)
  }, [tasks])

  const monthlyMetrics = useMemo(() => {
    const byMonth = new Map<string, PeriodMetric>()

    tasks.forEach((task) => {
      const date = new Date(`${task.dayDate}T00:00:00`)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const existing = byMonth.get(key)

      if (existing) {
        existing.count += 1
        existing.minutes += Number(task.durationMinutes) || 0
      } else {
        byMonth.set(key, {
          label: monthLabel(date),
          count: 1,
          minutes: Number(task.durationMinutes) || 0,
        })
      }
    })

    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, value]) => value)
  }, [tasks])

  const maxWeekMinutes = Math.max(...weeklyMetrics.map((metric) => metric.minutes), 1)
  const maxMonthMinutes = Math.max(...monthlyMetrics.map((metric) => metric.minutes), 1)

  async function handleSignOut() {
    try {
      await signOut(auth)
      router.replace("/login")
    } catch {
      setStatusMessage("Sign-out failed.")
    }
  }

  return (
    <AppShell userEmail={user?.email} onLogout={handleSignOut}>
      {loadingAuth ? <p className="mb-4 text-sm">Checking auth session...</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tasks</CardDescription>
            <CardTitle className="text-2xl">{totalTasks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total minutes</CardDescription>
            <CardTitle className="text-2xl">{totalMinutes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average time per task</CardDescription>
            <CardTitle className="text-2xl">{avgMinutes} min</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Done rate</CardDescription>
            <CardTitle className="text-2xl">{doneRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Status distribution</CardTitle>
            <CardDescription>Across all tracked tasks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">In progress</p>
                <p className="mt-2 text-xl font-semibold">{inProgressCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Testing</p>
                <p className="mt-2 text-xl font-semibold">{testingCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Done</p>
                <p className="mt-2 text-xl font-semibold">{doneCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top active days</CardTitle>
            <CardDescription>Most recently active dates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-sm text-muted-foreground">Loading metrics...</p> : null}

            {!loading && dailyMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No task data yet.</p>
            ) : null}

            {!loading &&
              dailyMetrics.slice(0, 7).map((day) => (
                <div key={day.date} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{day.date}</p>
                    <p className="text-xs text-muted-foreground">{day.count} task(s)</p>
                  </div>
                  <Badge variant="outline">{day.minutes} min</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly report</CardTitle>
            <CardDescription>Last 8 weeks by total minutes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {weeklyMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekly data yet.</p>
            ) : (
              weeklyMetrics.map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{metric.label}</span>
                    <span>
                      {metric.minutes} min • {metric.count} task(s)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(metric.minutes / maxWeekMinutes) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly report</CardTitle>
            <CardDescription>Last 6 months by total minutes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthlyMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No monthly data yet.</p>
            ) : (
              monthlyMetrics.map((metric) => (
                <div key={metric.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{metric.label}</span>
                    <span>
                      {metric.minutes} min • {metric.count} task(s)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary/80"
                      style={{ width: `${(metric.minutes / maxMonthMinutes) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {statusMessage ? <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p> : null}
    </AppShell>
  )
}
