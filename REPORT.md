# Image Upload & Validation Service — Loom Video Script & Report

---


## 1. Project Overview (Opening — 30 seconds)


**Tech Stack:**
- **Frontend:** React (Vite) + Axios
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + Prisma ORM (with `@prisma/adapter-pg`)
- **Image Processing:** Sharp (resolution, blur, format conversion) + ONNX Runtime (face detection with UltraFace-320 model)
- **File Handling:** Multer (disk storage with UUID naming)

---

## 1.5 Journey of an Image — End to End (60 seconds)


1. **User selects a file** — the React frontend validates the MIME type client-side (JPEG, PNG, or HEIC only) and shows an instant preview via `FileReader`.

2. **Frontend POSTs the file** — Axios sends a `multipart/form-data` request to `POST /api/upload`. The file travels as binary in the request body.

3. **Multer middleware intercepts** — it checks the file type against an allowlist and enforces a 5MB size cap. If either fails, Express returns a `400` immediately. Otherwise, the file is saved to disk with a UUID filename (no collisions, no path traversal risk).

4. **Route handler creates a PENDING record** — Prisma inserts a row into PostgreSQL with `status: PENDING`. This gives us a record ID to track the image regardless of what happens next.

5. **Validation pipeline runs sequentially (fail-fast):**
   - **Format conversion** — if HEIC, Sharp converts to JPEG (quality 90). Everything downstream works with a standard format.
   - **Resolution check** — Sharp reads metadata (no pixel decode). If below 500×500, the DB row is updated to `REJECTED` with the reason, and we return early.
   - **Blurriness check** — image is converted to grayscale, a Laplacian kernel is applied, and variance is computed. Low variance = blurry = rejected.
   - **Face detection** — the UltraFace ONNX model runs inference (resize to 320×240, normalize, NMS). Must find exactly 1 face occupying ≥5% of image area.

6. **Final DB update** — if all checks pass, the row is updated to `ACCEPTED` with the final storage path and format. If any check fails, it's `REJECTED` with a human-readable reason.

7. **Response returned to frontend** — the React app receives the full image record (id, status, rejectionReason, timestamps) and renders it as an accepted/rejected card in the results grid.

> "So in summary: file → disk → database record → 4-step validation → accept or reject. The whole thing is synchronous right now — the user waits for the response, which takes about 1–2 seconds depending on image size."

---

## 2. UI Walkthrough (Frontend Pointers)

### Architecture Decisions
- **Single-component design** (`ImageUpload.jsx`) — keeps state co-located and simple for an MVP.
- **Drag-and-drop + click-to-browse** — dual input UX pattern via native HTML5 drag events.
- **Client-side type validation** — `ALLOWED_TYPES` array rejects invalid formats before hitting the network.
- **Instant preview** — uses `FileReader.readAsDataURL()` to render a thumbnail before upload.
- **Optimistic state management** — `uploads` array stores results in session; `accepted`/`rejected` computed via `.filter()`.

### Key Talking Points
| Feature | Implementation |
|---------|---------------|
| Drag & Drop | `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop` handlers with `dragActive` state |
| File Preview | `FileReader` API, shown inside the dropzone when a file is selected |
| Upload Progress | `uploading` boolean disables the button and shows a CSS spinner |
| Error Display | Catches Axios errors and displays via `error-banner` div |
| Results Grid | Maps `uploads` array to card components showing status badges (✓/✗) |

### Styling Approach
- Pure CSS (no framework) — custom variables, gradients, and `system-ui` font stack.
- Responsive layout: single column, `max-width: 560px` upload form, full-width results.
- Visual feedback: border color changes on drag, scale transform on hover, gradient button with box-shadow.

---

## 3. Backend Walkthrough (Server Pointers)

### Request Flow (show diagram)
```
Client POST /api/upload
       │
       ▼
  Multer Middleware ──► Disk (uploads/)
       │                  UUID filename
       ▼
  Route Handler
       │
       ├─ 1. Create PENDING record (Prisma)
       │
       ├─ 2. Format Conversion (HEIC → JPEG via Sharp)
       │
       ├─ 3. Resolution Check (≥ 500×500)
       │
       ├─ 4. Blurriness Check (Laplacian variance ≥ 100)
       │
       ├─ 5. Face Detection (UltraFace ONNX model)
       │      - Exactly 1 face required
       │      - Face ≥ 5% of image area
       │
       └─ 6. Update DB: ACCEPTED or REJECTED with reason
```

### Key Backend Decisions
| Decision | Reasoning |
|----------|-----------|
| **Multer disk storage** | Avoids memory pressure for large files; UUID prevents filename collisions |
| **Sequential validation pipeline** | Fail-fast: reject on first failure without running expensive subsequent checks |
| **Sharp for image analysis** | Native bindings (libvips) — fastest Node.js image library, handles HEIC natively |
| **ONNX Runtime for faces** | Runs the UltraFace-RFB-320 model at inference; no external API calls, works offline |
| **Laplacian variance for blur** | Classical computer vision approach — fast, deterministic, no ML overhead |
| **Global error middleware** | Catches Multer-specific errors (file size, type) and returns clean JSON responses |

### Validator Deep Dives

**Blurriness (`validators/blurriness.js`):**
- Converts image to grayscale raw pixels.
- Applies a 3×3 Laplacian kernel (`[0,1,0; 1,-4,1; 0,1,0]`) to detect edges.
- Computes variance of the convolution output — low variance = few edges = blurry.
- Threshold: 100 (tunable).

**Face Detection (`validators/face.js`):**
- Loads `version-RFB-320.onnx` (UltraFace model, ~1.2MB).
- Preprocesses: resize to 320×240, normalize to [-1,1], convert HWC→CHW.
- Post-processes: confidence threshold 0.7, NMS with IoU 0.3.
- Business rules: exactly 1 face, bounding box ≥ 5% of total image area.

**Format Conversion (`validators/format.js`):**
- Detects HEIC mimetype and converts to JPEG (quality 90) via Sharp.
- Passthrough for JPEG/PNG/WebP/GIF.

**Resolution (`validators/resolution.js`):**
- Reads image metadata (no pixel decoding needed).
- Rejects if width < 500 or height < 500.

---

## 4. Database Schema (Prisma + PostgreSQL)

### Schema Design
```prisma
enum ImageStatus {
  PENDING
  ACCEPTED
  REJECTED
}

model Image {
  id              String      @id @default(uuid())
  originalName    String
  format          String
  status          ImageStatus @default(PENDING)
  rejectionReason String?
  storagePath     String
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}
```

### Why These Choices?

| Decision | Reasoning |
|----------|-----------|
| **UUID primary key** | No sequential IDs exposed to clients; safe for distributed systems |
| **Enum for status** | Type-safe state machine (`PENDING → ACCEPTED / REJECTED`); Postgres enforces valid values |
| **Nullable `rejectionReason`** | Only populated on rejection; avoids empty strings and clearly signals "no reason needed" |
| **`storagePath` tracked** | Enables future cleanup jobs, migration to cloud storage, or serving files |
| **`updatedAt` auto-managed** | Prisma `@updatedAt` tracks last state change for auditing |
| **PostgreSQL (not SQLite)** | Production-grade; supports enums, JSON, extensions (pgvector), concurrent writes |
| **Prisma with `@prisma/adapter-pg`** | Driver adapter pattern — uses raw `pg` connection for flexibility while keeping Prisma's type-safe query API |

### Migration Strategy
- Single initial migration (`20260519131818_init`) — creates the table, enum type, and UUID default.
- Prisma Migrate handles schema diffs going forward.

---

## 5. Future Improvements — Scaling Roadmap

### 5.1 Testing the Current Synchronous Setup

> "Before we optimize, let's write tests for the current synchronous setup."

**What to test:**
- **Unit tests** for each validator (mock Sharp/ONNX, test edge cases: exactly 500×500, variance = 99.9, 0 faces, 2 faces).
- **Integration tests** for the upload route (supertest + test database).
- **File upload edge cases:** 5MB boundary, corrupt files, empty body, double extension.

**Tools:** Jest or Vitest + Supertest + a test Postgres DB (or Prisma's `--preview` test mode).

**Why first:** Gives a safety net so the refactoring below doesn't silently break validation logic.

---

### 5.2 Async Validation (Offload from Main Thread)

> "The synchronous validation blocks the Node main thread. Let's refactor for scale."

**Current Problem:**
- Sharp's pixel processing and ONNX inference are CPU-bound.
- A 4K image blur check can block the event loop for 200–500ms.
- Under concurrent load, all other requests queue behind validation.

**Solution — Worker-based Architecture:**
```
POST /api/upload
  └─ Multer saves file
  └─ Create PENDING record
  └─ Enqueue job (BullMQ + Redis)
  └─ Return 202 { id, status: "PENDING" }

Worker Process (separate):
  └─ Dequeue job
  └─ Run validators
  └─ Update DB → ACCEPTED/REJECTED
```

**Benefits:**
- Express responds in <50ms (just disk write + DB insert).
- Workers scale horizontally (add more pods/containers).
- Failed jobs retry automatically with backoff.
- Frontend polls `GET /api/upload/:id` or subscribes via WebSocket.

---

### 5.3 Cloud Storage with Cloudinary

> "Let's move away from local storage and integrate Cloudinary for cloud media management."

**Current Problem:**
- `uploads/` folder lives on the server disk — not durable, not CDN-served, not scalable across instances.
- No image transformations, no responsive delivery.

**Migration Path:**
1. After validation passes, upload to Cloudinary via their Node SDK.
2. Store the Cloudinary `public_id` and `secure_url` in the DB.
3. Delete the local temp file.
4. Serve images via Cloudinary's CDN with on-the-fly transforms (resize, format negotiation, quality optimization).

**Schema addition:**
```prisma
model Image {
  ...
  cloudinaryId    String?
  cloudinaryUrl   String?
}
```

---

### 5.4 Direct-to-Cloud Uploads (Presigned URLs)

> "Right now, the image goes User → Express Server → Cloudinary. For huge files or thousands of concurrent users, this eats up server bandwidth."

**Current Flow:**
```
User ──[5MB]──► Express ──[5MB]──► Cloudinary
                 (double bandwidth)
```

**Improved Flow with Signed Uploads:**
```
1. Frontend calls GET /api/upload/signature
2. Express generates a signed upload params (timestamp, signature, api_key)
3. Frontend uploads DIRECTLY to Cloudinary using the signed params
4. Cloudinary sends a webhook/notification to Express with metadata
5. Express validates and creates the DB record
```

**Benefits:**
- Server bandwidth drops to near zero for file transfer.
- Upload speed improves (user → CDN edge, not user → your server → CDN).
- Server only handles lightweight JSON requests.
- Works with files of any size (Cloudinary handles chunked uploads).

**Trade-off:** Validation must happen post-upload (download from Cloudinary URL for checking) or move validation to a Cloudinary webhook/add-on.

---

### 5.5 WebSockets / SSE Instead of Polling

> "Relying on HTTP polling means the frontend makes a request every 2 seconds. If 10,000 users are waiting, that's 5,000 requests per second hitting your database just to ask 'Is it done yet?'."

**Current Pattern (if async):** `setInterval(() => fetch('/api/upload/' + id), 2000)`

**Better: Server-Sent Events (SSE)**
```js
// Backend
app.get('/api/upload/:id/status', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(async () => {
    const image = await prisma.image.findUnique({ where: { id } });
    if (image.status !== 'PENDING') {
      res.write(`data: ${JSON.stringify(image)}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 500); // internal polling, not client-driven
});
```

**Even Better: WebSockets (Socket.IO)**
```js
// Worker emits when done:
io.to(imageId).emit('validation-complete', { status, rejectionReason });

// Frontend subscribes once:
socket.emit('subscribe', imageId);
socket.on('validation-complete', (data) => { /* update UI */ });
```

**Comparison:**
| Approach | Requests/sec (10K users) | Latency | Complexity |
|----------|--------------------------|---------|------------|
| Polling (2s) | 5,000 | 0–2s delay | Low |
| SSE | 0 (push-based) | Instant | Medium |
| WebSocket | 0 (push-based) | Instant | Medium-High |

---

### 5.6 Vector Similarity with pgvector (Duplicate Detection)

> "Comparing a new pHash against thousands of existing records using standard database queries will eventually slow down."

**Use Case:** Detect near-duplicate uploads by computing perceptual hashes (pHash) and finding similar images in the database.

**Current (naive) approach:**
```sql
SELECT * FROM images WHERE phash = 'abc123...';  -- exact match only
```

**Improved with pgvector:**
```sql
-- Store 64-dim pHash as a vector
ALTER TABLE images ADD COLUMN phash_vector vector(64);

-- Create HNSW index for fast approximate nearest-neighbor search
CREATE INDEX ON images USING hnsw (phash_vector vector_cosine_ops);

-- Query: find images with cosine similarity > 0.95
SELECT *, 1 - (phash_vector <=> '[0.1, 0.2, ...]') AS similarity
FROM images
WHERE 1 - (phash_vector <=> '[0.1, 0.2, ...]') > 0.95
ORDER BY phash_vector <=> '[0.1, 0.2, ...]'
LIMIT 5;
```

**Why pgvector over alternatives?**
| Feature | pgvector | Pinecone/Weaviate |
|---------|----------|-------------------|
| Hosting | Same Postgres instance | Separate service |
| Cost | Free (extension) | Per-query pricing |
| Latency | <5ms (in-DB) | Network hop |
| Consistency | Transactional with your data | Eventually consistent |
| Scale ceiling | ~10M vectors (with HNSW) | Billions |

**Implementation Steps:**
1. Install `pgvector` extension: `CREATE EXTENSION vector;`
2. Add `phash_vector vector(64)` column.
3. Compute pHash after upload using a library like `imghash` or Sharp + DCT.
4. Before accepting, query for nearest neighbors — if similarity > 0.95, reject as duplicate.

---

## 6. Demo Flow (Suggested Order for Video)

1. **Show the running app** — upload a valid portrait, show it get ACCEPTED.
2. **Upload a blurry image** — show REJECTED with the reason.
3. **Upload a low-res image** — show REJECTED with dimensions in the reason.
4. **Upload a group photo** — show "Multiple faces detected" rejection.
5. **Show the database** — `npx prisma studio` to show rows with statuses.
6. **Walk through the code** — start from the route, trace through each validator.
7. **Discuss the architecture diagram** — highlight where each improvement lands.

---

## 7. Summary Table

| What We Built | What's Next |
|---------------|-------------|
| Multer disk upload + UUID naming | Cloudinary cloud storage |
| Synchronous validation pipeline | BullMQ worker queue (async) |
| HTTP request/response | WebSocket/SSE push notifications |
| Manual upload via form | Presigned direct-to-cloud URLs |
| Per-image status in Postgres | pgvector for duplicate detection at scale |
| Unit validators (blur, face, res) | Comprehensive test suite (Jest/Vitest) |

---

