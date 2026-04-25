"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { FirebaseError } from "firebase/app"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { useRouter } from "next/navigation"
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ListBullets,
  NotePencil,
  Plus,
  Trash,
} from "@phosphor-icons/react"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

type TaskDayDoc = {
  date: string
  tasks: TaskItem[]
}

type TaskFormState = {
  title: string
  status: TaskStatus
  durationMinutes: string
  description: string
  link: string
}

type TaskFilterStatus = "all" | TaskStatus
type HomeViewMode = "list" | "calendar"

type SortKey =
  | "created_desc"
  | "created_asc"
  | "duration_desc"
  | "duration_asc"
  | "title_asc"
  | "title_desc"

type CalendarDaySummary = {
  count: number
  minutes: number
}

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "testing", label: "Testing" },
  { value: "done", label: "Done" },
]

const emptyTaskForm: TaskFormState = {
  title: "",
  status: "in_progress",
  durationMinutes: "",
  description: "",
  link: "",
}

function todayIsoDate() {
  const now = new Date()
  const tzOffset = now.getTimezoneOffset() * 60 * 1000
  return new Date(Date.now() - tzOffset).toISOString().slice(0, 10)
}

function statusBadgeVariant(status: TaskStatus): "default" | "secondary" | "outline" {
  if (status === "done") return "default"
  if (status === "testing") return "secondary"
  return "outline"
}

function displayStatus(status: TaskStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status
}

function normalizeTaskForm(task: TaskItem): TaskFormState {
  return {
    title: task.title,
    status: task.status,
    durationMinutes: String(task.durationMinutes),
    description: task.description ?? "",
    link: task.link ?? "",
  }
}

function getMonthDateRange(month: string) {
  const [yearRaw, monthRaw] = month.split("-")
  const year = Number(yearRaw)
  const monthIndex = Number(monthRaw) - 1

  const startDate = new Date(year, monthIndex, 1)
  const endDate = new Date(year, monthIndex + 1, 0)
  return { startDate, endDate }
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatMonthLabel(month: string) {
  const [yearRaw, monthRaw] = month.split("-")
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, 1)
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

function generateTaskId() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID()
  }

  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function HomePanel() {
  const router = useRouter()
  const { timeUnit } = useUserSettings()
  const today = todayIsoDate()
  const currentMonth = today.slice(0, 7)

  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [viewMode, setViewMode] = useState<HomeViewMode>("list")
  const [calendarMonth, setCalendarMonth] = useState(() => todayIsoDate().slice(0, 7))
  const [calendarSummaries, setCalendarSummaries] = useState<
    Record<string, CalendarDaySummary>
  >({})

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TaskFilterStatus>("all")
  const [sortKey, setSortKey] = useState<SortKey>("created_desc")

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskModalMode, setTaskModalMode] = useState<"create" | "edit">("create")
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [viewTask, setViewTask] = useState<TaskItem | null>(null)

  const selectedDateSummary = calendarSummaries[selectedDate]

  const calendarGrid = useMemo(() => {
    const { startDate, endDate } = getMonthDateRange(calendarMonth)
    const firstWeekday = startDate.getDay()
    const daysInMonth = endDate.getDate()

    const cells: Array<{ date: string | null; dayNumber: number | null }> = []

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ date: null, dayNumber: null })
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(startDate.getFullYear(), startDate.getMonth(), day)
      cells.push({ date: toIsoDate(date), dayNumber: day })
    }

    while (cells.length % 7 !== 0) {
      cells.push({ date: null, dayNumber: null })
    }

    return cells
  }, [calendarMonth])

  const totalMinutes = useMemo(
    () => tasks.reduce((sum, task) => sum + task.durationMinutes, 0),
    [tasks]
  )
  const totalDurationLabel =
    timeUnit === "hours"
      ? `${(totalMinutes / 60).toFixed(2)} total hour(s)`
      : `${totalMinutes} total minute(s)`

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    const next = tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false
      }

      if (!query) return true

      const haystack = [task.title, task.description ?? "", task.link ?? ""]
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })

    next.sort((a, b) => {
      switch (sortKey) {
        case "created_asc":
          return a.createdAt.localeCompare(b.createdAt)
        case "created_desc":
          return b.createdAt.localeCompare(a.createdAt)
        case "duration_asc":
          return a.durationMinutes - b.durationMinutes
        case "duration_desc":
          return b.durationMinutes - a.durationMinutes
        case "title_asc":
          return a.title.localeCompare(b.title)
        case "title_desc":
          return b.title.localeCompare(a.title)
        default:
          return 0
      }
    })

    return next
  }, [searchQuery, sortKey, statusFilter, tasks])

  const syncCalendarSummaryForDate = useCallback(
    (date: string, dayTasks: TaskItem[]) => {
      if (date.slice(0, 7) !== calendarMonth) {
        return
      }

      const count = dayTasks.length
      const minutes = dayTasks.reduce(
        (sum, task) => sum + (Number(task.durationMinutes) || 0),
        0
      )

      setCalendarSummaries((prev) => {
        const current = prev[date]

        if (count === 0) {
          if (!current) return prev
          const next = { ...prev }
          delete next[date]
          return next
        }

        if (current && current.count === count && current.minutes === minutes) {
          return prev
        }

        return {
          ...prev,
          [date]: { count, minutes },
        }
      })
    },
    [calendarMonth]
  )

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

    async function loadDayTasks() {
      setLoadingTasks(true)
      setStatusMessage(null)

      try {
        const dayRef = doc(db, "users", uid, "taskDays", selectedDate)
        const snapshot = await getDoc(dayRef)

        if (!snapshot.exists()) {
          setTasks([])
          syncCalendarSummaryForDate(selectedDate, [])
          return
        }

        const data = snapshot.data() as Partial<TaskDayDoc>
        const nextTasks = Array.isArray(data.tasks) ? data.tasks : []
        setTasks(nextTasks)
        syncCalendarSummaryForDate(selectedDate, nextTasks)
      } catch {
        setStatusMessage("Failed to load tasks for the selected day.")
      } finally {
        setLoadingTasks(false)
      }
    }

    void loadDayTasks()
  }, [selectedDate, syncCalendarSummaryForDate, user])

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    async function loadCalendarMonthSummaries() {
      try {
        const { startDate, endDate } = getMonthDateRange(calendarMonth)
        const totalDays = endDate.getDate()

        const docs = await Promise.all(
          Array.from({ length: totalDays }, (_, index) => {
            const date = new Date(startDate.getFullYear(), startDate.getMonth(), index + 1)
            const iso = toIsoDate(date)
            const dayRef = doc(db, "users", uid, "taskDays", iso)
            return getDoc(dayRef).then((snapshot) => ({ iso, snapshot }))
          })
        )

        const next: Record<string, CalendarDaySummary> = {}
        docs.forEach(({ iso, snapshot }) => {
          if (!snapshot.exists()) return
          const data = snapshot.data() as Partial<TaskDayDoc>
          const dayTasks = Array.isArray(data.tasks) ? data.tasks : []
          if (dayTasks.length === 0) return
          const minutes = dayTasks.reduce(
            (sum, task) => sum + (Number(task.durationMinutes) || 0),
            0
          )
          next[iso] = { count: dayTasks.length, minutes }
        })

        setCalendarSummaries(next)
      } catch {
        setStatusMessage("Failed to load calendar summaries.")
      }
    }

    void loadCalendarMonthSummaries()
  }, [calendarMonth, user])

  async function persistTasks(nextTasks: TaskItem[]) {
    if (!user) return false

    try {
      const dayRef = doc(db, "users", user.uid, "taskDays", selectedDate)
      if (nextTasks.length === 0) {
        await deleteDoc(dayRef)
        return true
      }
      await setDoc(
        dayRef,
        {
          date: selectedDate,
          tasks: nextTasks,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      return true
    } catch (error) {
      if (error instanceof FirebaseError) {
        setStatusMessage(`Failed to save tasks (${error.code}): ${error.message}`)
      } else {
        setStatusMessage("Failed to save tasks. Check Firestore rules.")
      }
      return false
    }
  }

  function openCreateTaskModal() {
    setTaskModalMode("create")
    setActiveTaskId(null)
    setTaskForm(emptyTaskForm)
    setStatusMessage(null)
    setTaskModalOpen(true)
  }

  function openEditTaskModal(task: TaskItem) {
    setTaskModalMode("edit")
    setActiveTaskId(task.id)
    setTaskForm(normalizeTaskForm(task))
    setStatusMessage(null)
    setTaskModalOpen(true)
  }

  function closeTaskModal() {
    setTaskModalOpen(false)
    setActiveTaskId(null)
    setTaskForm(emptyTaskForm)
  }

  function openTaskViewModal(task: TaskItem) {
    setViewTask(task)
  }

  function goToPreviousMonth() {
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const date = new Date(Number(yearRaw), Number(monthRaw) - 2, 1)
    setCalendarMonth(toIsoDate(date).slice(0, 7))
  }

  function goToNextMonth() {
    if (calendarMonth >= currentMonth) {
      return
    }
    const [yearRaw, monthRaw] = calendarMonth.split("-")
    const date = new Date(Number(yearRaw), Number(monthRaw), 1)
    setCalendarMonth(toIsoDate(date).slice(0, 7))
  }

  function handleCalendarDaySelect(date: string) {
    if (date > today) {
      return
    }
    setSelectedDate(date)
    setViewMode("list")
    setStatusMessage(null)
  }

  async function handleTaskModalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedDate > today) {
      setStatusMessage("You can only create tasks for today or past dates.")
      return
    }

    const trimmedTitle = taskForm.title.trim()
    const trimmedDescription = taskForm.description.trim()
    const trimmedLink = taskForm.link.trim()
    const parsedDuration = Number(taskForm.durationMinutes)

    if (!trimmedTitle) {
      setStatusMessage("Task title is required.")
      return
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setStatusMessage("Time spent must be a positive number of minutes.")
      return
    }

    setSavingTask(true)
    setStatusMessage(null)

    if (taskModalMode === "create") {
      const newTask: TaskItem = {
        id: generateTaskId(),
        title: trimmedTitle,
        status: taskForm.status,
        durationMinutes: parsedDuration,
        createdAt: new Date().toISOString(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(trimmedLink ? { link: trimmedLink } : {}),
      }

      const nextTasks = [newTask, ...tasks]
      const saved = await persistTasks(nextTasks)

      if (saved) {
        setTasks(nextTasks)
        syncCalendarSummaryForDate(selectedDate, nextTasks)
        closeTaskModal()
        setStatusMessage("Task added.")
      }

      setSavingTask(false)
      return
    }

    if (!activeTaskId) {
      setSavingTask(false)
      setStatusMessage("No task selected for edit.")
      return
    }

    const nextTasks = tasks.map((task) =>
      task.id === activeTaskId
        ? (() => {
            const updated: TaskItem = {
              ...task,
              title: trimmedTitle,
              status: taskForm.status,
              durationMinutes: parsedDuration,
            }

            if (trimmedDescription) {
              updated.description = trimmedDescription
            } else {
              delete updated.description
            }

            if (trimmedLink) {
              updated.link = trimmedLink
            } else {
              delete updated.link
            }

            return updated
          })()
        : task
    )

    setTasks(nextTasks)
    syncCalendarSummaryForDate(selectedDate, nextTasks)
    const saved = await persistTasks(nextTasks)

    if (!saved) {
      setTasks(tasks)
      syncCalendarSummaryForDate(selectedDate, tasks)
      setSavingTask(false)
      return
    }

    closeTaskModal()
    setStatusMessage("Task updated.")
    setSavingTask(false)
  }

  async function handleStatusChange(taskId: string, nextStatus: TaskStatus) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: nextStatus } : task
    )

    setTasks(nextTasks)
    syncCalendarSummaryForDate(selectedDate, nextTasks)
    setStatusMessage(null)

    const saved = await persistTasks(nextTasks)
    if (!saved) {
      setTasks(tasks)
      syncCalendarSummaryForDate(selectedDate, tasks)
      return
    }

    setStatusMessage("Task status updated.")
  }

  async function handleDeleteTask(taskId: string) {
    const confirmed = window.confirm("Delete this task?")
    if (!confirmed) return

    const nextTasks = tasks.filter((task) => task.id !== taskId)

    setTasks(nextTasks)
    setStatusMessage(null)

    const saved = await persistTasks(nextTasks)
    if (!saved) {
      setTasks(tasks)
      return
    }

    setStatusMessage("Task deleted.")
  }

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
      {loadingAuth ? (
        <div className="mb-4 rounded-lg border p-4">
          <Skeleton className="h-4 w-40" />
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>
                {viewMode === "list"
                  ? `${tasks.length} task(s) for ${selectedDate} • ${totalDurationLabel}`
                  : `Calendar view for ${formatMonthLabel(calendarMonth)}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")}
              >
                <ListBullets className="size-4" />
                List
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "calendar" ? "default" : "outline"}
                onClick={() => setViewMode("calendar")}
              >
                <CalendarBlank className="size-4" />
                Calendar
              </Button>
              <Button type="button" onClick={openCreateTaskModal}>
                <Plus className="size-4" />
                New task
              </Button>
            </div>
          </div>

          {viewMode === "list" ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="task-date">Date</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    const nextDate =
                      event.target.value > today ? today : event.target.value
                    setSelectedDate(nextDate)
                    setCalendarMonth(nextDate.slice(0, 7))
                  }}
                  max={today}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-search">Search</Label>
                <Input
                  id="task-search"
                  placeholder="Search title, description, link"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-filter-status">Status filter</Label>
                <select
                  id="task-filter-status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as TaskFilterStatus)
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-sort">Sort</Label>
                <select
                  id="task-sort"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="created_desc">Newest first</option>
                  <option value="created_asc">Oldest first</option>
                  <option value="duration_desc">Duration high to low</option>
                  <option value="duration_asc">Duration low to high</option>
                  <option value="title_asc">Title A-Z</option>
                  <option value="title_desc">Title Z-A</option>
                </select>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {viewMode === "list" ? (
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Task</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">
                      {timeUnit === "hours" ? "Time (hrs)" : "Time (min)"}
                    </th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Link</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTasks ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-row-${index}`} className="border-t">
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : null}

                  {!loadingTasks && filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                        No tasks match current filters.
                      </td>
                    </tr>
                  ) : null}

                  {!loadingTasks &&
                    filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="border-t align-top transition-colors hover:bg-muted/30"
                        onClick={() => openTaskViewModal(task)}
                      >
                        <td className="px-4 py-3 font-medium">{task.title}</td>
                        <td className="px-4 py-3">
                          <Badge variant={statusBadgeVariant(task.status)}>
                            {displayStatus(task.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {timeUnit === "hours"
                            ? (task.durationMinutes / 60).toFixed(2)
                            : task.durationMinutes}
                        </td>
                        <td className="max-w-[280px] px-4 py-3 text-muted-foreground">
                          {task.description ?? "-"}
                        </td>
                        <td className="max-w-[240px] px-4 py-3">
                          {task.link ? (
                            <a
                              href={task.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation()
                                openEditTaskModal(task)
                              }}
                            >
                              <NotePencil className="size-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleDeleteTask(task.id)
                              }}
                            >
                              <Trash className="size-4" />
                              Delete
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleStatusChange(
                                  task.id,
                                  task.status === "in_progress"
                                    ? "testing"
                                    : task.status === "testing"
                                      ? "done"
                                      : "in_progress"
                                )
                              }}
                            >
                              <ArrowsClockwise className="size-4" />
                              Next status
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        ) : (
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
                <CaretLeft className="size-4" />
                Previous
              </Button>
              <p className="text-sm font-medium">{formatMonthLabel(calendarMonth)}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextMonth}
                disabled={calendarMonth >= currentMonth}
              >
                Next
                <CaretRight className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="px-2 py-1 font-medium">
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-2">
              {calendarGrid.map((cell, index) => {
                if (!cell.date || !cell.dayNumber) {
                  return <div key={`empty-${index}`} className="h-24 rounded-md border bg-muted/20" />
                }

                if (cell.date > today) {
                  return (
                    <div
                      key={cell.date}
                      className="h-24 rounded-md border bg-muted/20"
                    />
                  )
                }

                const summary = calendarSummaries[cell.date]
                const isSelected = cell.date === selectedDate

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleCalendarDaySelect(cell.date as string)}
                    className={`h-24 rounded-md border p-2 text-left transition-colors hover:bg-muted/40 ${
                      isSelected ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <p className="text-sm font-medium">{cell.dayNumber}</p>
                    {summary ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <p>{summary.count} task(s)</p>
                        <p>
                          {timeUnit === "hours"
                            ? `${(summary.minutes / 60).toFixed(2)} h`
                            : `${summary.minutes} min`}
                        </p>
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {selectedDateSummary ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Selected {selectedDate}: {selectedDateSummary.count} task(s),{" "}
                {timeUnit === "hours"
                  ? `${(selectedDateSummary.minutes / 60).toFixed(2)} hour(s)`
                  : `${selectedDateSummary.minutes} minute(s)`}
              </p>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Selected {selectedDate}: no tasks logged.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={Boolean(viewTask)} onOpenChange={(open) => !open && setViewTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewTask?.title ?? "Task details"}</DialogTitle>
            <DialogDescription>
              Detailed task view for {selectedDate}
            </DialogDescription>
          </DialogHeader>

          {viewTask ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={statusBadgeVariant(viewTask.status)}>
                  {displayStatus(viewTask.status)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {timeUnit === "hours"
                    ? `${(viewTask.durationMinutes / 60).toFixed(2)} hour(s)`
                    : `${viewTask.durationMinutes} minute(s)`}
                </span>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Description
                </p>
                <p className="mt-1 text-sm">
                  {viewTask.description?.trim() || "No description provided."}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Link
                </p>
                {viewTask.link ? (
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {viewTask.link}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No link provided.</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Created: {new Date(viewTask.createdAt).toLocaleString()}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            {viewTask?.link ? (
              <Button asChild variant="secondary">
                <a href={viewTask.link} target="_blank" rel="noreferrer">
                  Open
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setViewTask(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (!viewTask) return
                setViewTask(null)
                openEditTaskModal(viewTask)
              }}
            >
              Edit task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={taskModalOpen} onOpenChange={setTaskModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {taskModalMode === "create" ? "Create task" : "Edit task"}
            </DialogTitle>
            <DialogDescription>
              {taskModalMode === "create"
                ? "Add a new task for the selected date."
                : "Update task details."}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleTaskModalSubmit}>
            <div className="space-y-2">
              <Label htmlFor="modal-task-title">Task title</Label>
              <Input
                id="modal-task-title"
                placeholder="Implement ticket export"
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, title: event.target.value }))
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="modal-task-status">Status</Label>
                <select
                  id="modal-task-status"
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      status: event.target.value as TaskStatus,
                    }))
                  }
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modal-task-duration">Time spent (min)</Label>
                <Input
                  id="modal-task-duration"
                  type="number"
                  min={1}
                  placeholder="90"
                  value={taskForm.durationMinutes}
                  onChange={(event) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      durationMinutes: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="modal-task-link">Link (optional)</Label>
              <Input
                id="modal-task-link"
                type="url"
                placeholder="https://github.com/org/repo/pull/123"
                value={taskForm.link}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, link: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modal-task-description">Description (optional)</Label>
              <Textarea
                id="modal-task-description"
                placeholder="Short notes about what was done"
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeTaskModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingTask || loadingTasks}>
                <Plus className="size-4" />
                {savingTask
                  ? "Saving..."
                  : taskModalMode === "create"
                    ? "Create task"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {statusMessage ? <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p> : null}
    </AppShell>
  )
}
