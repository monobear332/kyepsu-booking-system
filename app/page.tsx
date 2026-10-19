'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Turnstile } from '@marsidev/react-turnstile'

import Image from 'next/image'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { EventInput } from '@fullcalendar/core'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'

import { SiFacebook } from 'react-icons/si'
import { CiMail } from 'react-icons/ci'
import { FiMapPin } from 'react-icons/fi'

interface SelectedSlotItem {
  court: number
  date: string
  label: string
}

interface AvailableSlotRow {
  label: string
  court1Status: 'available' | 'reserved' | 'past'
  court2Status: 'available' | 'reserved' | 'past'
}

// ─────────────────────────────────────────────
// RESPONSIVE READ-ONLY CALENDAR
// ─────────────────────────────────────────────
function ReadOnlyCalendar({
  title,
  events,
  courtNumber,
}: {
  title: string
  events: EventInput[]
  courtNumber: number
}) {
  const [calendarView, setCalendarView] = useState<'timeGridWeek' | 'timeGridDay'>('timeGridWeek')

  useEffect(() => {
    const handleResize = () => {
      setCalendarView(window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek')
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Court label */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4D663B] text-white text-xs font-black tracking-wider">
          {courtNumber}
        </div>
        <h2 className="text-base font-bold text-[#223230] uppercase tracking-widest">{title}</h2>
        <div className="flex-1 h-px bg-[#4D663B]/15" />
      </div>

      <div className="bg-white rounded-2xl border border-[#E2E8E5] shadow-sm flex-1 overflow-hidden p-2 md:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView={calendarView}
          key={calendarView}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          allDaySlot={false}
          editable={false}
          selectable={false}
          events={events}
          timeZone="Asia/Manila"
          height="auto"
          expandRows={true}
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            omitZeroMinute: true,
            meridiem: 'short',
          }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// HELPERS (unchanged logic)
// ─────────────────────────────────────────────
const generateSlots = () => {
  const slots = []
  for (let hour = 6; hour < 24; hour++) {
    slots.push({ start: hour, end: hour + 1 })
  }
  return slots
}

const getManilaNow = () => {
  const manilaString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  return new Date(manilaString)
}



const calculateSlotPrice = (slotLabel: string) => {
  const startPart = slotLabel.split(' - ')[0]
  const [time, modifier] = startPart.split(' ')
  let [hours] = time.split(':')
  let hour24 = parseInt(hours, 10)
  if (hour24 === 12) hour24 = 0
  if (modifier === 'PM') hour24 += 12
  return hour24 >= 16 ? 220 : 120
}

const parseSlotToIsoStrings = (selectedDate: string, slotLabel: string) => {
  const [startPart, endPart] = slotLabel.split(' - ')
  const convertTo24hString = (timeStr: string) => {
    const [time, modifier] = timeStr.split(' ')
    let [hours, minutes] = time.split(':')
    if (hours === '12') hours = '00'
    if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12)
    return `${hours.padStart(2, '0')}:${minutes}:00`
  }
  return {
    startTime: `${selectedDate}T${convertTo24hString(startPart)}`,
    endTime: `${selectedDate}T${convertTo24hString(endPart)}`,
  }
}

const getTodayDateString = () => {
  const today = getManilaNow()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

const generateReferenceCode = () => `PB-${Math.floor(1000000000 + Math.random() * 9000000000)}`

const validatePHPhone = (phone: string) => {
  const cleanPhone = phone.trim().replace(/\s+/g, '')
  return /^(09|\+?639)\d{9}$/.test(cleanPhone)
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()

  const [hasActiveAdminSession, setHasActiveAdminSession] = useState(false)
  const [loginopen, setLogInOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [court1Events, setCourt1Events] = useState<EventInput[]>([])
  const [court2Events, setCourt2Events] = useState<EventInput[]>([])

  const [bookingOpen, setBookingOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString())
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotRow[]>([])
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlotItem[]>([])

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [activeReference, setActiveReference] = useState('')
  const [activeAmount, setActiveAmount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(300)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [selectedMethod, setSelectedMethod] = useState<'gcash' | 'bpi'>('gcash')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [isUploadingPayment, setIsUploadingPayment] = useState(false)

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<any>(null)

  useEffect(() => {
    fetchBookings()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setHasActiveAdminSession(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!bookingOpen || !selectedDate) return
    loadAvailableSlots()
  }, [selectedDate, bookingOpen])

  useEffect(() => {
    if (paymentOpen && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft((p) => p - 1), 1000)
    } else if (timeLeft === 0 && paymentOpen) {
      clearInterval(timerRef.current!)
      alert('Your payment window has expired. Slots have been released.')
      handlePaymentModalClose(false)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [paymentOpen, timeLeft])

  const handleLogin = async () => {
    setLoading(true)
    const { data: profile, error: profileError } = await supabase
      .from('users').select('email').eq('username', username).single()
    if (profileError || !profile) {
      setLoading(false)
      alert('Invalid username credential tracking assignment.')
      return
    }
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: profile.email, password,
    })
    if (authError || !authData.session) {
      alert(authError?.message || 'Authentication failed.')
      setLoading(false)
      return
    }
    setLogInOpen(false)
    setHasActiveAdminSession(true)
    setLoading(false)
    setUsername('')
    setPassword('')
    window.location.href = '/admin'
  }

  const handleModalOpenToggle = (isOpen: boolean) => {
    setBookingOpen(isOpen)
    if (!isOpen) {
      setSelectedDate(getTodayDateString())
      setSelectedSlots([])
      setAvailableSlots([])
      setCustomerName('')
      setCustomerPhone('')
      setTurnstileToken(null)
    }
  }

  const handlePaymentCancelation = async (refCode: string) => {
    if (!refCode) return
    await supabase.from('bookings').update({ status: 'expired' })
      .eq('reference_code', refCode).eq('status', 'pending')
  }

  const handlePaymentModalClose = async (isOpen: boolean) => {
    if (!isOpen) {
      if (timerRef.current) clearInterval(timerRef.current)
      const refToWipe = activeReference
      setPaymentOpen(false)
      setTimeLeft(300)
      setActiveReference('')
      setActiveAmount(0)
      setScreenshotFile(null)
      await handlePaymentCancelation(refToWipe)
      fetchBookings()
      if (selectedDate) loadAvailableSlots()
    } else {
      setPaymentOpen(isOpen)
    }
  }

  const loadAvailableSlots = async () => {
  const allSlots = generateSlots()
  const startOfDay = `${selectedDate}T00:00:00`
  const endOfDay = `${selectedDate}T23:59:59`
  const { data: existingBookings, error } = await supabase
    .from('bookings').select('court, start_time, end_time')
    .in('court', ['1', '2']).in('status', ['pending', 'confirmed', 'reserved'])
    .gte('start_time', startOfDay).lte('end_time', endOfDay)
  if (error) { console.error('Error fetching slots:', error); return }

  const manilaNow = getManilaNow()
  const isToday = selectedDate === getTodayDateString()
  const currentHour = manilaNow.getHours()

  const updatedSlots = allSlots.map((slot) => {
    const matchCourtBooking = (courtNum: number) =>
      existingBookings?.some((booking) => {
        if (String(booking.court) !== String(courtNum)) return false
        const rawTimePart = booking.start_time.split('T')[1]
        return parseInt(rawTimePart.split(':')[0], 10) === slot.start
      })
    const formatTime = (hour: number) => {
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const displayHour = hour % 12 === 0 ? 12 : hour % 12
      return `${String(displayHour).padStart(2, '0')}:00 ${ampm}`
    }

    // Block any slot that has already started/passed for today
    const isPast = isToday && slot.start < currentHour

    return {
      label: `${formatTime(slot.start)} - ${formatTime(slot.end)}`,
      court1Status: isPast ? 'past' as const : (matchCourtBooking(1) ? 'reserved' as const : 'available' as const),
      court2Status: isPast ? 'past' as const : (matchCourtBooking(2) ? 'reserved' as const : 'available' as const),
    }
  })
  setAvailableSlots(updatedSlots)
}

  const fetchBookings = async () => {
    const startOfToday = `${getTodayDateString()}T00:00:00`
    const { data, error } = await supabase.from('bookings').select('*')
      .in('status', ['pending', 'confirmed', 'reserved']).gte('end_time', startOfToday)
    if (error) { console.error(error); return }
    const mapBookingToEvent = (booking: any) => ({
      id: booking.id,
      title: booking.status === 'pending' ? 'Pending' : 'Reserved',
      start: booking.start_time.split('+')[0],
      end: booking.end_time.split('+')[0],
      className: booking.status === 'pending' ? 'booking-pending' : 'booking-reserved',
    })
    setCourt1Events(data.filter((b) => String(b.court) === '1').map(mapBookingToEvent))
    setCourt2Events(data.filter((b) => String(b.court) === '2').map(mapBookingToEvent))
  }

  const toggleSlot = (courtNum: number, slotLabel: string) => {
    setSelectedSlots((prev) => {
      const idx = prev.findIndex(s => s.court === courtNum && s.date === selectedDate && s.label === slotLabel)
      return idx > -1 ? prev.filter((_, i) => i !== idx) : [...prev, { court: courtNum, date: selectedDate, label: slotLabel }]
    })
  }

  const handleConfirmReservation = async () => {
    if (!selectedSlots.length || !customerName.trim() || !validatePHPhone(customerPhone) || !turnstileToken) {
      alert('Please complete all form requirements accurately before proceeding.')
      return
    }
    setIsSubmitting(true)
    const generatedRef = generateReferenceCode()
    const computedPrice = selectedSlots.reduce((sum, item) => sum + calculateSlotPrice(item.label), 0)
    const recordsToInsert = selectedSlots.map((item) => {
      const { startTime, endTime } = parseSlotToIsoStrings(item.date, item.label)
      return {
        court: String(item.court), start_time: startTime, end_time: endTime,
        customer_name: customerName.trim(), customer_phone: customerPhone.trim().replace(/\s+/g, ''),
        status: 'pending', reference_code: generatedRef, amount: calculateSlotPrice(item.label),
      }
    })
    const { error } = await supabase.from('bookings').insert(recordsToInsert)
    if (error) {
      alert('Failed to complete reservation. One of your selected slots might have been booked. Please refresh page.')
      setIsSubmitting(false)
      if (turnstileRef.current) turnstileRef.current.reset()
      setTurnstileToken(null)
      return
    }
    setActiveReference(generatedRef)
    setActiveAmount(computedPrice)
    setTimeLeft(300)
    setIsSubmitting(false)
    handleModalOpenToggle(false)
    setPaymentOpen(true)
  }

  const formatTimerString = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const handleSubmitPayment = async () => {
    if (!screenshotFile || !activeReference) return
    setIsUploadingPayment(true)
    try {
      const fileExt = screenshotFile.name.split('.').pop()
      const filePath = `${activeReference}-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(filePath, screenshotFile)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('payment-proofs').getPublicUrl(filePath)
      const { error: updateError } = await supabase.from('bookings').update({
        status: 'pending', screenshot_url: publicUrl, payment_method: selectedMethod,
      }).eq('reference_code', activeReference)
      if (updateError) throw updateError
      if (timerRef.current) clearInterval(timerRef.current)
      alert('Payment submitted successfully! Your reservation is now held under verification review.')
      setPaymentOpen(false)
      setScreenshotFile(null)
      fetchBookings()
    } catch (err: any) {
      console.error('Submission error:', err)
      alert('Failed to upload your payment receipt. Please try again.')
    } finally {
      setIsUploadingPayment(false)
    }
  }

  const cartCourt1 = selectedSlots.filter(s => s.court === 1)
  const cartCourt2 = selectedSlots.filter(s => s.court === 2)
  const currentCartTotal = selectedSlots.reduce((sum, item) => sum + calculateSlotPrice(item.label), 0)
  const isPhoneValid = customerPhone.trim() === '' || validatePHPhone(customerPhone)

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen bg-[#FAFAF9]">

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-50 w-full bg-[#FAFAF9]/90 backdrop-blur-md border-b border-[#E2E8E5]">
          {/* Olive accent line at very top */}
          <div className="h-0.5 w-full bg-gradient-to-r from-[#4D663B] via-[#7a9e5c] to-[#4D663B]" />
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
            <button
              onClick={() => {
                if (confirm('Admin access? Press OK for Admin Login, Cancel to stay on Homepage.')) {
                  setLogInOpen(true)
                }
              }}
              className="flex items-center gap-3 group"
            >
              <Image src="/logo.png" alt="KYEPSU Logo" width={60} height={60} className="rounded-xl transition-transform group-hover:scale-105" />
              <div className="hidden sm:block text-left">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#4D663B] leading-none">KYEPSU</p>
                <p className="text-[10px] font-medium tracking-widest text-[#223230]/50 uppercase">Pickleball Court</p>
              </div>
            </button>

            <Button
              size="lg"
              className="font-bold tracking-wide bg-[#4D663B] hover:bg-[#3b502e] text-white px-6 transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-[#4D663B]/20"
              onClick={() => setBookingOpen(true)}
            >
              Book Now
            </Button>
          </div>
        </header>

        {/* ── HERO ── */}
        <section className="relative max-w-6xl mx-auto px-4 md:px-6 pt-16 pb-12 text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 bg-[#4D663B]/8 border border-[#4D663B]/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4D663B] animate-ping" />
            <span className="text-xs font-bold text-[#4D663B] tracking-[0.15em] uppercase">Live Booking System</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-[#223230] uppercase leading-none mb-2">
            KYEPSU
          </h1>
          <h2 className="text-2xl md:text-4xl font-extrabold text-[#4D663B] uppercase tracking-widest mb-6">
            Pickleball Court
          </h2>

          {/* Decorative court line */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-16 bg-[#4D663B]/30" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#4D663B]" />
            <div className="h-px w-32 bg-[#4D663B]" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#4D663B]" />
            <div className="h-px w-16 bg-[#4D663B]/30" />
          </div>

          <p className="text-base md:text-lg text-[#223230]/60 max-w-lg mx-auto font-medium mb-2">
            Reserve your court in seconds. View live availability and book your preferred schedule online.
          </p>
          <p className="text-sm font-semibold italic text-[#4D663B]/70 tracking-wider mb-8">
            Dink and Drive, Stay Alive!
          </p>

          <Button
            size="lg"
            className="font-bold px-10 py-6 text-base bg-[#4D663B] hover:bg-[#3b502e] text-white shadow-xl shadow-[#4D663B]/25 transition-all hover:scale-105 active:scale-95"
            onClick={() => setBookingOpen(true)}
          >
            Book Court Now
          </Button>
        </section>

        {/* ── AVAILABILITY SECTION HEADER ── */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#223230]/40 whitespace-nowrap">Court Availability</h3>
            <div className="flex-1 h-px bg-[#E2E8E5]" />
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-[#223230]/40">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#4D663B]" />Reserved</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed border-[#4D663B] bg-[#4D663B]/10" />Pending</span>
            </div>
          </div>
        </div>

        {/* ── CALENDARS ── */}
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <ReadOnlyCalendar title="Court 1" events={court1Events} courtNumber={1} />
            <ReadOnlyCalendar title="Court 2" events={court2Events} courtNumber={2} />
          </div>
        </div>

        {/* ── VIDEO SECTION ── */}
        <div className="mt-20 relative overflow-hidden bg-[#223230]">
          <div className="absolute inset-0 bg-gradient-to-b from-[#223230]/60 via-transparent to-[#223230]/80 z-10 pointer-events-none" />
          <video
            autoPlay muted loop playsInline
            className="w-full object-cover max-h-[500px] opacity-60"
          >
            <source src="/backgroundvideo.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#7a9e5c] mb-3">Take a Look</p>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight leading-none">
              Inside Our Courts
            </h2>
            <div className="mt-5 h-0.5 w-16 bg-[#7a9e5c] mx-auto" />
          </div>
        </div>

        {/* ── MAP SECTION ── */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4D663B] mb-2">Find Us</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#223230] uppercase tracking-tight">
              We are Located At
            </h2>
            <p className="text-sm text-[#223230]/50 mt-2 max-w-xs mx-auto">
              Click the map to open driving directions in Google Maps.
            </p>
          </div>

          <a
            href="https://maps.app.goo.gl/BsUnEVVaLn4yoAD49"
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-4xl mx-auto overflow-hidden rounded-2xl shadow-2xl shadow-[#223230]/15 border border-[#E2E8E5] transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
          >
            <img
              src="/location.png"
              alt="KYEPSU Pickleball Court Location Map"
              className="w-full h-auto object-cover"
            />
          </a>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="bg-[#1a2620] text-gray-400 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-12">

          {/* Top row: logo + tagline */}
          <div className="flex flex-col items-center text-center mb-10">
            <Image src="/logo.png" alt="KYEPSU" width={64} height={64} className="rounded-xl mb-4 opacity-90" />
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white mb-1">KYEPSU Pickleball Court</p>
            <p className="text-xs text-gray-500 italic">Dink and Drive, Stay Alive!</p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/8 mb-8" />

          {/* Links row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 mb-8">
            {/* Facebook */}
            <a
              href="https://facebook.com/YOUR_PAGE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-sm font-semibold text-gray-300 hover:text-white transition-colors group"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4D663B]/30 group-hover:bg-[#4D663B]/50 transition-colors">
                <SiFacebook size={14} className="text-[#7a9e5c]" />
              </span>
              Visit us on Facebook
            </a>

            {/* Vertical divider – hidden on mobile */}
            <div className="hidden sm:block w-px h-6 bg-white/10" />

            {/* Email */}
            <a
              href="mailto:kyepsupickleballcourts@gmail.com"
              className="flex items-center gap-2.5 text-sm font-semibold text-gray-300 hover:text-white transition-colors group"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4D663B]/30 group-hover:bg-[#4D663B]/50 transition-colors">
                <CiMail size={16} className="text-[#7a9e5c]" />
              </span>
              kyepsupickleballcourts@gmail.com
            </a>
          </div>

          {/* Bottom copyright */}
          <div className="text-center">
            <p className="text-xs text-gray-600">
              © {new Date().getFullYear()} KYEPSU Pickleball Court. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* ── LOGIN MODAL ── */}
      <Dialog open={loginopen} onOpenChange={setLogInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Login</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── BOOKING MODAL ── */}
      <Dialog open={bookingOpen} onOpenChange={handleModalOpenToggle}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-3 border-b bg-gray-50/50">
            <DialogTitle className="font-black tracking-wide text-[#223230]">Book Court Slots</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Date picker */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#4D663B]">Select Date</label>
              <Input type="date" value={selectedDate} min={getTodayDateString()} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>

            {/* Slot grid */}
            {selectedDate && availableSlots.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#4D663B]">Available Slots</label>
                <div className="grid grid-cols-12 gap-2 bg-[#4D663B]/8 border border-[#4D663B]/15 p-2 rounded-lg text-xs font-bold text-[#223230]/60 sticky top-0 z-10">
                  <div className="col-span-6">Time Window & Rate</div>
                  <div className="col-span-3 text-center">Court 1</div>
                  <div className="col-span-3 text-center">Court 2</div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {availableSlots.map((slot) => {
                    const isC1Selected = selectedSlots.some(s => s.court === 1 && s.date === selectedDate && s.label === slot.label)
                    const isC2Selected = selectedSlots.some(s => s.court === 2 && s.date === selectedDate && s.label === slot.label)
                    const costOfSlot = calculateSlotPrice(slot.label)
                    return (
                      <div key={slot.label} className="grid grid-cols-12 gap-2 p-2 rounded-lg border border-gray-100 bg-white items-center text-xs hover:border-[#4D663B]/20 transition-colors">
                        <div className="col-span-6 flex flex-col">
                          <span className="font-bold text-[#223230]">{slot.label}</span>
                          <span className="text-[10px] text-gray-400">₱{costOfSlot}/hr</span>
                        </div>
                        <div className="col-span-3 text-center">
                          {slot.court1Status === 'available' ? (
                            <span onClick={() => toggleSlot(1, slot.label)} className={`inline-block w-full py-1 rounded-md border font-bold cursor-pointer transition-all ${isC1Selected ? 'bg-[#4D663B] text-white border-[#4D663B]' : 'text-[#4D663B] border-[#4D663B]/30 bg-[#4D663B]/5 hover:bg-[#4D663B]/10'}`}>
                              {isC1Selected ? '✓' : 'Open'}
                            </span>
                          ) : slot.court1Status === 'past' ? (
                            <span className="inline-block w-full py-1 rounded-md bg-gray-50 text-gray-300 font-medium border border-transparent text-[10px]">Past</span>
                          ) : (
                            <span className="inline-block w-full py-1 rounded-md bg-gray-100 text-gray-400 font-medium border border-transparent text-[10px]">Taken</span>
                          )}
                        </div>
                        <div className="col-span-3 text-center">
                          {slot.court2Status === 'available' ? (
                            <span onClick={() => toggleSlot(2, slot.label)} className={`inline-block w-full py-1 rounded-md border font-bold cursor-pointer transition-all ${isC2Selected ? 'bg-[#4D663B] text-white border-[#4D663B]' : 'text-[#4D663B] border-[#4D663B]/30 bg-[#4D663B]/5 hover:bg-[#4D663B]/10'}`}>
                              {isC2Selected ? '✓' : 'Open'}
                            </span>
                          ) : slot.court2Status === 'past' ? (
                            <span className="inline-block w-full py-1 rounded-md bg-gray-50 text-gray-300 font-medium border border-transparent text-[10px]">Past</span>
                          ) : (
                            <span className="inline-block w-full py-1 rounded-md bg-gray-100 text-gray-400 font-medium border border-transparent text-[10px]">Taken</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cart summary */}
            {selectedSlots.length > 0 && (
              <div className="p-4 bg-[#4D663B]/6 border border-[#4D663B]/20 rounded-xl space-y-3">
                <div className="flex justify-between items-center border-b border-[#4D663B]/15 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#223230]">Selected Slots</h3>
                  <span className="text-xs bg-[#4D663B] text-white px-3 py-0.5 rounded-full font-black">₱{currentCartTotal} total</span>
                </div>
                {cartCourt1.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-[#4D663B] uppercase tracking-wider mb-1">Court 1</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {cartCourt1.map((item, idx) => (
                        <div key={idx} className="text-[11px] bg-white text-[#223230] font-semibold px-2 py-0.5 rounded border border-[#4D663B]/20 flex items-center gap-1">
                          <span>[{item.date.slice(5)}] {item.label.split(' - ')[0]}</span>
                          <span className="text-[10px] text-gray-400">(₱{calculateSlotPrice(item.label)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {cartCourt2.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-[#4D663B] uppercase tracking-wider mb-1">Court 2</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {cartCourt2.map((item, idx) => (
                        <div key={idx} className="text-[11px] bg-white text-[#223230] font-semibold px-2 py-0.5 rounded border border-[#4D663B]/20 flex items-center gap-1">
                          <span>[{item.date.slice(5)}] {item.label.split(' - ')[0]}</span>
                          <span className="text-[10px] text-gray-400">(₱{calculateSlotPrice(item.label)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contact info */}
            {selectedSlots.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#4D663B]">
                  Contact Information <span className="text-red-500">*</span>
                </label>
                <Input placeholder="Full Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                <div>
                  <Input
                    placeholder="Mobile Number (e.g. 09123456789)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={!isPhoneValid ? 'border-red-400 focus-visible:ring-red-400' : ''}
                  />
                  {!isPhoneValid && (
                    <span className="text-xs text-red-500 block mt-1 font-medium">Please provide a valid PH mobile number (09XXXXXXXXX).</span>
                  )}
                </div>
              </div>
            )}

            {/* Captcha */}
            {selectedSlots.length > 0 && customerName.trim() && validatePHPhone(customerPhone) && (
              <div className="flex justify-center pt-2">
                <Turnstile
                  ref={turnstileRef}
                  siteKey="0x4AAAAAAFboskHvUBcywVvJ"
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                />
              </div>
            )}
          </div>

          <div className="p-6 border-t bg-gray-50/50">
            <Button
              className="w-full bg-[#4D663B] hover:bg-[#3b502e] text-white font-bold tracking-wide transition-all"
              disabled={!selectedSlots.length || !customerName.trim() || !validatePHPhone(customerPhone) || !turnstileToken || isSubmitting}
              onClick={handleConfirmReservation}
            >
              {isSubmitting ? 'Reserving...' : 'Confirm Reservation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── PAYMENT MODAL ── */}
      <Dialog open={paymentOpen} onOpenChange={handlePaymentModalClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-3 border-b bg-gray-50/50">
            <DialogTitle className="text-center text-xl font-black text-[#223230]">Reservation Created</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-center">
            <div className="bg-[#4D663B]/6 border border-[#4D663B]/20 rounded-xl p-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#4D663B] font-black block mb-1">Reference Code</span>
              <span className="text-lg font-mono font-bold text-[#223230]">{activeReference}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 border rounded-xl p-3">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block mb-1">Amount Due</span>
                <span className="text-xl font-black text-[#223230]">₱{activeAmount}</span>
              </div>
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-3">
                <span className="text-[10px] uppercase tracking-wider text-red-600 font-bold block mb-1">Expires In</span>
                <span className="text-xl font-mono font-black text-red-600 animate-pulse">{formatTimerString(timeLeft)}</span>
              </div>
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-4 text-left">
              <label className="text-xs font-black uppercase tracking-wider text-[#223230]/60 block text-center">
                Select payment gateway and send payment:
              </label>

              <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 rounded-xl">
                <button type="button" onClick={() => setSelectedMethod('gcash')}
                  className={`py-2 text-xs font-black rounded-lg transition-all ${selectedMethod === 'gcash' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                  GCash
                </button>
                <button type="button" onClick={() => setSelectedMethod('bpi')}
                  className={`py-2 text-xs font-black rounded-lg transition-all ${selectedMethod === 'bpi' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
                  BPI Bank
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl border p-4 text-center space-y-3">
                {selectedMethod === 'gcash' ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-600">
                      Send to GCash: <span className="font-bold text-blue-600">0976-105-8717</span> (Kyle O.)
                    </p>
                    <div className="w-44 h-44 bg-white p-2 border border-blue-200 rounded-xl mx-auto shadow-sm flex items-center justify-center border-dashed border-blue-300">
                       <Image 
                          src="/images/GCASHQR.png" // Update this path to match your image file name
                          alt="GCash QR Code"
                           width={160}  // Explicit width in pixels (matches your container sizing minus padding)
                           height={160} // Explicit height in pixels
                          priority
                          className="object-contain"
                        />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-600">
                      Transfer to BPI: <span className="font-bold text-orange-600">0599340217</span> (KYEPSU)
                    </p>
                    <div className="w-44 h-44 bg-white p-2 border border-orange-200 rounded-xl mx-auto shadow-sm flex items-center justify-center border-dashed border-orange-300">
                      <Image 
                        src="/images/BPIQR.png" // Update this path to match your image file name
                        alt="BPI QR Code"
                        width={160}  // Explicit width in pixels (matches your container sizing minus padding)
                        height={160} // Explicit height in pixels
                        priority
                        className="object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#223230]/60 block">
                  Upload Payment Screenshot <span className="text-red-500">*</span>
                </label>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-white hover:bg-gray-50 hover:border-[#4D663B]/40 transition-all p-4">
                  <span className="text-xs font-semibold text-gray-700">
                    {screenshotFile ? screenshotFile.name : 'Click to select or drop screenshot'}
                  </span>
                  <span className="text-[10px] text-gray-400 mt-1">PNG, JPG up to 5MB</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    if (e.target.files?.[0]) setScreenshotFile(e.target.files[0])
                  }} />
                </label>
              </div>
            </div>
          </div>

          <div className="p-6 border-t bg-gray-50/50">
            <Button className="w-full bg-[#4D663B] hover:bg-[#3b502e] text-white font-bold"
              disabled={!screenshotFile || isUploadingPayment} onClick={handleSubmitPayment}>
              {isUploadingPayment ? 'Uploading Receipt...' : 'Submit Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
