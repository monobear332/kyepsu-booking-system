import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  
  // Force delete all authorization cookies handled by Supabase
  cookieStore.getAll().forEach((cookie) => {
    if (cookie.name.includes('sb-') || cookie.name.includes('auth')) {
      cookieStore.set({
        name: cookie.name,
        value: '',
        maxAge: -1, // Tells the browser to discard the cookie instantly
        path: '/',
      })
    }
  })

  return NextResponse.json({ success: true })
}