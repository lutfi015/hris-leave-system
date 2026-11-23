import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  if (actor.role === "EMPLOYEE") return apiError("Jadwal tim hanya tersedia untuk Manajer dan HR Admin", 403);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const data = await db.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lt: tomorrow },
      endDate: { gte: today },
      ...(actor.role === "MANAGER" ? { employee: { managerId: actor.id } } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      workingDays: true,
      employee: { select: { name: true, jobTitle: true, department: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json({ success: true, data });
}
