import type { Metadata } from 'next'
import { Inter, Libre_Baskerville, Poppins } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const googleTagManagerId = 'GTM-WCFQC2M7'
const siteUrl = 'https://kanwas.ai'
const defaultTitle = 'AI whiteboard for your second brain'
const defaultDescription =
  'Kanwas is a local-first AI whiteboard for creative deep work. A folder of plain markdown files becomes a canvas where you research, plan, and create with AI. Compatible with Claude Code, Codex, and OpenCode.'
const defaultOgImage = '/landing/images/og-image.jpg'
const defaultOgImageAlt = 'Kanwas — AI whiteboard for your second brain'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const libreBaskerville = Libre_Baskerville({
  variable: '--font-libre-baskerville',
  subsets: ['latin'],
  weight: ['400'],
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultTitle,
  description: defaultDescription,
  openGraph: {
    type: 'website',
    siteName: 'Kanwas',
    url: '/',
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: defaultOgImageAlt,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: defaultOgImageAlt,
      },
    ],
  },
  icons: {
    icon: '/landing/images/favicon.png',
    apple: '/landing/images/webclip.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${poppins.variable} ${libreBaskerville.variable} body`}>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <Script src="https://kit.fontawesome.com/e33949a08a.js" crossOrigin="anonymous" strategy="afterInteractive" />
        <Script id="google-tag-manager" strategy="beforeInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${googleTagManagerId}');`}
        </Script>
        {children}
      </body>
    </html>
  )
}
