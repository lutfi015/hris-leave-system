"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, LayoutDashboard, LogOut, Plus, Settings, Users, X } from "lucide-react";

type Role = "EMPLOYEE" | "MANAGER" | "HR_ADMIN";
type Menu = "dashboard" | "leaves" | "approvals" | "settings";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type ApprovalStage = "MANAGER" | "HR_ADMIN";
type Approval = {
  id: string;
  stage: ApprovalStage;
  decision: "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUIRED";
  remarks: string | null;
  approver: { name: string };
};
type LeaveRequest = {
  id: string;
  employeeId: string;
  employee: { name: string; nik: string; jobTitle: string; department: string };
  leaveType: { name: string; code: string };
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  approvals: Approval[];
};
type User = { id: string; name: string; role: Role; jobTitle: string; nik: string };
type LeaveType = { id: string; name: string; code: string; annualQuota: number };
type Holiday = { id: string; name: string; date: string };
type Dashboard = { remaining: number; used: number; pending: number; recentRequests: LeaveRequest[] };
type TeamLeave = Pick<LeaveRequest, "id" | "startDate" | "endDate" | "workingDays"> & {
  employee: { name: string; jobTitle: string; department: string };
  leaveType: { name: string };
};

const roleLabel: Record<Role, string> = { EMPLOYEE: "Karyawan", MANAGER: "Manajer", HR_ADMIN: "HR Admin" };
const statusLabel: Record<LeaveStatus, string> = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan" };
const approvalLabel: Record<Approval["decision"], string> = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", NOT_REQUIRED: "Tidak diperlukan" };
const menuLabel: Record<Menu, string> = { dashboard: "Dashboard", leaves: "Permintaan Cuti", approvals: "Persetujuan", settings: "Pengaturan" };

function formatDate(value: string) {
  const date = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date[0], date[1] - 1, date[2]));
}

function formatToday(value: string) {
  const date = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(date[0], date[1] - 1, date[2]));
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = `Permintaan gagal (HTTP ${response.status})`;
    if (text.trim()) {
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        throw new Error(message);
      }
    }
    throw new Error(message);
  }
  if (!text.trim()) throw new Error("Respons API kosong");

  let result: { success?: boolean; message?: string; data?: T } | null = null;
  try {
    result = JSON.parse(text) as { success?: boolean; message?: string; data?: T };
  } catch {
    throw new Error("Respons API bukan JSON yang valid");
  }
  if (result.success !== true) throw new Error(result.message || "Permintaan tidak dapat diproses");
  return result.data as T;
}

export default function Home() {
  const [activeMenu, setActiveMenu] = useState<Menu>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [today, setToday] = useState("");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<TeamLeave[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>({ remaining: 0, used: 0, pending: 0, recentRequests: [] });
  const [filter, setFilter] = useState("ALL");
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [holidayForm, setHolidayForm] = useState({ name: "", date: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadActorData(user: User) {
    setError("");
    const headers = { "x-actor-id": user.id };
    try {
      const [bootstrap, leaveData, approvalData, teamSchedule, settings] = await Promise.all([
        fetch(`/api/v1/bootstrap?userId=${encodeURIComponent(user.id)}`).then(parseResponse<{ users: User[]; activeUser: User; today: string; leaveTypes: LeaveType[]; holidays: Holiday[]; dashboard: Dashboard }>),
        fetch("/api/v1/leaves/requests", { headers }).then(parseResponse<LeaveRequest[]>),
        user.role === "EMPLOYEE"
          ? Promise.resolve([] as LeaveRequest[])
          : fetch("/api/v1/approvals", { headers }).then(parseResponse<LeaveRequest[]>),
        user.role === "EMPLOYEE"
          ? Promise.resolve([] as TeamLeave[])
          : fetch("/api/v1/approvals/team-schedule", { headers }).then(parseResponse<TeamLeave[]>),
        fetch("/api/v1/settings/holidays").then(parseResponse<{ holidays: Holiday[]; leaveTypes: LeaveType[] }>),
      ]);
      setUsers(bootstrap.users);
      setActiveUser(bootstrap.activeUser);
      setToday(bootstrap.today);
      setRequests(leaveData);
      setApprovals(approvalData);
      setTeamLeaves(teamSchedule);
      setLeaveTypes(settings.leaveTypes);
      setHolidays(settings.holidays);
      setDashboard(bootstrap.dashboard);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data aplikasi");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/bootstrap")
      .then(parseResponse<{ users: User[]; activeUser: User }>)
      .then((data) => {
        if (!active) return;
        setUsers(data.users);
        setActiveUser(data.activeUser);
        void loadActorData(data.activeUser);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Gagal memuat data aplikasi");
      });
    return () => { active = false; };
  }, []);

  const pendingCount = approvals.length;
  const visibleRequests = useMemo(() => {
    const source = activeMenu === "approvals" ? approvals : requests;
    return filter === "ALL" ? source : source.filter((item) => item.status === filter);
  }, [activeMenu, approvals, filter, requests]);

  function switchRole(role: Role) {
    const nextUser = users.find((user) => user.role === role);
    if (!nextUser) {
      setError(`Pengguna untuk role ${roleLabel[role]} belum tersedia`);
      return;
    }
    setActiveUser(nextUser);
    setActiveMenu("dashboard");
    setFilter("ALL");
    void loadActorData(nextUser);
  }

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUser) return;
    setIsSubmitting(true);
    setError("");
    try {
      await parseResponse(await fetch("/api/v1/leaves/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": activeUser.id },
        body: JSON.stringify(form),
      }));
      setLeaveModalOpen(false);
      setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      await loadActorData(activeUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pengajuan cuti gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelRequest(id: string) {
    if (!activeUser) return;
    setIsSubmitting(true);
    setError("");
    try {
      await parseResponse(await fetch(`/api/v1/leaves/requests/${id}/cancel`, {
        method: "PATCH",
        headers: { "x-actor-id": activeUser.id },
      }));
      await loadActorData(activeUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pembatalan cuti gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function decideRequest(id: string, decision: "APPROVED" | "REJECTED") {
    if (!activeUser) return;
    const remarks = window.prompt("Catatan keputusan (opsional):");
    if (remarks === null) return;
    setIsSubmitting(true);
    setError("");
    try {
      await parseResponse(await fetch(`/api/v1/approvals/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": activeUser.id },
        body: JSON.stringify({ decision, remarks }),
      }));
      await loadActorData(activeUser);
      setSelectedRequest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Keputusan persetujuan gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUser) return;
    setIsSubmitting(true);
    setError("");
    try {
      await parseResponse(await fetch("/api/v1/settings/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor-id": activeUser.id },
        body: JSON.stringify(holidayForm),
      }));
      setHolidayForm({ name: "", date: "" });
      await loadActorData(activeUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penambahan hari libur gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function exportLeaveReport() {
    if (!activeUser) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/v1/reports/leaves.csv", {
        headers: { "x-actor-id": activeUser.id },
      });
      if (!response.ok) {
        const message = await response.text();
        let apiMessage = `Ekspor gagal (HTTP ${response.status})`;
        if (message.trim()) {
          try {
            apiMessage = (JSON.parse(message) as { message?: string }).message ?? apiMessage;
          } catch {
            apiMessage = `Ekspor gagal (HTTP ${response.status})`;
          }
        }
        throw new Error(apiMessage);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "rekap-cuti.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ekspor rekap cuti gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  const exportButton = activeUser?.role === "HR_ADMIN"
    ? <button className="secondary-button export-button" disabled={isSubmitting} onClick={exportLeaveReport}>{isSubmitting ? "Memproses..." : "Export Rekap CSV"}</button>
    : undefined;

  const menuItems: { id: Menu; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", icon: LayoutDashboard },
    { id: "leaves", icon: CalendarDays },
    ...(activeUser?.role !== "EMPLOYEE" && activeUser ? [{ id: "approvals" as const, icon: Users }] : []),
    { id: "settings", icon: Settings },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><CalendarDays size={22} /></div><span>HRIS</span></div>
        <nav>
          {menuItems.map(({ id, icon: Icon }) => (
            <button key={id} className={`nav-item ${activeMenu === id ? "active" : ""}`} onClick={() => { setActiveMenu(id); setFilter(id === "approvals" ? "PENDING" : "ALL"); }}>
              <Icon size={19} /> {menuLabel[id]} {id === "approvals" && <span className="nav-count">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{activeUser?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "HR"}</div>
            <div><strong>{activeUser?.name ?? "Memuat..."}</strong><small>{activeUser?.jobTitle ?? " "}</small></div>
            <LogOut size={17} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">{today ? formatToday(today) : ""}</p><h1>{menuLabel[activeMenu]}</h1></div>
          <div className="role-switcher"><span>Mode Simulasi</span><select value={activeUser?.role ?? "EMPLOYEE"} onChange={(event) => switchRole(event.target.value as Role)}><option value="EMPLOYEE">Karyawan</option><option value="MANAGER">Manajer</option><option value="HR_ADMIN">HR Admin</option></select><ChevronDown size={16} /></div>
        </header>

        <section className="content">
          {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
          {activeMenu === "dashboard" && (
            <>
              <div className="welcome-row"><div><h2>Selamat datang, {activeUser?.name.split(" ")[0] ?? ""}</h2><p>Ringkasan saldo dan pengajuan cuti Anda.</p></div>{activeUser?.role === "EMPLOYEE" && <button className="primary-button" onClick={() => setLeaveModalOpen(true)}><Plus size={18} /> Ajukan Cuti</button>}</div>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-icon blue"><CalendarDays size={21} /></div><div><span>Saldo Cuti Tahunan</span><strong>{dashboard.remaining} <small>hari</small></strong></div></article>
                <article className="stat-card"><div className="stat-icon amber"><CalendarDays size={21} /></div><div><span>Cuti Digunakan</span><strong>{dashboard.used} <small>hari</small></strong></div></article>
                <article className="stat-card"><div className="stat-icon green"><Users size={21} /></div><div><span>{activeUser?.role === "EMPLOYEE" ? "Pengajuan Menunggu" : "Antrean Persetujuan"}</span><strong>{dashboard.pending} <small>pengajuan</small></strong></div></article>
              </div>
              <RequestTable requests={dashboard.recentRequests} role={activeUser?.role} onDetail={setSelectedRequest} onCancel={cancelRequest} onDecide={decideRequest} isSubmitting={isSubmitting} title="Riwayat Terbaru" />
            </>
          )}

          {activeMenu === "leaves" && (
            <RequestTable requests={requests} role={activeUser?.role} onDetail={setSelectedRequest} onCancel={cancelRequest} onDecide={decideRequest} isSubmitting={isSubmitting} title="Semua Pengajuan Cuti" toolbar={activeUser?.role === "EMPLOYEE" && <button className="primary-button" onClick={() => setLeaveModalOpen(true)}><Plus size={18} /> Ajukan Cuti</button>} filter={filter} onFilter={setFilter} />
          )}

          {activeMenu === "approvals" && (
            <>
              <section className="team-schedule-card">
                <div className="team-schedule-heading"><div><h3>Jadwal Cuti Tim Aktif</h3><p>Karyawan dengan pengajuan yang sedang berjalan dan telah disetujui</p></div><span className="schedule-count">{teamLeaves.length} orang</span></div>
                {teamLeaves.length ? <div className="team-schedule-list">{teamLeaves.map((item) => <article className="team-schedule-item" key={item.id}><div className="table-avatar">{item.employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="team-schedule-person"><strong>{item.employee.name}</strong><small>{item.employee.department} · {item.leaveType.name}</small></div><div className="team-schedule-dates"><strong>{formatDate(item.startDate)} – {formatDate(item.endDate)}</strong><small>{item.workingDays} hari kerja</small></div></article>)}</div> : <p className="schedule-empty">Tidak ada anggota tim yang sedang cuti saat ini.</p>}
              </section>
              <RequestTable requests={visibleRequests} role={activeUser?.role} onDetail={setSelectedRequest} onCancel={cancelRequest} onDecide={decideRequest} isSubmitting={isSubmitting} title="Inbox Persetujuan" subtitle={`${pendingCount} pengajuan menunggu tindakan Anda`} toolbar={exportButton} approvalInbox />
            </>
          )}

          {activeMenu === "settings" && (
            <div className="settings-grid">
              <section className="table-card settings-card">
                <div className="table-header"><div><h3>Hari Libur Nasional</h3><p>{holidays.length} hari libur terdaftar</p></div>{exportButton}</div>
                {activeUser?.role === "HR_ADMIN" && <form className="holiday-form" onSubmit={addHoliday}><label>Nama hari libur<input required value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} placeholder="Contoh: Hari Kemerdekaan" /></label><label>Tanggal<input required type="date" value={holidayForm.date} onChange={(event) => setHolidayForm({ ...holidayForm, date: event.target.value })} /></label><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Memproses..." : <><Plus size={17} /> Tambah Hari Libur</>}</button></form>}
                <div className="settings-list">{holidays.map((holiday) => <div className="setting-row" key={holiday.id}><div className="table-avatar"><CalendarDays size={17} /></div><strong>{holiday.name}</strong><span>{formatDate(holiday.date)}</span></div>)}</div>
              </section>
              <section className="table-card settings-card"><div className="table-header"><div><h3>Jenis Cuti</h3><p>Kuota tahunan yang tersedia</p></div></div><div className="settings-list">{leaveTypes.map((type) => <div className="setting-row" key={type.id}><div className="table-avatar"><CalendarDays size={17} /></div><strong>{type.name}</strong><span>{type.annualQuota} hari / tahun</span></div>)}</div></section>
            </div>
          )}
        </section>
      </main>

      {leaveModalOpen && activeUser && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeaveModalOpen(false); }}>
          <form className="modal" onSubmit={submitLeave}>
            <div className="modal-header"><div><h3>Ajukan Cuti Baru</h3><p>Lengkapi detail permintaan cuti</p></div><button type="button" onClick={() => setLeaveModalOpen(false)}><X size={19} /></button></div>
            <label>Jenis Cuti<select required value={form.leaveTypeId} onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}><option value="">Pilih jenis cuti</option>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name} ({type.annualQuota} hari/tahun)</option>)}</select></label>
            <div className="date-grid"><label>Tanggal Mulai<input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Tanggal Selesai<input required type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label></div>
            <label>Alasan<textarea required rows={4} placeholder="Tuliskan alasan pengajuan cuti" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setLeaveModalOpen(false)} disabled={isSubmitting}>Batal</button><button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Memproses..." : "Ajukan Cuti"}</button></div>
          </form>
        </div>
      )}

      {selectedRequest && <RequestDetail request={selectedRequest} canDecide={activeMenu === "approvals" && selectedRequest.status === "PENDING" && activeUser?.role !== "EMPLOYEE"} isSubmitting={isSubmitting} onDecide={decideRequest} onClose={() => setSelectedRequest(null)} />}
    </div>
  );
}

function RequestTable({
  requests, role, onDetail, onCancel, onDecide, isSubmitting, title, subtitle, toolbar, filter, onFilter, approvalInbox = false,
}: {
  requests: LeaveRequest[];
  role?: Role;
  onDetail: (request: LeaveRequest) => void;
  onCancel: (id: string) => void;
  onDecide: (id: string, decision: "APPROVED" | "REJECTED") => void;
  isSubmitting: boolean;
  title: string;
  subtitle?: string;
  toolbar?: React.ReactNode;
  filter?: string;
  onFilter?: (value: string) => void;
  approvalInbox?: boolean;
}) {
  return (
    <div className="table-card">
      <div className="table-header"><div><h3>{title}</h3><p>{subtitle ?? `${requests.length} pengajuan ditemukan`}</p></div><div className="table-tools">{toolbar}{onFilter && <select value={filter} onChange={(event) => onFilter(event.target.value)}><option value="ALL">Semua Status</option><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="REJECTED">Ditolak</option><option value="CANCELLED">Dibatalkan</option></select>}</div></div>
      <div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Jenis Cuti</th><th>Tanggal</th><th>Durasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {requests.map((item) => <tr key={item.id}>
          <td><div className="employee"><div className="table-avatar">{item.employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><strong>{item.employee.name}</strong><small>{item.id}</small></div></div></td>
          <td>{item.leaveType.name}</td><td><strong>{formatDate(item.startDate)}</strong><small>{formatDate(item.endDate)}</small></td><td>{item.workingDays} hari kerja</td>
          <td><span className={`status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span></td>
          <td><div className="row-actions">
            <button className="text-action" onClick={() => onDetail(item)}>Detail</button>
            {!approvalInbox && role === "EMPLOYEE" && item.status === "PENDING" && <button className="text-action danger" disabled={isSubmitting} onClick={() => onCancel(item.id)}>Batalkan</button>}
            {approvalInbox && item.status === "PENDING" && <><button className="approve" disabled={isSubmitting} onClick={() => onDecide(item.id, "APPROVED")}>{isSubmitting ? "Memproses..." : "Setujui"}</button><button className="reject" disabled={isSubmitting} onClick={() => onDecide(item.id, "REJECTED")}>{isSubmitting ? "Memproses..." : "Tolak"}</button></>}
          </div></td>
        </tr>)}
        {!requests.length && <tr><td className="empty-row" colSpan={6}>Belum ada pengajuan untuk ditampilkan.</td></tr>}
      </tbody></table></div>
    </div>
  );
}

function RequestDetail({ request, canDecide, isSubmitting, onDecide, onClose }: {
  request: LeaveRequest;
  canDecide: boolean;
  isSubmitting: boolean;
  onDecide: (id: string, decision: "APPROVED" | "REJECTED") => void;
  onClose: () => void;
}) {
  const approvalFor = (stage: ApprovalStage) => request.approvals.find((approval) => approval.stage === stage);
  const rows: { stage: ApprovalStage; label: string }[] = [
    { stage: "MANAGER", label: "Step 1 · Manajer" },
    { stage: "HR_ADMIN", label: "Step 2 · HR Admin" },
  ];
  return (
    <div className="modal-backdrop detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="modal-header"><div><h3 id="detail-title">Detail Pengajuan</h3><p>{request.id}</p></div><button type="button" onClick={onClose}><X size={19} /></button></div>
        <div className="detail-grid"><div><span>Nama Karyawan</span><strong>{request.employee.name}</strong></div><div><span>NIK</span><strong>{request.employee.nik}</strong></div><div><span>Jenis Cuti</span><strong>{request.leaveType.name}</strong></div><div><span>Status</span><strong>{statusLabel[request.status]}</strong></div><div><span>Rentang Tanggal</span><strong>{formatDate(request.startDate)} – {formatDate(request.endDate)}</strong></div><div><span>Total Hari Kerja</span><strong>{request.workingDays} hari</strong></div><div className="detail-reason"><span>Alasan Cuti</span><p>{request.reason}</p></div></div>
        <h4>Approval Chain</h4>
        <div className="approval-timeline">{rows.map(({ stage, label }) => {
          const approval = approvalFor(stage);
          const notNeeded = stage === "HR_ADMIN" && request.workingDays <= 3;
          const noLongerRequired = !approval && request.status !== "PENDING";
          const decision = notNeeded || noLongerRequired ? "NOT_REQUIRED" : approval?.decision ?? "PENDING";
          return <div className="timeline-step" key={stage}><div className={`timeline-dot ${decision.toLowerCase()}`} /><div className="timeline-content"><div className="timeline-heading"><strong>{label}</strong><span className={`status ${decision === "PENDING" ? "pending" : decision === "APPROVED" ? "approved" : decision === "REJECTED" ? "rejected" : "neutral"}`}>{approvalLabel[decision]}</span></div><small>{approval?.approver.name ?? (notNeeded ? "Approval tambahan tidak dibutuhkan" : stage === "HR_ADMIN" ? "Menunggu persetujuan Manajer" : "Manajer yang ditetapkan")}</small><p>Catatan: {approval?.remarks || "—"}</p></div></div>;
        })}</div>
        {canDecide && <div className="modal-actions"><button type="button" className="reject" disabled={isSubmitting} onClick={() => onDecide(request.id, "REJECTED")}>{isSubmitting ? "Memproses..." : "Tolak"}</button><button type="button" className="approve" disabled={isSubmitting} onClick={() => onDecide(request.id, "APPROVED")}>{isSubmitting ? "Memproses..." : "Setujui"}</button></div>}
      </section>
    </div>
  );
}
