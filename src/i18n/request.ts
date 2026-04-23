import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import path from 'path'
import fs from 'fs'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = cookieStore.get('locale')?.value || 'en'
  const validLocales = ['en', 'it', 'es']
  const resolvedLocale = validLocales.includes(locale) ? locale : 'en'

  const messagesPath = path.join(process.cwd(), 'messages', `${resolvedLocale}.json`)
  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'))

  return {
    locale: resolvedLocale,
    messages,
  }
})
