import { ApprovalDecision, ApprovalStage, LeaveStatus } from "@prisma/client";
import { db } from "@/lib/db";

export class ApprovalError extends Error {}

export async function decideApproval(
  requestId: string,
  actorId: string,
  decision: Exclude<ApprovalDecision, "PENDING" | "NOT_REQUIRED">,
  remarks: string | null,
) {
  return db.$transaction(async (transaction) => {
    const request = await transaction.leaveRequest.findUnique({
      where: { id: requestId },
      include: { approvals: { orderBy: { stage: "asc" } } },
    });
    if (!request || request.status !== "PENDING") throw new ApprovalError("Permintaan tidak ditemukan atau bukan PENDING");

    const approval = request.approvals.find((item) => item.approverId === actorId && item.decision === "PENDING");
    if (!approval) throw new ApprovalError("Tidak ada tahap persetujuan aktif untuk pengguna ini");

    const changed = await transaction.approval.updateMany({
      where: { id: approval.id, decision: "PENDING" },
      data: { decision, remarks },
    });
    if (changed.count !== 1) throw new ApprovalError("Tahap persetujuan sudah diproses");

    if (decision === "REJECTED") {
      await transaction.leaveRequest.update({
        where: { id: request.id },
        data: { status: LeaveStatus.REJECTED },
      });
    } else if (approval.stage === ApprovalStage.MANAGER && request.workingDays > 3) {
      const hrApprover = await transaction.employee.findFirst({ where: { role: "HR_ADMIN" }, orderBy: { createdAt: "asc" } });
      if (!hrApprover) throw new ApprovalError("Akun HR Admin belum tersedia");
      await transaction.approval.create({
        data: {
          requestId: request.id,
          approverId: hrApprover.id,
          stage: ApprovalStage.HR_ADMIN,
        },
      });
    } else {
      const year = request.startDate.getUTCFullYear();
      const balance = await transaction.leaveBalance.updateMany({
        where: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
          remaining: { gte: request.workingDays },
        },
        data: {
          remaining: { decrement: request.workingDays },
          used: { increment: request.workingDays },
        },
      });
      if (balance.count !== 1) throw new ApprovalError("Saldo cuti tidak mencukupi saat persetujuan");
      await transaction.leaveRequest.update({
        where: { id: request.id },
        data: { status: LeaveStatus.APPROVED },
      });
    }

    return transaction.leaveRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        employee: true,
        leaveType: true,
        approvals: { include: { approver: true }, orderBy: { stage: "asc" } },
      },
    });
  });
}
