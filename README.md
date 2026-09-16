# Customer Ticket System

Sistem manajemen tiket customer support berbasis **NestJS** dengan arsitektur multi-tenancy, klasifikasi otomatis dan pembuatan draft balasan berbasis **LLM (Google Gemini)**, serta optimasi performa menggunakan **Redis Caching**.

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Tech Stack](#tech-stack)
3. [Cara Menjalankan Project](#cara-menjalankan-project)
   - [Prasyarat Sistem](#prasyarat-sistem)
   - [Setup Environment Variable](#1-setup-environment-variable)
   - [Setup Database PostgreSQL & Migrasi Prisma](#2-setup-database-postgresql--migrasi-prisma)
   - [Setup Redis](#3-setup-redis)
   - [Membuat Data Awal (Organisasi & API Key)](#4-membuat-data-awal-organisasi--api-key)
   - [Menjalankan Aplikasi](#5-menjalankan-aplikasi)
   - [Menjalankan Pengujian (Testing)](#6-menjalankan-pengujian-testing)
4. [Integrasi LLM](#integrasi-llm)
   - [Provider yang Dipilih & Alasan](#provider-yang-dipilih--alasan)
   - [Desain Prompt](#desain-prompt)
5. [Dokumentasi API](#dokumentasi-api)
6 [Hal yang akan diperbaiki/ditambah kalau ada waktu lebih. (yang terpikirkan saat ini)](#Hal-yang-akan-diperbaiki/ditambah-kalau-ada-waktu-lebih.-(yang-terpikirkan-saat-ini))
---

## Fitur Utama

- **Multi-tenant Ticket Management**: Pengelolaan tiket terisolasi berdasarkan organisasi (`x-api-key`).
- **Otomasi Klasifikasi LLM**: Mengklasifikasi tiket ke kategori `billing`, `technical`, atau `general` secara otomatis saat tiket dibuat (`POST /tickets`).
- **AI Suggested Reply**: Menghasilkan draft balasan customer support untuk mempercepat waktu respon agen.
- **Redis Cache Layer**: Mencegah pemanggilan LLM berulang untuk tiket dengan subjek & pesan yang identik.
- **Graceful Error Handling**: Tiket tetap tersimpan meskipun koneksi LLM timeout, terkena rate limit, atau Redis sedang offline.

---

## Cara Menjalankan Project

### Prasyarat Sistem

Sebelum memulai, pastikan perangkat Anda telah terpasang:
- **Node.js**: v20.x atau lebih baru
- **Package Manager**: `pnpm` (direkomendasikan: `npm i -g pnpm`)
- **PostgreSQL Server**: Berjalan lokal atau via cloud/Docker
- **Redis Server**: Berjalan lokal atau via cloud/Docker

---

### 1. Setup Environment Variable

Salin file template `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` dan sesuaikan nilainya:

```env
# URL koneksi database PostgreSQL
DATABASE_URL="postgresql://postgres:postgres26@localhost:5432/customer_ticket?schema=public"

# API Key Google Gemini (didapatkan dari https://aistudio.google.com/)
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"

# URL koneksi Redis (opsional: jika kosong, sistem otomatis masuk mode graceful degrade tanpa cache)
REDIS_URL="redis://localhost:6379"

# Port aplikasi (default: 3000)
PORT=3000
```

> **Keamanan:** API Key LLM dan kredensial database **wajib** disimpan dalam environment variable dan tidak boleh di-hardcode ke dalam repositori.

---

### 2. Setup Database PostgreSQL & Migrasi Prisma

1. Buat database di PostgreSQL (misal bernama `customer_ticket`):
   ```sql
   CREATE DATABASE customer_ticket;
   ```

2. Jalankan instalasi dependensi project:
   ```bash
   pnpm install
   ```

3. Jalankan migrasi Prisma untuk membuat tabel database:
   ```bash
   pnpm run prisma:migrate
   ```

---

### 3. Setup Redis

Pastikan Redis server aktif pada port yang ditentukan (default `6379`).

**Opsi 1: Service Lokal (Windows / Linux / macOS)**
```bash
# Memastikan koneksi ke Redis
redis-cli ping
# Response yang diharapkan: PONG
```

> **Catatan:** Jika Redis tidak dijalankan, aplikasi tetap dapat beroperasi normal (cache di-bypass secara otomatis).

---

### 4. Membuat Data Awal (Organisasi & API Key)

Semua endpoint dilindungi oleh `ApiKeyGuard`. Anda memerlukan minimal satu data organisasi di database untuk pengujian:

Jalankan Prisma Studio:
```bash
npx prisma studio
```
1. Buka browser di alamat `http://localhost:5555`.
2. Klik model **Organization**, lalu klik **Add record**.
3. Isi kolom:
   - `name`: `PT Solusi Digital`
   - `apiKey`: `secret-key-organisasi-1`
4. Klik tombol **Save 1 change**.

---

### 5. Menjalankan Aplikasi

```bash
# Mode development (hot-reload aktif)
pnpm run start:dev

# Mode build & production
pnpm run build
pnpm run start:prod
```

Aplikasi akan aktif dan dapat diakses di: `http://localhost:3000`.

---

### 6. Menjalankan Pengujian (Testing)

```bash
# Menjalankan seluruh unit test (Vitest)
pnpm run test

# Menjalankan unit test dengan coverage report
pnpm run test:cov

# Menjalankan end-to-end (E2E) test
pnpm run test:e2e
```

---

## Integrasi LLM

### Provider yang Dipilih & Alasan

Project ini memilih **Google Gemini** menggunakan model **`gemini-2.0-flash`** melalui SDK resmi `@google/genai`.

**Alasan Pemilihan:**
1. **Dukungan Native Structured Outputs (JSON Schema + Enum):**  
   Gemini API mendukung penegakan skema respon (`responseSchema`) langsung di tingkat model. Hal ini menjamin bahwa properti `category` **pasti bernilai salah satu dari enum yang ditentukan** (`billing`, `technical`, atau `general`), mengurangi kemungkinan format respon yang salah.
2. **Kecepatan & Latensi Sangat Rendah:**  
   Model `gemini-2.0-flash` dioptimalkan untuk inferensi cepat (waktu respon rata-rata di bawah 1,5 detik), ideal untuk alur pembuatan tiket pelanggan secara real-time.
3. **Efisiensi Biaya (Free Quota Developer):**  
   Google AI Studio menyediakan kuota gratis yang memadai untuk kebutuhan pengembangan, pengujian internal, dan iterasi awal.
4. **SDK Resmi Modern:**  
   Paket `@google/genai` kompatibel penuh dengan modern ECMAScript Modules (ESM) dan ekosistem TypeScript NestJS.

---

### Desain Prompt

Digunakan pendekatan **Single Combined Prompt** (satu prompt gabungan). Pendekatan ini dipilih dibandingkan memanggil LLM dua kali karena:
- Mengurangi latensi jaringan hingga 50%.
- Menghemat konsumsi token input.
- Menghindari risiko salah satu panggilan berhasil namun panggilan kedua gagal.

#### Contoh Prompt yang Dikirim ke LLM:

```text
Kamu adalah agen customer support profesional. Tugasmu adalah menganalisis
tiket dari pelanggan dan menghasilkan dua hal:

1. category — Klasifikasikan tiket ke dalam TEPAT SATU kategori berikut:
   - "billing"   : terkait pembayaran, tagihan, invoice, harga, langganan, refund
   - "technical" : terkait bug, error, gangguan teknis, performa, integrasi, API
   - "general"   : pertanyaan umum, informasi produk, atau topik lain yang tidak
                   masuk dua kategori di atas

2. suggestedReply — Tulis draft balasan singkat (2-4 kalimat) yang sopan dan
   profesional dalam bahasa yang sama dengan pesan pelanggan. Balasan harus
   memperlihatkan empati dan memberi gambaran langkah selanjutnya.

Subjek: {subject}
Pesan: {message}
```

#### Penegakan Skema Respon (Response Schema):

```typescript
config: {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        enum: ['billing', 'technical', 'general'], // ← Enforce di engine level
      },
      suggestedReply: { type: Type.STRING },
    },
    required: ['category', 'suggestedReply'],
  },
}
```

Sebagai lapisan proteksi tambahan (defense-in-depth), output LLM tetap divalidasi di level aplikasi menggunakan `class-validator` (`@IsIn(['billing', 'technical', 'general'])`).

---

## Dokumentasi API

Base URL: `http://localhost:3000`

### Headers Wajib
| Header | Value | Deskripsi |
| :--- | :--- | :--- |
| `x-api-key` | `string` | API Key organisasi Anda |
| `Content-Type` | `application/json` | Format payload request |

---

### 1. Buat Tiket Baru
- **Method:** `POST`
- **Path:** `/tickets`
- **Request Body:**
  ```json
  {
    "customerEmail": "budi@perusahaan.com",
    "subject": "Gagal proses pembayaran langganan",
    "message": "Kartu kredit saya ditolak saat memperpanjang paket tahunan, mohon solusinya."
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "id": "7fa18357-bb6a-4d29-b68e-5bcf279b90fa",
    "organizationId": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
    "customerEmail": "budi@perusahaan.com",
    "subject": "Gagal proses pembayaran langganan",
    "message": "Kartu kredit saya ditolak saat memperpanjang paket tahunan, mohon solusinya.",
    "category": "billing",
    "suggestedReply": "Halo Budi, terima kasih telah menghubungi kami. Kami mohon maaf atas kendala pembayaran Anda. Mohon pastikan kartu Anda mendukung transaksi online internasional atau coba metode pembayaran alternatif di dashboard akun Anda.",
    "status": "open",
    "createdAt": "2026-09-16T12:00:00.000Z"
  }
  ```

---

### 2. Dapatkan Semua Tiket
- **Method:** `GET`
- **Path:** `/tickets`
- **Query Params (Opsional):**
  - `status`: `open` | `in_progress` | `closed`
  - `category`: `billing` | `technical` | `general`
- **Response (`200 OK`):**
  ```json
  [
    {
      "id": "7fa18357-bb6a-4d29-b68e-5bcf279b90fa",
      "customerEmail": "budi@perusahaan.com",
      "subject": "Gagal proses pembayaran langganan",
      "category": "billing",
      "status": "open",
      "createdAt": "2026-09-16T12:00:00.000Z"
    }
  ]
  ```

---

### 3. Dapatkan Detail Tiket
- **Method:** `GET`
- **Path:** `/tickets/:id`
- **Response (`200 OK`):** Objek tiket lengkap atau `404 Not Found`.

---

### 4. Perbarui Status Tiket
- **Method:** `PATCH`
- **Path:** `/tickets/:id/status`
- **Request Body:**
  ```json
  {
    "status": "in_progress"
  }
  ```
- **Response (`200 OK`):** Objek tiket dengan status terbarui. Status yang diperbolehkan: `open`, `in_progress`, `closed`.

## Hal yang akan diperbaiki/ditambah kalau ada waktu lebih. (yang terpikirkan saat ini)
### 1. Menggunakan Docker/Docker Compose
### 2. Mempelajari mengenai Crawler, cara mengkoneksikan code python pada project ini serta mengimplementasikannya
