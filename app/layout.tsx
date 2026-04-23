import { Geist_Mono, Inter, Lora } from "next/font/google"

import "./globals.css"
import { AuthSessionSync } from "@/components/auth-session-sync"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const loraHeading = Lora({ subsets: ["latin"], variable: "--font-heading" })

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})
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
          <AuthSessionSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
