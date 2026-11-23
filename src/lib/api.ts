import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function getActor(actorId: string | null) {
  if (!actorId) return null;
  return db.employee.findUnique({ where: { id: actorId } });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}
