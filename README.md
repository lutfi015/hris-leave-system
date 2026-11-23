# HRIS Leave System

Aplikasi pengelolaan cuti karyawan untuk pengajuan, approval berjenjang, saldo cuti, dan jadwal cuti tim. Aplikasi menyediakan dashboard berdasarkan role, inbox approval, detail approval chain, pengaturan hari libur, dan ekspor rekap CSV untuk HR Admin.

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL (Neon)

## Arsitektur data

```mermaid
erDiagram
  EMPLOYEE ||--o{ LEAVE_REQUEST : submits
  EMPLOYEE ||--o{ LEAVE_BALANCE : has
  EMPLOYEE ||--o{ APPROVAL : handles
  EMPLOYEE o|--o{ EMPLOYEE : manages
  LEAVE_TYPE ||--o{ LEAVE_REQUEST : categorizes
  LEAVE_TYPE ||--o{ LEAVE_BALANCE : allocates
  LEAVE_REQUEST ||--o{ APPROVAL : routes

  EMPLOYEE {
    string id PK
    string nik UK
    string name
    string email UK
    string department
    enum role
    string managerId FK
  }
  LEAVE_REQUEST {
    string id PK
    datetime startDate
    datetime endDate
    int workingDays
    string reason
    enum status
  }
  LEAVE_TYPE {
    string id PK
    string code UK
    string name
    int annualQuota
  }
  LEAVE_BALANCE {
    string id PK
    int year
    int used
    int remaining
  }
  APPROVAL {
    string id PK
    enum stage
    enum decision
    string remarks
  }
  HOLIDAY {
    string id PK
    date date UK
    string name
  }
```

Prisma memetakan `LeaveType` ke tabel `leave_types` dan `Holiday` ke tabel `public_holidays`.

## Aturan bisnis

- Pengajuan baru membutuhkan persetujuan Manajer.
- Jika pengajuan lebih dari 3 hari kerja, persetujuan HR Admin dibuka setelah Manajer menyetujui.
- Saldo cuti dikurangi hanya saat tahap approval terakhir menyetujui pengajuan; perubahan status dan saldo dilakukan secara transaksional.
- Hari kerja tidak menghitung akhir pekan dan hari libur nasional.
- Pengajuan PENDING dapat dibatalkan oleh pemiliknya.
- Manager melihat jadwal cuti APPROVED yang sedang berjalan untuk anggota tim langsung. HR Admin melihat jadwal seluruh tim.
- Hanya HR Admin yang dapat menambahkan hari libur dan mengekspor rekap CSV.

## Menjalankan lokal

1. Pastikan Node.js 20.19+ tersedia.
2. Siapkan PostgreSQL lokal atau Neon, lalu isi `.env`:

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
   DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@DIRECT_HOST/DB?sslmode=require"
   ```

   Untuk Neon gunakan URL pooled (`-pooler`) pada `DATABASE_URL`, dan URL direct (tanpa `-pooler`) pada `DATABASE_URL_UNPOOLED`. Jangan commit file `.env`.

3. Instal dependensi, terapkan migrasi, dan isi data demo:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed
   ```

4. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

   Buka `http://localhost:3000`.

Data demo mencakup karyawan, Manajer, HR Admin, jenis cuti, saldo, dan hari libur. Dropdown **Mode Simulasi** membantu mencoba role yang berbeda; simulasi ini bukan autentikasi untuk produksi.

## API utama

- `GET /api/v1/bootstrap?userId=...`
- `GET|POST /api/v1/leaves/requests`
- `PATCH /api/v1/leaves/requests/{id}/cancel`
- `GET /api/v1/approvals`
- `GET /api/v1/approvals/team-schedule`
- `POST /api/v1/approvals/{requestId}/decide`
- `GET|POST /api/v1/settings/holidays`
- `GET /api/v1/reports/leaves.csv`

Untuk tes alur terhadap database Neon, jalankan server terlebih dahulu, lalu `npm run test:neon`.
