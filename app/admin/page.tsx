'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { DateSelectArg, EventInput } from '@fullcalendar/core'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type CourtKey = 'court1' | 'court2'

interface BookingRecord {
  id: string
  court: string
  start_time: string
  end_time: string
  customer_name: string
  customer_phone: string
  status: 'pending' | 'reserved' | 'confirmed' | 'expired'
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

type CourtCalendarProps = {
  title: string
  events: EventInput[]
  onSelect: (selectInfo: DateSelectArg) => void
  onEventClick: (eventInfo: any) => void
  onEventChange: (changeInfo: any) => void
}

function CourtCalendar({
  title,
  events,
  onSelect,
  onEventClick,
  onEventChange,
}: CourtCalendarProps) {
  return (
    <div className="mb-10">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">{title}</h2>
      <div className="bg-white p-4 rounded-xl shadow">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          slotMinTime="08:00:00"
          slotMaxTime="24:00:00"
          allDaySlot={false}
          editable={true}
          selectable={true}
          height="auto"
          timeZone="UTC"
          select={onSelect}
          events={events}
          eventClick={onEventClick}
          eventDrop={onEventChange}
          eventResize={onEventChange}
        />
      </div>
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  const [rawBookings, setRawBookings] = useState<BookingRecord[]>([])
  const [court1Events, setCourt1Events] = useState<EventInput[]>([])
  const [court2Events, setCourt2Events] = useState<EventInput[]>([])
  const [groupedReviewRows, setGroupedReviewRows] = useState<GroupedVerificationRow[]>([])

  const [open, setOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  
  const [selectedCourt, setSelectedCourt] = useState<CourtKey>('court1')
  const [selectedStart, setSelectedStart] = useState('')
  const [selectedEnd, setSelectedEnd] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  useEffect(() => {
    let mounted = true

    const checkSessionState = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        if (mounted) window.location.href = '/'
      } else {
        if (mounted) {
          setCheckingAuth(false)
          refreshAdminDashboard()
        }
      }
    }

    checkSessionState()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_OUT' || !session) && mounted) {
        window.location.href = '/'
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshAdminDashboard = async () => {
    const startOfTodayIso = new Date().toISOString().split('T')[0] + 'T00:00:00Z'

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['pending', 'confirmed', 'reserved'])
      .gte('end_time', startOfTodayIso)

    if (error) {
      console.error('Error fetching admin dashboard matrix:', error)
      return
    }

    const records: BookingRecord[] = data || []
    setRawBookings(records)

    const mapToCalendarEvent = (b: BookingRecord) => {
      const cleanStart = b.start_time.split('+')[0]
      const cleanEnd = b.end_time.split('+')[0]
      
      let color = '#f59e0b' // pending
      if (b.status === 'reserved') color = '#3b82f6'
      if (b.status === 'confirmed') color = '#22c55e'

      return {
        id: b.id,
        title: `${b.customer_name} (${b.status.toUpperCase()})`,
        start: cleanStart,
        end: cleanEnd,
        color: color,
      }
    }

    setCourt1Events(records.filter(r => r.court === '1').map(mapToCalendarEvent))
    setCourt2Events(records.filter(r => r.court === '2').map(mapToCalendarEvent))

    const reviewQueue = records.filter(r => r.status === 'reserved' || r.status === 'pending')
    const groupsMap: { [code: string]: GroupedVerificationRow } = {}

    reviewQueue.forEach((item) => {
      const code = item.reference_code
      const datePart = item.start_time.split('T')[0].slice(5) 
      const slotRangeStr = `${item.start_time.substring(11, 16)}-${item.end_time.substring(11, 16)}`
      const slotDescription = `[Ct ${item.court}] ${datePart} @ ${slotRangeStr}`

      if (!groupsMap[code]) {
        groupsMap[code] = {
          reference_code: code,
          customer_name: item.customer_name,
          customer_phone: item.customer_phone,
          payment_method: item.payment_method,
          screenshot_url: item.screenshot_url,
          amount: item.amount || 0,
          slotsDescription: [slotDescription]
        }
      } else {
        groupsMap[code].slotsDescription.push(slotDescription)
        if (item.amount && !groupsMap[code].amount) {
          groupsMap[code].amount = item.amount
        }
      }
    })

    setGroupedReviewRows(Object.values(groupsMap))
  }

  const handleLogOut = async () => {
    const confirmSignout = window.confirm('Are you sure you want to log out of the admin panel?')
    if (!confirmSignout) return

    try {
      await supabase.auth.signOut()
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } catch (err) {
      console.error('Logout operation error:', err)
      window.location.href = '/'
    }
  }

  const handleBulkUpdateStatus = async (referenceCode: string, targetStatus: 'confirmed' | 'expired') => {
    const { error } = await supabase
      .from('bookings')
      .update({ status: targetStatus })
      .eq('reference_code', referenceCode)

    if (error) {
      alert('Failed to modify bulk status changes.')
      return
    }
    refreshAdminDashboard()
  }

  const handleDateSelect = (selectInfo: DateSelectArg, court: CourtKey) => {
    setSelectedCourt(court)
    setSelectedStart(selectInfo.startStr)
    setSelectedEnd(selectInfo.endStr)
    setCustomerName('')
    setCustomerPhone('')
    setIsEditing(false)
    setOpen(true)
  }

  const handleEventClick = (clickedEvent: any, court: CourtKey) => {
    const matchedRecord = rawBookings.find(r => r.id === clickedEvent.id)
    if (!matchedRecord) return

    setSelectedCourt(court)
    setSelectedEventId(matchedRecord.id)
    setCustomerName(matchedRecord.customer_name)
    setCustomerPhone(matchedRecord.customer_phone)
    setSelectedStart(clickedEvent.startStr || matchedRecord.start_time)
    setSelectedEnd(clickedEvent.endStr || matchedRecord.end_time)
    setIsEditing(true)
    setOpen(true)
  }

  const createReservation = async () => {
    if (!customerName.trim()) return
    const courtIdStr = selectedCourt === 'court1' ? '1' : '2'

    const hasOverlap = rawBookings
      .filter(r => r.court === courtIdStr)
      .some(b => new Date(selectedStart) < new Date(b.end_time) && new Date(selectedEnd) > new Date(b.start_time))

    if (hasOverlap) {
      alert('This schedule overlaps an existing reservation.')
      return
    }

    const { error } = await supabase
      .from('bookings')
      .insert([{
        court: courtIdStr,
        start_time: selectedStart,
        end_time: selectedEnd,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || 'ADMIN_DIRECT',
        status: 'confirmed',
        amount: 0, 
        reference_code: `ADM-${Math.floor(100000 + Math.random() * 900000)}`
      }])

    if (error) {
      alert('Failed writing admin reservation slot.')
      return
    }

    setOpen(false)
    refreshAdminDashboard()
  }

  const updateReservation = async () => {
    if (!selectedEventId) return

    const { error } = await supabase
      .from('bookings')
      .update({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim()
      })
      .eq('id', selectedEventId)

    if (error) {
      alert('Failed updating core customer records.')
      return
    }

    setOpen(false)
    setIsEditing(false)
    refreshAdminDashboard()
  }

  const deleteReservation = async () => {
    if (!selectedEventId) return

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', selectedEventId)

    if (error) {
      alert('Failed terminating database registration slot.')
      return
    }

    setOpen(false)
    setIsEditing(false)
    refreshAdminDashboard()
  }

  const handleEventChange = async (changeInfo: any, court: CourtKey) => {
    const eventObj = changeInfo.event
    const courtIdStr = court === 'court1' ? '1' : '2'
    const updatedStart = eventObj.start?.toISOString()
    const updatedEnd = eventObj.end?.toISOString()

    if (!updatedStart || !updatedEnd) return

    const hasOverlap = rawBookings.some((b) => {
      if (b.id === eventObj.id || b.court !== courtIdStr) return false
      return new Date(updatedStart) < new Date(b.end_time) && new Date(updatedEnd) > new Date(b.start_time)
    })

    if (hasOverlap) {
      alert('Modification rejected: Slots overlap another active booking entry.')
      changeInfo.revert()
      return
    }

    const { error } = await supabase
      .from('bookings')
      .update({
        start_time: updatedStart,
        end_time: updatedEnd
      })
      .eq('id', eventObj.id)

    if (error) {
      alert('Failed applying drag/resize updates to database.')
      changeInfo.revert()
      return
    }

    refreshAdminDashboard()
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Authenticating access security layers...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-gray-100 min-h-screen pb-12">
        <header className="bg-white border-b sticky top-0 z-50 shadow-xs">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
              <span className="font-bold text-gray-900 text-sm tracking-wide uppercase">Admin Operations Management</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                className="text-gray-700 border-gray-200 font-semibold"
                onClick={() => router.push('/')}
              >
                ← Back to Home
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                className="font-semibold px-4"
                onClick={handleLogOut}
              >
                Log Out
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-8">
          {/* QUEUE TABLE */}
          <div className="bg-white rounded-xl shadow-md p-6 max-w-6xl mx-auto">
            <div className="mb-4">
              <h1 className="text-2xl font-extrabold text-gray-900">Incoming Receipts & Verification Queue</h1>
              <p className="text-xs text-gray-500">Review grouped bookings by reference number and execute bulk actions.</p>
            </div>

            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-sm text-left text-gray-600 bg-white">
                <thead className="text-xs uppercase bg-gray-50 text-gray-700 border-b">
                  <tr>
                    <th className="px-4 py-3">Reference Code</th>
                    <th className="px-4 py-3">Customer Details</th>
                    <th className="px-4 py-3">Linked Court Time Slots</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Receipt Screenshot</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupedReviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400 font-medium">
                        No transactions awaiting verification.
                      </td>
                    </tr>
                  ) : (
                    groupedReviewRows.map((row) => (
                      <tr key={row.reference_code} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-blue-600">{row.reference_code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{row.customer_name}</div>
                          <div className="text-xs text-gray-400">{row.customer_phone}</div>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex flex-wrap gap-1">
                            {row.slotsDescription.map((desc, idx) => (
                              <span key={idx} className="text-[10px] bg-slate-100 border text-slate-800 font-semibold px-1.5 py-0.5 rounded">
                                {desc}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-extrabold text-gray-900">₱{row.amount}</td>
                        <td className="px-4 py-3 uppercase text-xs font-bold text-gray-500">{row.payment_method || 'N/A'}</td>
                        <td className="px-4 py-3">
                          {row.screenshot_url ? (
                            <a 
                              href={row.screenshot_url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-xs font-semibold text-blue-600 underline hover:text-blue-800 flex items-center gap-1"
                            >
                              View Receipt ↗
                            </a>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium italic">Awaiting Upload...</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7 px-3 font-semibold"
                              onClick={() => handleBulkUpdateStatus(row.reference_code, 'confirmed')}
                            >
                              Approve All
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              className="text-xs h-7 px-3 font-semibold"
                              onClick={() => handleBulkUpdateStatus(row.reference_code, 'expired')}
                            >
                              Reject All
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CALENDARS GRID */}
          <div className="max-w-6xl mx-auto space-y-4">
            <CourtCalendar
              title="Court 1 Overview"
              events={court1Events}
              onSelect={(info) => handleDateSelect(info, 'court1')}
              onEventClick={(info) => handleEventClick(info.event, 'court1')}
              onEventChange={(info) => handleEventChange(info, 'court1')}
            />

            <CourtCalendar
              title="Court 2 Overview"
              events={court2Events}
              onSelect={(info) => handleDateSelect(info, 'court2')}
              onEventClick={(info) => handleEventClick(info.event, 'court2')}
              onEventChange={(info) => handleEventChange(info, 'court2')}
            />
          </div>
        </div>
      </div>

      {/* MANAGE BOOKING DIALOG MODAL */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Modify Reservation Details' : 'Create Admin Overwrite Reservation'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="bg-slate-50 border rounded-lg p-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase block mb-1">Target Coordinates</span>
              <p className="text-xs font-mono font-medium text-slate-700">
                Court: <span className="text-blue-600 font-bold uppercase">{selectedCourt}</span>
              </p>
              <p className="text-xs font-mono font-medium text-slate-700">
                Timeline: <span className="text-emerald-600 font-bold">{selectedStart.substring(0, 16).replace('T', ' ')}</span> to <span className="text-emerald-600 font-bold">{selectedEnd.substring(0, 16).replace('T', ' ')}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Customer Name</label>
                <Input
                  placeholder="e.g. Coach Kyle"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Mobile Contact String</label>
                <Input
                  placeholder="e.g. 09123456789"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2 pt-2">
                <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={updateReservation}>
                  Update Basic Records
                </Button>
                <Button variant="destructive" className="w-full" onClick={deleteReservation}>
                  Delete Booking Entirely
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2" onClick={createReservation}>
                Inject Block Reservation
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}