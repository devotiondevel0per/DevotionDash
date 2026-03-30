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
  projectsPermission: PermissionSet;
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
    email: "qa_manager@teamwox.local",
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
    email: "qa_user@teamwox.local",
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

function pass(actor: StepResult["actor"], step: string, expected: string, status: number, details: string): StepResult {
  return { actor, step, expected, status, outcome: "pass", details };
}

function fail(actor: StepResult["actor"], step: string, expected: string, status: number, details: string): StepResult {
  return { actor, step, expected, status, outcome: "fail", details };
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
  if (!branding.ok) throw new Error(`Cannot reach ${baseUrl}; branding endpoint returned HTTP ${branding.status}.`);
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

  const pwd = await requestJson("PUT", `/api/administration/users/${userId}/password`, adminToken, {
    password: qaPassword,
  });
  if (!pwd.ok) throw new Error(`Cannot reset password for ${spec.login}: HTTP ${pwd.status}`);

  const assign = await requestJson("PUT", `/api/administration/users/${userId}/roles`, adminToken, {
    groupIds: [roleId],
    membershipRole: spec.membershipRole,
  });
  if (!assign.ok) throw new Error(`Cannot assign role for ${spec.login}: HTTP ${assign.status}`);
}

async function ensureQaAccounts(adminToken: string) {
  for (const spec of qaUsers) {
    const roleId = await ensureRole(adminToken, spec.roleName, spec.roleColor, spec.permissions);
    await ensureQaUser(adminToken, roleId, spec);
  }
}

function projectsPermissionFromPayload(permsPayload: Record<string, unknown> | null): PermissionSet {
  const permissions = asObject(permsPayload?.permissions);
  const projects = asObject(permissions?.projects);
  return {
    read: Boolean(projects?.read),
    write: Boolean(projects?.write),
    manage: Boolean(projects?.manage),
  };
}

async function buildActorContext(actor: ActorKey, login: string, password: string): Promise<ActorContext> {
  const loginResult = await loginMobile(login, password);
  if (!loginResult.ok || !loginResult.token) {
    throw new Error(`${actor} login failed (${loginResult.status}): ${loginResult.error ?? "unknown"}`);
  }
  const perms = await requestJson("GET", "/api/permissions", loginResult.token);
  if (!perms.ok) throw new Error(`${actor} permissions failed: HTTP ${perms.status}`);
  const permsObj = asObject(perms.data);
  if (!permsObj || typeof permsObj.userId !== "string") throw new Error(`${actor} permissions payload malformed.`);

  return {
    actor,
    login,
    token: loginResult.token,
    userId: permsObj.userId,
    isAdmin: permsObj.isAdmin === true,
    projectsPermission: projectsPermissionFromPayload(permsObj),
  };
}

async function runActorProjectTests(
  ctx: ActorContext,
  adminCtx: ActorContext
): Promise<{ steps: StepResult[] }> {
  const steps: StepResult[] = [];
  const cleanupProjectIds: string[] = [];

  const canRead = ctx.isAdmin || ctx.projectsPermission.read;
  const canWrite = ctx.isAdmin || ctx.projectsPermission.write;

  const list = await requestJson("GET", "/api/projects?limit=20", ctx.token);
  if (canRead && list.status === 200) {
    steps.push(pass(ctx.actor, "projects-list", "200", list.status, "Projects list accessible."));
  } else if (!canRead && list.status === 403) {
    steps.push(pass(ctx.actor, "projects-list", "403", list.status, "Projects list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "projects-list", canRead ? "200" : "403", list.status, "Unexpected projects list response."));
  }

  const createName = `[QA Projects] ${ctx.actor} ${Date.now()}`;
  const create = await requestJson("POST", "/api/projects", ctx.token, {
    name: createName,
    description: "Automated deep project test",
  });

  let projectId: string | null = null;
  if (canWrite && create.status === 201) {
    const project = asObject(create.data);
    projectId = typeof project?.id === "string" ? project.id : null;
    if (projectId) {
      cleanupProjectIds.push(projectId);
      steps.push(pass(ctx.actor, "projects-create", "201", create.status, `Project created (${projectId}).`));
    } else {
      steps.push(fail(ctx.actor, "projects-create", "201 with id", create.status, "Project created but id missing."));
    }
  } else if (!canWrite && create.status === 403) {
    steps.push(pass(ctx.actor, "projects-create", "403", create.status, "Project create correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "projects-create", canWrite ? "201" : "403", create.status, "Unexpected project create response."));
  }

  if (!projectId || !canWrite) {
    return { steps };
  }

  try {
    const detail = await requestJson("GET", `/api/projects/${projectId}`, ctx.token);
    steps.push(
      detail.status === 200
        ? pass(ctx.actor, "projects-detail", "200", detail.status, "Project detail loaded.")
        : fail(ctx.actor, "projects-detail", "200", detail.status, "Project detail failed.")
    );

    const update = await requestJson("PUT", `/api/projects/${projectId}`, ctx.token, {
      description: "Updated from deep test",
      status: "active",
    });
    steps.push(
      update.status === 200
        ? pass(ctx.actor, "projects-update-manager-only", "200", update.status, "Project updated by project manager.")
        : fail(ctx.actor, "projects-update-manager-only", "200", update.status, "Project update failed.")
    );

    const addPhase = await requestJson("POST", `/api/projects/${projectId}/phases`, ctx.token, {
      name: "QA Phase",
    });
    let phaseId: string | null = null;
    if (addPhase.status === 201) {
      const phase = asObject(addPhase.data);
      phaseId = typeof phase?.id === "string" ? phase.id : null;
      steps.push(pass(ctx.actor, "projects-phase-create", "201", addPhase.status, "Phase created."));
    } else {
      steps.push(fail(ctx.actor, "projects-phase-create", "201", addPhase.status, "Phase create failed."));
    }

    const addMember = await requestJson("POST", `/api/projects/${projectId}/members`, ctx.token, {
      userId: adminCtx.userId,
      role: "member",
    });
    let memberId: string | null = null;
    if (addMember.status === 201) {
      const member = asObject(addMember.data);
      memberId = typeof member?.id === "string" ? member.id : null;
      steps.push(pass(ctx.actor, "projects-member-add", "201", addMember.status, "Member added."));
    } else {
      steps.push(fail(ctx.actor, "projects-member-add", "201", addMember.status, "Member add failed."));
    }

    const createTask = await requestJson("POST", `/api/projects/${projectId}/tasks`, ctx.token, {
      title: "QA Project Task",
      description: "Task in project deep test",
      phaseId: phaseId ?? undefined,
      assigneeId: ctx.userId,
      priority: "normal",
    });
    let taskId: string | null = null;
    if (createTask.status === 201) {
      const task = asObject(createTask.data);
      taskId = typeof task?.id === "string" ? task.id : null;
      steps.push(pass(ctx.actor, "projects-task-create", "201", createTask.status, "Project task created."));
    } else {
      steps.push(fail(ctx.actor, "projects-task-create", "201", createTask.status, "Project task create failed."));
    }

    if (taskId) {
      const updateTask = await requestJson("PUT", `/api/projects/${projectId}/tasks/${taskId}`, ctx.token, {
        title: "QA Project Task Updated",
        priority: "high",
      });
      steps.push(
        updateTask.status === 200
          ? pass(ctx.actor, "projects-task-update", "200", updateTask.status, "Project task updated.")
          : fail(ctx.actor, "projects-task-update", "200", updateTask.status, "Project task update failed.")
      );

      const deleteTask = await requestJson("DELETE", `/api/projects/${projectId}/tasks/${taskId}`, ctx.token);
      steps.push(
        deleteTask.status === 200
          ? pass(ctx.actor, "projects-task-delete", "200", deleteTask.status, "Project task deleted.")
          : fail(ctx.actor, "projects-task-delete", "200", deleteTask.status, "Project task delete failed.")
      );
    }

    if (phaseId) {
      const updatePhase = await requestJson("PUT", `/api/projects/${projectId}/phases/${phaseId}`, ctx.token, {
        name: "QA Phase Updated",
      });
      steps.push(
        updatePhase.status === 200
          ? pass(ctx.actor, "projects-phase-update", "200", updatePhase.status, "Phase updated.")
          : fail(ctx.actor, "projects-phase-update", "200", updatePhase.status, "Phase update failed.")
      );

      const deletePhase = await requestJson("DELETE", `/api/projects/${projectId}/phases/${phaseId}`, ctx.token);
      steps.push(
        deletePhase.status === 200
          ? pass(ctx.actor, "projects-phase-delete", "200", deletePhase.status, "Phase deleted.")
          : fail(ctx.actor, "projects-phase-delete", "200", deletePhase.status, "Phase delete failed.")
      );
    }

    if (memberId) {
      const removeMember = await requestJson("DELETE", `/api/projects/${projectId}/members/${memberId}`, ctx.token);
      steps.push(
        removeMember.status === 200
          ? pass(ctx.actor, "projects-member-remove", "200", removeMember.status, "Member removed.")
          : fail(ctx.actor, "projects-member-remove", "200", removeMember.status, "Member remove failed.")
      );
    }
  } finally {
    for (const id of cleanupProjectIds) {
      await requestJson("DELETE", `/api/projects/${id}`, ctx.token);
    }
  }

  return { steps };
}

async function runCrossRoleProjectChecks(
  admin: ActorContext,
  manager: ActorContext,
  user: ActorContext
): Promise<StepResult[]> {
  const steps: StepResult[] = [];

  const createdIds: string[] = [];
  let projectIdA: string | null = null;
  let projectIdB: string | null = null;

  try {
    const createA = await requestJson("POST", "/api/projects", admin.token, {
      name: `[QA Cross Project A] ${Date.now()}`,
      description: "Cross-role membership test",
    });
    const aObj = asObject(createA.data);
    projectIdA = typeof aObj?.id === "string" ? aObj.id : null;
    if (createA.status === 201 && projectIdA) {
      createdIds.push(projectIdA);
      steps.push(pass("cross-role", "admin-create-project-A", "201", createA.status, `Project A created (${projectIdA}).`));
    } else {
      steps.push(fail("cross-role", "admin-create-project-A", "201", createA.status, "Could not create project A."));
      return steps;
    }

    const userReadBefore = await requestJson("GET", `/api/projects/${projectIdA}`, user.token);
    steps.push(
      userReadBefore.status === 403
        ? pass("cross-role", "user-read-project-before-membership", "403", userReadBefore.status, "User blocked before membership.")
        : fail("cross-role", "user-read-project-before-membership", "403", userReadBefore.status, "User should not read project before membership.")
    );

    const addUserMember = await requestJson("POST", `/api/projects/${projectIdA}/members`, admin.token, {
      userId: user.userId,
      role: "member",
    });
    steps.push(
      addUserMember.status === 201
        ? pass("cross-role", "admin-add-user-member", "201", addUserMember.status, "User added as project member.")
        : fail("cross-role", "admin-add-user-member", "201", addUserMember.status, "Failed to add user as member.")
    );

    const userReadAfter = await requestJson("GET", `/api/projects/${projectIdA}`, user.token);
    steps.push(
      userReadAfter.status === 200
        ? pass("cross-role", "user-read-project-after-membership", "200", userReadAfter.status, "User can read project after membership.")
        : fail("cross-role", "user-read-project-after-membership", "200", userReadAfter.status, "User should read project after membership.")
    );

    const userProjectUpdate = await requestJson("PUT", `/api/projects/${projectIdA}`, user.token, {
      description: "User trying manager-only update",
    });
    steps.push(
      userProjectUpdate.status === 403
        ? pass("cross-role", "user-update-project-manager-only", "403", userProjectUpdate.status, "User blocked from manager-only project update.")
        : fail("cross-role", "user-update-project-manager-only", "403", userProjectUpdate.status, "User should be blocked from manager-only update.")
    );

    const userPhaseCreate = await requestJson("POST", `/api/projects/${projectIdA}/phases`, user.token, {
      name: "User unauthorized phase",
    });
    steps.push(
      userPhaseCreate.status === 403
        ? pass("cross-role", "user-create-phase-manager-only", "403", userPhaseCreate.status, "User blocked from manager-only phase create.")
        : fail("cross-role", "user-create-phase-manager-only", "403", userPhaseCreate.status, "User should be blocked from phase create.")
    );

    const userTaskCreate = await requestJson("POST", `/api/projects/${projectIdA}/tasks`, user.token, {
      title: "User member project task",
      priority: "normal",
      assigneeId: user.userId,
    });
    let userTaskId: string | null = null;
    if (userTaskCreate.status === 201) {
      const taskObj = asObject(userTaskCreate.data);
      userTaskId = typeof taskObj?.id === "string" ? taskObj.id : null;
      steps.push(pass("cross-role", "user-create-project-task-as-member", "201", userTaskCreate.status, "User created project task as member."));
    } else {
      steps.push(fail("cross-role", "user-create-project-task-as-member", "201", userTaskCreate.status, "User should create task as member."));
    }

    if (userTaskId) {
      const userTaskDelete = await requestJson("DELETE", `/api/projects/${projectIdA}/tasks/${userTaskId}`, user.token);
      steps.push(
        userTaskDelete.status === 200
          ? pass("cross-role", "user-delete-project-task-as-member", "200", userTaskDelete.status, "User deleted project task as member.")
          : fail("cross-role", "user-delete-project-task-as-member", "200", userTaskDelete.status, "User should delete project task as member.")
      );
    }

    const createB = await requestJson("POST", "/api/projects", admin.token, {
      name: `[QA Cross Project B] ${Date.now()}`,
      description: "Visibility filtering test",
    });
    const bObj = asObject(createB.data);
    projectIdB = typeof bObj?.id === "string" ? bObj.id : null;
    if (createB.status === 201 && projectIdB) {
      createdIds.push(projectIdB);
      steps.push(pass("cross-role", "admin-create-project-B", "201", createB.status, `Project B created (${projectIdB}).`));
    } else {
      steps.push(fail("cross-role", "admin-create-project-B", "201", createB.status, "Could not create project B."));
      return steps;
    }

    const userList = await requestJson("GET", "/api/projects?limit=200", user.token);
    if (userList.status === 200 && Array.isArray(userList.data)) {
      const foundB = (userList.data as Record<string, unknown>[]).some((project) => project.id === projectIdB);
      steps.push(
        !foundB
          ? pass("cross-role", "user-list-excludes-non-member-project", "project B hidden", userList.status, "User list excludes non-member project.")
          : fail("cross-role", "user-list-excludes-non-member-project", "project B hidden", userList.status, "User list included project without membership.")
      );
    } else {
      steps.push(fail("cross-role", "user-list-excludes-non-member-project", "200", userList.status, "Could not load user project list."));
    }

    const addManagerToA = await requestJson("POST", `/api/projects/${projectIdA}/members`, admin.token, {
      userId: manager.userId,
      role: "member",
    });
    if (addManagerToA.status === 201) {
      const managerRead = await requestJson("GET", `/api/projects/${projectIdA}`, manager.token);
      steps.push(
        managerRead.status === 403
          ? pass("cross-role", "manager-module-block-even-if-member", "403", managerRead.status, "Manager blocked by module permissions.")
          : fail("cross-role", "manager-module-block-even-if-member", "403", managerRead.status, "Manager should be blocked by module permissions.")
      );
    } else {
      steps.push(fail("cross-role", "admin-add-manager-member", "201", addManagerToA.status, "Failed to add manager as member."));
    }
  } finally {
    for (const id of createdIds) {
      await requestJson("DELETE", `/api/projects/${id}`, admin.token);
    }
  }

  return steps;
}

function printSummary(steps: StepResult[]) {
  const actors: Array<StepResult["actor"]> = ["admin", "manager", "user", "cross-role"];
  console.log("");
  console.log("Projects module deep test report");
  console.log("================================");
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
      projectsPermission: ctx.projectsPermission,
    })),
    steps,
  };
  await writeFile("temp/projects-module-report.json", JSON.stringify(payload, null, 2), "utf8");
  console.log("Saved JSON report: temp/projects-module-report.json");
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
  allSteps.push(...(await runActorProjectTests(adminCtx, adminCtx)).steps);
  allSteps.push(...(await runActorProjectTests(managerCtx, adminCtx)).steps);
  allSteps.push(...(await runActorProjectTests(userCtx, adminCtx)).steps);
  allSteps.push(...(await runCrossRoleProjectChecks(adminCtx, managerCtx, userCtx)));

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
