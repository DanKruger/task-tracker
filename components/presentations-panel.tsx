"use client"

import { useEffect, useMemo, useState } from "react"
import PptxGenJS from "pptxgenjs"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  CalendarBlank,
  GearSix,
  PresentationChart,
  Slideshow,
  TrendUp,
} from "@phosphor-icons/react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { auth, db } from "@/lib/firebase"
import { Skeleton } from "@/components/ui/skeleton"
import { useUserSettings } from "@/components/user-settings-provider"

type TaskStatus = "in_progress" | "testing" | "done"

type TaskItem = {
  id: string
  title: string
  status: TaskStatus
  durationMinutes: number
  description?: string
  link?: string
  createdAt: string
}

type TaskWithDate = TaskItem & {
  dayDate: string
}

type TaskDayDoc = {
  tasks?: TaskItem[]
}

type SprintPreset = 7 | 14

type DeckSettings = {
  includeDescriptions: boolean
  includeLinks: boolean
  includeSummarySlide: boolean
  includeStatusSlide: boolean
  includeThankYouSlide: boolean
}

function todayIsoDate() {
  const now = new Date()
  const tzOffset = now.getTimezoneOffset() * 60 * 1000
  return new Date(Date.now() - tzOffset).toISOString().slice(0, 10)
}

function buildRangeDates(endDateIso: string, days: number) {
  const endDate = new Date(`${endDateIso}T00:00:00`)
  const dates: string[] = []

  for (let i = days - 1; i >= 0; i -= 1) {
    const current = new Date(endDate)
    current.setDate(endDate.getDate() - i)
    const iso = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`
    dates.push(iso)
  }

  return dates
}

function shortStatus(status: TaskStatus) {
  if (status === "in_progress") return "In progress"
  if (status === "testing") return "Testing"
  return "Done"
}

function addFooter(slide: PptxGenJS.Slide, subtitle: string) {
  slide.addText(subtitle, {
    x: 0.6,
    y: 6.95,
    w: 12.1,
    h: 0.25,
    fontSize: 10,
    color: "6B7280",
    align: "right",
  })
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

function formatDuration(minutes: number, unit: "minutes" | "hours") {
  if (unit === "hours") {
    return (minutes / 60).toFixed(2)
  }
  return String(minutes)
}

export function PresentationsPanel() {
  const router = useRouter()
  const { timeUnit } = useUserSettings()

  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [presetDays, setPresetDays] = useState<SprintPreset>(7)
  const [endDate, setEndDate] = useState(todayIsoDate)
  const [tasks, setTasks] = useState<TaskWithDate[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deckSettings, setDeckSettings] = useState<DeckSettings>({
    includeDescriptions: true,
    includeLinks: true,
    includeSummarySlide: true,
    includeStatusSlide: true,
    includeThankYouSlide: true,
  })

  const rangeDates = useMemo(
    () => buildRangeDates(endDate, presetDays),
    [endDate, presetDays]
  )

  const metrics = useMemo(() => {
    const totalTasks = tasks.length
    const totalMinutes = tasks.reduce(
      (sum, task) => sum + (Number(task.durationMinutes) || 0),
      0
    )
    const doneCount = tasks.filter((task) => task.status === "done").length
    const testingCount = tasks.filter((task) => task.status === "testing").length
    const inProgressCount = tasks.filter((task) => task.status === "in_progress").length
    const doneRate = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0

    const byDay = rangeDates.map((date) => {
      const dayTasks = tasks.filter((task) => task.dayDate === date)
      const dayMinutes = dayTasks.reduce(
        (sum, task) => sum + (Number(task.durationMinutes) || 0),
        0
      )
      return { date, count: dayTasks.length, minutes: dayMinutes }
    }).filter((day) => day.count > 0)

    return {
      totalTasks,
      totalMinutes,
      doneCount,
      testingCount,
      inProgressCount,
      doneRate,
      byDay,
    }
  }, [rangeDates, tasks])

  const totalTimeLabel = useMemo(() => {
    if (timeUnit === "hours") {
      return `${(metrics.totalMinutes / 60).toFixed(2)} h`
    }
    return `${metrics.totalMinutes} min`
  }, [metrics.totalMinutes, timeUnit])

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

    async function loadSprintTasks() {
      setLoadingData(true)
      setStatusMessage(null)

      try {
        const docs = await Promise.all(
          rangeDates.map(async (date) => {
            const dayRef = doc(db, "users", uid, "taskDays", date)
            const snapshot = await getDoc(dayRef)
            return { date, snapshot }
          })
        )

        const nextTasks: TaskWithDate[] = []

        docs.forEach(({ date, snapshot }) => {
          if (!snapshot.exists()) return
          const data = snapshot.data() as TaskDayDoc
          const dayTasks = Array.isArray(data.tasks) ? data.tasks : []
          dayTasks.forEach((task) => {
            nextTasks.push({ ...task, dayDate: date })
          })
        })

        nextTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setTasks(nextTasks)
      } catch {
        setStatusMessage("Failed to load sprint data.")
      } finally {
        setLoadingData(false)
      }
    }

    void loadSprintTasks()
  }, [rangeDates, user])

  async function handleSignOut() {
    try {
      await signOut(auth)
      router.replace("/login")
    } catch {
      setStatusMessage("Sign-out failed.")
    }
  }

  async function generateDeck() {
    if (tasks.length === 0) {
      setStatusMessage("No tasks in selected sprint range.")
      return
    }

    setGenerating(true)
    setStatusMessage(null)

    try {
      const startDate = rangeDates[0]
      const end = rangeDates[rangeDates.length - 1]
      const sprintLabel = `${startDate} to ${end}`
      const presenterName = user?.displayName || user?.email || "Team member"

      const pptx = new PptxGenJS()
      pptx.layout = "LAYOUT_WIDE"
      pptx.author = user?.email ?? "Task Tracker"
      pptx.subject = `Sprint report (${presetDays} days)`
      pptx.title = `Sprint Report - ${sprintLabel}`
      pptx.company = "Task Tracker"

      const titleSlide = pptx.addSlide()
      titleSlide.background = { color: "0F172A" }
      titleSlide.addText("Sprint presentation", {
        x: 0.7,
        y: 1.8,
        w: 11.8,
        h: 0.8,
        fontSize: 44,
        bold: true,
        color: "F8FAFC",
      })
      titleSlide.addText(`${presetDays}-day window`, {
        x: 0.7,
        y: 2.7,
        w: 6,
        h: 0.4,
        fontSize: 20,
        color: "93C5FD",
      })
      titleSlide.addText(sprintLabel, {
        x: 0.7,
        y: 3.25,
        w: 8,
        h: 0.4,
        fontSize: 18,
        color: "CBD5E1",
      })
      titleSlide.addText(`Presented by: ${presenterName}`, {
        x: 0.7,
        y: 6.45,
        w: 11,
        h: 0.35,
        fontSize: 16,
        bold: true,
        color: "94A3B8",
      })

      if (deckSettings.includeSummarySlide) {
        const summarySlide = pptx.addSlide()
        summarySlide.background = { color: "F8FAFC" }
        summarySlide.addText("Sprint Summary", {
          x: 0.6,
          y: 0.4,
          w: 8,
          h: 0.5,
          fontSize: 30,
          bold: true,
          color: "0F172A",
        })

        const cards = [
          { label: "Total tasks", value: String(metrics.totalTasks) },
          {
            label:
              timeUnit === "hours" ? "Total hours" : "Total minutes",
            value:
              timeUnit === "hours"
                ? (metrics.totalMinutes / 60).toFixed(2)
                : String(metrics.totalMinutes),
          },
          { label: "Done tasks", value: String(metrics.doneCount) },
          { label: "Done rate", value: `${metrics.doneRate}%` },
        ]

        cards.forEach((card, index) => {
          const x = 0.7 + (index % 2) * 6.25
          const y = 1.3 + Math.floor(index / 2) * 2.25
          summarySlide.addShape(pptx.ShapeType.roundRect, {
            x,
            y,
            w: 5.8,
            h: 1.8,
            fill: { color: "E2E8F0" },
            line: { color: "CBD5E1", pt: 1 },
          })
          summarySlide.addText(card.label, {
            x: x + 0.3,
            y: y + 0.35,
            w: 5.2,
            h: 0.4,
            fontSize: 14,
            color: "475569",
          })
          summarySlide.addText(card.value, {
            x: x + 0.3,
            y: y + 0.8,
            w: 5.2,
            h: 0.7,
            fontSize: 32,
            bold: true,
            color: "0F172A",
          })
        })

        addFooter(summarySlide, "Generated from Task Tracker")
      }

      if (deckSettings.includeStatusSlide) {
        const statusSlide = pptx.addSlide()
        statusSlide.background = { color: "FFFFFF" }
        statusSlide.addText("Status Breakdown", {
          x: 0.6,
          y: 0.4,
          w: 7,
          h: 0.5,
          fontSize: 28,
          bold: true,
          color: "0F172A",
        })

        statusSlide.addChart(
          pptx.ChartType.pie,
          [
            {
              name: "Tasks",
              labels: ["Done", "Testing", "In progress"],
              values: [
                metrics.doneCount,
                metrics.testingCount,
                metrics.inProgressCount,
              ],
            },
          ],
          {
            x: 0.9,
            y: 1.2,
            w: 7.5,
            h: 4.8,
            showLegend: true,
            legendPos: "r",
          }
        )

        statusSlide.addShape(pptx.ShapeType.roundRect, {
          x: 8.9,
          y: 1.45,
          w: 3.2,
          h: 3.8,
          fill: { color: "F8FAFC" },
          line: { color: "CBD5E1", pt: 1 },
        })
        statusSlide.addText(
          `Done: ${metrics.doneCount}\nTesting: ${metrics.testingCount}\nIn progress: ${metrics.inProgressCount}`,
          {
            x: 9.2,
            y: 1.85,
            w: 2.6,
            h: 2.8,
            fontSize: 16,
            color: "334155",
            breakLine: true,
          }
        )

        addFooter(statusSlide, sprintLabel)
      }

      rangeDates.forEach((date) => {
        const dayTasks = tasks
          .filter((task) => task.dayDate === date)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

        if (dayTasks.length === 0) {
          return
        }

        const tableRows = dayTasks.map((task) => [
          { text: task.title || "-" },
          { text: shortStatus(task.status) },
          {
            text: formatDuration(
              Number(task.durationMinutes) || 0,
              timeUnit
            ),
          },
          ...(deckSettings.includeDescriptions
            ? [{ text: task.description || "-" }]
            : []),
          ...(deckSettings.includeLinks ? [{ text: task.link ? "Yes" : "-" }] : []),
        ])

        const tablePages = chunkArray(tableRows, 12)

        tablePages.forEach((pageRows, pageIndex) => {
          const daySlide = pptx.addSlide()
          daySlide.background = { color: "FFFFFF" }
          daySlide.addText(`Tasks for ${date}`, {
            x: 0.6,
            y: 0.4,
            w: 8,
            h: 0.5,
            fontSize: 28,
            bold: true,
            color: "0F172A",
          })
          daySlide.addText(
              `${dayTasks.length} task(s) • ${
              timeUnit === "hours"
                ? `${(
                    dayTasks.reduce(
                      (sum, task) => sum + (Number(task.durationMinutes) || 0),
                      0
                    ) / 60
                  ).toFixed(2)} hour(s)`
                : `${dayTasks.reduce(
                    (sum, task) => sum + (Number(task.durationMinutes) || 0),
                    0
                  )} minute(s)`
            }`,
            {
              x: 0.6,
              y: 0.92,
              w: 7,
              h: 0.3,
              fontSize: 12,
              color: "64748B",
            }
          )

          daySlide.addTable(
            [
              [
                {
                  text: "Task",
                  options: { bold: true, color: "FFFFFF", fill: { color: "1D4ED8" } },
                },
                {
                  text: "Status",
                  options: { bold: true, color: "FFFFFF", fill: { color: "1D4ED8" } },
                },
                {
                  text: timeUnit === "hours" ? "Time (hrs)" : "Time (min)",
                  options: { bold: true, color: "FFFFFF", fill: { color: "1D4ED8" } },
                },
                ...(deckSettings.includeDescriptions
                  ? [
                      {
                        text: "Description",
                        options: {
                          bold: true,
                          color: "FFFFFF",
                          fill: { color: "1D4ED8" },
                        },
                      },
                    ]
                  : []),
                ...(deckSettings.includeLinks
                  ? [
                      {
                        text: "Link",
                        options: {
                          bold: true,
                          color: "FFFFFF",
                          fill: { color: "1D4ED8" },
                        },
                      },
                    ]
                  : []),
              ],
              ...pageRows,
            ],
            {
              x: 0.65,
              y: 1.3,
              w: 12,
              h: 5.8,
              border: { pt: 1, color: "CBD5E1" },
              fill: { color: "FFFFFF" },
              color: "0F172A",
              fontSize: 11,
              valign: "middle",
            }
          )

          const pageLabel =
            tablePages.length > 1
              ? `${date} • page ${pageIndex + 1}/${tablePages.length}`
              : date
          addFooter(daySlide, pageLabel)
        })
      })

      if (deckSettings.includeThankYouSlide) {
        const thankYouSlide = pptx.addSlide()
        thankYouSlide.background = { color: "0B1220" }
        thankYouSlide.addText("Thank you", {
          x: 0.7,
          y: 2.4,
          w: 11.8,
          h: 0.9,
          fontSize: 56,
          bold: true,
          color: "F8FAFC",
          align: "center",
        })
        thankYouSlide.addText("Questions?", {
          x: 0.7,
          y: 3.5,
          w: 11.8,
          h: 0.5,
          fontSize: 24,
          color: "93C5FD",
          align: "center",
        })
        addFooter(thankYouSlide, sprintLabel)
      }

      const fileName = `Sprint-Report-${startDate}-to-${end}.pptx`
      await pptx.writeFile({ fileName })
      setStatusMessage(`Presentation exported: ${fileName}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown generation error"
      setStatusMessage(`Failed to generate presentation file: ${message}`)
    } finally {
      setGenerating(false)
    }
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
            <PresentationChart className="size-5" />
            Sprint Presentations
          </CardTitle>
          <CardDescription>
            Generate a downloadable slideshow for your sprint updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="preset-days">Sprint preset</Label>
              <select
                id="preset-days"
                value={presetDays}
                onChange={(event) => setPresetDays(Number(event.target.value) as SprintPreset)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value={7}>1 week (7 days)</option>
                <option value={14}>2 weeks (14 days)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="w-full"
              >
                <GearSix className="size-4" />
                Deck settings
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                onClick={() => void generateDeck()}
                disabled={loadingData || generating || tasks.length === 0}
                className="w-full"
              >
                <Slideshow className="size-4" />
                {generating ? "Generating..." : "Generate slide deck (.pptx)"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Range</p>
              <p className="mt-1 text-sm font-medium">
                <CalendarBlank className="mr-1 inline size-4 align-text-bottom" />
                {rangeDates[0]} to {rangeDates[rangeDates.length - 1]}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Tasks</p>
              <p className="mt-1 text-2xl font-semibold">{metrics.totalTasks}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                {timeUnit === "hours" ? "Hours" : "Minutes"}
              </p>
              <p className="mt-1 text-2xl font-semibold">{totalTimeLabel}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Done rate</p>
              <p className="mt-1 text-2xl font-semibold">{metrics.doneRate}%</p>
              <TrendUp className="mt-1 size-4 text-muted-foreground" />
            </div>
          </div>

          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Tasks</th>
                  <th className="px-4 py-3 font-medium">
                    {timeUnit === "hours" ? "Hours" : "Minutes"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingData ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-sprint-${index}`} className="border-t">
                      <td colSpan={3} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  metrics.byDay.map((day) => (
                    <tr key={day.date} className="border-t">
                      <td className="px-4 py-3">{day.date}</td>
                      <td className="px-4 py-3">{day.count}</td>
                      <td className="px-4 py-3">
                        {timeUnit === "hours"
                          ? (day.minutes / 60).toFixed(2)
                          : day.minutes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Slide generation settings</CardTitle>
              <CardDescription>
                Configure what the generated sprint deck should include.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Time display is controlled globally in Settings and currently uses{" "}
                <span className="font-medium text-foreground">
                  {timeUnit === "hours" ? "hours" : "minutes"}
                </span>
                .
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="setting-descriptions">Include descriptions</Label>
                  <Switch
                    id="setting-descriptions"
                    checked={deckSettings.includeDescriptions}
                    onCheckedChange={(checked) =>
                      setDeckSettings((prev) => ({
                        ...prev,
                        includeDescriptions: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="setting-links">Include links column</Label>
                  <Switch
                    id="setting-links"
                    checked={deckSettings.includeLinks}
                    onCheckedChange={(checked) =>
                      setDeckSettings((prev) => ({
                        ...prev,
                        includeLinks: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="setting-summary">Include summary slide</Label>
                  <Switch
                    id="setting-summary"
                    checked={deckSettings.includeSummarySlide}
                    onCheckedChange={(checked) =>
                      setDeckSettings((prev) => ({
                        ...prev,
                        includeSummarySlide: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="setting-status">Include status slide</Label>
                  <Switch
                    id="setting-status"
                    checked={deckSettings.includeStatusSlide}
                    onCheckedChange={(checked) =>
                      setDeckSettings((prev) => ({
                        ...prev,
                        includeStatusSlide: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <Label htmlFor="setting-thank-you">Include thank-you slide</Label>
                  <Switch
                    id="setting-thank-you"
                    checked={deckSettings.includeThankYouSlide}
                    onCheckedChange={(checked) =>
                      setDeckSettings((prev) => ({
                        ...prev,
                        includeThankYouSlide: checked,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {statusMessage ? <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p> : null}
    </AppShell>
  )
}
