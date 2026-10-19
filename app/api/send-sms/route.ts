import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  // 1. Only logged-in admins can trigger SMS
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Look up the booking server-side (never trust phone/name from the client)
  const { referenceCode } = await req.json()
  if (!referenceCode) return NextResponse.json({ error: 'Missing referenceCode' }, { status: 400 })

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('customer_name, customer_phone')
    .eq('reference_code', referenceCode)
    .eq('status', 'confirmed')
    .limit(1)

  if (error || !bookings?.length) {
    return NextResponse.json({ error: 'No confirmed booking found' }, { status: 404 })
  }

  const { customer_name, customer_phone } = bookings[0]

  // 3. Message
  const message =
    `Hi ${customer_name},\n\n` +
    `We are pleased to confirm that your booking ${referenceCode} has been approved! ` +
    `Thank you for choosing us, and we look forward to seeing you on the court!`

  // 4. Send via Semaphore
  const params = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY!,
    number: customer_phone,
    message,
  })
   if (process.env.SEMAPHORE_SENDER_NAME) params.set('sendername', process.env.SEMAPHORE_SENDER_NAME)

  try {
    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })  
    if (!res.ok) {
      console.error('Semaphore error:', res.status, await res.text())
      return NextResponse.json({ error: 'SMS provider rejected the request' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Semaphore request failed:', err)
    return NextResponse.json({ error: 'Failed to reach SMS provider' }, { status: 502 })
  }
}