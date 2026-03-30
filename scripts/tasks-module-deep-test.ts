import { mkdir, writeFile } from "node:fs/promises";

type ActorKey = "admin" | "manager" | "user";

type PermissionSet = {
  read: boolean;
  write: boolean;
  manage: boolean;
};

type HttpResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | unknown[] | null;
};

type StepResult = {
  actor: ActorKey | "cross-role";
  step: string;
  expected: string;
  status: number;
  outcome: "pass" | "fail";
  details: string;
};

type ActorContext = {
  actor: ActorKey;
  login: string;
  token: string;
  userId: string;
  isAdmin: boolean;
  tasksPermission: PermissionSet;
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function requestJson(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

async function requestMultipart(
  path: string,
  token: string,
  formData: FormData
): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
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
  const branding = await requestJson("GET", "/api/public/branding");
  if (!branding.ok) {
    throw new Error(`Cannot reach ${baseUrl}; branding endpoint returned HTTP ${branding.status}.`);
  }
}

async function ensureRole(
  adminToken: string,
  roleName: string,
  roleColor: string,
  permissions: Record<string, ("read" | "write" | "manage")[]>
) {
  const rolesResult = await requestJson("GET", "/api/administration/roles", adminToken);
  if (!rolesResult.ok) throw new Error(`Cannot load roles: HTTP ${rolesResult.status}`);
  const payload = asObject(rolesResult.data);
  const roles = Array.isArray(payload?.roles) ? (payload.roles as Record<string, unknown>[]) : [];
  const existing = roles.find((role) => role.name === roleName);
  if (existing && typeof existing.id === "string") return existing.id;

  const createRole = await requestJson("POST", "/api/administration/roles", adminToken, {
    name: roleName,
    color: roleColor,
    permissions,
  });
  if (!createRole.ok) throw new Error(`Cannot create role ${roleName}: HTTP ${createRole.status}`);
  const created = asObject(createRole.data);
  if (!created || typeof created.id !== "string") throw new Error(`Role create missing id for ${roleName}`);
  return created.id;
}

async function ensureQaUser(adminToken: string, roleId: string, spec: QaUserSpec) {
  const usersResult = await requestJson("GET", "/api/administration/users", adminToken);
  if (!usersResult.ok) throw new Error(`Cannot load users: HTTP ${usersResult.status}`);
  const users = Array.isArray(usersResult.data) ? (usersResult.data as Record<string, unknown>[]) : [];
  const existing = users.find((user) => user.login === spec.login);
  let userId = typeof existing?.id === "string" ? existing.id : null;

  if (!userId) {
    const created = await requestJson("POST", "/api/administration/users", adminToken, {
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
    if (!created.ok) throw new Error(`Cannot create user ${spec.login}: HTTP ${created.status}`);
    const createdObj = asObject(created.data);
    if (!createdObj || typeof createdObj.id !== "string") throw new Error(`User create missing id for ${spec.login}`);
    userId = createdObj.id;
  } else {
    const updated = await requestJson("PUT", `/api/administration/users/${userId}`, adminToken, {
      name: spec.name,
      surname: spec.surname,
      fullname: spec.fullname,
      email: spec.email,
      isAdmin: false,
      isActive: true,
    });
    if (!updated.ok) throw new Error(`Cannot update user ${spec.login}: HTTP ${updated.status}`);
  }

  const passwordResult = await requestJson("PUT", `/api/administration/users/${userId}/password`, adminToken, {
    password: qaPassword,
  });
  if (!passwordResult.ok) throw new Error(`Cannot reset password for ${spec.login}: HTTP ${passwordResult.status}`);

  const roleAssign = await requestJson("PUT", `/api/administration/users/${userId}/roles`, adminToken, {
    groupIds: [roleId],
    membershipRole: spec.membershipRole,
  });
  if (!roleAssign.ok) throw new Error(`Cannot assign role for ${spec.login}: HTTP ${roleAssign.status}`);
}

async function ensureQaAccounts(adminToken: string) {
  for (const spec of qaUsers) {
    const roleId = await ensureRole(adminToken, spec.roleName, spec.roleColor, spec.permissions);
    await ensureQaUser(adminToken, roleId, spec);
  }
}

function tasksPermissionFromPayload(permsPayload: Record<string, unknown> | null): PermissionSet {
  const permissions = asObject(permsPayload?.permissions);
  const tasks = asObject(permissions?.tasks);
  return {
    read: Boolean(tasks?.read),
    write: Boolean(tasks?.write),
    manage: Boolean(tasks?.manage),
  };
}

function pass(actor: StepResult["actor"], step: string, expected: string, status: number, details: string): StepResult {
  return { actor, step, expected, status, outcome: "pass", details };
}

function fail(actor: StepResult["actor"], step: string, expected: string, status: number, details: string): StepResult {
  return { actor, step, expected, status, outcome: "fail", details };
}

async function buildActorContext(actor: ActorKey, login: string, password: string): Promise<ActorContext> {
  const loginResult = await loginMobile(login, password);
  if (!loginResult.ok || !loginResult.token) {
    throw new Error(`${actor} login failed (${loginResult.status}): ${loginResult.error ?? "unknown"}`);
  }
  const perms = await requestJson("GET", "/api/permissions", loginResult.token);
  if (!perms.ok) throw new Error(`${actor} permissions failed: HTTP ${perms.status}`);
  const permsObj = asObject(perms.data);
  if (!permsObj || typeof permsObj.userId !== "string") {
    throw new Error(`${actor} permissions payload malformed.`);
  }

  return {
    actor,
    login,
    token: loginResult.token,
    userId: permsObj.userId,
    isAdmin: permsObj.isAdmin === true,
    tasksPermission: tasksPermissionFromPayload(permsObj),
  };
}

async function runActorTaskTests(ctx: ActorContext): Promise<{ steps: StepResult[]; createdTaskId: string | null; stageKeys: string[] }> {
  const steps: StepResult[] = [];
  let createdTaskId: string | null = null;
  const stageKeys: string[] = [];

  const canRead = ctx.isAdmin || ctx.tasksPermission.read;
  const canWrite = ctx.isAdmin || ctx.tasksPermission.write;

  const meta = await requestJson("GET", "/api/tasks/meta", ctx.token);
  if (canRead && meta.status === 200) {
    steps.push(pass(ctx.actor, "tasks-meta", "200", meta.status, "Meta endpoint accessible."));
  } else if (!canRead && meta.status === 403) {
    steps.push(pass(ctx.actor, "tasks-meta", "403", meta.status, "Meta endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "tasks-meta", canRead ? "200" : "403", meta.status, "Unexpected tasks/meta response."));
  }

  const list = await requestJson("GET", "/api/tasks?limit=5", ctx.token);
  if (canRead && list.status === 200) {
    steps.push(pass(ctx.actor, "tasks-list", "200", list.status, "Tasks list accessible."));
    const listObj = asObject(list.data);
    const stages = Array.isArray(listObj?.stages) ? (listObj?.stages as Record<string, unknown>[]) : [];
    for (const stage of stages) {
      const key = typeof stage.key === "string" ? stage.key : "";
      if (key) stageKeys.push(key);
    }
  } else if (!canRead && list.status === 403) {
    steps.push(pass(ctx.actor, "tasks-list", "403", list.status, "Tasks list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "tasks-list", canRead ? "200" : "403", list.status, "Unexpected tasks list response."));
  }

  if (!canRead) {
    return { steps, createdTaskId, stageKeys };
  }

  const createPayload = {
    title: `[QA Deep] ${ctx.actor} task ${Date.now()}`,
    description: "Automated deep test task",
    type: "task",
    priority: "normal",
    isPrivate: false,
    assigneeIds: [ctx.userId],
  };
  const create = await requestJson("POST", "/api/tasks", ctx.token, createPayload);
  if (canWrite && create.status === 201) {
    const createObj = asObject(create.data);
    createdTaskId = typeof createObj?.id === "string" ? createObj.id : null;
    if (createdTaskId) {
      steps.push(pass(ctx.actor, "tasks-create", "201", create.status, `Task created (${createdTaskId}).`));
    } else {
      steps.push(fail(ctx.actor, "tasks-create", "201 with id", create.status, "Task created but id missing in payload."));
    }
  } else if (!canWrite && create.status === 403) {
    steps.push(pass(ctx.actor, "tasks-create", "403", create.status, "Task creation correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "tasks-create", canWrite ? "201" : "403", create.status, "Unexpected create response."));
  }

  if (!canWrite || !createdTaskId) {
    return { steps, createdTaskId, stageKeys };
  }

  const detail = await requestJson("GET", `/api/tasks/${createdTaskId}`, ctx.token);
  steps.push(
    detail.status === 200
      ? pass(ctx.actor, "tasks-detail", "200", detail.status, "Task detail loaded.")
      : fail(ctx.actor, "tasks-detail", "200", detail.status, "Task detail endpoint failed.")
  );

  const nextStatus = stageKeys.find((stage) => stage !== "opened") ?? stageKeys[0] ?? "opened";
  const update = await requestJson("PUT", `/api/tasks/${createdTaskId}`, ctx.token, {
    title: `${createPayload.title} updated`,
    priority: "high",
    status: nextStatus,
  });
  steps.push(
    update.status === 200
      ? pass(ctx.actor, "tasks-update", "200", update.status, `Task updated to status "${nextStatus}".`)
      : fail(ctx.actor, "tasks-update", "200", update.status, "Task update failed.")
  );

  const comment = await requestJson("POST", `/api/tasks/${createdTaskId}/comments`, ctx.token, {
    content: `QA comment ${new Date().toISOString()}`,
  });
  steps.push(
    comment.status === 201
      ? pass(ctx.actor, "tasks-comment-create", "201", comment.status, "Task comment created.")
      : fail(ctx.actor, "tasks-comment-create", "201", comment.status, "Task comment create failed.")
  );

  const commentsList = await requestJson("GET", `/api/tasks/${createdTaskId}/comments`, ctx.token);
  steps.push(
    commentsList.status === 200
      ? pass(ctx.actor, "tasks-comment-list", "200", commentsList.status, "Task comments fetched.")
      : fail(ctx.actor, "tasks-comment-list", "200", commentsList.status, "Task comments fetch failed.")
  );

  const favAdd = await requestJson("POST", `/api/tasks/${createdTaskId}/favorite`, ctx.token);
  steps.push(
    favAdd.status === 200
      ? pass(ctx.actor, "tasks-favorite-add", "200", favAdd.status, "Task favorited.")
      : fail(ctx.actor, "tasks-favorite-add", "200", favAdd.status, "Favorite add failed.")
  );

  const favRemove = await requestJson("DELETE", `/api/tasks/${createdTaskId}/favorite`, ctx.token);
  steps.push(
    favRemove.status === 200
      ? pass(ctx.actor, "tasks-favorite-remove", "200", favRemove.status, "Task unfavorited.")
      : fail(ctx.actor, "tasks-favorite-remove", "200", favRemove.status, "Favorite remove failed.")
  );

  const fd = new FormData();
  fd.append(
    "files",
    new Blob([`qa file for ${ctx.actor}`], { type: "text/plain" }),
    "qa-deep-test.txt"
  );
  const upload = await requestMultipart(`/api/tasks/${createdTaskId}/uploads`, ctx.token, fd);
  steps.push(
    upload.status === 201
      ? pass(ctx.actor, "tasks-upload", "201", upload.status, "Task attachment uploaded.")
      : fail(ctx.actor, "tasks-upload", "201", upload.status, "Task attachment upload failed.")
  );

  const del = await requestJson("DELETE", `/api/tasks/${createdTaskId}`, ctx.token);
  steps.push(
    del.status === 200
      ? pass(ctx.actor, "tasks-delete-own", "200", del.status, "Own task deleted.")
      : fail(ctx.actor, "tasks-delete-own", "200", del.status, "Own task delete failed.")
  );

  createdTaskId = null;
  return { steps, createdTaskId, stageKeys };
}

async function runCrossRoleChecks(
  admin: ActorContext,
  manager: ActorContext,
  user: ActorContext
): Promise<StepResult[]> {
  const steps: StepResult[] = [];

  const create = await requestJson("POST", "/api/tasks", admin.token, {
    title: `[QA Cross] admin task ${Date.now()}`,
    description: "Cross-role deletion test",
    type: "task",
    priority: "normal",
    isPrivate: false,
    assigneeIds: [admin.userId],
  });

  const created = asObject(create.data);
  const taskId = typeof created?.id === "string" ? created.id : null;
  if (create.status !== 201 || !taskId) {
    steps.push(fail("cross-role", "admin-create-cross-task", "201", create.status, "Cannot create cross-role task."));
    return steps;
  }
  steps.push(pass("cross-role", "admin-create-cross-task", "201", create.status, `Cross task created (${taskId}).`));

  try {
    const userDelete = await requestJson("DELETE", `/api/tasks/${taskId}`, user.token);
    if (user.tasksPermission.write && !user.isAdmin) {
      steps.push(
        userDelete.status === 403
          ? pass("cross-role", "user-delete-admin-task", "403", userDelete.status, "User correctly blocked from deleting admin task.")
          : fail("cross-role", "user-delete-admin-task", "403", userDelete.status, "User should not be able to delete admin-owned task.")
      );
    } else {
      steps.push(
        userDelete.status === 403
          ? pass("cross-role", "user-delete-admin-task", "403", userDelete.status, "Delete blocked as expected.")
          : fail("cross-role", "user-delete-admin-task", "403", userDelete.status, "Unexpected delete response for non-writer user.")
      );
    }

    if (!(manager.isAdmin || manager.tasksPermission.read)) {
      const managerGet = await requestJson("GET", `/api/tasks/${taskId}`, manager.token);
      steps.push(
        managerGet.status === 403
          ? pass("cross-role", "manager-read-task-without-read", "403", managerGet.status, "Manager blocked from task detail as expected.")
          : fail("cross-role", "manager-read-task-without-read", "403", managerGet.status, "Manager should not access task detail.")
      );
    }
  } finally {
    const adminDelete = await requestJson("DELETE", `/api/tasks/${taskId}`, admin.token);
    steps.push(
      adminDelete.status === 200
        ? pass("cross-role", "admin-delete-cross-task", "200", adminDelete.status, "Cross task cleaned up.")
        : fail("cross-role", "admin-delete-cross-task", "200", adminDelete.status, "Failed to clean up cross-role task.")
    );
  }

  return steps;
}

function printSummary(steps: StepResult[]) {
  const actors: Array<StepResult["actor"]> = ["admin", "manager", "user", "cross-role"];

  console.log("");
  console.log("Tasks module deep test report");
  console.log("=============================");
  console.log(`Server: ${baseUrl}`);
  console.log("");

  for (const actor of actors) {
    const rows = steps.filter((step) => step.actor === actor);
    if (rows.length === 0) continue;
    const passCount = rows.filter((row) => row.outcome === "pass").length;
    const failCount = rows.length - passCount;
    console.log(`${actor.toUpperCase()}: ${passCount} passed, ${failCount} failed`);
    for (const row of rows.filter((r) => r.outcome === "fail")) {
      console.log(`  - ${row.step}: FAIL [${row.status}] ${row.details}`);
    }
    console.log("");
  }
}

async function saveReport(steps: StepResult[], contexts: ActorContext[]) {
  await mkdir("temp", { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    actors: contexts.map((ctx) => ({
      actor: ctx.actor,
      login: ctx.login,
      userId: ctx.userId,
      isAdmin: ctx.isAdmin,
      tasksPermission: ctx.tasksPermission,
    })),
    steps,
  };
  await writeFile("temp/tasks-module-report.json", JSON.stringify(payload, null, 2), "utf8");
  console.log("Saved JSON report: temp/tasks-module-report.json");
}

async function main() {
  console.log(`Using server: ${baseUrl}`);
  await checkServerReachable();

  const adminLogin = await loginMobile(adminCreds.login, adminCreds.password);
  if (!adminLogin.ok || !adminLogin.token) {
    throw new Error(`Admin login failed (${adminLogin.status}): ${adminLogin.error ?? "unknown"}`);
  }

  await ensureQaAccounts(adminLogin.token);

  const adminCtx = await buildActorContext("admin", adminCreds.login, adminCreds.password);
  const managerCtx = await buildActorContext("manager", qaUsers[0].login, qaPassword);
  const userCtx = await buildActorContext("user", qaUsers[1].login, qaPassword);

  const allSteps: StepResult[] = [];
  const adminResult = await runActorTaskTests(adminCtx);
  const managerResult = await runActorTaskTests(managerCtx);
  const userResult = await runActorTaskTests(userCtx);

  allSteps.push(...adminResult.steps, ...managerResult.steps, ...userResult.steps);
  allSteps.push(...(await runCrossRoleChecks(adminCtx, managerCtx, userCtx)));

  printSummary(allSteps);
  await saveReport(allSteps, [adminCtx, managerCtx, userCtx]);

  const failCount = allSteps.filter((step) => step.outcome === "fail").length;
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
