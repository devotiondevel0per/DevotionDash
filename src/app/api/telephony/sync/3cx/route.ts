import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/api-access";
import {
  getActive3cxProvider,
  list3cxCallControlSnapshot,
  list3cxUsers,
  normalizeExtension,
  type ThreeCxCallControlParticipant,
} from "@/lib/telephony/threecx";

type SyncBody = {
  userId?: string;
  syncUsers?: boolean;
  syncLiveCalls?: boolean;
};

function normalizePhone(value: string | null | undefined) {
  return normalizeExtension(value);
}

function toStatus(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("busy")) return "busy";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (normalized.includes("miss") || normalized.includes("noanswer") || normalized.includes("unanswer")) return "missed";
  if (normalized.includes("ring") || normalized.includes("wait")) return "missed";
  return "answered";
}

function toDirection(
  participant: ThreeCxCallControlParticipant,
  dn: string,
  knownExtensions: Set<string>
): "inbound" | "outbound" | "internal" {
  const fromDn = normalizePhone(participant.originated_by_dn);
  const otherDn = normalizePhone(participant.party_dn);
  if (knownExtensions.has(dn) && otherDn && knownExtensions.has(otherDn)) {
    return "internal";
  }
  if (fromDn && fromDn === dn) return "outbound";
  if (otherDn && otherDn === dn) return "inbound";
  return "outbound";
}

export async function POST(req: NextRequest) {
  const accessResult = await requireModuleAccess("telephony", "manage");
  if (!accessResult.ok) return accessResult.response;

  const body = (await req.json().catch(() => ({}))) as SyncBody;
  const targetUserId = body.userId?.trim() || null;
  const syncUsers = body.syncUsers ?? true;
  const syncLiveCalls = body.syncLiveCalls ?? true;

  const provider = await getActive3cxProvider(accessResult.ctx.db);
  if (!provider) {
    return NextResponse.json(
      { error: "No active 3CX provider found. Configure one in Administration -> Telephony Providers." },
      { status: 400 }
    );
  }

  try {
    const syncSummary = {
      providerId: provider.id,
      targetUserId,
      extensionsCreated: 0,
      extensionsUpdated: 0,
      extensionsSkipped: 0,
      callsInserted: 0,
      callsSkipped: 0,
      warnings: [] as string[],
    };

    if (syncUsers) {
      const [threeCxUsers, localUsers, localExtensions] = await Promise.all([
        list3cxUsers(provider),
        accessResult.ctx.db.user.findMany({
          select: { id: true, email: true },
        }),
        accessResult.ctx.db.extension.findMany({
          select: { id: true, number: true, userId: true },
        }),
      ]);

      const userIdByEmail = new Map(
        localUsers
          .filter((u) => Boolean(u.email))
          .map((u) => [u.email!.trim().toLowerCase(), u.id] as const)
      );
      const extByNumber = new Map(localExtensions.map((ext) => [normalizePhone(ext.number), ext] as const));

      for (const user of threeCxUsers) {
        const extNumber = normalizePhone(user.Number);
        if (!extNumber) continue;

        const existing = extByNumber.get(extNumber);
        const mappedByEmail = user.EmailAddress ? userIdByEmail.get(user.EmailAddress.trim().toLowerCase()) ?? null : null;
        const mappedUserId = existing?.userId ?? mappedByEmail ?? null;

        if (targetUserId && mappedUserId !== targetUserId) {
          syncSummary.extensionsSkipped += 1;
          continue;
        }

        if (existing) {
          const shouldSetUser = !existing.userId && Boolean(mappedUserId);
          if (!shouldSetUser) {
            syncSummary.extensionsSkipped += 1;
            continue;
          }
          await accessResult.ctx.db.extension.update({
            where: { id: existing.id },
            data: {
              userId: mappedUserId,
              isActive: true,
            },
          });
          syncSummary.extensionsUpdated += 1;
          continue;
        }

        await accessResult.ctx.db.extension.create({
          data: {
            number: extNumber,
            userId: mappedUserId,
            password: randomUUID().replace(/-/g, ""),
            isActive: true,
          },
        });
        syncSummary.extensionsCreated += 1;
      }
    }

    if (syncLiveCalls) {
      const [extensionRows, dnStates] = await Promise.all([
        accessResult.ctx.db.extension.findMany({
          select: { number: true, userId: true },
        }),
        list3cxCallControlSnapshot(provider).catch((error) => {
          const message = error instanceof Error ? error.message : "Unknown error while reading /callcontrol";
          syncSummary.warnings.push(`Live call sync skipped: ${message}`);
          return [];
        }),
      ]);

      const extensionToUser = new Map(
        extensionRows
          .map((row) => [normalizePhone(row.number), row.userId] as const)
          .filter(([number]) => Boolean(number))
      );
      const knownExtensions = new Set([...extensionToUser.keys()]);
      const targetExtensions = targetUserId
        ? new Set(
            extensionRows
              .filter((row) => row.userId === targetUserId)
              .map((row) => normalizePhone(row.number))
              .filter(Boolean)
          )
        : null;

      const candidates = [] as Array<{
        key: string;
        callerNum: string;
        calleeNum: string;
        callerId: string | null;
        calleeId: string | null;
        direction: "inbound" | "outbound" | "internal";
        status: string;
      }>;

      for (const state of dnStates) {
        const dn = normalizePhone(state.dn);
        if (!dn) continue;
        const participants = Array.isArray(state.participants) ? state.participants : [];

        for (const participant of participants) {
          const callId = participant.callid ?? "na";
          const legId = participant.legid ?? participant.id ?? "na";
          const key = `3cx:${callId}:${legId}`;

          const callerNum =
            normalizePhone(participant.party_caller_id) ||
            normalizePhone(participant.originated_by_dn) ||
            dn;
          const calleeNum = normalizePhone(participant.party_dn) || normalizePhone(participant.party_did) || dn;
          const direction = toDirection(participant, dn, knownExtensions);
          const dnUserId = extensionToUser.get(dn) ?? null;
          let callerId = extensionToUser.get(callerNum) ?? null;
          let calleeId = extensionToUser.get(calleeNum) ?? null;
          if (!callerId && !calleeId && dnUserId) {
            if (direction === "outbound") callerId = dnUserId;
            if (direction === "inbound") calleeId = dnUserId;
          }

          if (targetUserId) {
            const relatedToTarget =
              callerId === targetUserId ||
              calleeId === targetUserId ||
              (targetExtensions ? targetExtensions.has(callerNum) || targetExtensions.has(calleeNum) || targetExtensions.has(dn) : false);
            if (!relatedToTarget) {
              syncSummary.callsSkipped += 1;
              continue;
            }
          }

          candidates.push({
            key,
            callerNum,
            calleeNum,
            callerId,
            calleeId,
            direction,
            status: toStatus(participant.status),
          });
        }
      }

      const dedupedByKey = new Map<string, (typeof candidates)[number]>();
      for (const candidate of candidates) {
        if (!dedupedByKey.has(candidate.key)) {
          dedupedByKey.set(candidate.key, candidate);
        }
      }

      const keys = [...dedupedByKey.keys()];
      if (keys.length > 0) {
        const existing = await accessResult.ctx.db.callLog.findMany({
          where: { recordUrl: { in: keys } },
          select: { recordUrl: true },
        });
        const existingKeys = new Set(existing.map((row) => row.recordUrl).filter(Boolean) as string[]);

        for (const [key, entry] of dedupedByKey.entries()) {
          if (existingKeys.has(key)) {
            syncSummary.callsSkipped += 1;
            continue;
          }
          await accessResult.ctx.db.callLog.create({
            data: {
              callerId: entry.callerId,
              calleeId: entry.calleeId,
              callerNum: entry.callerNum || "unknown",
              calleeNum: entry.calleeNum || "unknown",
              direction: entry.direction,
              status: entry.status,
              duration: 0,
              startedAt: new Date(),
              recordUrl: key,
            },
          });
          syncSummary.callsInserted += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      source: "3cx",
      mode: "live-call-control-snapshot",
      ...syncSummary,
    });
  } catch (error) {
    console.error("[POST /api/telephony/sync/3cx]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "3CX sync failed",
      },
      { status: 500 }
    );
  }
}

