"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  MapPin,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

//  Types 

type TeamCalendar = {
  id: string;
  name: string;
  type: string;
  color: string;
  ownerId: string | null;
};

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location: string | null;
  color: string | null;
  calendar: { id: string; name: string; color: string } | null;
};

type ViewMode = "month" | "week" | "day";

//  Helpers 

const WEEK_DAYS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

//  Create Event Dialog 

type CreateEventDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
  calendars: TeamCalendar[];
  prefillDate?: string; // YYYY-MM-DD
};

function CreateEventDialog({
  open,
  onClose,
  onCreated,
  calendars,
  prefillDate,
}: CreateEventDialogProps) {
  const defaultStart = useMemo(() => {
    if (prefillDate) return `${prefillDate}T09:00`;
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalDatetimeString(d);
  }, [prefillDate]);

  const defaultEnd = useMemo(() => {
    if (prefillDate) return `${prefillDate}T10:00`;
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return toLocalDatetimeString(d);
  }, [prefillDate]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [allDay, setAllDay] = useState(false);
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [color, setColor] = useState("#3B82F6");
  const [submitting, setSubmitting] = useState(false);

  // Sync default dates when dialog opens or prefill changes
  useEffect(() => {
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    if (calendars.length > 0 && !calendarId) setCalendarId(calendars[0].id);
  }, [open, defaultStart, defaultEnd, calendars, calendarId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!calendarId) { toast.error("Please select a calendar"); return; }

    const startParsed = new Date(
      allDay ? `${startDate.slice(0, 10)}T00:00:00` : startDate
    );
    const endParsed = new Date(
      allDay ? `${endDate.slice(0, 10)}T23:59:59.999` : endDate
    );

    if (!Number.isFinite(startParsed.getTime()) || !Number.isFinite(endParsed.getTime())) {
      toast.error("Invalid start or end date");
      return;
    }
    if (endParsed < startParsed) {
      toast.error("End time must be after start time");
      return;
    }
    const startIso = startParsed.toISOString();
    const endIso = endParsed.toISOString();

    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId,
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          startDate: startIso,
          endDate: endIso,
          allDay,
          color,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to create event");
      }
      const created = (await res.json()) as CalendarEvent;
      toast.success("Event created");
      onCreated(created);
      onClose();
      setTitle("");
      setDescription("");
      setLocation("");
      setAllDay(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Title *</Label>
            <Input
              id="ev-title"
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ev-allday"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="ev-allday" className="cursor-pointer">All day</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Start *</Label>
              <Input
                id="ev-start"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? startDate.slice(0, 10) : startDate}
                onChange={(e) =>
                  setStartDate(allDay ? e.target.value : e.target.value)
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">End *</Label>
              <Input
                id="ev-end"
                type={allDay ? "date" : "datetime-local"}
                value={allDay ? endDate.slice(0, 10) : endDate}
                onChange={(e) =>
                  setEndDate(allDay ? e.target.value : e.target.value)
                }
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Calendar *</Label>
            <Select value={calendarId} onValueChange={(v) => setCalendarId(v ?? "")} items={Object.fromEntries(calendars.map((cal) => [cal.id, cal.name]))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 shrink-0"
                      style={{ backgroundColor: cal.color }}
                    />
                    {cal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-location">Location</Label>
              <Input
                id="ev-location"
                placeholder="Optional"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="ev-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-12 rounded border border-input cursor-pointer"
                />
                <span className="text-xs text-gray-500">{color}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea
              id="ev-desc"
              placeholder="Optional notes..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: "#FE0000", color: "#fff" }}
            >
              {submitting ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

//  Main Page 

type CreateCalendarDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (calendar: TeamCalendar) => void;
};

function CreateCalendarDialog({
  open,
  onClose,
  onCreated,
}: CreateCalendarDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("personal");
  const [color, setColor] = useState("#FE0000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setType("personal");
    setColor("#FE0000");
    setSaving(false);
  }, [open]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Calendar name is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/calendar/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type, color }),
      });
      const data = (await response.json()) as TeamCalendar | { error?: string };
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Failed to create calendar");
        return;
      }
      onCreated(data as TeamCalendar);
      toast.success("Calendar created");
      onClose();
    } catch {
      toast.error("Failed to create calendar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Calendar</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cal-name">Name *</Label>
            <Input id="cal-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value ?? "personal")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cal-color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="cal-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 rounded border border-input cursor-pointer"
              />
              <span className="text-xs text-gray-500">{color}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#FE0000] text-white hover:bg-[#d70000]" disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CalendarPage() {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDateKey, setSelectedDateKey] = useState(
    dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [view, setView] = useState<ViewMode>("month");

  const [calendars, setCalendars] = useState<TeamCalendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingCalendars, setLoadingCalendars] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [createCalendarOpen, setCreateCalendarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();

  // Load calendars
  useEffect(() => {
    let mounted = true;
    fetch("/api/calendar/calendars")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load calendars");
        return res.json();
      })
      .then((data: TeamCalendar[]) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setCalendars(list);
        setSelectedIds(new Set(list.map((c) => c.id)));
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to load calendars");
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingCalendars(false);
      });
    return () => { mounted = false; };
  }, []);

  // Load events for current visible period
  useEffect(() => {
    let mounted = true;
    let start = new Date(currentYear, currentMonth, 1);
    let end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    if (view === "week") {
      start = startOfWeekMonday(new Date(`${selectedDateKey}T00:00:00`));
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    }
    if (view === "day") {
      start = new Date(`${selectedDateKey}T00:00:00`);
      end = new Date(`${selectedDateKey}T23:59:59.999`);
    }
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
      limit: "500",
    });
    setLoadingEvents(true);
    fetch(`/api/calendar/events?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load events");
        return res.json();
      })
      .then((data: CalendarEvent[]) => {
        if (!mounted) return;
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingEvents(false);
      });
    return () => { mounted = false; };
  }, [currentMonth, currentYear, selectedDateKey, view]);

  // Navigation helpers
  function prevMonth() {
    if (view === "week" || view === "day") {
      const d = new Date(`${selectedDateKey}T00:00:00`);
      d.setDate(d.getDate() - (view === "week" ? 7 : 1));
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
      setSelectedDateKey(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      return;
    }
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  }
  function nextMonth() {
    if (view === "week" || view === "day") {
      const d = new Date(`${selectedDateKey}T00:00:00`);
      d.setDate(d.getDate() + (view === "week" ? 7 : 1));
      setCurrentMonth(d.getMonth());
      setCurrentYear(d.getFullYear());
      setSelectedDateKey(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      return;
    }
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  }
  function goToday() {
    const t = new Date();
    setCurrentMonth(t.getMonth());
    setCurrentYear(t.getFullYear());
    setSelectedDateKey(dateKey(t.getFullYear(), t.getMonth(), t.getDate()));
  }

  function toggleCalendar(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success("Event deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete event");
    }
  }

  // Filtered events by selected calendars
  const filteredEvents = useMemo(
    () => events.filter((e) => e.calendar && selectedIds.has(e.calendar.id)),
    [events, selectedIds]
  );

  // Event map keyed by dateKey
  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      let guard = 0;
      while (cursor <= last && guard < 90) {
        const k = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        const arr = map.get(k) ?? [];
        arr.push(e);
        map.set(k, arr);
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      map.set(k, arr);
    }
    return map;
  }, [filteredEvents]);

  // Upcoming events (next 10 from today)
  const upcomingEvents = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return filteredEvents
      .filter((e) => new Date(e.startDate) >= today)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 10);
  }, [filteredEvents]);

  // Calendar grid cells (Mon-start)
  const daysInMonth = useMemo(
    () => new Date(currentYear, currentMonth + 1, 0).getDate(),
    [currentYear, currentMonth]
  );
  // JS getDay: 0=Sun, convert to Mon-start: Mon=0  Sun=6
  const firstDayRaw = new Date(currentYear, currentMonth, 1).getDay();
  const firstDayMonStart = (firstDayRaw + 6) % 7; // shift so Mon=0

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayMonStart; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const monthLabel = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  const selectedDate = useMemo(() => new Date(`${selectedDateKey}T00:00:00`), [selectedDateKey]);
  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(selectedDate);
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return d;
    });
  }, [selectedDate]);
  const selectedDayEvents = useMemo(
    () => (eventMap.get(selectedDateKey) ?? []),
    [eventMap, selectedDateKey]
  );
  const weekLabel = `${weekDays[0]?.toLocaleDateString([], { month: "short", day: "numeric" })} - ${weekDays[6]?.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  const headerLabel =
    view === "month"
      ? monthLabel
      : view === "week"
        ? weekLabel
        : selectedDate.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });

  const myCalendars = calendars.filter((c) => c.type === "personal");
  const sharedCalendars = calendars.filter((c) => c.type !== "personal");

  return (
    <div className="flex h-full">
      {/*  Left Panel  */}
      <div className="w-56 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b">
          <Button
            size="sm"
            className="w-full"
            style={{ backgroundColor: "#FE0000", color: "#fff" }}
            onClick={() => setCreateCalendarOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Calendar
          </Button>
        </div>

        <div className="flex-1 p-3 space-y-4 overflow-y-auto">
          {loadingCalendars ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <>
              {/* My Calendars */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  My Calendars
                </p>
                <div className="space-y-1">
                  {myCalendars.length === 0 && (
                    <p className="text-xs text-gray-400">Personal calendar</p>
                  )}
                  {myCalendars.map((cal) => {
                    const checked = selectedIds.has(cal.id);
                    return (
                      <label
                        key={cal.id}
                        className="flex items-center gap-2.5 px-1 py-1.5 rounded cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCalendar(cal.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: checked ? cal.color : "#D1D5DB" }}
                        />
                        <span className="text-sm text-gray-700 truncate">{cal.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Shared Calendars */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Shared Calendars
                </p>
                <div className="space-y-1">
                  {sharedCalendars.length === 0 && calendars.length > 0 && (
                    <p className="text-xs text-gray-400">No shared calendars</p>
                  )}
                  {sharedCalendars.length === 0 && calendars.length === 0 && (
                    <p className="text-xs text-gray-400">No calendars found</p>
                  )}
                  {sharedCalendars.map((cal) => {
                    const checked = selectedIds.has(cal.id);
                    return (
                      <label
                        key={cal.id}
                        className="flex items-center gap-2.5 px-1 py-1.5 rounded cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCalendar(cal.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: checked ? cal.color : "#D1D5DB" }}
                        />
                        <span className="text-sm text-gray-700 truncate">{cal.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/*  Main Content  */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* Top bar */}
        <div className="border-b bg-white px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(["month", "week", "day"] as ViewMode[]).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={view === v ? "default" : "ghost"}
                  className={cn(
                    "h-7 px-3 text-xs capitalize",
                    view === v ? "" : "text-gray-600"
                  )}
                  style={view === v ? { backgroundColor: "#FE0000", color: "#fff" } : undefined}
                  onClick={() => setView(v)}
                >
                  {v}
                </Button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-base font-semibold text-gray-900 min-w-40">{headerLabel}</h2>
            <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={goToday}>
              Today
            </Button>
          </div>

          <Button
            size="sm"
            style={{ backgroundColor: "#FE0000", color: "#fff" }}
            onClick={() => { setPrefillDate(undefined); setCreateOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Event
          </Button>
        </div>

        {/* Calendar grid + upcoming list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {view === "month" && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="grid grid-cols-7 border-b">
                {WEEK_DAYS_MON.map((d) => (
                  <div
                    key={d}
                    className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {loadingEvents ? (
                <div className="p-6 space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {cells.map((day, idx) => {
                    const isToday =
                      day === today.getDate() &&
                      currentMonth === today.getMonth() &&
                      currentYear === today.getFullYear();
                    const key = day ? dateKey(currentYear, currentMonth, day) : "";
                    const dayEvents = day ? (eventMap.get(key) ?? []) : [];
                    const selected = day && key === selectedDateKey;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "min-h-[96px] border-b border-r p-1.5 last:border-r-0 transition-colors",
                          day ? "cursor-pointer hover:bg-red-50/20" : "bg-gray-50/50 opacity-40",
                          selected ? "bg-red-50/30" : ""
                        )}
                        onClick={() => {
                          if (!day) return;
                          const dk = dateKey(currentYear, currentMonth, day);
                          setSelectedDateKey(dk);
                        }}
                        onDoubleClick={() => {
                          if (!day) return;
                          const dk = dateKey(currentYear, currentMonth, day);
                          setPrefillDate(dk);
                          setCreateOpen(true);
                        }}
                      >
                        {day && (
                          <>
                            <div
                              className={cn(
                                "h-6 w-6 flex items-center justify-center rounded-full text-xs mb-1 font-medium",
                                isToday ? "text-white font-bold" : "text-gray-700"
                              )}
                              style={isToday ? { backgroundColor: "#FE0000" } : undefined}
                            >
                              {day}
                            </div>
                            <div className="space-y-0.5">
                              {dayEvents.slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className="text-[11px] px-1 py-0.5 rounded text-white truncate leading-4"
                                  style={{
                                    backgroundColor:
                                      event.color || event.calendar?.color || "#3B82F6",
                                  }}
                                  title={event.title}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {event.allDay ? "" : `${new Date(event.startDate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} `}
                                  {event.title}
                                </div>
                              ))}
                              {dayEvents.length > 3 && (
                                <p className="text-[11px] text-gray-400 pl-1">+{dayEvents.length - 3} more</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "week" && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="grid grid-cols-7 border-b">
                {weekDays.map((d) => {
                  const k = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                  const isTodayCell =
                    d.getDate() === today.getDate() &&
                    d.getMonth() === today.getMonth() &&
                    d.getFullYear() === today.getFullYear();
                  return (
                    <button
                      key={k}
                      className={cn(
                        "border-r px-2 py-2 text-left last:border-r-0 hover:bg-gray-50",
                        selectedDateKey === k ? "bg-red-50/50" : ""
                      )}
                      onClick={() => setSelectedDateKey(k)}
                    >
                      <p className="text-xs text-gray-500">{WEEK_DAYS_MON[(d.getDay() + 6) % 7]}</p>
                      <p className={cn("text-sm font-semibold", isTodayCell ? "text-[#FE0000]" : "text-gray-900")}>{d.getDate()}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-7">
                {weekDays.map((d) => {
                  const k = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                  const dayEvents = eventMap.get(k) ?? [];
                  return (
                    <div key={k} className="min-h-[220px] border-r p-2 last:border-r-0">
                      {dayEvents.length === 0 ? (
                        <p className="text-xs text-gray-300">No events</p>
                      ) : (
                        <div className="space-y-1">
                          {dayEvents.map((event) => (
                            <div
                              key={event.id}
                              className="text-[11px] px-2 py-1 rounded text-white truncate"
                              style={{ backgroundColor: event.color || event.calendar?.color || "#3B82F6" }}
                            >
                              {event.allDay ? "All day" : new Date(event.startDate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {event.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "day" && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold text-gray-800">
                  {selectedDate.toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h3>
              </div>
              {loadingEvents ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : selectedDayEvents.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-25" />
                  <p className="text-sm">No events for this day</p>
                </div>
              ) : (
                <div className="divide-y">
                  {selectedDayEvents.map((event) => {
                    const eventColor = event.color || event.calendar?.color || "#3B82F6";
                    return (
                      <div key={event.id} className="flex items-stretch gap-0 hover:bg-gray-50">
                        <div className="w-1 shrink-0 rounded-l" style={{ backgroundColor: eventColor }} />
                        <div className="flex-1 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                              <p className="text-xs text-gray-500 mt-1">{formatEventTime(event)}</p>
                            </div>
                            <button
                              onClick={() => void deleteEvent(event.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-[#FE0000] transition-colors"
                              title="Delete event"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming events */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Upcoming Events</h3>
              {upcomingEvents.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs ml-auto"
                  style={{ backgroundColor: "#FFF0F0", color: "#FE0000" }}
                >
                  {upcomingEvents.length}
                </Badge>
              )}
            </div>

            {loadingEvents ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="py-10 text-center text-gray-400">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-25" />
                <p className="text-sm">No upcoming events</p>
              </div>
            ) : (
              <div className="divide-y">
                {upcomingEvents.map((event) => {
                  const eventColor = event.color || event.calendar?.color || "#3B82F6";
                  const start = new Date(event.startDate);
                  return (
                    <div key={event.id} className="flex items-stretch gap-0 hover:bg-gray-50">
                      <div
                        className="w-1 shrink-0 rounded-l"
                        style={{ backgroundColor: eventColor }}
                      />
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {event.title}
                            </p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="h-3 w-3" />
                                {start.toLocaleDateString([], {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="h-3 w-3" />
                                {formatEventTime(event)}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              )}
                            </div>
                            {event.calendar && (
                              <div className="flex items-center gap-1 mt-1">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: event.calendar.color }}
                                />
                                <span className="text-xs text-gray-400">
                                  {event.calendar.name}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {event.allDay && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-gray-100 text-gray-500"
                              >
                                All day
                              </Badge>
                            )}
                            <button
                              onClick={() => void deleteEvent(event.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-[#FE0000] transition-colors"
                              title="Delete event"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {event.description && (
                          <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateCalendarDialog
        open={createCalendarOpen}
        onClose={() => setCreateCalendarOpen(false)}
        onCreated={(calendar) => {
          setCalendars((prev) => [calendar, ...prev]);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.add(calendar.id);
            return next;
          });
        }}
      />

      {/* Create Event Dialog */}
      <CreateEventDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(event) => setEvents((prev) => [...prev, event])}
        calendars={calendars}
        prefillDate={prefillDate}
      />
    </div>
  );
}

