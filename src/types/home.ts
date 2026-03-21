export interface HomeTaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  due: string | null;
}

export interface HomeEmailItem {
  id: number;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
}

export interface HomeOrganizationItem {
  id: number;
  name: string;
  type: string;
  rating: string;
  manager: string;
}

export interface HomeEventItem {
  id: number;
  title: string;
  date: string;
  time: string;
  type: string;
}

export interface HomeServiceRequestItem {
  id: number;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  updated: string;
}

export interface HomeMetricBreakdown {
  tasks: {
    opened: number;
    completed: number;
    closed: number;
    highPriorityOpen: number;
    normalPriorityOpen: number;
    lowPriorityOpen: number;
    overdue: number;
    dueToday: number;
    dueInThreeDays: number;
  };
  requests: {
    open: number;
    pending: number;
    closed: number;
    highPriorityActive: number;
    normalPriorityActive: number;
    lowPriorityActive: number;
  };
  emails: {
    unread: number;
    receivedToday: number;
    unreadOlderThan3Days: number;
  };
  events: {
    today: number;
    thisWeek: number;
    allDayThisWeek: number;
  };
  organizations: {
    potential: number;
    client: number;
    partner: number;
    hot: number;
    good: number;
    weak: number;
  };
}

export interface HomeDashboardData {
  activeTasks: number;
  openRequests: number;
  unreadEmails: number;
  todayEvents: number;
  recentTasks: HomeTaskItem[];
  recentEmails: HomeEmailItem[];
  activeOrganizations: HomeOrganizationItem[];
  upcomingEvents: HomeEventItem[];
  recentRequests: HomeServiceRequestItem[];
  dueSoonTasks: HomeTaskItem[];
  breakdown: HomeMetricBreakdown;
}

export type HomeInsightSeverity = "high" | "medium" | "low";

export interface HomeAiRisk {
  title: string;
  reason: string;
  severity: HomeInsightSeverity;
  href: string;
}

export interface HomeAiAction {
  title: string;
  description: string;
  href: string;
}

export interface HomeAiInsightData {
  summary: string;
  focusScore: number;
  highlights: string[];
  risks: HomeAiRisk[];
  actions: HomeAiAction[];
  source: string;
  generatedAt: string;
  fallback: boolean;
}
