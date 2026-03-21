import { prisma } from "@/lib/prisma";
import type { HomeDashboardData } from "@/types/home";

function formatPersonName(person?: { fullname?: string | null; name?: string | null; surname?: string | null }) {
  if (!person) return "Unassigned";
  if (person.fullname && person.fullname.trim()) return person.fullname.trim();
  return [person.name ?? "", person.surname ?? ""].join(" ").trim() || "Unassigned";
}

function formatEmailDate(date: Date, todayStart: Date, tomorrowStart: Date) {
  if (date >= todayStart && date < tomorrowStart) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatShortDate(date: Date, todayStart: Date, tomorrowStart: Date) {
  if (date >= todayStart && date < tomorrowStart) return "Today";
  if (date >= tomorrowStart) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return `Overdue (${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
}

export async function getHomeDashboardData(userId: string): Promise<HomeDashboardData> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const nextThreeDays = new Date(todayStart);
  nextThreeDays.setDate(nextThreeDays.getDate() + 3);
  const nextWeek = new Date(todayStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const threeDaysAgo = new Date(todayStart);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const taskScope = {
    OR: [{ creatorId: userId }, { assignees: { some: { userId } } }],
  };
  const requestScope = {
    OR: [{ requesterId: userId }, { assigneeId: userId }],
  };

  const calendars = await prisma.calendar.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    select: { id: true },
  });

  const calendarIds = calendars.map((c) => c.id);
  const eventWhereBase = calendarIds.length > 0 ? { calendarId: { in: calendarIds } } : { calendarId: "__none__" };

  const [
    activeTasks,
    openRequests,
    unreadEmails,
    todayEvents,
    taskCompletedCount,
    taskClosedCount,
    overdueTasks,
    dueTodayTasks,
    dueInThreeDaysTasks,
    highPriorityOpenTasks,
    normalPriorityOpenTasks,
    lowPriorityOpenTasks,
    requestPendingCount,
    requestClosedCount,
    highPriorityActiveRequests,
    normalPriorityActiveRequests,
    lowPriorityActiveRequests,
    receivedTodayEmails,
    unreadOlderThan3DaysEmails,
    thisWeekEvents,
    allDayThisWeekEvents,
    orgPotentialCount,
    orgClientCount,
    orgPartnerCount,
    orgHotCount,
    orgGoodCount,
    orgWeakCount,
    recentTasksRaw,
    dueSoonTasksRaw,
    recentEmailsRaw,
    organizationsRaw,
    upcomingEventsRaw,
    recentRequestsRaw,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: "open",
      },
    }),
    prisma.email.count({
      where: {
        isRead: false,
        status: { not: "deleted" },
        recipients: { some: { userId } },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        ...eventWhereBase,
        startDate: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "completed",
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "closed",
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        dueDate: { lt: todayStart },
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        dueDate: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        dueDate: { gte: todayStart, lte: nextThreeDays },
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        priority: "high",
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        priority: "normal",
      },
    }),
    prisma.task.count({
      where: {
        ...taskScope,
        status: "opened",
        priority: "low",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: "pending",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: "closed",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: { in: ["open", "pending"] },
        priority: "high",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: { in: ["open", "pending"] },
        priority: "normal",
      },
    }),
    prisma.serviceDeskRequest.count({
      where: {
        ...requestScope,
        status: { in: ["open", "pending"] },
        priority: "low",
      },
    }),
    prisma.email.count({
      where: {
        status: { not: "deleted" },
        recipients: { some: { userId } },
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.email.count({
      where: {
        isRead: false,
        status: { not: "deleted" },
        recipients: { some: { userId } },
        createdAt: { lt: threeDaysAgo },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        ...eventWhereBase,
        startDate: { gte: todayStart, lte: nextWeek },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        ...eventWhereBase,
        allDay: true,
        startDate: { gte: todayStart, lte: nextWeek },
      },
    }),
    prisma.organization.count({
      where: { status: "open", type: "potential" },
    }),
    prisma.organization.count({
      where: { status: "open", type: "client" },
    }),
    prisma.organization.count({
      where: { status: "open", type: "partner" },
    }),
    prisma.organization.count({
      where: { status: "open", rating: "hot" },
    }),
    prisma.organization.count({
      where: { status: "open", rating: "good" },
    }),
    prisma.organization.count({
      where: { status: "open", rating: "weak" },
    }),
    prisma.task.findMany({
      where: taskScope,
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        creator: { select: { name: true, surname: true, fullname: true } },
        assignees: {
          include: {
            user: { select: { name: true, surname: true, fullname: true } },
          },
          take: 1,
        },
      },
    }),
    prisma.task.findMany({
      where: {
        ...taskScope,
        status: "opened",
        dueDate: { gte: todayStart, lte: nextThreeDays },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        creator: { select: { name: true, surname: true, fullname: true } },
        assignees: {
          include: {
            user: { select: { name: true, surname: true, fullname: true } },
          },
          take: 1,
        },
      },
    }),
    prisma.email.findMany({
      where: {
        recipients: { some: { userId } },
        status: { not: "deleted" },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        from: { select: { name: true, surname: true, fullname: true } },
      },
    }),
    prisma.organization.findMany({
      where: { status: "open" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        manager: { select: { name: true, surname: true, fullname: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        ...eventWhereBase,
        startDate: { gte: todayStart, lte: nextWeek },
      },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    prisma.serviceDeskRequest.findMany({
      where: requestScope,
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        assignee: { select: { name: true, surname: true, fullname: true } },
      },
    }),
  ]);

  const recentTasks = recentTasksRaw.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: formatPersonName(task.assignees[0]?.user ?? task.creator),
    due: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
  }));

  const dueSoonTasks = dueSoonTasksRaw.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: formatPersonName(task.assignees[0]?.user ?? task.creator),
    due: task.dueDate ? formatShortDate(task.dueDate, todayStart, tomorrowStart) : "No due date",
  }));

  const recentEmails = recentEmailsRaw.map((email, index) => ({
    id: index + 1,
    from: formatPersonName(email.from ?? undefined),
    subject: email.subject,
    date: formatEmailDate(email.createdAt, todayStart, tomorrowStart),
    unread: !email.isRead,
  }));

  const activeOrganizations = organizationsRaw.map((org, index) => ({
    id: index + 1,
    name: org.name,
    type: org.type,
    rating: org.rating,
    manager: formatPersonName(org.manager ?? undefined),
  }));

  const upcomingEvents = upcomingEventsRaw.map((event, index) => ({
    id: index + 1,
    title: event.title,
    date: formatEventDate(event.startDate),
    time: event.allDay ? "All day" : formatEventTime(event.startDate),
    type: event.allDay ? "all-day" : "event",
  }));

  const recentRequests = recentRequestsRaw.map((request, index) => ({
    id: index + 1,
    title: request.title,
    status: request.status,
    priority: request.priority,
    assignee: formatPersonName(request.assignee ?? undefined),
    updated: request.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return {
    activeTasks,
    openRequests,
    unreadEmails,
    todayEvents,
    recentTasks,
    recentEmails,
    activeOrganizations,
    upcomingEvents,
    recentRequests,
    dueSoonTasks,
    breakdown: {
      tasks: {
        opened: activeTasks,
        completed: taskCompletedCount,
        closed: taskClosedCount,
        highPriorityOpen: highPriorityOpenTasks,
        normalPriorityOpen: normalPriorityOpenTasks,
        lowPriorityOpen: lowPriorityOpenTasks,
        overdue: overdueTasks,
        dueToday: dueTodayTasks,
        dueInThreeDays: dueInThreeDaysTasks,
      },
      requests: {
        open: openRequests,
        pending: requestPendingCount,
        closed: requestClosedCount,
        highPriorityActive: highPriorityActiveRequests,
        normalPriorityActive: normalPriorityActiveRequests,
        lowPriorityActive: lowPriorityActiveRequests,
      },
      emails: {
        unread: unreadEmails,
        receivedToday: receivedTodayEmails,
        unreadOlderThan3Days: unreadOlderThan3DaysEmails,
      },
      events: {
        today: todayEvents,
        thisWeek: thisWeekEvents,
        allDayThisWeek: allDayThisWeekEvents,
      },
      organizations: {
        potential: orgPotentialCount,
        client: orgClientCount,
        partner: orgPartnerCount,
        hot: orgHotCount,
        good: orgGoodCount,
        weak: orgWeakCount,
      },
    },
  };
}

