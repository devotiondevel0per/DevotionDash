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
  chatPermission: PermissionSet;
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

function chatPermissionFromPayload(permsPayload: Record<string, unknown> | null): PermissionSet {
  const permissions = asObject(permsPayload?.permissions);
  const chat = asObject(permissions?.chat);
  return {
    read: Boolean(chat?.read),
    write: Boolean(chat?.write),
    manage: Boolean(chat?.manage),
  };
}

function memberIdsFromDialog(dialog: Record<string, unknown>): string[] {
  const members = Array.isArray(dialog.members) ? (dialog.members as Record<string, unknown>[]) : [];
  const ids = members
    .map((member) => {
      if (typeof member.userId === "string") return member.userId;
      const user = asObject(member.user);
      if (typeof user?.id === "string") return user.id;
      return "";
    })
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids)).sort();
}

function directDialogKey(dialog: Record<string, unknown>): string | null {
  if (dialog.isExternal === true) return null;
  if (typeof dialog.groupId === "string" && dialog.groupId.length > 0) return null;
  if (typeof dialog.organizationId === "string" && dialog.organizationId.length > 0) return null;
  if (typeof dialog.subject === "string" && dialog.subject.trim().length > 0) return null;
  const memberIds = memberIdsFromDialog(dialog);
  if (memberIds.length !== 2) return null;
  return memberIds.join(":");
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
    chatPermission: chatPermissionFromPayload(permsObj),
  };
}

async function runActorChatTests(
  ctx: ActorContext,
  partner: ActorContext
): Promise<{ steps: StepResult[]; dmDialogId: string | null }> {
  const steps: StepResult[] = [];
  let dmDialogId: string | null = null;
  let createdMessageId: string | null = null;

  const canRead = ctx.isAdmin || ctx.chatPermission.read;
  const canWrite = ctx.isAdmin || ctx.chatPermission.write;
  const canManage = ctx.isAdmin || ctx.chatPermission.manage;

  const users = await requestJson("GET", "/api/chat/users", ctx.token);
  if (canRead && users.status === 200) {
    const rows = Array.isArray(users.data) ? (users.data as Record<string, unknown>[]) : [];
    const containsSelf = rows.some((row) => row.id === ctx.userId);
    steps.push(
      !containsSelf
        ? pass(ctx.actor, "chat-users", "200 without self", users.status, "Users endpoint excludes self.")
        : fail(ctx.actor, "chat-users", "200 without self", users.status, "Users endpoint includes current user unexpectedly.")
    );
  } else if (!canRead && users.status === 403) {
    steps.push(pass(ctx.actor, "chat-users", "403", users.status, "Users endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "chat-users", canRead ? "200" : "403", users.status, "Unexpected users endpoint response."));
  }

  const groups = await requestJson("GET", "/api/chat/groups", ctx.token);
  if (canRead && groups.status === 200) {
    steps.push(pass(ctx.actor, "chat-groups-list", "200", groups.status, "Groups list accessible."));
  } else if (!canRead && groups.status === 403) {
    steps.push(pass(ctx.actor, "chat-groups-list", "403", groups.status, "Groups list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "chat-groups-list", canRead ? "200" : "403", groups.status, "Unexpected groups list response."));
  }

  const groupCreate = await requestJson("POST", "/api/chat/groups", ctx.token, {});
  if (canManage && groupCreate.status === 400) {
    steps.push(pass(ctx.actor, "chat-groups-manage-gate", "400 (manage passed; missing name)", groupCreate.status, "Manage endpoint reachable; validation executed."));
  } else if (!canManage && groupCreate.status === 403) {
    steps.push(pass(ctx.actor, "chat-groups-manage-gate", "403", groupCreate.status, "Manage endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "chat-groups-manage-gate", canManage ? "400" : "403", groupCreate.status, "Unexpected groups manage response."));
  }

  const dialogsList = await requestJson("GET", "/api/chat/dialogs", ctx.token);
  if (canRead && dialogsList.status === 200) {
    steps.push(pass(ctx.actor, "chat-dialogs-list", "200", dialogsList.status, "Dialogs list accessible."));
    const rows = Array.isArray(dialogsList.data) ? (dialogsList.data as Record<string, unknown>[]) : [];
    const seen = new Set<string>();
    let duplicateFound = false;
    for (const row of rows) {
      const key = directDialogKey(row);
      if (!key) continue;
      if (seen.has(key)) {
        duplicateFound = true;
        break;
      }
      seen.add(key);
    }
    steps.push(
      !duplicateFound
        ? pass(ctx.actor, "chat-dialogs-dedupe", "no duplicate direct keys", dialogsList.status, "Dialog list dedupe is working.")
        : fail(ctx.actor, "chat-dialogs-dedupe", "no duplicate direct keys", dialogsList.status, "Duplicate direct dialogs found in list response.")
    );
  } else if (!canRead && dialogsList.status === 403) {
    steps.push(pass(ctx.actor, "chat-dialogs-list", "403", dialogsList.status, "Dialogs list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "chat-dialogs-list", canRead ? "200" : "403", dialogsList.status, "Unexpected dialogs list response."));
  }

  const dmCreate = await requestJson("POST", "/api/chat/dialogs", ctx.token, {
    memberIds: [partner.userId, ctx.userId],
  });
  if (!canWrite) {
    steps.push(
      dmCreate.status === 403
        ? pass(ctx.actor, "chat-dm-create", "403", dmCreate.status, "DM create correctly blocked.")
        : fail(ctx.actor, "chat-dm-create", "403", dmCreate.status, "DM create should be blocked.")
    );
    return { steps, dmDialogId };
  }

  const dmObj = asObject(dmCreate.data);
  dmDialogId = typeof dmObj?.id === "string" ? dmObj.id : null;
  if ((dmCreate.status === 201 || dmCreate.status === 200) && dmDialogId) {
    steps.push(pass(ctx.actor, "chat-dm-create", "200/201 with dialog id", dmCreate.status, `DM available (${dmDialogId}).`));
  } else {
    steps.push(fail(ctx.actor, "chat-dm-create", "200/201 with dialog id", dmCreate.status, "DM create/find failed."));
    return { steps, dmDialogId };
  }

  const dmCreateAgain = await requestJson("POST", "/api/chat/dialogs", ctx.token, {
    memberIds: [ctx.userId, partner.userId, partner.userId],
  });
  const dmAgainObj = asObject(dmCreateAgain.data);
  const dmDialogIdAgain = typeof dmAgainObj?.id === "string" ? dmAgainObj.id : null;
  steps.push(
    dmCreateAgain.status === 200 && dmDialogIdAgain === dmDialogId
      ? pass(ctx.actor, "chat-dm-find-existing", "200 with same dialog id", dmCreateAgain.status, "Direct dialog dedupe works.")
      : fail(ctx.actor, "chat-dm-find-existing", "200 with same dialog id", dmCreateAgain.status, "Direct dialog dedupe failed.")
  );

  const detail = await requestJson("GET", `/api/chat/dialogs/${dmDialogId}`, ctx.token);
  steps.push(
    canRead && detail.status === 200
      ? pass(ctx.actor, "chat-dialog-detail", "200", detail.status, "Dialog detail accessible.")
      : fail(ctx.actor, "chat-dialog-detail", canRead ? "200" : "403", detail.status, "Unexpected dialog detail response.")
  );

  const messages = await requestJson("GET", `/api/chat/dialogs/${dmDialogId}/messages?limit=20`, ctx.token);
  steps.push(
    canRead && messages.status === 200
      ? pass(ctx.actor, "chat-messages-list", "200", messages.status, "Messages list accessible.")
      : fail(ctx.actor, "chat-messages-list", canRead ? "200" : "403", messages.status, "Unexpected messages list response.")
  );

  const sendText = await requestJson("POST", `/api/chat/dialogs/${dmDialogId}/messages`, ctx.token, {
    content: `QA message from ${ctx.actor} ${new Date().toISOString()} https://example.com/test`,
  });
  const sendTextObj = asObject(sendText.data);
  const textMessageId = typeof sendTextObj?.id === "string" ? sendTextObj.id : null;
  if (sendText.status === 201 && textMessageId) {
    createdMessageId = textMessageId;
    steps.push(pass(ctx.actor, "chat-send-text", "201", sendText.status, `Text message sent (${textMessageId}).`));
  } else {
    steps.push(fail(ctx.actor, "chat-send-text", "201", sendText.status, "Text message send failed."));
  }

  const sendAttachment = await requestJson("POST", `/api/chat/dialogs/${dmDialogId}/messages`, ctx.token, {
    content: "",
    attachments: [
      {
        fileName: "qa.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl: "data:text/plain;base64,aGVsbG8=",
        kind: "file",
      },
    ],
  });
  steps.push(
    sendAttachment.status === 201
      ? pass(ctx.actor, "chat-send-attachment", "201", sendAttachment.status, "Attachment message sent.")
      : fail(ctx.actor, "chat-send-attachment", "201", sendAttachment.status, "Attachment message send failed.")
  );

  const dialogUpdate = await requestJson("PUT", `/api/chat/dialogs/${dmDialogId}`, ctx.token, {
    status: "open",
    subject: `QA ${ctx.actor} DM`,
  });
  steps.push(
    dialogUpdate.status === 200
      ? pass(ctx.actor, "chat-dialog-update", "200", dialogUpdate.status, "Dialog update succeeded.")
      : fail(ctx.actor, "chat-dialog-update", "200", dialogUpdate.status, "Dialog update failed.")
  );

  const invalidStatusUpdate = await requestJson("PUT", `/api/chat/dialogs/${dmDialogId}`, ctx.token, {
    status: "archived",
  });
  steps.push(
    invalidStatusUpdate.status === 400
      ? pass(ctx.actor, "chat-dialog-invalid-status", "400", invalidStatusUpdate.status, "Invalid status correctly rejected.")
      : fail(ctx.actor, "chat-dialog-invalid-status", "400", invalidStatusUpdate.status, "Invalid status should be rejected.")
  );

  const deleteAttempt = await requestJson("DELETE", `/api/chat/messages/${createdMessageId ?? "missing"}`, ctx.token);
  if (canManage) {
    steps.push(
      createdMessageId && deleteAttempt.status === 200
        ? pass(ctx.actor, "chat-message-delete-manage", "200", deleteAttempt.status, "Manage message delete succeeded.")
        : fail(ctx.actor, "chat-message-delete-manage", "200", deleteAttempt.status, "Manage delete should succeed.")
    );
  } else {
    steps.push(
      deleteAttempt.status === 403
        ? pass(ctx.actor, "chat-message-delete-manage", "403", deleteAttempt.status, "Non-manage delete correctly blocked.")
        : fail(ctx.actor, "chat-message-delete-manage", "403", deleteAttempt.status, "Non-manage delete should be blocked.")
    );
  }

  return { steps, dmDialogId };
}

async function runCrossRoleChatChecks(
  admin: ActorContext,
  manager: ActorContext,
  user: ActorContext
): Promise<StepResult[]> {
  const steps: StepResult[] = [];

  const selfDialog = await requestJson("POST", "/api/chat/dialogs", user.token, {
    memberIds: [user.userId],
  });
  steps.push(
    selfDialog.status === 400
      ? pass("cross-role", "chat-self-dialog-block", "400", selfDialog.status, "Self-only dialog creation is blocked.")
      : fail("cross-role", "chat-self-dialog-block", "400", selfDialog.status, "Self-only dialog should be blocked.")
  );

  const adminUserDm = await requestJson("POST", "/api/chat/dialogs", admin.token, {
    memberIds: [admin.userId, user.userId],
  });
  const adminUserDmObj = asObject(adminUserDm.data);
  const adminUserDialogId = typeof adminUserDmObj?.id === "string" ? adminUserDmObj.id : null;
  if ((adminUserDm.status === 200 || adminUserDm.status === 201) && adminUserDialogId) {
    steps.push(pass("cross-role", "chat-admin-user-dm", "200/201", adminUserDm.status, `Admin-user DM available (${adminUserDialogId}).`));

    const managerReadForeign = await requestJson("GET", `/api/chat/dialogs/${adminUserDialogId}`, manager.token);
    steps.push(
      managerReadForeign.status === 403
        ? pass("cross-role", "chat-manager-cannot-read-foreign-dm", "403", managerReadForeign.status, "Manager blocked from non-member dialog.")
        : fail("cross-role", "chat-manager-cannot-read-foreign-dm", "403", managerReadForeign.status, "Manager should be blocked from non-member dialog.")
    );

    const userReadOwn = await requestJson("GET", `/api/chat/dialogs/${adminUserDialogId}`, user.token);
    steps.push(
      userReadOwn.status === 200
        ? pass("cross-role", "chat-user-read-member-dm", "200", userReadOwn.status, "User can read member dialog.")
        : fail("cross-role", "chat-user-read-member-dm", "200", userReadOwn.status, "User should read member dialog.")
    );

    const userSend = await requestJson("POST", `/api/chat/dialogs/${adminUserDialogId}/messages`, user.token, {
      content: "Cross-role QA ping",
    });
    steps.push(
      userSend.status === 201
        ? pass("cross-role", "chat-user-send-member-dm", "201", userSend.status, "User can send message in member dialog.")
        : fail("cross-role", "chat-user-send-member-dm", "201", userSend.status, "User should send in member dialog.")
    );
  } else {
    steps.push(fail("cross-role", "chat-admin-user-dm", "200/201", adminUserDm.status, "Could not obtain admin-user DM."));
  }

  const managerUserDm = await requestJson("POST", "/api/chat/dialogs", manager.token, {
    memberIds: [manager.userId, user.userId],
  });
  const managerUserDmObj = asObject(managerUserDm.data);
  const managerUserDialogId = typeof managerUserDmObj?.id === "string" ? managerUserDmObj.id : null;
  if ((managerUserDm.status === 200 || managerUserDm.status === 201) && managerUserDialogId) {
    steps.push(pass("cross-role", "chat-manager-user-dm", "200/201", managerUserDm.status, `Manager-user DM available (${managerUserDialogId}).`));

    const managerClose = await requestJson("PUT", `/api/chat/dialogs/${managerUserDialogId}`, manager.token, {
      status: "closed",
    });
    steps.push(
      managerClose.status === 200
        ? pass("cross-role", "chat-manager-close-dm", "200", managerClose.status, "Manager can update member dialog status.")
        : fail("cross-role", "chat-manager-close-dm", "200", managerClose.status, "Manager should update member dialog status.")
    );
  } else {
    steps.push(fail("cross-role", "chat-manager-user-dm", "200/201", managerUserDm.status, "Could not obtain manager-user DM."));
  }

  const adminDeleteWithoutId = await requestJson("DELETE", "/api/chat/messages/missing-id", admin.token);
  steps.push(
    adminDeleteWithoutId.status === 404
      ? pass("cross-role", "chat-admin-delete-missing-message", "404", adminDeleteWithoutId.status, "Admin delete on missing message returns 404.")
      : fail("cross-role", "chat-admin-delete-missing-message", "404", adminDeleteWithoutId.status, "Expected 404 for missing message delete.")
  );

  return steps;
}

function printSummary(steps: StepResult[]) {
  const actors: Array<StepResult["actor"]> = ["admin", "manager", "user", "cross-role"];
  console.log("");
  console.log("Chat module deep test report");
  console.log("============================");
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
      chatPermission: ctx.chatPermission,
    })),
    steps,
  };
  await writeFile("temp/chat-module-report.json", JSON.stringify(payload, null, 2), "utf8");
  console.log("Saved JSON report: temp/chat-module-report.json");
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
  allSteps.push(...(await runActorChatTests(adminCtx, userCtx)).steps);
  allSteps.push(...(await runActorChatTests(managerCtx, userCtx)).steps);
  allSteps.push(...(await runActorChatTests(userCtx, adminCtx)).steps);
  allSteps.push(...(await runCrossRoleChatChecks(adminCtx, managerCtx, userCtx)));

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
