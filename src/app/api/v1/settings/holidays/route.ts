import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  const [holidays, leaveTypes] = await Promise.all([
    db.holiday.findMany({ orderBy: { date: "asc" } }),
    db.leaveType.findMany({ orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ success: true, data: { holidays, leaveTypes } });
}

export async function POST(request: NextRequest) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  if (actor.role !== "HR_ADMIN") return apiError("Hanya HR Admin yang dapat menambah hari libur", 403);

  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return apiError("Data hari libur tidak valid", 400);
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || typeof input.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return apiError("Nama dan tanggal hari libur wajib diisi", 400);
  }
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) {
    return apiError("Tanggal hari libur tidak valid", 400);
  }
  const existing = await db.holiday.findUnique({ where: { date } });
  if (existing) return apiError("Tanggal tersebut sudah terdaftar sebagai hari libur", 409);
  const holiday = await db.holiday.create({ data: { date, name: input.name.trim() } });
  return NextResponse.json({ success: true, data: holiday }, { status: 201 });
}
