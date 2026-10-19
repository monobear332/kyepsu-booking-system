'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {EventInput } from '@fullcalendar/core'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type CourtKey = 'court1' | 'court2'

interface BookingRecord {
  id: string
  court: string
  start_time: string
  end_time: string
  customer_name: string
  customer_phone: string
  status: 'pending' | 'reserved' | 'confirmed' | 'expired' | 'refunded'
  reference_code: string
  screenshot_url?: string
  payment_method?: string
  amount?: number
}

interface GroupedVerificationRow {
  reference_code: string
  customer_name: string
  customer_phone: string
  payment_method?: string
  screenshot_url?: string
  amount: number
  slotsDescription: string[]
}

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    expired:   'bg-red-100 text-red-600 border-red-200',
    pending:   'bg-amber-100 text-amber-700 border-amber-200',
    reserved:  'bg-blue-100 text-blue-700 border-blue-200',
    refunded:  'bg-purple-100 text-purple-600 border-purple-200',
  }
  return (
    <span className={`inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${styles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  )
}

// ─────────────────────────────────────────────
// COURT CALENDAR
// ─────────────────────────────────────────────
function CourtCalendar({
  courtNumber,
  events,
  onEventClick,
}: {
  courtNumber: number
  events: EventInput[]
  onEventClick: (info: any) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#4D663B] text-white text-xs font-black">
          {courtNumber}
        </div>
        <h2 className="text-base font-black text-[#223230] uppercase tracking-widest">Court {courtNumber} Overview</h2>
        <div className="flex-1 h-px bg-[#4D663B]/15" />
      </div>
      <div className="bg-white rounded-2xl border border-[#E2E8E5] shadow-sm p-2 md:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          allDaySlot={false}
          editable={false}
          selectable={false}
          height="auto"
          timeZone="Asia/Manila"
          events={events}
          eventClick={onEventClick}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────
function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#4D663B] mb-0.5">{label}</p>
      <h2 className="text-xl font-black text-[#223230] tracking-tight">{title}</h2>
      <div className="mt-2 h-px bg-[#E2E8E5]" />
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN ADMIN PAGE
// ─────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [rawBookings, setRawBookings] = useState<BookingRecord[]>([])
  const [historyBookings, setHistoryBookings] = useState<BookingRecord[]>([])
  const HISTORY_PAGE_SIZE = 25

  const [historyMonth, setHistoryMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [historySearchInput, setHistorySearchInput] = useState('')
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyPage, setHistoryPage] = useState(0) // zero-indexed
  const [historyTotalCount, setHistoryTotalCount] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [court1Events, setCourt1Events] = useState<EventInput[]>([])
  const [court2Events, setCourt2Events] = useState<EventInput[]>([])
  const [groupedReviewRows, setGroupedReviewRows] = useState<GroupedVerificationRow[]>([])

  // Booking modal
  const [open, setOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedCourt, setSelectedCourt] = useState<CourtKey>('court1')
  const [selectedStart, setSelectedStart] = useState('')
  const [selectedEnd, setSelectedEnd] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedCurrentStatus, setSelectedCurrentStatus] = useState<BookingRecord['status'] | ''>('')

  // Report modal
  const [reportOpen, setReportOpen] = useState(false)
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [electricityBill, setElectricityBill] = useState('')
  const [waterBill, setWaterBill] = useState('')
  const [salariesPaid, setSalariesPaid] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // ── Auth ──
  useEffect(() => {
    let mounted = true
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (mounted) window.location.href = '/'
      } else {
        if (mounted) { setCheckingAuth(false); refreshAdminDashboard() }
      }
    }
    checkSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_OUT' || !session) && mounted) window.location.href = '/'
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  // ── Data fetching ──
    const refreshAdminDashboard = async () => {
    const startOfTodayIso = new Date().toISOString().split('T')[0] + 'T00:00:00Z'

    // Cutoff: 1 month before today
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - 1)
    const cutoffIso = cutoffDate.toISOString().split('T')[0] + 'T00:00:00Z'

    // Fetch pending/reserved (for verification queue) + confirmed (for calendar),
    // limited to the last month onward to keep the query light
    const { data: all } = await supabase
      .from('bookings').select('*')
      .in('status', ['pending', 'reserved', 'confirmed'])
      .gte('start_time', cutoffIso)
      .order('start_time', { ascending: true })

    const records: BookingRecord[] = all || []
    setRawBookings(records)

    // Calendar only shows confirmed bookings
    const confirmedRecords = records.filter(r => r.status === 'confirmed')

    const mapToEvent = (b: BookingRecord) => ({
      id: b.id,
      title: b.customer_name,
      start: b.start_time.split('+')[0],
      end: b.end_time.split('+')[0],
      color: '#22c55e',
    })

    setCourt1Events(confirmedRecords.filter(r => r.court === '1').map(mapToEvent))
    setCourt2Events(confirmedRecords.filter(r => r.court === '2').map(mapToEvent))

    // Verification queue — only currently-active items awaiting review
    const queue = records.filter(r => r.status === 'reserved' || r.status === 'pending')
    const groupsMap: Record<string, GroupedVerificationRow> = {}
    queue.forEach((item) => {
      const code = item.reference_code
      const datePart = item.start_time.split('T')[0].slice(5)
      const slotStr = `[Ct ${item.court}] ${datePart} @ ${item.start_time.substring(11,16)}–${item.end_time.substring(11,16)}`
      if (!groupsMap[code]) {
        groupsMap[code] = { reference_code: code, customer_name: item.customer_name, customer_phone: item.customer_phone, payment_method: item.payment_method, screenshot_url: item.screenshot_url, amount: item.amount || 0, slotsDescription: [slotStr] }
      } else {
        groupsMap[code].slotsDescription.push(slotStr)
        groupsMap[code].amount += item.amount || 0
      }
    })
    setGroupedReviewRows(Object.values(groupsMap))
  }

  const fetchHistoryBookings = async () => {
    setHistoryLoading(true)
    const [year, month] = historyMonth.split('-').map(Number)
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
    const nextMonth = month === 12
      ? `${year + 1}-01-01T00:00:00`
      : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`

    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .in('status', ['confirmed', 'expired', 'refunded'])
      .gte('start_time', monthStart)
      .lt('start_time', nextMonth)
      .order('start_time', { ascending: false })

    const trimmedSearch = historySearchQuery.trim()
    if (trimmedSearch) {
      query = query.or(`reference_code.ilike.%${trimmedSearch}%,customer_name.ilike.%${trimmedSearch}%`)
    }

    const from = historyPage * HISTORY_PAGE_SIZE
    const to = from + HISTORY_PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) {
      console.error('Failed to fetch transaction history:', error)
      setHistoryLoading(false)
      return
    }
    setHistoryBookings(data || [])
    setHistoryTotalCount(count || 0)
    setHistoryLoading(false)
  }
// Debounce the search input into an actual query value
useEffect(() => {
  const t = setTimeout(() => {
    setHistorySearchQuery(historySearchInput)
    setHistoryPage(0)
  }, 350)
  return () => clearTimeout(t)
}, [historySearchInput])

// Reset to page 0 whenever the month changes
useEffect(() => {
  setHistoryPage(0)
}, [historyMonth])

// Actually fetch whenever month / search / page changes (after auth resolves)
useEffect(() => {
  if (checkingAuth) return
  fetchHistoryBookings()
}, [checkingAuth, historyMonth, historySearchQuery, historyPage])


  const handleLogOut = async () => {
    if (!window.confirm('Log out of admin panel?')) return
    try {
      await supabase.auth.signOut()
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch { window.location.href = '/' }
  }

 const handleBulkUpdateStatus = async (refCode: string, status: 'confirmed' | 'expired') => {
  const { error } = await supabase.from('bookings').update({ status }).eq('reference_code', refCode)
  if (error) { alert('Failed to update status.'); return }

  // Fire the SMS only on approval. Don't block the UI on it.
  if (status === 'confirmed') {
    const { data: { session } } = await supabase.auth.getSession()
    fetch('/api/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ referenceCode: refCode }),
    })
      .then((res) => {
        if (!res.ok) alert(`Booking approved, but the confirmation SMS failed to send. You may want to contact the customer manually (Ref: ${refCode}).`)
      })
      .catch(() => {
        alert(`Booking approved, but the confirmation SMS failed to send. You may want to contact the customer manually (Ref: ${refCode}).`)
      })
  }

  refreshAdminDashboard()
  fetchHistoryBookings()
}

  // ── Booking modal handlers ──
   const handleEventClick = (ev: any, court: CourtKey) => {
    const match = rawBookings.find(r => r.id === ev.id)
    if (!match) return
    setSelectedCourt(court)
    setSelectedEventId(match.id)
    setCustomerName(match.customer_name)
    setCustomerPhone(match.customer_phone)
    setSelectedStart(match.start_time)
    setSelectedEnd(match.end_time)
    setSelectedCurrentStatus(match.status)
    setOpen(true)
  }

  const handleSetStatus = async (status: 'confirmed' | 'expired' | 'refunded') => {
    if (!selectedEventId) return
    const { error } = await supabase.from('bookings').update({ status }).eq('id', selectedEventId)
    if (error) { alert('Failed to update status.'); return }
    setOpen(false)
    refreshAdminDashboard()
    fetchHistoryBookings()
  }




  // ── Report generator ──
  const generateReport = async () => {
    setIsGenerating(true)
    try {
      const [year, month] = reportMonth.split('-').map(Number)
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
      const nextMonth = month === 12 ? `${year + 1}-01-01T00:00:00` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`

      const { data, error } = await supabase
        .from('bookings').select('*')
        .eq('status', 'confirmed')
        .gte('start_time', monthStart)
        .lt('start_time', nextMonth)

      if (error) throw error

      const records: BookingRecord[] = data || []
      const c1 = records.filter(r => r.court === '1')
      const c2 = records.filter(r => r.court === '2')

      const stripTz = (ts: string) => ts.split('+')[0].split('Z')[0]
      const calcHours = (items: BookingRecord[]) =>
        items.reduce((sum, b) => {
          const start = new Date(stripTz(b.start_time)).getTime()
          const end = new Date(stripTz(b.end_time)).getTime()
          const hrs = (end - start) / 3600000
          return sum + (hrs > 0 ? hrs : 0)
        }, 0)
      const c1Hours = calcHours(c1)
      const c2Hours = calcHours(c2)

      const c1Amount = c1.reduce((sum, b) => sum + (b.amount || 0), 0)
      const c2Amount = c2.reduce((sum, b) => sum + (b.amount || 0), 0)
      const grossProfit = c1Amount + c2Amount

      const electricity = parseFloat(electricityBill) || 0
      const water = parseFloat(waterBill) || 0
      const salaries = parseFloat(salariesPaid) || 0
      const totalDeductions = electricity + water + salaries
      const netProfit = grossProfit - totalDeductions

      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })

      const divider = '─'.repeat(40)
      const report = [
        `KYEPSU PICKLEBALL COURT`,
        `Monthly Financial Report`,
        divider,
        `${monthName} ${year}`,
        divider,
        ``,
        `INCOME`,
        ``,
        `  Court 1`,
        `    Total Hours Booked : ${c1.length} hrs`,
        `    Total Amount       : ₱${c1Amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        `  Court 2`,
        `    Total Hours Booked : ${c2.length} hrs`,
        `    Total Amount       : ₱${c2Amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        `  Combined Hours       : ${(c1Hours + c2Hours).toFixed(1)} hrs`,
        `  Gross Income         : ₱${grossProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        divider,
        ``,
        `DEDUCTIONS`,
        ``,
        `  Electricity Bill     : ₱${electricity.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `  Water Bill           : ₱${water.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `  Salaries Paid        : ₱${salaries.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        `  Total Deductions     : ₱${totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        divider,
        ``,
        `NET PROFIT             : ₱${netProfit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        ``,
        divider,
        ``,
        `  Bookings Confirmed`,
        `    Court 1            : ${c1.length} slot(s)`,
        `    Court 2            : ${c2.length} slot(s)`,
        ``,
        `  Report Generated     : ${new Date().toLocaleString('en-PH')}`,
        divider,
      ].join('\n')

      const blob = new Blob([report], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KYEPSU-Report-${monthName}-${year}.txt`
      a.click()
      URL.revokeObjectURL(url)
      setReportOpen(false)
    } catch (err) {
      console.error(err)
      alert('Failed to generate report. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Loading ──
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#4D663B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[#223230]/50 tracking-wide">Verifying admin access…</p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <div className="bg-[#F5F6F3] min-h-screen pb-16">

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-50 bg-[#FAFAF9]/95 backdrop-blur-md border-b border-[#E2E8E5]">
          <div className="h-0.5 w-full bg-gradient-to-r from-[#4D663B] via-[#7a9e5c] to-[#4D663B]" />
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">

            {/* Left: logo + label */}
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="KYEPSU" width={44} height={44} className="rounded-lg" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4D663B] leading-none">KYEPSU</p>
                <p className="text-xs font-bold text-[#223230] leading-tight">Admin Panel</p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-[#4D663B] hover:bg-[#3b502e] text-white font-bold text-xs gap-1.5"
                onClick={() => setReportOpen(true)}
              >
                📊 Generate Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-bold border-[#E2E8E5] text-[#223230]"
                onClick={() => router.push('/')}
              >
                ← Homepage
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs font-bold"
                onClick={handleLogOut}
              >
                Log Out
              </Button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-10">

          {/* ── LEGEND ── */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Pending', color: 'bg-amber-400' },
              { label: 'Reserved', color: 'bg-blue-500' },
              { label: 'Confirmed', color: 'bg-emerald-500' },
              { label: 'Expired', color: 'bg-red-400' },
              { label: 'Refunded', color: 'bg-purple-500' },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-bold text-[#223230]/70">
                <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />{label}
              </span>
            ))}
          </div>

          {/* ── VERIFICATION QUEUE ── */}
          <section className="bg-white rounded-2xl border border-[#E2E8E5] shadow-sm p-6">
            <SectionHeader label="Action Required" title="Payment Verification Queue" />
            <div className="overflow-x-auto rounded-xl border border-[#E2E8E5]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#4D663B]/6 border-b border-[#E2E8E5]">
                  <tr>
                    {['Reference', 'Customer', 'Slots', 'Amount', 'Method', 'Receipt', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#223230]/50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8E5]">
                  {groupedReviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-[#223230]/30 text-sm font-semibold">
                        No pending transactions — you're all caught up.
                      </td>
                    </tr>
                  ) : (
                    groupedReviewRows.map((row) => (
                      <tr key={row.reference_code} className="hover:bg-[#4D663B]/3 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-[#4D663B] text-xs">{row.reference_code}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#223230] text-xs">{row.customer_name}</p>
                          <p className="text-[10px] text-gray-400">{row.customer_phone}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {row.slotsDescription.map((d, i) => (
                              <span key={i} className="text-[10px] bg-[#4D663B]/8 text-[#4D663B] font-bold px-1.5 py-0.5 rounded border border-[#4D663B]/20">{d}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-black text-[#223230]">₱{row.amount.toLocaleString()}</td>
                        <td className="px-4 py-3 text-[10px] font-bold uppercase text-gray-400">{row.payment_method || '—'}</td>
                        <td className="px-4 py-3">
                          {row.screenshot_url ? (
                            <a href={row.screenshot_url} target="_blank" rel="noreferrer"
                              className="text-xs font-bold text-[#4D663B] underline underline-offset-2 hover:text-[#3b502e]">
                              View ↗
                            </a>
                          ) : (
                            <span className="text-[10px] italic text-amber-500 font-semibold">Awaiting…</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button size="sm"
                              className="bg-[#4D663B] hover:bg-[#3b502e] text-white text-[10px] h-7 px-3 font-black"
                              onClick={() => handleBulkUpdateStatus(row.reference_code, 'confirmed')}>
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive"
                              className="text-[10px] h-7 px-3 font-black"
                              onClick={() => handleBulkUpdateStatus(row.reference_code, 'expired')}>
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── TRANSACTION HISTORY ── */}
          <section className="bg-white rounded-2xl border border-[#E2E8E5] shadow-sm p-6">
            <SectionHeader label="Records" title="Transaction History" />

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#4D663B]">Month</label>
                <Input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#4D663B]">
                  Search (Reference or Name)
                </label>
                <Input
                  placeholder="e.g. PB-1234567890 or Juan Dela Cruz"
                  value={historySearchInput}
                  onChange={(e) => setHistorySearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8E5]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#4D663B]/6 border-b border-[#E2E8E5]">
                  <tr>
                    {['Reference', 'Customer', 'Court', 'Date', 'Time Slot', 'Amount', 'Method', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#223230]/50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8E5]">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-[#223230]/30 text-sm font-semibold">Loading…</td>
                    </tr>
                  ) : historyBookings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-[#223230]/30 text-sm font-semibold">
                        No transactions found for this filter.
                      </td>
                    </tr>
                  ) : (
                    historyBookings.map((b) => {
                      const date = b.start_time.split('T')[0]
                      const startT = b.start_time.substring(11, 16)
                      const endT = b.end_time.substring(11, 16)
                      return (
                        <tr key={b.id} className="hover:bg-[#4D663B]/3 transition-colors">
                          <td className="px-4 py-3 font-mono text-[10px] font-bold text-[#4D663B]">{b.reference_code}</td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#223230] text-xs">{b.customer_name}</p>
                            <p className="text-[10px] text-gray-400">{b.customer_phone}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#4D663B] text-white text-[10px] font-black">{b.court}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#223230]/70 font-semibold">{date}</td>
                          <td className="px-4 py-3 text-xs font-mono text-[#223230]/70">{startT}–{endT}</td>
                          <td className="px-4 py-3 font-black text-[#223230] text-xs">₱{(b.amount || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-[10px] font-bold uppercase text-gray-400">{b.payment_method || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {historyTotalCount > 0 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs font-semibold text-[#223230]/50">
                  Showing {historyPage * HISTORY_PAGE_SIZE + 1}–{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, historyTotalCount)} of {historyTotalCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm" className="text-xs font-bold"
                    disabled={historyPage === 0 || historyLoading}
                    onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </Button>
                  <Button
                    variant="outline" size="sm" className="text-xs font-bold"
                    disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotalCount || historyLoading}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ── CALENDARS ── */}
          <section className="space-y-6">
            <div>
              <p className="text-xs text-[#223230]/40 mt-1">
                Click an existing booking to update its status. New bookings can only be made by customers from the homepage.
              </p>
            </div>
            <CourtCalendar
              courtNumber={1}
              events={court1Events}
              onEventClick={(info) => handleEventClick(info.event, 'court1')}
            />
            <CourtCalendar
              courtNumber={2}
              events={court2Events}
              onEventClick={(info) => handleEventClick(info.event, 'court2')}
            />
          </section>
        </div>
      </div>

      {/* ── BOOKING DIALOG ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black text-[#223230]">Booking Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-[#4D663B]/6 border border-[#4D663B]/20 rounded-xl p-3 text-xs font-mono space-y-1.5">
              <p className="text-[#223230]/60"><span className="font-black text-[#4D663B]">Court:</span> {selectedCourt === 'court1' ? 'Court 1' : 'Court 2'}</p>
              <p className="text-[#223230]/60"><span className="font-black text-[#4D663B]">Customer:</span> {customerName}</p>
              <p className="text-[#223230]/60"><span className="font-black text-[#4D663B]">Phone:</span> {customerPhone}</p>
              <p className="text-[#223230]/60"><span className="font-black text-[#4D663B]">From:</span> {selectedStart.substring(0, 16).replace('T', ' ')}</p>
              <p className="text-[#223230]/60"><span className="font-black text-[#4D663B]">To:</span> {selectedEnd.substring(0, 16).replace('T', ' ')}</p>
              <div className="flex items-center gap-2 pt-1">
                <span className="font-black text-[#4D663B]">Status:</span>
                {selectedCurrentStatus && <StatusBadge status={selectedCurrentStatus} />}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#4D663B] block">Update Status</label>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-40"
                  disabled={selectedCurrentStatus === 'confirmed'}
                  onClick={() => handleSetStatus('confirmed')}
                >
                  Mark as Confirmed
                </Button>
                <Button
                  variant="destructive"
                  className="w-full font-bold disabled:opacity-40"
                  disabled={selectedCurrentStatus === 'expired'}
                  onClick={() => handleSetStatus('expired')}
                >
                  Mark as Expired / Cancelled
                </Button>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-40"
                  disabled={selectedCurrentStatus === 'refunded'}
                  onClick={() => handleSetStatus('refunded')}
                >
                  Mark as Refunded
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REPORT DIALOG ── */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black text-[#223230]">Generate Monthly Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[#4D663B] block mb-1">Report Month</label>
              <Input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
              />
            </div>

            <div className="h-px bg-[#E2E8E5]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[#223230]/40">Deductions</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#223230]/60 block mb-1">Electricity Bill (₱)</label>
                <Input
                  type="number"
                  placeholder="e.g. 3500"
                  value={electricityBill}
                  onChange={(e) => setElectricityBill(e.target.value)}
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#223230]/60 block mb-1">Water Bill (₱)</label>
                <Input
                  type="number"
                  placeholder="e.g. 800"
                  value={waterBill}
                  onChange={(e) => setWaterBill(e.target.value)}
                  min="0"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#223230]/60 block mb-1">Salaries Paid (₱)</label>
                <Input
                  type="number"
                  placeholder="e.g. 12000"
                  value={salariesPaid}
                  onChange={(e) => setSalariesPaid(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            <Button
              className="w-full bg-[#4D663B] hover:bg-[#3b502e] text-white font-bold"
              disabled={isGenerating || !reportMonth}
              onClick={generateReport}
            >
              {isGenerating ? 'Generating…' : 'Download Report (.txt)'}
            </Button>

            <p className="text-[10px] text-[#223230]/30 text-center leading-relaxed">
              Only <strong>confirmed</strong> bookings for the selected month are included. Leave deduction fields blank to treat them as ₱0.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
