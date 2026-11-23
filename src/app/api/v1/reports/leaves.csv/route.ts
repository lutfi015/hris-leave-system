import { NextRequest } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  if (actor.role !== "HR_ADMIN") return apiError("Hanya HR Admin yang dapat mengekspor rekap cuti", 403);

  const requests = await db.leaveRequest.findMany({
    select: {
      startDate: true,
      endDate: true,
      workingDays: true,
      status: true,
      employee: { select: { nik: true, name: true, department: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  const rows = [
    ["NIK", "Nama", "Departemen", "Jenis Cuti", "Tanggal Mulai", "Tanggal Selesai", "Total Hari", "Status"],
    ...requests.map((item) => [
      item.employee.nik,
      item.employee.name,
      item.employee.department,
      item.leaveType.name,
      item.startDate.toISOString().slice(0, 10),
      item.endDate.toISOString().slice(0, 10),
      item.workingDays,
      item.status,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rekap-cuti.csv"',
      "Cache-Control": "no-store",
    },
  });
}
