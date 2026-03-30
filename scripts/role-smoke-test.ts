import { mkdir, writeFile } from "node:fs/promises";

type ActorKey = "admin" | "manager" | "user";

type ModuleCheck = {
  moduleId: string;
  path: string;
  method?: "GET";
};

type CheckResult = {
  moduleId: string;
  expectedRead: boolean;
  status: number;
  outcome: "pass" | "fail";
  reason: string;
};

type ActorReport = {
  actor: ActorKey;
  login: string;
  isAdmin: boolean;
  loginOk: boolean;
  loginStatus: number;
  loginError: string | null;
  checkResults: CheckResult[];
};

type HttpResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | unknown[] | null;
};

type QaUserSpec = {
  key: Exclude<ActorKey, "admin">;
  login: string;
  email: string;
  name: string;
  surname: string;
  fullname: string;
  roleName: string;
  roleColor: string;
  membershipRole: "member" | "manager";
  permissions: Record<string, ("read" | "write" | "manage")[]>;
};

const baseUrl = (process.env.TEST_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const adminCreds = {
  login: process.env.TEST_ADMIN_LOGIN ?? "admin",
  password: process.env.TEST_ADMIN_PASSWORD ?? "admin123",
};

const qaPassword = process.env.TEST_QA_PASSWORD ?? "QaUser@123";

const qaUsers: QaUserSpec[] = [
  {
    key: "manager",
    login: "qa_manager",
    email: "qa_manager@zeddash.local",
    name: "QA",
    surname: "Manager",
    fullname: "QA Manager",
    roleName: "QA CRM Manager",
    roleColor: "#5EAD63",
    membershipRole: "manager",
    permissions: {
      home: ["read"],
      leads: ["read", "write", "manage"],
      clients: ["read", "write", "manage"],
      contacts: ["read", "write", "manage"],
      livechat: ["read", "write", "manage"],
      servicedesk: ["read", "write", "manage"],
      email: ["read", "write"],
      chat: ["read", "write"],
      search: ["read"],
    },
  },
  {
    key: "user",
    login: "qa_user",
    email: "qa_user@zeddash.local",
    name: "QA",
    surname: "User",
    fullname: "QA User",
    roleName: "QA Employee",
    roleColor: "#437388",
    membershipRole: "member",
    permissions: {
      home: ["read"],
      tasks: ["read", "write"],
      projects: ["read", "write"],
      documents: ["read", "write"],
      email: ["read", "write"],
      board: ["read", "write"],
      leads: ["read", "write"],
      clients: ["read"],
      contacts: ["read"],
      team: ["read"],
      calendar: ["read", "write"],
      chat: ["read", "write"],
      livechat: ["read", "write"],
      servicedesk: ["read", "write"],
      search: ["read"],
    },
  },
];

const moduleChecks: ModuleCheck[] = [
  { moduleId: "home", path: "/api/home/stats" },
  { moduleId: "tasks", path: "/api/tasks?limit=1" },
  { moduleId: "projects", path: "/api/projects?limit=1" },
  { moduleId: "documents", path: "/api/documents?category=all" },
  { moduleId: "email", path: "/api/email?limit=1" },
  { moduleId: "board", path: "/api/board?limit=1" },
  { moduleId: "leads", path: "/api/leads?limit=1" },
  { moduleId: "clients", path: "/api/clients?limit=1" },
  { moduleId: "contacts", path: "/api/contacts?limit=1" },
  { moduleId: "team", path: "/api/team?limit=1" },
  { moduleId: "calendar", path: "/api/calendar/events" },
  { moduleId: "chat", path: "/api/chat/dialogs" },
  { moduleId: "livechat", path: "/api/livechat/dialogs?status=all&limit=1" },
  { moduleId: "servicedesk", path: "/api/servicedesk?limit=1" },
  { moduleId: "products", path: "/api/products?limit=1" },
  { moduleId: "accounting", path: "/api/accounting/books?limit=1" },
  { moduleId: "ebank", path: "/api/ebank/accounts" },
  { moduleId: "telephony", path: "/api/telephony/providers" },
  { moduleId: "search", path: "/api/search?q=smoke" },
  { moduleId: "administration", path: "/api/administration/users?limit=1" },
];

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function requestJson(
  method: "GET" | "POST" | "PUT",
  path: string,
  token?: string,
  body?: Record<string, unknown>
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | unknown[] | null;
  return { ok: response.ok, status: response.status, data };
}

async function loginMobile(login: string, password: string) {
  const result = await requestJson("POST", "/api/auth/mobile", undefined, { login, password });
  const obj = asObject(result.data);
  return {
    ok: result.ok,
    status: result.status,
    token: typeof obj?.token === "string" ? obj.token : null,
    error: typeof obj?.error === "string" ? obj.error : null,
  };
}

async function checkServerReachable() {
  const result = await requestJson("GET", "/api/public/branding");
  if (!result.ok) {
    throw new Error(`Cannot reach ${baseUrl}. Branding request failed with HTTP ${result.status}.`);
  }
}

async function ensureRole(
  adminToken: string,
  roleName: string,
  roleColor: string,
  permissions: Record<string, ("read" | "write" | "manage")[]>
) {
  const rolesResult = await requestJson("GET", "/api/administration/roles", adminToken);
  if (!rolesResult.ok) {
    throw new Error(`Cannot load roles: HTTP ${rolesResult.status}`);
  }
  const rolesPayload = asObject(rolesResult.data);
  const roles = Array.isArray(rolesPayload?.roles) ? (rolesPayload?.roles as Record<string, unknown>[]) : [];

  const existing = roles.find((role) => role.name === roleName);
  if (existing && typeof existing.id === "string") {
    return existing.id;
  }

  const createResult = await requestJson("POST", "/api/administration/roles", adminToken, {
    name: roleName,
    color: roleColor,
    permissions,
  });
  if (!createResult.ok) {
    throw new Error(`Cannot create role ${roleName}: HTTP ${createResult.status}`);
  }
  const created = asObject(createResult.data);
  if (!created || typeof created.id !== "string") {
    throw new Error(`Role creation did not return an id for ${roleName}.`);
  }
  return created.id;
}

async function ensureQaUser(adminToken: string, roleId: string, spec: QaUserSpec) {
  const usersResult = await requestJson("GET", "/api/administration/users", adminToken);
  if (!usersResult.ok) {
    throw new Error(`Cannot load users: HTTP ${usersResult.status}`);
  }
  const users = Array.isArray(usersResult.data) ? (usersResult.data as Record<string, unknown>[]) : [];
  const existing = users.find((user) => user.login === spec.login);

  let userId = typeof existing?.id === "string" ? existing.id : null;

  if (!userId) {
    const createResult = await requestJson("POST", "/api/administration/users", adminToken, {
      login: spec.login,
      email: spec.email,
      password: qaPassword,
      name: spec.name,
      surname: spec.surname,
      fullname: spec.fullname,
      isAdmin: false,
      isActive: true,
      roleIds: [roleId],
    });
    if (!createResult.ok) {
      throw new Error(`Cannot create user ${spec.login}: HTTP ${createResult.status}`);
    }
    const created = asObject(createResult.data);
    if (!created || typeof created.id !== "string") {
      throw new Error(`User creation did not return an id for ${spec.login}.`);
    }
    userId = created.id;
  } else {
    const profileResult = await requestJson("PUT", `/api/administration/users/${userId}`, adminToken, {
      name: spec.name,
      surname: spec.surname,
      fullname: spec.fullname,
      email: spec.email,
      isAdmin: false,
      isActive: true,
    });
    if (!profileResult.ok) {
      throw new Error(`Cannot update user ${spec.login}: HTTP ${profileResult.status}`);
    }
  }

  const passwordResult = await requestJson(
    "PUT",
    `/api/administration/users/${userId}/password`,
    adminToken,
    { password: qaPassword }
  );
  if (!passwordResult.ok) {
    throw new Error(`Cannot reset password for ${spec.login}: HTTP ${passwordResult.status}`);
  }

  const rolesResult = await requestJson(
    "PUT",
    `/api/administration/users/${userId}/roles`,
    adminToken,
    {
      groupIds: [roleId],
      membershipRole: spec.membershipRole,
    }
  );
  if (!rolesResult.ok) {
    throw new Error(`Cannot assign role for ${spec.login}: HTTP ${rolesResult.status}`);
  }
}

async function ensureQaAccounts(adminToken: string) {
  for (const spec of qaUsers) {
    const roleId = await ensureRole(adminToken, spec.roleName, spec.roleColor, spec.permissions);
    await ensureQaUser(adminToken, roleId, spec);
  }
}

function moduleCanRead(permissions: unknown, moduleId: string): boolean {
  const permObj = asObject(permissions);
  const modulePermissions = asObject(permObj?.[moduleId]);
  return Boolean(modulePermissions?.read);
}

async function checkModuleAccess(
  token: string,
  permissions: unknown,
  check: ModuleCheck,
  isAdmin: boolean
): Promise<CheckResult> {
  const expectedRead = isAdmin || moduleCanRead(permissions, check.moduleId);
  const method = check.method ?? "GET";
  const result = await requestJson(method, check.path, token);

  if (!expectedRead && result.status !== 403) {
    return {
      moduleId: check.moduleId,
      expectedRead,
      status: result.status,
      outcome: "fail",
      reason: "Expected 403 forbidden, but endpoint was accessible.",
    };
  }

  if (expectedRead && result.status === 403) {
    return {
      moduleId: check.moduleId,
      expectedRead,
      status: result.status,
      outcome: "fail",
      reason: "Expected read access, but endpoint returned 403.",
    };
  }

  if (expectedRead && result.status >= 500) {
    return {
      moduleId: check.moduleId,
      expectedRead,
      status: result.status,
      outcome: "fail",
      reason: "Read access exists, but endpoint returned a server error.",
    };
  }

  return {
    moduleId: check.moduleId,
    expectedRead,
    status: result.status,
    outcome: "pass",
    reason: "OK",
  };
}

async function runForActor(actor: ActorKey, login: string, password: string): Promise<ActorReport> {
  const loginResult = await loginMobile(login, password);
  if (!loginResult.ok || !loginResult.token) {
    return {
      actor,
      login,
      isAdmin: false,
      loginOk: false,
      loginStatus: loginResult.status,
      loginError: loginResult.error ?? "Login failed",
      checkResults: [],
    };
  }

  const permsResult = await requestJson("GET", "/api/permissions", loginResult.token);
  const permsObj = asObject(permsResult.data);
  const isAdmin = permsObj?.isAdmin === true;

  if (!permsResult.ok || !permsObj) {
    return {
      actor,
      login,
      isAdmin,
      loginOk: false,
      loginStatus: permsResult.status,
      loginError: "Failed to fetch /api/permissions",
      checkResults: [],
    };
  }

  const permissions = permsObj.permissions;
  const checkResults: CheckResult[] = [];
  for (const check of moduleChecks) {
    const row = await checkModuleAccess(loginResult.token, permissions, check, isAdmin);
    checkResults.push(row);
  }

  return {
    actor,
    login,
    isAdmin,
    loginOk: true,
    loginStatus: loginResult.status,
    loginError: null,
    checkResults,
  };
}

function printReport(reports: ActorReport[]) {
  console.log("");
  console.log("Role smoke test report");
  console.log("======================");
  console.log(`Server: ${baseUrl}`);
  console.log(`Checked modules: ${moduleChecks.length}`);
  console.log("");

  for (const report of reports) {
    console.log(`${report.actor.toUpperCase()} (${report.login})`);
    if (!report.loginOk) {
      console.log(`  Login: FAIL (${report.loginStatus}) ${report.loginError ?? ""}`);
      console.log("");
      continue;
    }

    const pass = report.checkResults.filter((row) => row.outcome === "pass").length;
    const fail = report.checkResults.length - pass;
    console.log(`  Login: PASS (${report.loginStatus})`);
    console.log(`  Module checks: ${pass} passed, ${fail} failed`);
    for (const row of report.checkResults.filter((item) => item.outcome === "fail")) {
      console.log(`  - ${row.moduleId}: FAIL [${row.status}] ${row.reason}`);
    }
    console.log("");
  }
}

async function saveReport(reports: ActorReport[]) {
  await mkdir("temp", { recursive: true });
  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    checks: moduleChecks,
    qaUsers: qaUsers.map((user) => ({ key: user.key, login: user.login, roleName: user.roleName })),
    reports,
  };
  await writeFile("temp/role-smoke-report.json", JSON.stringify(output, null, 2), "utf8");
  console.log("Saved JSON report: temp/role-smoke-report.json");
}

async function main() {
  console.log(`Using server: ${baseUrl}`);
  await checkServerReachable();

  const adminLogin = await loginMobile(adminCreds.login, adminCreds.password);
  if (!adminLogin.ok || !adminLogin.token) {
    throw new Error(`Admin login failed (${adminLogin.status}): ${adminLogin.error ?? "unknown error"}`);
  }
  await ensureQaAccounts(adminLogin.token);

  const reports: ActorReport[] = [];
  reports.push(await runForActor("admin", adminCreds.login, adminCreds.password));
  for (const spec of qaUsers) {
    reports.push(await runForActor(spec.key, spec.login, qaPassword));
  }

  printReport(reports);
  await saveReport(reports);

  const totalFails = reports.reduce((sum, report) => {
    if (!report.loginOk) return sum + 1;
    return sum + report.checkResults.filter((row) => row.outcome === "fail").length;
  }, 0);
  if (totalFails > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
