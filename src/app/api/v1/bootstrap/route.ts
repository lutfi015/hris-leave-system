import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";

export async function GET(request: NextRequest) {
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const [users, leaveTypes, holidays] = await Promise.all([
    db.employee.findMany({ orderBy: { name: "asc" } }),
    db.leaveType.findMany({ orderBy: { name: "asc" } }),
    db.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);
  const activeUser = requestedUserId
    ? users.find((user) => user.id === requestedUserId)
    : users.find((user) => user.role === "EMPLOYEE");
  if (!activeUser) return apiError("Pengguna aktif tidak ditemukan", 404);

  const year = new Date().getFullYear();
  const [balances, recentRequests, pendingApprovals] = await Promise.all([
    db.leaveBalance.findMany({ where: { employeeId: activeUser.id, year }, include: { leaveType: true } }),
    db.leaveRequest.findMany({
      where: { employeeId: activeUser.id },
      include: { employee: true, leaveType: true, approvals: { include: { approver: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    activeUser.role === "EMPLOYEE"
      ? db.leaveRequest.count({ where: { employeeId: activeUser.id, status: "PENDING" } })
      : db.approval.count({ where: { approverId: activeUser.id, decision: "PENDING", request: { status: "PENDING" } } }),
  ]);
  const annualBalance = balances.find((balance) => balance.leaveType.code === "ANNUAL");

  return NextResponse.json({
    success: true,
    data: {
      users,
      activeUser,
      today: new Date().toISOString().slice(0, 10),
      leaveTypes,
      holidays,
      dashboard: {
        remaining: annualBalance?.remaining ?? 0,
        used: annualBalance?.used ?? 0,
        pending: pendingApprovals,
        recentRequests,
      },
    },
  });
}
