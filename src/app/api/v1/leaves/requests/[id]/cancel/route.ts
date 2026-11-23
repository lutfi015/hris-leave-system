import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  const { id } = await context.params;
  const updated = await db.$transaction(async (transaction) => {
    const changed = await transaction.leaveRequest.updateMany({
      where: { id, employeeId: actor.id, status: LeaveStatus.PENDING },
      data: { status: LeaveStatus.CANCELLED },
    });
    if (changed.count) {
      await transaction.approval.updateMany({
        where: { requestId: id, decision: "PENDING" },
        data: { decision: "NOT_REQUIRED", remarks: "Pengajuan dibatalkan oleh karyawan" },
      });
    }
    return changed;
  });
  if (!updated.count) return apiError("Permintaan tidak ditemukan atau bukan milik Anda dalam status PENDING", 409);
  const data = await db.leaveRequest.findUniqueOrThrow({
    where: { id },
    include: { employee: true, leaveType: true, approvals: { include: { approver: true } } },
  });
  return NextResponse.json({ success: true, data });
}
