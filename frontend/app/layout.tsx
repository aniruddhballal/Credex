import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-dm-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Credex', template: '%s | Credex' },
  description: 'B2B procurement and embedded trade finance for Indian SMEs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              fontFamily: 'var(--font-inter)',
              fontSize: '0.875rem',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
            },
          }}
        />
      </body>
    </html>
  )
}