# Customer Ticket System

Sistem manajemen tiket customer support berbasis **NestJS** dengan arsitektur multi-tenancy, klasifikasi otomatis dan pembuatan draft balasan berbasis **LLM (Google Gemini)**, serta optimasi performa menggunakan **Redis Caching**.

---

## Daftar Isi

1. [Fitur Utama](#fitur-utama)
2. [Tech Stack](#tech-stack)
3. [Cara Menjalankan Project](#cara-menjalankan-project)
   - [Prasyarat Sistem](#prasyarat-sistem)
   - [1. Setup Environment Variable](#1-setup-environment-variable)
   - [2. Setup Database PostgreSQL & Migrasi Prisma](#2-setup-database-postgresql--migrasi-prisma)
   - [3. Setup Redis](#3-setup-redis)
   - [4. Membuat Data Awal (Organisasi & API Key)](#4-membuat-data-awal-organisasi--api-key)
   - [5. Menjalankan Aplikasi](#5-menjalankan-aplikasi)
   - [6. Menjalankan Pengujian (Testing)](#6-menjalankan-pengujian-testing)
4. [Integrasi LLM](#integrasi-llm)
   - [Provider yang Dipilih & Alasan](#provider-yang-dipilih--alasan)
   - [Desain Prompt](#desain-prompt)
5. [Dokumentasi API](#dokumentasi-api)
6. [Hal yang akan diperbaiki/ditambah kalau ada waktu lebih. (yang terpikirkan saat ini)](#hal-yang-akan-diperbaikiditambah-kalau-ada-waktu-lebih-yang-terpikirkan-saat-ini)
---

## Fitur Utama

- **Multi-tenant Ticket Management**: Pengelolaan tiket terisolasi berdasarkan organisasi melalui header `x-api-key`.
- **Otomasi Klasifikasi LLM**: Mengklasifikasi tiket ke kategori `billing`, `technical`, atau `general` secara otomatis saat tiket dibuat (`POST /tickets`).
- **AI Suggested Reply**: Menghasilkan draft balasan customer support yang empatik dan kontekstual untuk mempercepat respon agen support.
- **Redis Cache Layer**: Mengurangi latensi dan biaya API dengan mencache hasil klasifikasi untuk subjek & pesan tiket yang serupa/identik.
- **Graceful Error Handling**: Tiket tetap tersimpan aman di database meskipun koneksi LLM mengalami timeout, rate limit, atau Redis sedang offline.

---

## Cara Menjalankan Project

### Prasyarat Sistem

Sebelum memulai, pastikan perangkat Anda telah terpasang:
- **Node.js**: v20.x atau lebih baru
- **Package Manager**: `pnpm` (`npm i -g pnpm`)
- **PostgreSQL**: Berjalan secara lokal atau via Docker/Cloud
- **Redis**: Berjalan secara lokal atau via Docker/Cloud

---

### 1. Setup Environment Variable

Salin file template `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Buka file `.env` dan lengkapi variabel berikut:

```env
# URL koneksi database PostgreSQL
DATABASE_URL="postgresql://postgres:postgres26@localhost:5432/customer_ticket?schema=public"

# API Key Google Gemini (didapatkan dari https://aistudio.google.com/)
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"

# Model Gemini yang digunakan (default: gemini-3.6-flash)
GEMINI_MODEL="gemini-3.6-flash"

# URL koneksi Redis (opsional: jika kosong, sistem otomatis masuk mode graceful degrade tanpa cache)
REDIS_URL="redis://localhost:6379"

# Port server (default: 3000)
PORT=3000
```

> **Keamanan:** API Key LLM dan kredensial database **wajib** disimpan dalam environment variable dan tidak boleh di-hardcode ke dalam kode sumber.

---

### 2. Setup Database PostgreSQL & Migrasi Prisma

1. Buat database di PostgreSQL (misalnya bernama `customer_ticket`):
   ```sql
   CREATE DATABASE customer_ticket;
   ```

2. Pasang seluruh dependensi project:
   ```bash
   pnpm install
   ```

3. Jalankan migrasi schema Prisma:
   ```bash
   pnpm run prisma:migrate
   ```

---

### 3. Setup Redis

Pastikan Redis server aktif pada port yang dikonfigurasi (default `6379`). Anda bisa memilih salah satu cara berikut:

#### Opsi A: Menggunakan Docker (Praktis)
```bash
docker run -d --name ticket-redis -p 6379:6379 redis:alpine
```

#### Opsi B: Tanpa Docker (via WSL2 di Windows) — Sangat Direkomendasikan untuk Windows
Buka terminal WSL (Ubuntu) dan jalankan:
```bash
sudo apt update && sudo apt install redis-server -y
sudo service redis-server start
```
*Port 6379 di WSL2 otomatis ter-forward ke `localhost:6379` di Windows.*

#### Opsi C: Tanpa Docker (Native Windows via Scoop / Chocolatey / File .zip)
- **Via Scoop:**
  ```powershell
  scoop install redis
  redis-server
  ```
- **Via Chocolatey:**
  ```powershell
  choco install redis-64 -y
  redis-server
  ```
- **Via Portable (.zip):** Unduh rilis Windows dari [tporadowski/redis GitHub Releases](https://github.com/tporadowski/redis/releases), ekstrak foldernya, lalu jalankan `redis-server.exe`.

#### Opsi D: Menggunakan Redis Cloud Gratis (Tanpa Install Software Apapun)
Gunakan layanan cloud gratis seperti [Upstash Redis](https://upstash.com/):
1. Buat database gratis di Upstash.
2. Salin connection string Redis URL.
3. Tempelkan ke file `.env`:
   ```env
   REDIS_URL="rediss://default:your-password@your-endpoint.upstash.io:6379"
   ```

#### Opsi E: Tanpa Redis Sama Sekali (Mode Degraded / Graceful Fallback)
Jika tidak ingin menjalankan Redis saat pengembangan, Anda **tidak wajib menginstall Redis**. Cukup kosongkan atau jangan set variabel `REDIS_URL` di `.env`:
```env
REDIS_URL=""
```
Sistem akan otomatis mendeteksi ketiadaan Redis dan beralih ke mode *graceful degradation* (aplikasi tetap berjalan 100% normal dengan langsung memanggil LLM tanpa error).

**Verifikasi Koneksi:**
```bash
redis-cli ping
# Response yang diharapkan: PONG
```

---

### 4. Membuat Data Awal (Organisasi & API Key)

Semua endpoint dilindungi oleh `ApiKeyGuard`. Anda memerlukan minimal satu data organisasi di database:

Jalankan Prisma Studio:
```bash
npx prisma studio
```
1. Buka browser pada alamat `http://localhost:5555`.
2. Klik model **Organization**, lalu klik **Add record**.
3. Isi data:
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

Server backend akan berjalan di `http://localhost:3000`.

---

### 6. Menjalankan Pengujian (Testing)

```bash
# Menjalankan unit tests (Vitest)
pnpm run test

# Menjalankan test coverage
pnpm run test:cov

# Menjalankan end-to-end (E2E) test
pnpm run test:e2e
```

---

## Integrasi LLM

### Provider yang Dipilih & Alasan

Project ini memilih **Google Gemini** menggunakan model **`gemini-3.6-flash`** melalui SDK resmi `@google/genai`. Model dapat disesuaikan secara dinamis melalui environment variable `GEMINI_MODEL`.

**Alasan Pemilihan:**
1. **Dukungan Native Structured Outputs (JSON Schema + Enum):**  
   Gemini API mendukung penegakan skema respon (`responseSchema`) langsung pada level engine. Hal ini menjamin properti `category` **pasti bernilai salah satu dari enum yang ditentukan** (`billing`, `technical`, atau `general`), meminimalisir format keluaran yang tidak valid.
2. **Kecepatan & Latensi Sangat Rendah:**  
   Model `gemini-3.6-flash` memiliki latensi inferensi rata-rata di bawah 1,5 detik, sangat cocok untuk alur pembuatan tiket pelanggan secara real-time.
3. **Ketersediaan Kuota Gratis (Free Tier Developer):**  
   Google AI Studio menyediakan kuota gratis yang memadai untuk kebutuhan pengujian dan tahap pengembangan awal.
4. **SDK Resmi Modern:**  
   Paket `@google/genai` kompatibel penuh dengan arsitektur modern TypeScript ESM pada NestJS.

---

### Desain Prompt

Digunakan strategi **Single Combined Prompt** (satu prompt gabungan). Pendekatan ini dipilih dibandingkan memanggil LLM dua kali secara terpisah karena:
- Mengurangi latensi jaringan hingga 50%.
- Menghemat konsumsi token input.
- Menghindari inkonsistensi data jika salah satu panggilan API berhasil namun panggilan kedua gagal.

#### Contoh Prompt yang Digunakan:

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

#### Penegakan Response Schema:

```typescript
config: {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        enum: ['billing', 'technical', 'general'], // Enforce di level API Gemini
      },
      suggestedReply: { type: Type.STRING },
    },
    required: ['category', 'suggestedReply'],
  },
}
```

Sebagai pertahanan berlapis (*defense-in-depth*), output juga divalidasi di level aplikasi menggunakan `class-validator` (`@IsIn(['billing', 'technical', 'general'])`).

---

## Dokumentasi API & Panduan Pengujian Postman

Base URL: `http://localhost:3000`

### Headers Wajib
| Header | Value |
| :--- | :--- |
| `x-api-key` | `secret-key-organisasi-1` *(sesuai data Organisasi Anda)* |
| `Content-Type` | `application/json` |

---

### 1. Buat Tiket Baru (POST /tickets)

**Request Body (Technical Issue):**
```json
{
  "customerEmail": "andi@gmail.com",
  "subject": "Aplikasi crash saat klik tombol bayar",
  "message": "Setiap kali saya menekan tombol checkout, aplikasi tiba-tiba force close dengan error code 500."
}
```

**Response (`201 Created`):**
```json
{
  "id": "7fa18357-bb6a-4d29-b68e-5bcf279b90fa",
  "organizationId": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
  "customerEmail": "andi@gmail.com",
  "subject": "Aplikasi crash saat klik tombol bayar",
  "message": "Setiap kali saya menekan tombol checkout, aplikasi tiba-tiba force close dengan error code 500.",
  "category": "technical",
  "suggestedReply": "Halo Andi, mohon maaf atas kendala yang dialami. Tim teknis kami sedang menyelidiki error 500 saat checkout. Mohon coba bersihkan cache aplikasi Anda terlebih dahulu sementara kami melakukan penelusuran lebih lanjut.",
  "status": "open",
  "createdAt": "2026-09-16T12:00:00.000Z"
}
```

**Verifikasi Caching Redis:**
Kirim request yang sama persis untuk kedua kalinya. Waktu respon di Postman akan turun drastis (< 30 ms) dan log console menampilkan `Menggunakan hasil LLM dari cache Redis.`.

---

### 2. Dapatkan Semua Tiket (GET /tickets)

- **Query Params Opsional:**
  - `?status=open`
  - `?category=technical`

**Response (`200 OK`):**
```json
[
  {
    "id": "7fa18357-bb6a-4d29-b68e-5bcf279b90fa",
    "customerEmail": "andi@gmail.com",
    "subject": "Aplikasi crash saat klik tombol bayar",
    "category": "technical",
    "status": "open",
    "createdAt": "2026-09-16T12:00:00.000Z"
  }
]
```

---

### 3. Dapatkan Detail Tiket (GET /tickets/:id)
Mengambil detail lengkap satu tiket berdasarkan ID.

---

### 4. Perbarui Status Tiket (PATCH /tickets/:id/status)

**Request Body:**
```json
{
  "status": "in_progress"
}
```

**Response (`200 OK`):** Tiket dengan field `status` yang telah diperbarui (`open` | `in_progress` | `closed`).

---

## Hal yang akan diperbaiki/ditambah kalau ada waktu lebih. (yang terpikirkan saat ini)
1. Menggunakan Docker/Docker Compose
2. Mempelajari mengenai Crawler, cara mengkoneksikan code python pada project ini serta mengimplementasikannya
