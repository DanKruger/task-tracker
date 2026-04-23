# Task Tracker (Next.js + shadcn + Firebase)

## Firebase setup

1. Copy env values:

```bash
cp .env.example .env.local
```

2. Fill your Firebase Web App config in `.env.local`.
3. In Firebase Console, enable:
- Authentication -> Sign-in method -> Google
- Firestore Database (create database)

## What is implemented

- Google sign-in / sign-out via Firebase Auth
- Firestore smoke test that writes/merges `users/{uid}` and reads it back
- Dedicated auth route at `/login`
- Protected route at `/home`
- Protected dashboard route at `/dashboard`
- Protected presentations route at `/presentations`
- Middleware redirect logic:
  - unauthenticated users are redirected to `/login`
  - authenticated users visiting `/login` are redirected to `/home`

## Task tracking

- Tasks are scoped per day in Firestore under `users/{uid}/taskDays/{YYYY-MM-DD}`
- Each task contains:
  - required: title, status (`in_progress`, `testing`, `done`), time spent in minutes
  - optional: description, link
- `/home` includes:
  - date selector
  - add-task form
  - daily task table with:
    - edit task
    - delete task
    - status update
  - filters:
    - search (title/description/link)
    - status filter
    - sort (date, duration, title)
  - daily total minutes
- `/dashboard` includes:
  - total tasks, total minutes, average minutes/task, done rate
  - status distribution counts
  - recent day activity summary across all tracked days
  - weekly report chart (last 8 weeks)
  - monthly report chart (last 6 months)
- `/presentations` includes:
  - sprint preset selector (7 or 14 days)
  - end-date selector
  - deck settings modal with slide/timing/content toggles
  - generated PPTX deck download for the selected sprint window
