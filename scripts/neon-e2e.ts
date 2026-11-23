import { loadEnvConfig } from "@next/env";
import { ApprovalDecision, ApprovalStage, LeaveStatus, PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const db = new PrismaClient();
const apiBaseUrl = (process.env.HRIS_BASE_URL ?? "http://127.0.0.1:3000/api/v1").replace(/\/$/, "");
const requestIds: string[] = [];
let createdHolidayDate: string | null = null;

type ApiResult<T> = { success: boolean; data: T; message?: string };
type RequestResult = {
  id: string;
  status: LeaveStatus;
  workingDays: number;
  approvals: { stage: ApprovalStage; decision: ApprovalDecision; remarks: string | null }[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function callApi<T>(path: string, actorId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-actor-id", actorId);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${result.message ?? "Unknown error"}`);
  }
  return result.data;
}

function findFourWorkingDays(holidays: Set<string>) {
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const dates: string[] = [];
  for (; cursor.getUTCFullYear() === new Date().getUTCFullYear(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    const date = cursor.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(date)) dates.push(date);
    if (dates.length === 4) return { startDate: dates[0], endDate: dates[3] };
  }
  throw new Error("Not enough working days remain in the current calendar year for the approval test");
}

async function cleanup() {
  if (requestIds.length) {
    const requests = await db.leaveRequest.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, workingDays: true, status: true },
    });
    await db.$transaction(async (transaction) => {
      for (const request of requests) {
        if (request.status === LeaveStatus.APPROVED) {
          await transaction.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year: request.startDate.getUTCFullYear(),
            },
            data: {
              used: { decrement: request.workingDays },
              remaining: { increment: request.workingDays },
            },
          });
        }
      }
      await transaction.approval.deleteMany({ where: { requestId: { in: requestIds } } });
      await transaction.leaveRequest.deleteMany({ where: { id: { in: requestIds } } });
    });
  }
  if (createdHolidayDate) {
    await db.holiday.deleteMany({ where: { date: new Date(`${createdHolidayDate}T00:00:00.000Z`) } });
  }
}

async function main() {
  const [employee, manager, hrAdmin, annualLeave, holidays] = await Promise.all([
    db.employee.findFirst({ where: { email: "andi@hris.id", role: "EMPLOYEE" } }),
    db.employee.findFirst({ where: { email: "budi@hris.id", role: "MANAGER" } }),
    db.employee.findFirst({ where: { email: "sari@hris.id", role: "HR_ADMIN" } }),
    db.leaveType.findUnique({ where: { code: "ANNUAL" } }),
    db.holiday.findMany(),
  ]);
  assert(employee && manager && hrAdmin && annualLeave, "Seeded Employee, Manager, HR Admin, or ANNUAL leave type is missing");
  assert(employee.managerId === manager.id, "Seeded employee is not assigned to the seeded manager");

  const range = findFourWorkingDays(new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10))));
  const holidayDates = new Set(holidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));
  const activeRangeStart = new Date();
  activeRangeStart.setUTCHours(0, 0, 0, 0);
  while (activeRangeStart.getUTCDay() === 0 || activeRangeStart.getUTCDay() === 6 || holidayDates.has(activeRangeStart.toISOString().slice(0, 10))) {
    activeRangeStart.setUTCDate(activeRangeStart.getUTCDate() - 1);
  }
  const activeRangeEnd = new Date();
  activeRangeEnd.setUTCHours(0, 0, 0, 0);
  while (activeRangeEnd.getUTCDay() === 0 || activeRangeEnd.getUTCDay() === 6 || holidayDates.has(activeRangeEnd.toISOString().slice(0, 10))) {
    activeRangeEnd.setUTCDate(activeRangeEnd.getUTCDate() + 1);
  }
  const finalDay = new Date(`${range.endDate}T00:00:00.000Z`);
  finalDay.setUTCDate(finalDay.getUTCDate() + 1);
  while (finalDay.getUTCDay() === 0 || finalDay.getUTCDay() === 6 || holidayDates.has(finalDay.toISOString().slice(0, 10))) {
    finalDay.setUTCDate(finalDay.getUTCDate() + 1);
  }
  const cancelDate = finalDay.toISOString().slice(0, 10);

  try {
    const bootstrap = await fetch(`${apiBaseUrl}/bootstrap?userId=${employee.id}`).then(async (response) => {
      const result = await response.json() as ApiResult<{ activeUser: { id: string } }>;
      assert(response.ok && result.success, "Bootstrap API failed");
      return result.data;
    });
    assert(bootstrap.activeUser.id === employee.id, "Bootstrap returned the wrong active user");

    await callApi("/leaves/requests", employee.id);
    const created = await callApi<RequestResult>("/leaves/requests", employee.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaveTypeId: annualLeave.id,
        ...range,
        reason: "Automated Neon end-to-end verification",
      }),
    });
    requestIds.push(created.id);
    assert(created.status === LeaveStatus.PENDING && created.workingDays === 4, "Four-day request was not created as PENDING");
    assert(created.approvals.some((approval) => approval.stage === ApprovalStage.MANAGER), "Manager approval step was not created");

    const managerInbox = await callApi<RequestResult[]>("/approvals", manager.id);
    assert(managerInbox.some((item) => item.id === created.id), "Manager inbox did not return the pending request");
    const managerDecision = await callApi<RequestResult>(`/approvals/${created.id}/decide`, manager.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVED", remarks: "E2E manager approval" }),
    });
    assert(managerDecision.status === LeaveStatus.PENDING, "Four-day request should remain pending after Manager approval");
    assert(managerDecision.approvals.some((approval) => approval.stage === ApprovalStage.HR_ADMIN && approval.decision === ApprovalDecision.PENDING), "HR Admin approval step was not activated");

    const hrInbox = await callApi<RequestResult[]>("/approvals", hrAdmin.id);
    assert(hrInbox.some((item) => item.id === created.id), "HR Admin inbox did not return the second approval step");
    const hrDecision = await callApi<RequestResult>(`/approvals/${created.id}/decide`, hrAdmin.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVED", remarks: "E2E HR approval" }),
    });
    assert(hrDecision.status === LeaveStatus.APPROVED, "Request was not approved after the HR Admin decision");
    assert(hrDecision.approvals.every((approval) => approval.decision === ApprovalDecision.APPROVED), "Approval chain did not retain both decisions");

    const personalRequests = await callApi<RequestResult[]>("/leaves/requests", employee.id);
    assert(personalRequests.some((item) => item.id === created.id && item.status === LeaveStatus.APPROVED), "Approved request was not persisted in the employee request list");

    const activeLeave = await callApi<RequestResult>("/leaves/requests", employee.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaveTypeId: annualLeave.id,
        startDate: activeRangeStart.toISOString().slice(0, 10),
        endDate: activeRangeEnd.toISOString().slice(0, 10),
        reason: "Automated active team schedule verification",
      }),
    });
    requestIds.push(activeLeave.id);
    await callApi<RequestResult>(`/approvals/${activeLeave.id}/decide`, manager.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVED", remarks: "E2E active leave approval" }),
    });
    const teamSchedule = await callApi<{ id: string }[]>("/approvals/team-schedule", manager.id);
    assert(teamSchedule.some((item) => item.id === activeLeave.id), "Active approved leave was missing from the Manager team schedule");
    const csvResponse = await fetch(`${apiBaseUrl}/reports/leaves.csv`, { headers: { "x-actor-id": hrAdmin.id } });
    const csv = await csvResponse.text();
    const csvHeader = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].replace(/"/g, "");
    assert(csvResponse.ok && csvHeader === "NIK,Nama,Departemen,Jenis Cuti,Tanggal Mulai,Tanggal Selesai,Total Hari,Status", "HR Admin CSV export did not return the expected header");
    assert(csv.includes(employee.nik) && csv.includes("Product Design"), "HR Admin CSV export omitted employee data");

    const cancelled = await callApi<RequestResult>("/leaves/requests", employee.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaveTypeId: annualLeave.id,
        startDate: cancelDate,
        endDate: cancelDate,
        reason: "Automated cancellation verification",
      }),
    });
    requestIds.push(cancelled.id);
    const cancellation = await callApi<RequestResult>(`/leaves/requests/${cancelled.id}/cancel`, employee.id, { method: "PATCH" });
    assert(cancellation.status === LeaveStatus.CANCELLED, "Pending leave request could not be cancelled");

    const candidate = new Date("2099-12-31T00:00:00.000Z");
    while (await db.holiday.findUnique({ where: { date: candidate } })) candidate.setUTCDate(candidate.getUTCDate() - 1);
    createdHolidayDate = candidate.toISOString().slice(0, 10);
    const addedHoliday = await callApi<{ date: string }>("/settings/holidays", hrAdmin.id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Automated Neon e2e verification", date: createdHolidayDate }),
    });
    assert(addedHoliday.date.slice(0, 10) === createdHolidayDate, "HR Admin holiday was not stored");

    const forbiddenResponse = await fetch(`${apiBaseUrl}/settings/holidays`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": employee.id },
      body: JSON.stringify({ name: "Forbidden test", date: "2099-01-01" }),
    });
    assert(forbiddenResponse.status === 403, "Non-HR user was allowed to add a holiday");

    console.log("Neon e2e passed: bootstrap, personal leave CRUD, Manager→HR approval, active team schedule, HR CSV export, cancellation, holiday creation, and HR role guard.");
  } finally {
    try {
      await cleanup();
    } finally {
      await db.$disconnect();
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
