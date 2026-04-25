import { Geist_Mono, Inter, Lora } from "next/font/google"

import "./globals.css"
import { AuthSessionSync } from "@/components/auth-session-sync"
import { ThemeProvider } from "@/components/theme-provider"
import { UserSettingsProvider } from "@/components/user-settings-provider"
import { cn } from "@/lib/utils"
import { Metadata } from "next"

const loraHeading = Lora({ subsets: ["latin"], variable: "--font-heading" })

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Geist - Task Tracker",
  description: "View your tasks, dashboard metrics, and sprint presentations.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable,
        loraHeading.variable
      )}
    >
      <body>
        <ThemeProvider>
          <UserSettingsProvider>
            <AuthSessionSync />
            {children}
          </UserSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
