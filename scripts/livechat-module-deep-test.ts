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

type RawHttpResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  bodyText: string;
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
  livechatPermission: PermissionSet;
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

async function requestRaw(
  method: "GET",
  path: string,
  token?: string
): Promise<RawHttpResult> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
  });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    bodyText,
  };
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

function livechatPermissionFromPayload(permsPayload: Record<string, unknown> | null): PermissionSet {
  const permissions = asObject(permsPayload?.permissions);
  const livechat = asObject(permissions?.livechat);
  return {
    read: Boolean(livechat?.read),
    write: Boolean(livechat?.write),
    manage: Boolean(livechat?.manage),
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
    livechatPermission: livechatPermissionFromPayload(permsObj),
  };
}

async function runActorLiveChatTests(
  ctx: ActorContext,
  adminCtx: ActorContext
): Promise<{ steps: StepResult[]; dialogId: string | null }> {
  const steps: StepResult[] = [];
  let dialogId: string | null = null;

  const canRead = ctx.isAdmin || ctx.livechatPermission.read;
  const canWrite = ctx.isAdmin || ctx.livechatPermission.write;
  const canManage = ctx.isAdmin || ctx.livechatPermission.manage;

  const dialogs = await requestJson("GET", "/api/livechat/dialogs?status=all&queue=all&limit=50", ctx.token);
  if (canRead && dialogs.status === 200) {
    steps.push(pass(ctx.actor, "livechat-dialogs-list", "200", dialogs.status, "Livechat dialogs list accessible."));
  } else if (!canRead && dialogs.status === 403) {
    steps.push(pass(ctx.actor, "livechat-dialogs-list", "403", dialogs.status, "Livechat dialogs list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-dialogs-list", canRead ? "200" : "403", dialogs.status, "Unexpected dialogs list response."));
  }

  const overview = await requestJson("GET", "/api/livechat/overview", ctx.token);
  if (canRead && overview.status === 200) {
    steps.push(pass(ctx.actor, "livechat-overview", "200", overview.status, "Overview endpoint accessible."));
  } else if (!canRead && overview.status === 403) {
    steps.push(pass(ctx.actor, "livechat-overview", "403", overview.status, "Overview endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-overview", canRead ? "200" : "403", overview.status, "Unexpected overview response."));
  }

  const groups = await requestJson("GET", "/api/livechat/groups", ctx.token);
  if (canRead && groups.status === 200) {
    steps.push(pass(ctx.actor, "livechat-groups-list", "200", groups.status, "Groups list accessible."));
  } else if (!canRead && groups.status === 403) {
    steps.push(pass(ctx.actor, "livechat-groups-list", "403", groups.status, "Groups list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-groups-list", canRead ? "200" : "403", groups.status, "Unexpected groups list response."));
  }

  const agents = await requestJson("GET", "/api/livechat/agents", ctx.token);
  if (canRead && agents.status === 200) {
    steps.push(pass(ctx.actor, "livechat-agents", "200", agents.status, "Agents endpoint accessible."));
  } else if (!canRead && agents.status === 403) {
    steps.push(pass(ctx.actor, "livechat-agents", "403", agents.status, "Agents endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-agents", canRead ? "200" : "403", agents.status, "Unexpected agents response."));
  }

  const departments = await requestJson("GET", "/api/livechat/departments", ctx.token);
  if (canRead && departments.status === 200) {
    steps.push(pass(ctx.actor, "livechat-departments-list", "200", departments.status, "Departments endpoint accessible."));
  } else if (!canRead && departments.status === 403) {
    steps.push(pass(ctx.actor, "livechat-departments-list", "403", departments.status, "Departments endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-departments-list", canRead ? "200" : "403", departments.status, "Unexpected departments response."));
  }

  const groupCreateGate = await requestJson("POST", "/api/livechat/groups", ctx.token, {});
  if (canManage && groupCreateGate.status === 400) {
    steps.push(pass(ctx.actor, "livechat-groups-manage-gate", "400 (manage passed; missing name)", groupCreateGate.status, "Manage endpoint reachable for queue create."));
  } else if (!canManage && groupCreateGate.status === 403) {
    steps.push(pass(ctx.actor, "livechat-groups-manage-gate", "403", groupCreateGate.status, "Queue create correctly blocked for non-manage."));
  } else {
    steps.push(fail(ctx.actor, "livechat-groups-manage-gate", canManage ? "400" : "403", groupCreateGate.status, "Unexpected queue create gate response."));
  }

  const deptCreateGate = await requestJson("POST", "/api/livechat/departments", ctx.token, {});
  if (canManage && deptCreateGate.status === 400) {
    steps.push(pass(ctx.actor, "livechat-departments-manage-gate", "400 (manage passed; missing name)", deptCreateGate.status, "Manage endpoint reachable for department create."));
  } else if (!canManage && deptCreateGate.status === 403) {
    steps.push(pass(ctx.actor, "livechat-departments-manage-gate", "403", deptCreateGate.status, "Department create correctly blocked for non-manage."));
  } else {
    steps.push(fail(ctx.actor, "livechat-departments-manage-gate", canManage ? "400" : "403", deptCreateGate.status, "Unexpected department create gate response."));
  }

  const settingsGet = await requestJson("GET", "/api/livechat/settings", ctx.token);
  if (canManage && settingsGet.status === 200) {
    steps.push(pass(ctx.actor, "livechat-settings-get", "200", settingsGet.status, "Settings GET accessible."));
  } else if (!canManage && settingsGet.status === 403) {
    steps.push(pass(ctx.actor, "livechat-settings-get", "403", settingsGet.status, "Settings GET correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-settings-get", canManage ? "200" : "403", settingsGet.status, "Unexpected settings GET response."));
  }

  const settingsPatchGate = await requestJson("PATCH", "/api/livechat/settings", ctx.token, {});
  if (canManage && settingsPatchGate.status === 400) {
    steps.push(pass(ctx.actor, "livechat-settings-patch-gate", "400 (nothing to update)", settingsPatchGate.status, "Settings PATCH reachable and validated."));
  } else if (!canManage && settingsPatchGate.status === 403) {
    steps.push(pass(ctx.actor, "livechat-settings-patch-gate", "403", settingsPatchGate.status, "Settings PATCH correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-settings-patch-gate", canManage ? "400" : "403", settingsPatchGate.status, "Unexpected settings PATCH response."));
  }

  const statusList = await requestJson("GET", "/api/livechat/agent-status", ctx.token);
  if (canRead && statusList.status === 200) {
    steps.push(pass(ctx.actor, "livechat-agent-status-list", "200", statusList.status, "Agent status list accessible."));
  } else if (!canRead && statusList.status === 403) {
    steps.push(pass(ctx.actor, "livechat-agent-status-list", "403", statusList.status, "Agent status list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-agent-status-list", canRead ? "200" : "403", statusList.status, "Unexpected agent-status list response."));
  }

  const statusUpdate = await requestJson("PUT", "/api/livechat/agent-status", ctx.token, { status: "away" });
  if (canRead && statusUpdate.status === 200) {
    steps.push(pass(ctx.actor, "livechat-agent-status-update", "200", statusUpdate.status, "Agent status update succeeded."));
  } else if (!canRead && statusUpdate.status === 403) {
    steps.push(pass(ctx.actor, "livechat-agent-status-update", "403", statusUpdate.status, "Agent status update correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "livechat-agent-status-update", canRead ? "200" : "403", statusUpdate.status, "Unexpected agent-status update response."));
  }

  const statusInvalid = await requestJson("PUT", "/api/livechat/agent-status", ctx.token, { status: "busy" });
  if (canRead && statusInvalid.status === 400) {
    steps.push(pass(ctx.actor, "livechat-agent-status-invalid", "400", statusInvalid.status, "Invalid agent status correctly rejected."));
  } else if (!canRead && statusInvalid.status === 403) {
    steps.push(pass(ctx.actor, "livechat-agent-status-invalid", "403", statusInvalid.status, "Invalid status request correctly blocked (no access)."));
  } else {
    steps.push(fail(ctx.actor, "livechat-agent-status-invalid", canRead ? "400" : "403", statusInvalid.status, "Unexpected invalid agent-status response."));
  }

  if (!canWrite) {
    const blockedCreate = await requestJson("POST", "/api/livechat/dialogs", ctx.token, {
      visitorName: `Blocked ${ctx.actor}`,
    });
    steps.push(
      blockedCreate.status === 403
        ? pass(ctx.actor, "livechat-dialog-create", "403", blockedCreate.status, "Dialog create correctly blocked.")
        : fail(ctx.actor, "livechat-dialog-create", "403", blockedCreate.status, "Dialog create should be blocked.")
    );
    return { steps, dialogId };
  }

  const createDialog = await requestJson("POST", "/api/livechat/dialogs", ctx.token, {
    subject: `[QA Livechat] ${ctx.actor} ${Date.now()}`,
    visitorName: `Visitor ${ctx.actor}`,
    visitorEmail: `${ctx.actor}.${Date.now()}@example.test`,
    firstMessage: "Hello from visitor first message",
    assignToSelf: true,
  });
  const createObj = asObject(createDialog.data);
  dialogId = typeof createObj?.id === "string" ? createObj.id : null;
  if (createDialog.status === 201 && dialogId) {
    steps.push(pass(ctx.actor, "livechat-dialog-create", "201", createDialog.status, `Dialog created (${dialogId}).`));
  } else {
    steps.push(fail(ctx.actor, "livechat-dialog-create", "201", createDialog.status, "Dialog create failed."));
    return { steps, dialogId };
  }

  const detail = await requestJson("GET", `/api/livechat/dialogs/${dialogId}`, ctx.token);
  steps.push(
    detail.status === 200
      ? pass(ctx.actor, "livechat-dialog-detail", "200", detail.status, "Dialog detail accessible.")
      : fail(ctx.actor, "livechat-dialog-detail", "200", detail.status, "Dialog detail failed.")
  );

  const msgListInitial = await requestJson("GET", `/api/livechat/dialogs/${dialogId}/messages?limit=80`, ctx.token);
  if (msgListInitial.status === 200) {
    const msgPayload = asObject(msgListInitial.data);
    const items = Array.isArray(msgPayload?.items) ? (msgPayload?.items as Record<string, unknown>[]) : [];
    let sortedAscending = true;
    let previous = 0;
    for (const item of items) {
      const createdAt = typeof item.createdAt === "string" ? Date.parse(item.createdAt) : NaN;
      const ts = Number.isNaN(createdAt) ? 0 : createdAt;
      if (ts < previous) {
        sortedAscending = false;
        break;
      }
      previous = ts;
    }
    steps.push(pass(ctx.actor, "livechat-messages-list", "200", msgListInitial.status, "Messages list accessible."));
    steps.push(
      sortedAscending
        ? pass(ctx.actor, "livechat-messages-order", "ascending by createdAt", msgListInitial.status, "Message ordering is ascending (oldest -> newest).")
        : fail(ctx.actor, "livechat-messages-order", "ascending by createdAt", msgListInitial.status, "Message order is not ascending.")
    );
  } else {
    steps.push(fail(ctx.actor, "livechat-messages-list", "200", msgListInitial.status, "Messages list failed."));
  }

  const sendText = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/messages`, ctx.token, {
    content: `Agent reply from ${ctx.actor} at ${new Date().toISOString()} https://example.com/livechat`,
  });
  steps.push(
    sendText.status === 201
      ? pass(ctx.actor, "livechat-send-text", "201", sendText.status, "Text reply sent.")
      : fail(ctx.actor, "livechat-send-text", "201", sendText.status, "Text reply failed.")
  );

  const sendAttachment = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/messages`, ctx.token, {
    content: "",
    attachments: [
      {
        fileName: "livechat-qa.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl: "data:text/plain;base64,aGVsbG8=",
        kind: "file",
      },
    ],
  });
  steps.push(
    sendAttachment.status === 201
      ? pass(ctx.actor, "livechat-send-attachment", "201", sendAttachment.status, "Attachment reply sent.")
      : fail(ctx.actor, "livechat-send-attachment", "201", sendAttachment.status, "Attachment reply failed.")
  );

  const typingPost = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/typing`, ctx.token, {
    name: `QA ${ctx.actor}`,
  });
  steps.push(
    typingPost.status === 200
      ? pass(ctx.actor, "livechat-typing-post", "200", typingPost.status, "Typing status posted.")
      : fail(ctx.actor, "livechat-typing-post", "200", typingPost.status, "Typing post failed.")
  );

  const typingGet = await requestJson("GET", `/api/livechat/dialogs/${dialogId}/typing`, ctx.token);
  steps.push(
    typingGet.status === 200
      ? pass(ctx.actor, "livechat-typing-get", "200", typingGet.status, "Typing status fetched.")
      : fail(ctx.actor, "livechat-typing-get", "200", typingGet.status, "Typing get failed.")
  );

  const transcript = await requestRaw("GET", `/api/livechat/dialogs/${dialogId}/transcript`, ctx.token);
  const transcriptOk =
    transcript.status === 200 &&
    Boolean(transcript.contentType?.includes("text/plain")) &&
    transcript.bodyText.includes("Chat Transcript");
  steps.push(
    transcriptOk
      ? pass(ctx.actor, "livechat-transcript", "200 text/plain", transcript.status, "Transcript endpoint works.")
      : fail(ctx.actor, "livechat-transcript", "200 text/plain", transcript.status, `Unexpected transcript response type=${transcript.contentType}.`)
  );

  const insights = await requestJson("GET", `/api/livechat/dialogs/${dialogId}/insights`, ctx.token);
  if (insights.status === 200) {
    steps.push(pass(ctx.actor, "livechat-insights", "200 or 403 when disabled", insights.status, "Insights generated."));
  } else if (insights.status === 403) {
    steps.push(pass(ctx.actor, "livechat-insights", "200 or 403 when disabled", insights.status, "Insights currently disabled by settings."));
  } else {
    steps.push(fail(ctx.actor, "livechat-insights", "200 or 403", insights.status, "Unexpected insights response."));
  }

  const statusClose = await requestJson("PUT", `/api/livechat/dialogs/${dialogId}`, ctx.token, {
    status: "closed",
  });
  steps.push(
    statusClose.status === 200
      ? pass(ctx.actor, "livechat-dialog-close", "200", statusClose.status, "Dialog closed.")
      : fail(ctx.actor, "livechat-dialog-close", "200", statusClose.status, "Dialog close failed.")
  );

  const statusOpen = await requestJson("PUT", `/api/livechat/dialogs/${dialogId}`, ctx.token, {
    status: "open",
    subject: `[QA Livechat Updated] ${ctx.actor}`,
  });
  steps.push(
    statusOpen.status === 200
      ? pass(ctx.actor, "livechat-dialog-reopen", "200", statusOpen.status, "Dialog reopened and subject updated.")
      : fail(ctx.actor, "livechat-dialog-reopen", "200", statusOpen.status, "Dialog reopen failed.")
  );

  const assignSelf = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/assign`, ctx.token, {
    agentId: ctx.userId,
  });
  steps.push(
    assignSelf.status === 200
      ? pass(ctx.actor, "livechat-assign-self", "200", assignSelf.status, "Self assignment works.")
      : fail(ctx.actor, "livechat-assign-self", "200", assignSelf.status, "Self assignment failed.")
  );

  const transferTargetUserId = ctx.actor === "admin" ? ctx.userId : adminCtx.userId;
  const transfer = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/transfer`, ctx.token, {
    agentId: transferTargetUserId,
  });
  if (transferTargetUserId === ctx.userId) {
    if (canManage) {
      steps.push(
        transfer.status === 200
          ? pass(ctx.actor, "livechat-transfer-self-manage", "200", transfer.status, "Manage user can keep dialog assigned to self.")
          : fail(ctx.actor, "livechat-transfer-self-manage", "200", transfer.status, "Manage user self-transfer should be allowed.")
      );
    } else {
      steps.push(
        transfer.status === 400
          ? pass(ctx.actor, "livechat-transfer-self", "400", transfer.status, "Self-transfer correctly rejected.")
          : fail(ctx.actor, "livechat-transfer-self", "400", transfer.status, "Self-transfer should be rejected.")
      );
    }
  } else {
    const expectedTransfer = canManage ? 200 : 200;
    steps.push(
      transfer.status === expectedTransfer
        ? pass(ctx.actor, "livechat-transfer", "200", transfer.status, "Dialog transfer succeeded.")
        : fail(ctx.actor, "livechat-transfer", "200", transfer.status, "Dialog transfer failed.")
    );
  }

  // Keep test-created dialogs tidy by closing whenever actor still has access.
  await requestJson("PUT", `/api/livechat/dialogs/${dialogId}`, ctx.token, { status: "closed" });

  return { steps, dialogId };
}

async function runCrossRoleLiveChatChecks(
  admin: ActorContext,
  manager: ActorContext,
  user: ActorContext
): Promise<StepResult[]> {
  const steps: StepResult[] = [];

  const createByUser = await requestJson("POST", "/api/livechat/dialogs", user.token, {
    subject: `[QA Cross Livechat] ${Date.now()}`,
    visitorName: "Cross Visitor",
    visitorEmail: `cross.${Date.now()}@example.test`,
    firstMessage: "Cross role initial message",
    assignToSelf: true,
  });
  const createObj = asObject(createByUser.data);
  const dialogId = typeof createObj?.id === "string" ? createObj.id : null;
  if (createByUser.status !== 201 || !dialogId) {
    steps.push(fail("cross-role", "livechat-cross-create", "201", createByUser.status, "Failed to create cross-role dialog."));
    return steps;
  }
  steps.push(pass("cross-role", "livechat-cross-create", "201", createByUser.status, `Cross-role dialog created (${dialogId}).`));

  const managerView = await requestJson("GET", `/api/livechat/dialogs/${dialogId}`, manager.token);
  steps.push(
    managerView.status === 200
      ? pass("cross-role", "livechat-manager-view-foreign", "200", managerView.status, "Manager can view foreign livechat dialog.")
      : fail("cross-role", "livechat-manager-view-foreign", "200", managerView.status, "Manager should view foreign dialog.")
  );

  const managerAssignToAdmin = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/assign`, manager.token, {
    agentId: admin.userId,
  });
  steps.push(
    managerAssignToAdmin.status === 200
      ? pass("cross-role", "livechat-manager-assign-admin", "200", managerAssignToAdmin.status, "Manager reassigned dialog to admin.")
      : fail("cross-role", "livechat-manager-assign-admin", "200", managerAssignToAdmin.status, "Manager reassign should succeed.")
  );

  const userSendAfterUnassign = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/messages`, user.token, {
    content: "Should be blocked now",
  });
  steps.push(
    userSendAfterUnassign.status === 403
      ? pass("cross-role", "livechat-user-send-after-unassign", "403", userSendAfterUnassign.status, "Unassigned user blocked from sending.")
      : fail("cross-role", "livechat-user-send-after-unassign", "403", userSendAfterUnassign.status, "Unassigned user should be blocked from sending.")
  );

  const userDetailAfterUnassign = await requestJson("GET", `/api/livechat/dialogs/${dialogId}`, user.token);
  steps.push(
    userDetailAfterUnassign.status === 403
      ? pass("cross-role", "livechat-user-view-after-unassign", "403", userDetailAfterUnassign.status, "Unassigned user blocked from viewing.")
      : fail("cross-role", "livechat-user-view-after-unassign", "403", userDetailAfterUnassign.status, "Unassigned user should be blocked from viewing.")
  );

  const adminSendAfterAssign = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/messages`, admin.token, {
    content: "Admin handling conversation",
  });
  steps.push(
    adminSendAfterAssign.status === 201
      ? pass("cross-role", "livechat-admin-send-after-assign", "201", adminSendAfterAssign.status, "Assigned admin can send.")
      : fail("cross-role", "livechat-admin-send-after-assign", "201", adminSendAfterAssign.status, "Assigned admin should send.")
  );

  const managerTransferBackToUser = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/transfer`, manager.token, {
    agentId: user.userId,
  });
  steps.push(
    managerTransferBackToUser.status === 200
      ? pass("cross-role", "livechat-manager-transfer-user", "200", managerTransferBackToUser.status, "Manager transferred dialog back to user.")
      : fail("cross-role", "livechat-manager-transfer-user", "200", managerTransferBackToUser.status, "Manager transfer should succeed.")
  );

  const userSendAfterTransferBack = await requestJson("POST", `/api/livechat/dialogs/${dialogId}/messages`, user.token, {
    content: "Back as assigned",
  });
  steps.push(
    userSendAfterTransferBack.status === 201
      ? pass("cross-role", "livechat-user-send-after-transfer-back", "201", userSendAfterTransferBack.status, "User can send again after transfer back.")
      : fail("cross-role", "livechat-user-send-after-transfer-back", "201", userSendAfterTransferBack.status, "User should send after transfer back.")
  );

  const adminOwnedDialog = await requestJson("POST", "/api/livechat/dialogs", admin.token, {
    subject: `[QA Admin Owned] ${Date.now()}`,
    visitorName: "Admin Visitor",
    assignToSelf: true,
  });
  const adminOwnedObj = asObject(adminOwnedDialog.data);
  const adminOwnedId = typeof adminOwnedObj?.id === "string" ? adminOwnedObj.id : null;
  if (adminOwnedDialog.status === 201 && adminOwnedId) {
    const userViewAdminOwned = await requestJson("GET", `/api/livechat/dialogs/${adminOwnedId}`, user.token);
    steps.push(
      userViewAdminOwned.status === 403
        ? pass("cross-role", "livechat-user-view-admin-owned", "403", userViewAdminOwned.status, "User cannot view admin-assigned dialog.")
        : fail("cross-role", "livechat-user-view-admin-owned", "403", userViewAdminOwned.status, "User should not view admin-owned dialog.")
    );
    await requestJson("PUT", `/api/livechat/dialogs/${adminOwnedId}`, admin.token, { status: "closed" });
  } else {
    steps.push(fail("cross-role", "livechat-admin-owned-create", "201", adminOwnedDialog.status, "Failed to create admin-owned dialog for visibility check."));
  }

  await requestJson("PUT", `/api/livechat/dialogs/${dialogId}`, manager.token, { status: "closed" });
  return steps;
}

function printSummary(steps: StepResult[]) {
  const actors: Array<StepResult["actor"]> = ["admin", "manager", "user", "cross-role"];
  console.log("");
  console.log("Livechat module deep test report");
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
      livechatPermission: ctx.livechatPermission,
    })),
    steps,
  };
  await writeFile("temp/livechat-module-report.json", JSON.stringify(payload, null, 2), "utf8");
  console.log("Saved JSON report: temp/livechat-module-report.json");
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
  allSteps.push(...(await runActorLiveChatTests(adminCtx, adminCtx)).steps);
  allSteps.push(...(await runActorLiveChatTests(managerCtx, adminCtx)).steps);
  allSteps.push(...(await runActorLiveChatTests(userCtx, adminCtx)).steps);
  allSteps.push(...(await runCrossRoleLiveChatChecks(adminCtx, managerCtx, userCtx)));

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
