"use client"

import { useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { collection, getDocs } from "firebase/firestore"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

type TimeUnit = "minutes" | "hours"
type HeatMode = "count" | "time"

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

function formatReadableDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDuration(minutes: number, unit: TimeUnit) {
  if (unit === "hours") {
    return `${(minutes / 60).toFixed(2)} h`
  }
  return `${minutes} min`
}

function formatDurationValue(minutes: number, unit: TimeUnit) {
  if (unit === "hours") {
    return (minutes / 60).toFixed(2)
  }
  return String(minutes)
}

function heatLevelClass(level: number) {
  if (level <= 0) return "bg-muted/40"
  if (level === 1) return "bg-emerald-200 dark:bg-emerald-900/40"
  if (level === 2) return "bg-emerald-300 dark:bg-emerald-800/60"
  if (level === 3) return "bg-emerald-500 dark:bg-emerald-700"
  return "bg-emerald-700 dark:bg-emerald-500"
}

export function DashboardPanel() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskWithDate[]>([])
  const [dailyMetrics, setDailyMetrics] = useState<DayMetric[]>([])
  const [timeUnit, setTimeUnit] = useState<TimeUnit>("minutes")
  const [heatMode, setHeatMode] = useState<HeatMode>("count")

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
          if (dayTasks.length === 0) return
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
          label: formatReadableDate(key),
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

  const dayMetricMap = useMemo(() => {
    const map = new Map<string, DayMetric>()
    dailyMetrics.forEach((metric) => map.set(metric.date, metric))
    return map
  }, [dailyMetrics])

  const heatmapWeeks = useMemo(() => {
    const totalDays = 7 * 20
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (totalDays - 1 - index))
      const key = dateKey(date)
      const metric = dayMetricMap.get(key)
      return {
        date: key,
        count: metric?.count ?? 0,
        minutes: metric?.minutes ?? 0,
      }
    })

    const values = days.map((day) => (heatMode === "count" ? day.count : day.minutes))
    const maxValue = Math.max(...values, 1)

    const leveled = days.map((day) => {
      const value = heatMode === "count" ? day.count : day.minutes
      const ratio = value / maxValue
      const level = value === 0 ? 0 : Math.min(4, Math.ceil(ratio * 4))
      return { ...day, value, level }
    })

    const weeks: Array<typeof leveled> = []
    for (let i = 0; i < leveled.length; i += 7) {
      weeks.push(leveled.slice(i, i + 7))
    }

    return weeks
  }, [dayMetricMap, heatMode])

  const heatmapMonthLabels = useMemo(() => {
    let previousMonth = ""
    return heatmapWeeks.map((week) => {
      const firstDay = week[0]
      if (!firstDay) return ""
      const month = new Date(`${firstDay.date}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
      })
      if (month === previousMonth) return ""
      previousMonth = month
      return month
    })
  }, [heatmapWeeks])

  const weekdayLabels = useMemo(() => {
    const firstWeek = heatmapWeeks[0] ?? []
    return firstWeek.map((day) =>
      new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
      })
    )
  }, [heatmapWeeks])

  async function handleSignOut() {
    try {
      await signOut(auth)
      router.replace("/login")
    } catch {
      setStatusMessage("Sign-out failed.")
    }
  }

  return (
    <AppShell
      userEmail={user?.email}
      userName={user?.displayName}
      userAvatarUrl={user?.photoURL}
      onLogout={handleSignOut}
    >
      {loadingAuth ? <p className="mb-4 text-sm">Checking auth session...</p> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Dashboard controls</CardTitle>
            <CardDescription>Adjust units and heatmap mode.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="time-unit-switch">Show time as</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min</span>
                <Switch
                  id="time-unit-switch"
                  checked={timeUnit === "hours"}
                  onCheckedChange={(checked) =>
                    setTimeUnit(checked ? "hours" : "minutes")
                  }
                />
                <span className="text-xs text-muted-foreground">Hours</span>
              </div>
            </div>

          </div>
        </CardHeader>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tasks</CardDescription>
            <CardTitle className="text-2xl">{totalTasks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{timeUnit === "hours" ? "Total hours" : "Total minutes"}</CardDescription>
            <CardTitle className="text-2xl">{formatDurationValue(totalMinutes, timeUnit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average time per task</CardDescription>
            <CardTitle className="text-2xl">{formatDuration(avgMinutes, timeUnit)}</CardTitle>
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
                    <p className="font-medium">{formatReadableDate(day.date)}</p>
                    <p className="text-xs text-muted-foreground">{day.count} task(s)</p>
                  </div>
                  <Badge variant="outline">{formatDuration(day.minutes, timeUnit)}</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Contribution heatmap</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={heatMode === "count" ? "default" : "outline"}
                onClick={() => setHeatMode("count")}
              >
                Task count
              </Button>
              <Button
                size="sm"
                variant={heatMode === "time" ? "default" : "outline"}
                onClick={() => setHeatMode("time")}
              >
                Time spent
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block min-w-max">
                <div className="mb-2 flex gap-2 pl-10 text-[10px] text-muted-foreground">
                  {heatmapMonthLabels.map((month, index) => (
                    <span
                      key={`month-${index}`}
                      className="w-3 text-left leading-3 whitespace-nowrap"
                    >
                      {month}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <div className="w-10 grid grid-rows-7 gap-1 text-[10px] text-muted-foreground">
                    {weekdayLabels.map((label, index) => (
                      <span
                        key={`weekday-${index}`}
                        className="flex h-3 items-center leading-3"
                      >
                        {index % 2 === 0 ? label : ""}
                      </span>
                    ))}
                  </div>

                  <div className="inline-flex gap-1">
                    {heatmapWeeks.map((week, weekIndex) => (
                      <div key={`week-${weekIndex}`} className="grid grid-rows-7 gap-1">
                        {week.map((day) => {
                          const tooltipValue =
                            heatMode === "count"
                              ? `${day.count} task(s)`
                              : formatDuration(day.minutes, timeUnit)

                          return (
                            <div
                              key={day.date}
                              title={`${formatReadableDate(day.date)}: ${tooltipValue}`}
                              className={`size-3 rounded-[3px] ${heatLevelClass(day.level)}`}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    className={`size-3 rounded-[3px] ${heatLevelClass(level)}`}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly report</CardTitle>
            <CardDescription>
              Last 8 weeks by total {timeUnit === "hours" ? "hours" : "minutes"}.
            </CardDescription>
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
                      {formatDuration(metric.minutes, timeUnit)} • {metric.count} task(s)
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
            <CardDescription>
              Last 6 months by total {timeUnit === "hours" ? "hours" : "minutes"}.
            </CardDescription>
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
                      {formatDuration(metric.minutes, timeUnit)} • {metric.count} task(s)
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
