"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { FirebaseError } from "firebase/app"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { auth, db } from "@/lib/firebase"

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

type SortKey =
  | "created_desc"
  | "created_asc"
  | "duration_desc"
  | "duration_asc"
  | "title_asc"
  | "title_desc"

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "testing", label: "Testing" },
  { value: "done", label: "Done" },
]

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

export function HomePanel() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)

  const [selectedDate, setSelectedDate] = useState(todayIsoDate)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [form, setForm] = useState<TaskFormState>({
    title: "",
    status: "in_progress",
    durationMinutes: "",
    description: "",
    link: "",
  })

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TaskFilterStatus>("all")
  const [sortKey, setSortKey] = useState<SortKey>("created_desc")

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TaskFormState | null>(null)

  const totalMinutes = useMemo(
    () => tasks.reduce((sum, task) => sum + task.durationMinutes, 0),
    [tasks]
  )

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
          return
        }

        const data = snapshot.data() as Partial<TaskDayDoc>
        setTasks(Array.isArray(data.tasks) ? data.tasks : [])
      } catch {
        setStatusMessage("Failed to load tasks for the selected day.")
      } finally {
        setLoadingTasks(false)
      }
    }

    void loadDayTasks()
  }, [selectedDate, user])

  async function persistTasks(nextTasks: TaskItem[]) {
    if (!user) return false

    try {
      const dayRef = doc(db, "users", user.uid, "taskDays", selectedDate)
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

  async function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = form.title.trim()
    const trimmedDescription = form.description.trim()
    const trimmedLink = form.link.trim()
    const parsedDuration = Number(form.durationMinutes)

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

    const newTask: TaskItem = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      status: form.status,
      durationMinutes: parsedDuration,
      createdAt: new Date().toISOString(),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(trimmedLink ? { link: trimmedLink } : {}),
    }

    const nextTasks = [newTask, ...tasks]
    const saved = await persistTasks(nextTasks)

    if (saved) {
      setTasks(nextTasks)
      setForm((prev) => ({
        ...prev,
        title: "",
        durationMinutes: "",
        description: "",
        link: "",
      }))
      setShowNewTaskForm(false)
      setStatusMessage("Task added.")
    }

    setSavingTask(false)
  }

  async function handleStatusChange(taskId: string, nextStatus: TaskStatus) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: nextStatus } : task
    )

    setTasks(nextTasks)
    setStatusMessage(null)

    const saved = await persistTasks(nextTasks)
    if (!saved) {
      setTasks(tasks)
      return
    }

    setStatusMessage("Task status updated.")
  }

  function beginEdit(task: TaskItem) {
    setEditingTaskId(task.id)
    setEditForm(normalizeTaskForm(task))
    setStatusMessage(null)
  }

  function cancelEdit() {
    setEditingTaskId(null)
    setEditForm(null)
  }

  async function saveEdit(taskId: string) {
    if (!editForm) return

    const trimmedTitle = editForm.title.trim()
    const trimmedDescription = editForm.description.trim()
    const trimmedLink = editForm.link.trim()
    const parsedDuration = Number(editForm.durationMinutes)

    if (!trimmedTitle) {
      setStatusMessage("Task title is required.")
      return
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setStatusMessage("Time spent must be a positive number of minutes.")
      return
    }

    const nextTasks = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            title: trimmedTitle,
            status: editForm.status,
            durationMinutes: parsedDuration,
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
            ...(trimmedLink ? { link: trimmedLink } : {}),
          }
        : task
    )

    setTasks(nextTasks)
    setStatusMessage(null)

    const saved = await persistTasks(nextTasks)
    if (!saved) {
      setTasks(tasks)
      return
    }

    setStatusMessage("Task updated.")
    cancelEdit()
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

    if (editingTaskId === taskId) {
      cancelEdit()
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
    <AppShell userEmail={user?.email} onLogout={handleSignOut}>
      {loadingAuth ? <p className="mb-4 text-sm">Checking auth session...</p> : null}

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>
                {tasks.length} task(s) for {selectedDate} • {totalMinutes} total minute(s)
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="task-date">Date</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  required
                />
              </div>
              <Button
                type="button"
                onClick={() => setShowNewTaskForm((prev) => !prev)}
                className="sm:mb-[1px]"
              >
                {showNewTaskForm ? "Close" : "New task"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
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
        </CardHeader>

        {showNewTaskForm ? (
          <CardContent className="border-t pt-6">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleAddTask}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="task-title">Task title</Label>
                <Input
                  id="task-title"
                  placeholder="Implement ticket export"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-status">Status</Label>
                <select
                  id="task-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({
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
                <Label htmlFor="task-duration">Time spent (min)</Label>
                <Input
                  id="task-duration"
                  type="number"
                  min={1}
                  placeholder="90"
                  value={form.durationMinutes}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      durationMinutes: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-link">Link (optional)</Label>
                <Input
                  id="task-link"
                  type="url"
                  placeholder="https://github.com/org/repo/pull/123"
                  value={form.link}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, link: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-description">Description (optional)</Label>
                <Textarea
                  id="task-description"
                  placeholder="Short notes about what was done"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </div>

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={savingTask || loadingTasks}>
                  {savingTask ? "Saving..." : "Save task"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewTaskForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        ) : null}

        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time (min)</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingTasks ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                      Loading tasks...
                    </td>
                  </tr>
                ) : null}

                {!loadingTasks && filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                      No tasks match current filters.
                    </td>
                  </tr>
                ) : null}

                {!loadingTasks &&
                  filteredTasks.map((task) => {
                    const isEditing = editingTaskId === task.id && editForm

                    return (
                      <tr key={task.id} className="border-t align-top">
                        <td className="px-4 py-3 font-medium">
                          {isEditing ? (
                            <Input
                              value={editForm.title}
                              onChange={(event) =>
                                setEditForm((prev) =>
                                  prev
                                    ? { ...prev, title: event.target.value }
                                    : prev
                                )
                              }
                            />
                          ) : (
                            task.title
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={editForm.status}
                              onChange={(event) =>
                                setEditForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        status: event.target.value as TaskStatus,
                                      }
                                    : prev
                                )
                              }
                              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-[3px]"
                            >
                              {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant={statusBadgeVariant(task.status)}>
                              {displayStatus(task.status)}
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={1}
                              value={editForm.durationMinutes}
                              onChange={(event) =>
                                setEditForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        durationMinutes: event.target.value,
                                      }
                                    : prev
                                )
                              }
                            />
                          ) : (
                            task.durationMinutes
                          )}
                        </td>

                        <td className="max-w-[280px] px-4 py-3 text-muted-foreground">
                          {isEditing ? (
                            <Textarea
                              rows={2}
                              value={editForm.description}
                              onChange={(event) =>
                                setEditForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        description: event.target.value,
                                      }
                                    : prev
                                )
                              }
                            />
                          ) : (
                            task.description ?? "-"
                          )}
                        </td>

                        <td className="max-w-[240px] px-4 py-3">
                          {isEditing ? (
                            <Input
                              type="url"
                              placeholder="https://..."
                              value={editForm.link}
                              onChange={(event) =>
                                setEditForm((prev) =>
                                  prev
                                    ? { ...prev, link: event.target.value }
                                    : prev
                                )
                              }
                            />
                          ) : task.link ? (
                            <a
                              href={task.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => void saveEdit(task.id)}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => beginEdit(task)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleDeleteTask(task.id)}
                              >
                                Delete
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void handleStatusChange(
                                    task.id,
                                    task.status === "in_progress"
                                      ? "testing"
                                      : task.status === "testing"
                                        ? "done"
                                        : "in_progress"
                                  )
                                }
                              >
                                Next status
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {statusMessage ? <p className="mt-4 text-sm text-muted-foreground">{statusMessage}</p> : null}
    </AppShell>
  )
}
