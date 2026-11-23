import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  if (actor.role === "EMPLOYEE") return apiError("Inbox persetujuan hanya tersedia untuk Manajer dan HR Admin", 403);
  const data = await db.approval.findMany({
    where: { approverId: actor.id, decision: "PENDING", request: { status: "PENDING" } },
    include: {
      request: {
        include: {
          employee: true,
          leaveType: true,
          approvals: { include: { approver: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, data: data.map((approval) => approval.request) });
}
