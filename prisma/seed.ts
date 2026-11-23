import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const leaveTypes = await Promise.all([
    prisma.leaveType.upsert({
      where: { code: "ANNUAL" },
      update: {},
      create: { code: "ANNUAL", name: "Cuti Tahunan", annualQuota: 12 },
    }),
    prisma.leaveType.upsert({
      where: { code: "SICK" },
      update: {},
      create: { code: "SICK", name: "Cuti Sakit", annualQuota: 10 },
    }),
    prisma.leaveType.upsert({
      where: { code: "IMPORTANT" },
      update: {},
      create: { code: "IMPORTANT", name: "Cuti Penting", annualQuota: 5 },
    }),
  ]);

  const manager = await prisma.employee.upsert({
    where: { email: "budi@hris.id" },
    update: { name: "Budi Santoso", nik: "HRIS0002", jobTitle: "Engineering Manager", department: "Engineering", role: "MANAGER" },
    create: { name: "Budi Santoso", nik: "HRIS0002", email: "budi@hris.id", jobTitle: "Engineering Manager", department: "Engineering", role: "MANAGER" },
  });

  await prisma.employee.upsert({
    where: { email: "andi@hris.id" },
    update: { name: "Andi Pratama", nik: "HRIS0001", jobTitle: "UI/UX Designer", department: "Product Design", role: "EMPLOYEE", managerId: manager.id },
    create: { name: "Andi Pratama", nik: "HRIS0001", email: "andi@hris.id", jobTitle: "UI/UX Designer", department: "Product Design", role: "EMPLOYEE", managerId: manager.id },
  });

  await prisma.employee.upsert({
    where: { email: "sari@hris.id" },
    update: { name: "Sari Dewi", nik: "HRIS0003", jobTitle: "HR Admin", department: "Human Resources", role: "HR_ADMIN" },
    create: { name: "Sari Dewi", nik: "HRIS0003", email: "sari@hris.id", jobTitle: "HR Admin", department: "Human Resources", role: "HR_ADMIN" },
  });

  await prisma.employee.upsert({
    where: { email: "rina@hris.id" },
    update: { name: "Rina Kartika", nik: "HRIS0004", jobTitle: "Product Designer", department: "Product Design", role: "EMPLOYEE", managerId: manager.id },
    create: { name: "Rina Kartika", nik: "HRIS0004", email: "rina@hris.id", jobTitle: "Product Designer", department: "Product Design", role: "EMPLOYEE", managerId: manager.id },
  });

  const employees = await prisma.employee.findMany();
  for (const person of employees) {
    for (const leaveType of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: person.id, leaveTypeId: leaveType.id, year: new Date().getFullYear() } },
        update: {},
        create: { employeeId: person.id, leaveTypeId: leaveType.id, year: new Date().getFullYear(), used: 0, remaining: leaveType.annualQuota },
      });
    }
  }

  for (const [date, name] of [
    ["2026-01-01", "Tahun Baru Masehi"],
    ["2026-02-17", "Tahun Baru Imlek"],
    ["2026-03-20", "Hari Raya Idulfitri"],
  ]) {
    await prisma.holiday.upsert({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      update: { name },
      create: { date: new Date(`${date}T00:00:00.000Z`), name },
    });
  }
}

main().finally(() => prisma.$disconnect());
