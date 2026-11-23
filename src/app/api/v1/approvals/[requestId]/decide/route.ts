import { ApprovalDecision } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError, getActor } from "@/lib/api";
import { ApprovalError, decideApproval } from "@/services/approval-engine";

export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const actor = await getActor(request.headers.get("x-actor-id"));
  if (!actor) return apiError("Pengguna aktif tidak valid", 401);
  if (actor.role === "EMPLOYEE") return apiError("Hanya Manajer dan HR Admin yang dapat memberi keputusan", 403);
  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return apiError("Keputusan tidak valid", 400);
  const input = body as Record<string, unknown>;
  if (input.decision !== "APPROVED" && input.decision !== "REJECTED") return apiError("Keputusan tidak valid", 400);
  if (input.remarks !== undefined && typeof input.remarks !== "string") return apiError("Catatan harus berupa teks", 400);

  const { requestId } = await context.params;
  try {
    const data = await decideApproval(
      requestId,
      actor.id,
      input.decision as Exclude<ApprovalDecision, "PENDING" | "NOT_REQUIRED">,
      typeof input.remarks === "string" ? input.remarks.trim() || null : null,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof ApprovalError) return apiError(error.message, 409);
    throw error;
  }
}
