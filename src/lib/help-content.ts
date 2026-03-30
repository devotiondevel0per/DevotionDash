import type { ModuleId } from "@/lib/permissions";

export type HelpTopicType = "documentation" | "guide" | "tutorial";

export type HelpErrorDetail = {
  errorNumber: number;
  code: string;
  httpStatus: number;
  title: string;
  meaning: string;
  commonCause: string;
  fixSteps: string[];
};

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  type: HelpTopicType;
  module: ModuleId;
  relatedHref: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  audience: string[];
  whenToUse: string[];
  steps: string[];
  tips: string[];
  errorDetails: HelpErrorDetail[];
  updatedAt: string;
};

export const MODULE_LABEL: Record<ModuleId, string> = {
  home: "Home",
  tasks: "Tasks",
  projects: "Projects",
  documents: "Documents",
  email: "E-Mail",
  board: "Board",
  leads: "Leads",
  clients: "Organizations",
  contacts: "Contacts",
  team: "Team",
  calendar: "Calendar",
  chat: "Chat",
  livechat: "Live Chat",
  servicedesk: "Ticket Desk",
  products: "Products",
  accounting: "Accounting",
  ebank: "e-Bank",
  telephony: "Telephony",
  search: "Search",
  help: "Help",
  administration: "Administration",
};

export const TOPIC_TYPE_LABEL: Record<HelpTopicType, string> = {
  documentation: "Documentation",
  guide: "Guide",
  tutorial: "Tutorial",
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting Started With Teamwox",
    summary: "Simple overview of navigation, profile setup, search, and daily workflow basics.",
    type: "documentation",
    module: "help",
    relatedHref: "/home",
    tags: ["onboarding", "basics", "navigation"],
    difficulty: "beginner",
    audience: ["All users", "New joiners"],
    whenToUse: [
      "You are using Teamwox for the first time.",
      "You want a quick understanding of where each module lives.",
      "You need to set a clean daily workflow for your team.",
    ],
    steps: [
      "Start at Home and verify your profile info is correct.",
      "Open Search and test one query across tasks, documents, and chat.",
      "Pin your most-used modules in your daily order (Tasks, Projects, Chat, etc.).",
      "Check notifications and confirm you can open linked records.",
      "Review Help topics for the modules you use most.",
    ],
    tips: [
      "Use Search first before creating duplicate records.",
      "Keep status/stage updates current to avoid reporting mismatch.",
      "If an option is missing, it is usually permission-related.",
    ],
    errorDetails: [
      {
        errorNumber: 1001,
        code: "AUTH_UNAUTHORIZED",
        httpStatus: 401,
        title: "Unauthorized",
        meaning: "Your session is missing, expired, or invalid.",
        commonCause: "Long idle session, stale cookies, or login token mismatch.",
        fixSteps: [
          "Log out and log in again.",
          "If browser is stuck, clear site cookies for the domain.",
          "Confirm server time is correct and token secret did not change unexpectedly.",
        ],
      },
      {
        errorNumber: 1002,
        code: "AUTH_FORBIDDEN",
        httpStatus: 403,
        title: "Forbidden",
        meaning: "You are logged in but do not have permission for this action.",
        commonCause: "Role lacks read/write/manage permission for that module.",
        fixSteps: [
          "Ask admin to review your role in Administration > Users & Access.",
          "Check if module is globally disabled in Administration > Modules.",
        ],
      },
      {
        errorNumber: 1003,
        code: "SECURITY_POLICY_BLOCK",
        httpStatus: 403,
        title: "Blocked by Security Policy",
        meaning: "Network/country/IP rules denied access.",
        commonCause: "IP blocklist or country restriction in security policy.",
        fixSteps: [
          "Ask admin to review Security policy allowlist/blocklist.",
          "Try from approved office/VPN network.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "tasks-lifecycle",
    title: "Task Lifecycle and Stage Management",
    summary: "Create, assign, move, and close tasks correctly using your workflow stages.",
    type: "guide",
    module: "tasks",
    relatedHref: "/tasks",
    tags: ["tasks", "stages", "workflow"],
    difficulty: "beginner",
    audience: ["Executives", "Managers", "Agents"],
    whenToUse: [
      "You need clear ownership and delivery tracking.",
      "You are planning sprint or daily execution tasks.",
      "You want reports to reflect real completion states.",
    ],
    steps: [
      "Create task with clear title, deadline, and assignee.",
      "Set the correct stage instead of only adding comments.",
      "Use intermediate stages before completion for better visibility.",
      "Mark completed when done and verify dashboard counts update.",
      "Review overdue tasks daily and rebalance owners.",
    ],
    tips: [
      "Short title + detailed description gives best search and reporting.",
      "Avoid custom stage sprawl unless business actually needs it.",
      "Use comments for progress, not status.",
    ],
    errorDetails: [
      {
        errorNumber: 2001,
        code: "TASK_VALIDATION_FAILED",
        httpStatus: 400,
        title: "Task Validation Failed",
        meaning: "Required fields are missing or invalid.",
        commonCause: "Empty title, bad assignee, or invalid stage key.",
        fixSteps: [
          "Fill mandatory fields first.",
          "Use a valid assignee and stage from workflow config.",
        ],
      },
      {
        errorNumber: 2002,
        code: "TASK_NOT_FOUND",
        httpStatus: 404,
        title: "Task Not Found",
        meaning: "Task ID no longer exists or is outside your scope.",
        commonCause: "Task was deleted, archived, or belongs to restricted visibility.",
        fixSteps: [
          "Refresh list and search by title.",
          "Check permissions/scope filters (Assigned, Personal, Group).",
        ],
      },
      {
        errorNumber: 2003,
        code: "TASK_PERMISSION_DENIED",
        httpStatus: 403,
        title: "Task Permission Denied",
        meaning: "You can view but cannot edit/manage this task.",
        commonCause: "Role has read-only access.",
        fixSteps: [
          "Request write/manage access for Tasks module.",
          "Ask a manager/admin to perform the action.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "projects-kanban",
    title: "Project Boards and Project Tasks",
    summary: "How to structure projects and use kanban effectively without missing dependencies.",
    type: "tutorial",
    module: "projects",
    relatedHref: "/projects",
    tags: ["projects", "kanban", "planning"],
    difficulty: "intermediate",
    audience: ["Project managers", "Team leads"],
    whenToUse: [
      "You run multi-step execution with dependencies.",
      "You need project-level visibility, not only task-level.",
    ],
    steps: [
      "Create project and define objective, owner, and time window.",
      "Add project tasks grouped by phase or milestone.",
      "Use kanban drag-and-drop to update stage in real time.",
      "Review blocked cards daily and assign clear unblock owner.",
      "Close project only after final QA/sign-off checklist.",
    ],
    tips: [
      "Do not mix unrelated work inside one project.",
      "Keep WIP limits per stage to prevent queue pileup.",
    ],
    errorDetails: [
      {
        errorNumber: 3001,
        code: "PROJECT_LOAD_FAILED",
        httpStatus: 500,
        title: "Project Load Failed",
        meaning: "Server could not return project data.",
        commonCause: "Temporary DB issue or invalid relation in project task mapping.",
        fixSteps: [
          "Refresh and retry.",
          "Check server logs for project route error.",
          "Validate recent migration/schema changes.",
        ],
      },
      {
        errorNumber: 3002,
        code: "PROJECT_TASK_STAGE_INVALID",
        httpStatus: 400,
        title: "Invalid Project Task Stage",
        meaning: "Requested stage is not defined in project workflow config.",
        commonCause: "Stage key mismatch after workflow rename/removal.",
        fixSteps: [
          "Open Administration > Workflow Stages and verify project task stages.",
          "Update stale client payloads to valid stage keys.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "documents-sharing",
    title: "Documents Upload, Sharing, and Permissions",
    summary: "Best practices for document upload, preview, sharing, and access management.",
    type: "documentation",
    module: "documents",
    relatedHref: "/documents",
    tags: ["documents", "upload", "share", "permissions"],
    difficulty: "beginner",
    audience: ["All users", "Knowledge teams"],
    whenToUse: [
      "You need to upload files and share with selected users.",
      "You want to control read/write/delete permissions.",
    ],
    steps: [
      "Upload file into the correct folder first.",
      "Set folder-level and file-level sharing carefully.",
      "Verify preview/open behavior immediately after upload.",
      "Use descriptive names for future search and audits.",
      "Remove stale shares on sensitive documents.",
    ],
    tips: [
      "Folder share can grant broader access than file share.",
      "Large attachments should be tested on both web and mobile.",
    ],
    errorDetails: [
      {
        errorNumber: 4001,
        code: "DOCUMENT_UPLOAD_FAILED",
        httpStatus: 500,
        title: "Document Upload Failed",
        meaning: "File could not be stored successfully.",
        commonCause: "Storage permission issue, invalid path, or request interruption.",
        fixSteps: [
          "Retry with stable network.",
          "Check upload folder permissions on server.",
          "Review server upload route logs.",
        ],
      },
      {
        errorNumber: 4002,
        code: "DOCUMENT_ACCESS_DENIED",
        httpStatus: 403,
        title: "Document Access Denied",
        meaning: "You do not have read permission for this file.",
        commonCause: "Document not owned/shared to you.",
        fixSteps: [
          "Ask owner to share read access.",
          "Validate folder shares and inherited permissions.",
        ],
      },
      {
        errorNumber: 4003,
        code: "DOCUMENT_NOT_FOUND",
        httpStatus: 404,
        title: "Document Not Found",
        meaning: "Document no longer exists or URL is stale.",
        commonCause: "Record deleted/moved or stale link.",
        fixSteps: [
          "Search by name in Documents module.",
          "Request a fresh link from the owner.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "chat-collaboration",
    title: "Internal Chat Collaboration",
    summary: "One-to-one and group chat usage, duplicate-dialog prevention, and media/link sharing.",
    type: "guide",
    module: "chat",
    relatedHref: "/chat",
    tags: ["chat", "dialogs", "groups"],
    difficulty: "beginner",
    audience: ["All users"],
    whenToUse: [
      "You need quick internal communication and context sharing.",
      "You want to keep project discussion linked with actual work records.",
    ],
    steps: [
      "Start direct chat only if dialog does not already exist.",
      "Use group chat for team-level updates and decisions.",
      "Share links/files with meaningful one-line context.",
      "Pin critical dialogs and keep noise low.",
      "Use search/filter before creating new conversation.",
    ],
    tips: [
      "Avoid sending messages to yourself; use notes/tasks instead.",
      "Keep one canonical dialog per person/team to avoid fragmentation.",
    ],
    errorDetails: [
      {
        errorNumber: 5001,
        code: "CHAT_DIALOG_DUPLICATE",
        httpStatus: 409,
        title: "Duplicate Dialog",
        meaning: "A dialog for this participant set already exists.",
        commonCause: "Create call repeated or UI not deduplicating candidates.",
        fixSteps: [
          "Open existing dialog from list instead of creating new.",
          "Ensure client dedupes by normalized member IDs.",
        ],
      },
      {
        errorNumber: 5002,
        code: "CHAT_SELF_MESSAGE_BLOCKED",
        httpStatus: 400,
        title: "Self Chat Blocked",
        meaning: "System blocks creating/sending direct message to your own user.",
        commonCause: "Selected target user equals current logged user.",
        fixSteps: [
          "Choose another user.",
          "For personal reminders, create a task/note instead.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "livechat-agent",
    title: "Live Chat Agent Operations",
    summary: "How agents handle sessions, ordering, assignment, attachments, and response SLAs.",
    type: "tutorial",
    module: "livechat",
    relatedHref: "/livechat",
    tags: ["livechat", "agents", "queue"],
    difficulty: "intermediate",
    audience: ["Support agents", "Support managers"],
    whenToUse: [
      "You manage incoming visitor sessions.",
      "You need reliable queue handling and assignment behavior.",
    ],
    steps: [
      "Open queue and sort by newest or priority policy.",
      "Assign unassigned sessions quickly to avoid delay.",
      "Reply with clear, short messages and confirm action owner.",
      "Attach relevant files/screenshots where needed.",
      "Close conversation only after customer confirmation.",
    ],
    tips: [
      "Keep recent message at bottom for natural chat flow.",
      "Use refresh/auto-refresh controls during high volume periods.",
    ],
    errorDetails: [
      {
        errorNumber: 6001,
        code: "LIVECHAT_ATTACHMENT_FAILED",
        httpStatus: 500,
        title: "Attachment Send Failed",
        meaning: "File could not be sent in live chat.",
        commonCause: "Upload endpoint failure, invalid file metadata, or network timeout.",
        fixSteps: [
          "Retry with smaller file and stable network.",
          "Check server upload logs and MIME validation.",
        ],
      },
      {
        errorNumber: 6002,
        code: "LIVECHAT_ASSIGNMENT_CONFLICT",
        httpStatus: 409,
        title: "Assignment Conflict",
        meaning: "Session assignment changed while you were updating it.",
        commonCause: "Another agent/admin assigned the same session simultaneously.",
        fixSteps: [
          "Refresh queue and reopen updated session owner.",
          "Use clear team assignment protocol in busy shifts.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "servicedesk-requests",
    title: "Ticket Desk Request Handling",
    summary: "Lifecycle, ownership, priority, and stage rules for service desk requests.",
    type: "guide",
    module: "servicedesk",
    relatedHref: "/servicedesk",
    tags: ["tickets", "support", "workflow"],
    difficulty: "intermediate",
    audience: ["Support team", "Operations manager"],
    whenToUse: [
      "You process internal/external support tickets.",
      "You need transparent SLA tracking and closure quality.",
    ],
    steps: [
      "Capture issue clearly with priority and category.",
      "Assign owner immediately and set realistic due date.",
      "Move status as work progresses, not only at closure.",
      "Add customer-facing update before closing.",
      "Use reopen flow if issue returns with evidence.",
    ],
    tips: [
      "A closed ticket without final summary causes re-open churn.",
      "Use standard templates for recurring incident classes.",
    ],
    errorDetails: [
      {
        errorNumber: 7001,
        code: "SERVICEDESK_STATUS_INVALID",
        httpStatus: 400,
        title: "Invalid Ticket Status",
        meaning: "Requested status is not valid for current workflow config.",
        commonCause: "Legacy status key or typo in client request.",
        fixSteps: [
          "Verify active servicedesk stages in Administration.",
          "Use UI status controls instead of manual API payload when possible.",
        ],
      },
      {
        errorNumber: 7002,
        code: "SERVICEDESK_PERMISSION_DENIED",
        httpStatus: 403,
        title: "Ticket Permission Denied",
        meaning: "You are not allowed to update this ticket.",
        commonCause: "Read-only role or scope mismatch.",
        fixSteps: [
          "Ask manager for servicedesk.write/manage permission.",
          "Recheck scope filter (assigned/personal/group).",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "crm-leads",
    title: "Leads and Pipeline Flow",
    summary: "Lead lifecycle, source tracking, and conversion process in simple actionable steps.",
    type: "documentation",
    module: "leads",
    relatedHref: "/leads",
    tags: ["leads", "pipeline", "crm"],
    difficulty: "beginner",
    audience: ["Sales", "CRM managers"],
    whenToUse: [
      "You onboard new leads and track conversion.",
      "You need consistent stage movement and ownership.",
    ],
    steps: [
      "Create lead with complete basic identity fields.",
      "Set source and priority correctly for reporting quality.",
      "Move stage only when exit criteria is achieved.",
      "Record next action and owner before leaving lead.",
      "Mark won/lost with reason for analytics.",
    ],
    tips: [
      "Do not skip source field; it is vital for marketing ROI analysis.",
      "Avoid leaving leads with no next action.",
    ],
    errorDetails: [
      {
        errorNumber: 8001,
        code: "LEAD_STAGE_TRANSITION_BLOCKED",
        httpStatus: 400,
        title: "Lead Stage Transition Blocked",
        meaning: "Requested stage move is not permitted for your role or flow.",
        commonCause: "Terminal stage or missing manage permission.",
        fixSteps: [
          "Review lead stage rules and your role rights.",
          "Ask CRM manager for approve/manage action when needed.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "organizations-contacts",
    title: "Organizations and Contacts Structure",
    summary: "How organizations, contacts, leads, and service history connect.",
    type: "documentation",
    module: "clients",
    relatedHref: "/clients",
    tags: ["organizations", "contacts", "crm"],
    difficulty: "beginner",
    audience: ["Sales", "Support", "Account managers"],
    whenToUse: [
      "You need a single source of truth for customer data.",
      "You need to avoid duplicate organizations/contacts.",
    ],
    steps: [
      "Create organization first, then attach contacts.",
      "Map leads and tickets to the same organization record.",
      "Keep contact roles clear (decision maker, billing, technical).",
      "Update stale contacts before campaign or renewal runs.",
    ],
    tips: [
      "Duplicate org names hurt search and reporting quality.",
      "Use consistent naming convention for branches/subsidiaries.",
    ],
    errorDetails: [
      {
        errorNumber: 9001,
        code: "CLIENT_DUPLICATE_DETECTED",
        httpStatus: 409,
        title: "Duplicate Organization/Contact",
        meaning: "A similar record already exists.",
        commonCause: "New entry created without prior search.",
        fixSteps: [
          "Search by name/email/phone before creating.",
          "Merge or update existing record instead of duplicate insert.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "administration-permissions",
    title: "Roles, Permissions, and Module Access",
    summary: "Detailed role management, module toggles, and secure permission practices.",
    type: "guide",
    module: "administration",
    relatedHref: "/administration",
    tags: ["administration", "rbac", "security"],
    difficulty: "advanced",
    audience: ["Admins", "System managers"],
    whenToUse: [
      "You onboard new teams or departments.",
      "You need strict least-privilege governance.",
      "You troubleshoot missing menu/options for users.",
    ],
    steps: [
      "Create role templates by business function, not by person.",
      "Grant read first, then add write/manage only where needed.",
      "Use user overrides only for exceptions, not normal policy.",
      "Review module toggles and workflow stage configs monthly.",
      "Audit admin actions and high-risk permissions weekly.",
    ],
    tips: [
      "Use Replace mode for strict user overrides.",
      "Keep a rollback role set for emergency access mistakes.",
    ],
    errorDetails: [
      {
        errorNumber: 10001,
        code: "RBAC_OVERRIDE_INVALID",
        httpStatus: 400,
        title: "Invalid Permission Override",
        meaning: "Override payload has invalid module/action structure.",
        commonCause: "Malformed JSON or unsupported module/action key.",
        fixSteps: [
          "Use UI editor instead of manual payload when possible.",
          "Validate module IDs against system module list.",
        ],
      },
      {
        errorNumber: 10002,
        code: "MODULE_TOGGLE_PROTECTED",
        httpStatus: 400,
        title: "Protected Module Cannot Be Disabled",
        meaning: "Core module is always enabled by policy.",
        commonCause: "Attempt to disable home/search/help/administration.",
        fixSteps: [
          "Leave protected modules enabled.",
          "Control visibility via role permissions instead.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
  {
    id: "search-productivity",
    title: "Cross-Module Search Productivity",
    summary: "Use module filters and practical query strategies to find records quickly.",
    type: "tutorial",
    module: "search",
    relatedHref: "/search",
    tags: ["search", "productivity"],
    difficulty: "beginner",
    audience: ["All users"],
    whenToUse: [
      "You need to find items across modules quickly.",
      "You want fewer duplicate records and faster resolution.",
    ],
    steps: [
      "Start broad query, then narrow by module filter.",
      "Use keywords from title plus one unique identifier.",
      "Open most recent results first when troubleshooting.",
      "If no results, verify module permission and spelling.",
    ],
    tips: [
      "Search is permission-aware, so hidden modules return no results.",
      "Short precise queries often perform better than long sentences.",
    ],
    errorDetails: [
      {
        errorNumber: 11001,
        code: "SEARCH_REQUEST_FAILED",
        httpStatus: 500,
        title: "Search Request Failed",
        meaning: "Search API failed to return results.",
        commonCause: "Temporary server issue or unsupported query payload.",
        fixSteps: [
          "Retry query after refresh.",
          "Check API route health and server logs.",
        ],
      },
      {
        errorNumber: 11002,
        code: "SEARCH_FORBIDDEN_MODULE",
        httpStatus: 403,
        title: "Module Not Allowed In Search",
        meaning: "You filtered by module you cannot read.",
        commonCause: "Permission mismatch for selected module filter.",
        fixSteps: [
          "Switch to allowed module filter.",
          "Ask admin for module read access if required.",
        ],
      },
    ],
    updatedAt: "2026-03-31",
  },
];

export function getHelpTopicById(topicId: string) {
  return HELP_TOPICS.find((topic) => topic.id === topicId) ?? null;
}

