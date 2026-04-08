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
  size: number;
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
  documentsPermission: PermissionSet;
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
    email: "qa_manager@devotiondash.local",
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
    email: "qa_user@devotiondash.local",
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

async function requestMultipart(path: string, token: string, formData: FormData): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
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
  const buffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    size: buffer.byteLength,
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

function documentsPermissionFromPayload(permsPayload: Record<string, unknown> | null): PermissionSet {
  const permissions = asObject(permsPayload?.permissions);
  const documents = asObject(permissions?.documents);
  return {
    read: Boolean(documents?.read),
    write: Boolean(documents?.write),
    manage: Boolean(documents?.manage),
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
    documentsPermission: documentsPermissionFromPayload(permsObj),
  };
}

async function runActorDocumentTests(
  ctx: ActorContext,
  adminCtx: ActorContext,
  managerCtx: ActorContext
): Promise<{ steps: StepResult[] }> {
  const steps: StepResult[] = [];

  const canRead = ctx.isAdmin || ctx.documentsPermission.read;
  const canWrite = ctx.isAdmin || ctx.documentsPermission.write;
  const canManage = ctx.isAdmin || ctx.documentsPermission.manage;

  const list = await requestJson("GET", "/api/documents?category=all&limit=20", ctx.token);
  if (canRead && list.status === 200) {
    steps.push(pass(ctx.actor, "documents-list", "200", list.status, "Documents list accessible."));
  } else if (!canRead && list.status === 403) {
    steps.push(pass(ctx.actor, "documents-list", "403", list.status, "Documents list correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "documents-list", canRead ? "200" : "403", list.status, "Unexpected documents list response."));
  }

  const folders = await requestJson("GET", "/api/documents/folders", ctx.token);
  if (canRead && folders.status === 200) {
    steps.push(pass(ctx.actor, "documents-folders-list", "200", folders.status, "Folder tree endpoint accessible."));
  } else if (!canRead && folders.status === 403) {
    steps.push(pass(ctx.actor, "documents-folders-list", "403", folders.status, "Folder tree endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "documents-folders-list", canRead ? "200" : "403", folders.status, "Unexpected folders response."));
  }

  const counts = await requestJson("GET", "/api/documents/counts", ctx.token);
  if (canRead && counts.status === 200) {
    steps.push(pass(ctx.actor, "documents-counts", "200", counts.status, "Counts endpoint accessible."));
  } else if (!canRead && counts.status === 403) {
    steps.push(pass(ctx.actor, "documents-counts", "403", counts.status, "Counts endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "documents-counts", canRead ? "200" : "403", counts.status, "Unexpected counts response."));
  }

  const shareUsers = await requestJson("GET", "/api/documents/share-users?search=qa&limit=5", ctx.token);
  if (canRead && shareUsers.status === 200) {
    steps.push(pass(ctx.actor, "documents-share-users", "200", shareUsers.status, "Share-users endpoint accessible."));
  } else if (!canRead && shareUsers.status === 403) {
    steps.push(pass(ctx.actor, "documents-share-users", "403", shareUsers.status, "Share-users endpoint correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "documents-share-users", canRead ? "200" : "403", shareUsers.status, "Unexpected share-users response."));
  }

  const adminView = await requestJson("GET", "/api/documents/admin?view=all&limit=10", ctx.token);
  if (canManage && adminView.status === 200) {
    steps.push(pass(ctx.actor, "documents-admin-view", "200", adminView.status, "Admin documents view accessible."));
  } else if (!canManage && adminView.status === 403) {
    steps.push(pass(ctx.actor, "documents-admin-view", "403", adminView.status, "Admin documents view correctly blocked."));
  } else {
    steps.push(fail(ctx.actor, "documents-admin-view", canManage ? "200" : "403", adminView.status, "Unexpected documents admin view response."));
  }

  const createFolder = await requestJson("POST", "/api/documents", ctx.token, {
    type: "folder",
    name: `[QA Folder] ${ctx.actor} ${Date.now()}`,
    accessLevel: "private",
  });

  if (!canWrite) {
    if (createFolder.status === 403) {
      steps.push(pass(ctx.actor, "documents-folder-create", "403", createFolder.status, "Folder create correctly blocked."));
    } else {
      steps.push(fail(ctx.actor, "documents-folder-create", "403", createFolder.status, "Folder create should be blocked."));
    }

    const blockedCreateDoc = await requestJson("POST", "/api/documents", ctx.token, {
      type: "document",
      name: `[QA Doc] blocked ${ctx.actor} ${Date.now()}`,
      content: "Blocked create attempt",
      accessLevel: "private",
    });
    steps.push(
      blockedCreateDoc.status === 403
        ? pass(ctx.actor, "documents-create", "403", blockedCreateDoc.status, "Document create correctly blocked.")
        : fail(ctx.actor, "documents-create", "403", blockedCreateDoc.status, "Document create should be blocked.")
    );

    return { steps };
  }

  const cleanupFolderIds: string[] = [];
  const cleanupDocIds: string[] = [];

  let folderId: string | null = null;
  const folderObj = asObject(createFolder.data);
  const createdFolder = asObject(folderObj?.folder);
  if (createFolder.status === 201 && typeof createdFolder?.id === "string") {
    folderId = createdFolder.id;
    cleanupFolderIds.push(folderId);
    steps.push(pass(ctx.actor, "documents-folder-create", "201", createFolder.status, `Folder created (${folderId}).`));
  } else {
    steps.push(fail(ctx.actor, "documents-folder-create", "201", createFolder.status, "Folder create failed."));
    return { steps };
  }

  try {
    const renameFolder = await requestJson("PUT", `/api/documents/folders/${folderId}`, ctx.token, {
      name: `[QA Folder Renamed] ${ctx.actor} ${Date.now()}`,
    });
    steps.push(
      renameFolder.status === 200
        ? pass(ctx.actor, "documents-folder-rename", "200", renameFolder.status, "Folder rename succeeded.")
        : fail(ctx.actor, "documents-folder-rename", "200", renameFolder.status, "Folder rename failed.")
    );

    const createDoc = await requestJson("POST", "/api/documents", ctx.token, {
      type: "document",
      name: `[QA TextDoc] ${ctx.actor} ${Date.now()}.txt`,
      folderId,
      content: "QA content for documents module",
      accessLevel: "private",
    });
    let textDocId: string | null = null;
    const createDocObj = asObject(createDoc.data);
    const createdDoc = asObject(createDocObj?.document);
    if (createDoc.status === 201 && typeof createdDoc?.id === "string") {
      textDocId = createdDoc.id;
      cleanupDocIds.push(textDocId);
      steps.push(pass(ctx.actor, "documents-create", "201", createDoc.status, `Document created (${textDocId}).`));
    } else {
      steps.push(fail(ctx.actor, "documents-create", "201", createDoc.status, "Document create failed."));
    }

    if (textDocId) {
      const detail = await requestJson("GET", `/api/documents/${textDocId}`, ctx.token);
      steps.push(
        detail.status === 200
          ? pass(ctx.actor, "documents-detail", "200", detail.status, "Document detail loaded.")
          : fail(ctx.actor, "documents-detail", "200", detail.status, "Document detail failed.")
      );

      const update = await requestJson("PUT", `/api/documents/${textDocId}`, ctx.token, {
        name: `[QA TextDoc Updated] ${ctx.actor} ${Date.now()}.txt`,
        content: "Updated content",
      });
      steps.push(
        update.status === 200
          ? pass(ctx.actor, "documents-update", "200", update.status, "Document update succeeded.")
          : fail(ctx.actor, "documents-update", "200", update.status, "Document update failed.")
      );

      const setShare = await requestJson("PUT", `/api/documents/${textDocId}/share`, ctx.token, {
        accessLevel: "private",
        shares: [
          { userId: adminCtx.userId, canRead: true },
          { userId: managerCtx.userId, canRead: true },
        ],
      });
      steps.push(
        setShare.status === 200
          ? pass(ctx.actor, "documents-share-update", "200", setShare.status, "Document share updated.")
          : fail(ctx.actor, "documents-share-update", "200", setShare.status, "Document share update failed.")
      );

      const shareDetail = await requestJson("GET", `/api/documents/${textDocId}/share`, ctx.token);
      steps.push(
        shareDetail.status === 200
          ? pass(ctx.actor, "documents-share-detail", "200", shareDetail.status, "Document share detail loaded.")
          : fail(ctx.actor, "documents-share-detail", "200", shareDetail.status, "Document share detail failed.")
      );
    }

    const deleteFolderWhileNotEmpty = await requestJson("DELETE", `/api/documents/folders/${folderId}`, ctx.token);
    steps.push(
      deleteFolderWhileNotEmpty.status === 409
        ? pass(ctx.actor, "documents-folder-delete-non-empty", "409", deleteFolderWhileNotEmpty.status, "Non-empty folder delete correctly blocked.")
        : fail(ctx.actor, "documents-folder-delete-non-empty", "409", deleteFolderWhileNotEmpty.status, "Expected 409 on non-empty folder delete.")
    );

    const uploadForm = new FormData();
    const uploadBlob = new Blob([`Upload test from ${ctx.actor} at ${new Date().toISOString()}`], { type: "text/plain" });
    uploadForm.append("file", uploadBlob, `qa-upload-${ctx.actor}.txt`);
    uploadForm.append("folderId", folderId);
    uploadForm.append("accessLevel", "private");

    const upload = await requestMultipart("/api/documents/upload", ctx.token, uploadForm);
    let uploadDocId: string | null = null;
    const uploadObj = asObject(upload.data);
    if (upload.status === 201 && typeof uploadObj?.id === "string") {
      uploadDocId = uploadObj.id;
      cleanupDocIds.push(uploadDocId);
      steps.push(pass(ctx.actor, "documents-upload", "201", upload.status, `Upload succeeded (${uploadDocId}).`));
    } else {
      steps.push(fail(ctx.actor, "documents-upload", "201", upload.status, "Upload failed."));
    }

    if (uploadDocId) {
      const download = await requestRaw("GET", `/api/documents/${uploadDocId}/download`, ctx.token);
      const looksLikeBinary = download.contentType !== "application/json" && download.size > 0;
      steps.push(
        download.status === 200 && looksLikeBinary
          ? pass(ctx.actor, "documents-download", "200 + binary body", download.status, `Download worked (${download.size} bytes).`)
          : fail(ctx.actor, "documents-download", "200 + binary body", download.status, `Unexpected download response type=${download.contentType} size=${download.size}.`)
      );

      const deleteUpload = await requestJson("DELETE", `/api/documents/${uploadDocId}`, ctx.token);
      if (deleteUpload.status === 200) {
        const cleanupIdx = cleanupDocIds.indexOf(uploadDocId);
        if (cleanupIdx >= 0) cleanupDocIds.splice(cleanupIdx, 1);
      }
      steps.push(
        deleteUpload.status === 200
          ? pass(ctx.actor, "documents-uploaded-delete", "200", deleteUpload.status, "Uploaded document deleted.")
          : fail(ctx.actor, "documents-uploaded-delete", "200", deleteUpload.status, "Uploaded document delete failed.")
      );
    }

    if (canManage) {
      const adminByUser = await requestJson("GET", `/api/documents/admin?view=by_user&userId=${ctx.userId}&limit=10`, ctx.token);
      steps.push(
        adminByUser.status === 200
          ? pass(ctx.actor, "documents-admin-by-user", "200", adminByUser.status, "Admin by-user view works.")
          : fail(ctx.actor, "documents-admin-by-user", "200", adminByUser.status, "Admin by-user view failed.")
      );
    }

    if (cleanupDocIds.length > 0) {
      const bulkShare = await requestJson("POST", "/api/documents/shares/bulk", ctx.token, {
        action: "share",
        documentIds: cleanupDocIds,
        targetUserId: adminCtx.userId,
        canRead: true,
      });
      steps.push(
        bulkShare.status === 200
          ? pass(ctx.actor, "documents-bulk-share", "200", bulkShare.status, `Bulk share processed for ${cleanupDocIds.length} docs.`)
          : fail(ctx.actor, "documents-bulk-share", "200", bulkShare.status, "Bulk share failed.")
      );

      const bulkUnshare = await requestJson("POST", "/api/documents/shares/bulk", ctx.token, {
        action: "unshare",
        documentIds: cleanupDocIds,
        targetUserId: adminCtx.userId,
      });
      steps.push(
        bulkUnshare.status === 200
          ? pass(ctx.actor, "documents-bulk-unshare", "200", bulkUnshare.status, "Bulk unshare processed.")
          : fail(ctx.actor, "documents-bulk-unshare", "200", bulkUnshare.status, "Bulk unshare failed.")
      );
    }
  } finally {
    for (const docId of [...cleanupDocIds]) {
      await requestJson("DELETE", `/api/documents/${docId}`, ctx.token);
    }

    for (const folderCleanupId of [...cleanupFolderIds]) {
      await requestJson("DELETE", `/api/documents/folders/${folderCleanupId}`, ctx.token);
    }
  }

  return { steps };
}

async function runCrossRoleDocumentChecks(
  admin: ActorContext,
  manager: ActorContext,
  user: ActorContext
): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const cleanupUserDocIds: string[] = [];
  const cleanupAdminDocIds: string[] = [];
  const cleanupUserFolderIds: string[] = [];

  try {
    const userCreate = await requestJson("POST", "/api/documents", user.token, {
      type: "document",
      name: `[QA Cross User Private Doc] ${Date.now()}.txt`,
      content: "Cross-role private doc",
      accessLevel: "private",
    });
    const userCreateObj = asObject(userCreate.data);
    const userDoc = asObject(userCreateObj?.document);
    const userDocId = typeof userDoc?.id === "string" ? userDoc.id : null;
    if (userCreate.status === 201 && userDocId) {
      cleanupUserDocIds.push(userDocId);
      steps.push(pass("cross-role", "user-create-private-doc", "201", userCreate.status, `User private doc created (${userDocId}).`));

      const managerReadBeforeShare = await requestJson("GET", `/api/documents/${userDocId}`, manager.token);
      steps.push(
        managerReadBeforeShare.status === 403
          ? pass("cross-role", "manager-read-user-doc-before-share", "403", managerReadBeforeShare.status, "Manager blocked from reading before share.")
          : fail("cross-role", "manager-read-user-doc-before-share", "403", managerReadBeforeShare.status, "Manager should be blocked before share.")
      );

      const userShareToManager = await requestJson("PUT", `/api/documents/${userDocId}/share`, user.token, {
        accessLevel: "private",
        shares: [{ userId: manager.userId, canRead: true }],
      });
      steps.push(
        userShareToManager.status === 200
          ? pass("cross-role", "user-share-doc-to-manager", "200", userShareToManager.status, "User shared doc to manager.")
          : fail("cross-role", "user-share-doc-to-manager", "200", userShareToManager.status, "User should be able to share own doc.")
      );

      const managerReadAfterShare = await requestJson("GET", `/api/documents/${userDocId}`, manager.token);
      steps.push(
        managerReadAfterShare.status === 403
          ? pass("cross-role", "manager-read-user-doc-after-share", "403", managerReadAfterShare.status, "Manager still blocked due no documents module permission.")
          : fail("cross-role", "manager-read-user-doc-after-share", "403", managerReadAfterShare.status, "Expected manager block due module permission gate.")
      );

      const adminReadUserDoc = await requestJson("GET", `/api/documents/${userDocId}`, admin.token);
      steps.push(
        adminReadUserDoc.status === 200
          ? pass("cross-role", "admin-read-user-private-doc", "200", adminReadUserDoc.status, "Admin can read user private doc by id.")
          : fail("cross-role", "admin-read-user-private-doc", "200", adminReadUserDoc.status, "Admin should read user private doc.")
      );

      const managerUpdateUserDoc = await requestJson("PUT", `/api/documents/${userDocId}`, manager.token, {
        name: "manager should not update",
      });
      steps.push(
        managerUpdateUserDoc.status === 403
          ? pass("cross-role", "manager-update-user-doc", "403", managerUpdateUserDoc.status, "Manager update blocked.")
          : fail("cross-role", "manager-update-user-doc", "403", managerUpdateUserDoc.status, "Manager should be blocked from update.")
      );

      const managerDeleteUserDoc = await requestJson("DELETE", `/api/documents/${userDocId}`, manager.token);
      steps.push(
        managerDeleteUserDoc.status === 403
          ? pass("cross-role", "manager-delete-user-doc", "403", managerDeleteUserDoc.status, "Manager delete blocked.")
          : fail("cross-role", "manager-delete-user-doc", "403", managerDeleteUserDoc.status, "Manager should be blocked from delete.")
      );
    } else {
      steps.push(fail("cross-role", "user-create-private-doc", "201", userCreate.status, "User private doc create failed."));
    }

    const adminCreate = await requestJson("POST", "/api/documents", admin.token, {
      type: "document",
      name: `[QA Cross Admin Private Doc] ${Date.now()}.txt`,
      content: "Admin private doc",
      accessLevel: "private",
    });
    const adminCreateObj = asObject(adminCreate.data);
    const adminDoc = asObject(adminCreateObj?.document);
    const adminDocId = typeof adminDoc?.id === "string" ? adminDoc.id : null;
    if (adminCreate.status === 201 && adminDocId) {
      cleanupAdminDocIds.push(adminDocId);
      steps.push(pass("cross-role", "admin-create-private-doc", "201", adminCreate.status, `Admin private doc created (${adminDocId}).`));

      const userBulkShareAdminDoc = await requestJson("POST", "/api/documents/shares/bulk", user.token, {
        action: "share",
        documentIds: [adminDocId],
        targetUserId: manager.userId,
        canRead: true,
      });
      steps.push(
        userBulkShareAdminDoc.status === 403
          ? pass("cross-role", "user-bulk-share-admin-doc", "403", userBulkShareAdminDoc.status, "User blocked from bulk sharing admin-owned docs.")
          : fail("cross-role", "user-bulk-share-admin-doc", "403", userBulkShareAdminDoc.status, "User should not bulk-share admin-owned docs.")
      );
    } else {
      steps.push(fail("cross-role", "admin-create-private-doc", "201", adminCreate.status, "Admin private doc create failed."));
    }

    const userCreateFolder = await requestJson("POST", "/api/documents", user.token, {
      type: "folder",
      name: `[QA Cross Folder] ${Date.now()}`,
      accessLevel: "private",
    });
    const userFolderObj = asObject(userCreateFolder.data);
    const userFolder = asObject(userFolderObj?.folder);
    const userFolderId = typeof userFolder?.id === "string" ? userFolder.id : null;
    if (userCreateFolder.status === 201 && userFolderId) {
      cleanupUserFolderIds.push(userFolderId);
      steps.push(pass("cross-role", "user-create-folder", "201", userCreateFolder.status, `User folder created (${userFolderId}).`));

      const managerRenameFolder = await requestJson("PUT", `/api/documents/folders/${userFolderId}`, manager.token, {
        name: "manager-rename-attempt",
      });
      steps.push(
        managerRenameFolder.status === 403
          ? pass("cross-role", "manager-rename-user-folder", "403", managerRenameFolder.status, "Manager blocked from renaming user folder.")
          : fail("cross-role", "manager-rename-user-folder", "403", managerRenameFolder.status, "Manager should be blocked from folder rename.")
      );

      const userShareFolderToManager = await requestJson("PUT", `/api/documents/folders/${userFolderId}/share`, user.token, {
        accessLevel: "private",
        shares: [{ userId: manager.userId, canRead: true }],
      });
      steps.push(
        userShareFolderToManager.status === 200
          ? pass("cross-role", "user-share-folder-to-manager", "200", userShareFolderToManager.status, "User shared folder to manager.")
          : fail("cross-role", "user-share-folder-to-manager", "200", userShareFolderToManager.status, "User should share own folder.")
      );

      const managerFolderShareView = await requestJson("GET", `/api/documents/folders/${userFolderId}/share`, manager.token);
      steps.push(
        managerFolderShareView.status === 403
          ? pass("cross-role", "manager-view-folder-share", "403", managerFolderShareView.status, "Manager blocked due no documents read permission.")
          : fail("cross-role", "manager-view-folder-share", "403", managerFolderShareView.status, "Manager should be blocked from folder share view.")
      );
    } else {
      steps.push(fail("cross-role", "user-create-folder", "201", userCreateFolder.status, "User folder create failed."));
    }
  } finally {
    for (const id of cleanupUserDocIds) {
      await requestJson("DELETE", `/api/documents/${id}`, user.token);
    }
    for (const id of cleanupAdminDocIds) {
      await requestJson("DELETE", `/api/documents/${id}`, admin.token);
    }
    for (const id of cleanupUserFolderIds) {
      await requestJson("DELETE", `/api/documents/folders/${id}`, user.token);
      await requestJson("DELETE", `/api/documents/folders/${id}`, admin.token);
    }
  }

  return steps;
}

function printSummary(steps: StepResult[]) {
  const actors: Array<StepResult["actor"]> = ["admin", "manager", "user", "cross-role"];
  console.log("");
  console.log("Documents module deep test report");
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
      documentsPermission: ctx.documentsPermission,
    })),
    steps,
  };
  await writeFile("temp/documents-module-report.json", JSON.stringify(payload, null, 2), "utf8");
  console.log("Saved JSON report: temp/documents-module-report.json");
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
  allSteps.push(...(await runActorDocumentTests(adminCtx, adminCtx, managerCtx)).steps);
  allSteps.push(...(await runActorDocumentTests(managerCtx, adminCtx, managerCtx)).steps);
  allSteps.push(...(await runActorDocumentTests(userCtx, adminCtx, managerCtx)).steps);
  allSteps.push(...(await runCrossRoleDocumentChecks(adminCtx, managerCtx, userCtx)));

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
