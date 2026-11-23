import { LeaveStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";
import { calculateWorkingDays } from "@/services/leave-calculator";

export async function GET(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  const status = request.nextUrl.searchParams.get("status");
  if (status && !Object.values(LeaveStatus).includes(status as LeaveStatus)) return apiError("Filter status tidak valid", 400);
  const data = await db.leaveRequest.findMany({
    where: { employeeId: actor.id, ...(status ? { status: status as LeaveStatus } : {}) },
    include: { employee: true, leaveType: true, approvals: { include: { approver: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);

  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return apiError("Data pengajuan tidak valid", 400);
  const input = body as Record<string, unknown>;
  const leaveTypeId = input.leaveTypeId;
  const startDate = input.startDate;
  const endDate = input.endDate;
  const reason = input.reason;
  if (typeof leaveTypeId !== "string" ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof reason !== "string" ||
      !reason.trim()) {
    return apiError("Jenis cuti, rentang tanggal, dan alasan wajib diisi", 400);
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) return apiError("Format tanggal harus YYYY-MM-DD", 400);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      start.toISOString().slice(0, 10) !== startDate ||
      end.toISOString().slice(0, 10) !== endDate ||
      end < start || start.getUTCFullYear() !== end.getUTCFullYear()) {
    return apiError("Rentang tanggal cuti tidak valid", 400);
  }

  const [leaveType, manager, holidayRows, balance] = await Promise.all([
    db.leaveType.findUnique({ where: { id: leaveTypeId } }),
    actor.managerId ? db.employee.findUnique({ where: { id: actor.managerId } }) : null,
    db.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: actor.id, leaveTypeId, year: start.getUTCFullYear() } },
    }),
  ]);
  if (!leaveType) return apiError("Jenis cuti tidak ditemukan", 404);
  if (!manager || manager.role !== "MANAGER") return apiError("Karyawan belum memiliki manajer yang ditetapkan", 409);

  const workingDays = calculateWorkingDays(startDate, endDate, holidayRows.map((holiday) => holiday.date.toISOString().slice(0, 10)));
  if (workingDays < 1) return apiError("Rentang tanggal tidak memiliki hari kerja", 422);
  if (!balance || balance.remaining < workingDays) return apiError("Saldo cuti tidak mencukupi", 422);

  const created = await db.$transaction(async (transaction) => {
    const leaveRequest = await transaction.leaveRequest.create({
      data: {
        employeeId: actor.id,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        workingDays,
        reason: reason.trim(),
        status: LeaveStatus.PENDING,
      },
    });
    await transaction.approval.create({
      data: {
        requestId: leaveRequest.id,
        approverId: manager.id,
        stage: "MANAGER",
        decision: "PENDING",
      },
    });
    return transaction.leaveRequest.findUniqueOrThrow({
      where: { id: leaveRequest.id },
      include: { employee: true, leaveType: true, approvals: { include: { approver: true } } },
    });
  });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
}
