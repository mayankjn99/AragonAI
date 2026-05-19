# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                     │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌───────────────────────────┐   │
│  │ File     │──►│ Preview  │──►│ POST /api/upload           │   │
│  │ Select / │   │ (base64) │   │ (multipart/form-data)      │   │
│  │ Drag&Drop│   └──────────┘   └─────────────┬─────────────┘   │
│  └──────────┘                                 │                 │
│                                               │                 │
│  ┌────────────────────────────────────────────▼─────────────┐   │
│  │ Results Grid (Accepted ✓ / Rejected ✗ with reasons)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP (Axios)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Node.js + Express)                   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ Middleware Layer                                        │     │
│  │  • CORS                                                │     │
│  │  • express.json()                                      │     │
│  │  • Multer (disk storage, 5MB limit, type filter)       │     │
│  │  • Global error handler                                │     │
│  └───────────────────────────┬────────────────────────────┘     │
│                              │                                  │
│  ┌───────────────────────────▼────────────────────────────┐     │
│  │ Route: POST /api/upload                                │     │
│  │                                                        │     │
│  │  1. Save file to disk (UUID name)                      │     │
│  │  2. Create PENDING record in DB                        │     │
│  │  3. Run Validation Pipeline (sequential, fail-fast)    │     │
│  │  4. Update DB → ACCEPTED / REJECTED                    │     │
│  │  5. Return JSON response                               │     │
│  └───────────────────────────┬────────────────────────────┘     │
│                              │                                  │
│  ┌───────────────────────────▼────────────────────────────┐     │
│  │ Validation Pipeline                                    │     │
│  │                                                        │     │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐   │     │
│  │  │ Format      │─►│ Resolution   │─►│ Blurriness  │   │     │
│  │  │ Conversion  │  │ Check        │  │ Check       │   │     │
│  │  │ (HEIC→JPEG) │  │ (≥500×500)   │  │ (Laplacian) │   │     │
│  │  └─────────────┘  └──────────────┘  └──────┬──────┘   │     │
│  │                                             │          │     │
│  │                                    ┌────────▼────────┐ │     │
│  │                                    │ Face Detection  │ │     │
│  │                                    │ (UltraFace     │ │     │
│  │                                    │  ONNX model)   │ │     │
│  │                                    │ • 1 face only  │ │     │
│  │                                    │ • ≥5% area     │ │     │
│  │                                    └─────────────────┘ │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ Prisma ORM (@prisma/adapter-pg)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL 16)                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ Table: Image                                           │     │
│  │                                                        │     │
│  │  id              UUID (PK, auto-generated)             │     │
│  │  originalName    String                                │     │
│  │  format          String (mime type)                    │     │
│  │  status          Enum (PENDING | ACCEPTED | REJECTED)  │     │
│  │  rejectionReason String? (nullable)                    │     │
│  │  storagePath     String (disk path)                    │     │
│  │  createdAt       DateTime (auto)                       │     │
│  │  updatedAt       DateTime (auto)                       │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ File I/O
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FILE SYSTEM                                  │
│                                                                 │
│  uploads/                                                       │
│  ├── a3f4b2c1-...-d8e9.jpg                                     │
│  ├── 7b2c1a3f-...-4e5d.png                                     │
│  └── ...                                                        │
│                                                                 │
│  models/                                                        │
│  └── version-RFB-320.onnx  (UltraFace face detection model)    │
└─────────────────────────────────────────────────────────────────┘
```

## Request Lifecycle

```
 User Action          Network             Server                    Database
─────────────────────────────────────────────────────────────────────────────
                                                                    
 Select file ─────►  (client-side)                                  
                      type check                                    
                      preview render                                
                                                                    
 Click Upload ────►  POST /api/upload ──► Multer saves to disk      
                     (multipart)          │                         
                                          ├──► prisma.image.create ──► INSERT
                                          │    (status: PENDING)       (PENDING)
                                          │                         
                                          ├──► convertIfNeeded()    
                                          ├──► validateResolution() 
                                          ├──► validateBlurriness() 
                                          ├──► validateFaces()      
                                          │                         
                                          ├──► prisma.image.update ──► UPDATE
                                          │    (ACCEPTED/REJECTED)     (final)
                                          │                         
                     ◄── JSON response ◄──┘                         
                                                                    
 Display result                                                     
 (card with                                                         
  status badge)                                                     
```

## Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite | Fast HMR, minimal config, component model |
| HTTP Client | Axios | Interceptors, multipart support, error handling |
| Server | Express 5 | Mature, middleware ecosystem, async route support |
| File Upload | Multer | Stream-to-disk, file filtering, size limits |
| Image Processing | Sharp (libvips) | Fastest Node.js image lib, native bindings |
| Face Detection | ONNX Runtime | Local inference, no API costs, offline-capable |
| ORM | Prisma | Type-safe queries, migrations, studio GUI |
| Database | PostgreSQL 16 | Enums, extensions (pgvector-ready), ACID |
| File Naming | UUID v4 | Collision-free, no path traversal risk |

## Security Considerations

- **File type validation** — both client-side (MIME check) and server-side (Multer fileFilter)
- **File size limit** — 5MB enforced at middleware level
- **UUID filenames** — prevents path traversal and overwrites
- **No user-supplied paths** — storage path is entirely server-generated
- **Error sanitization** — internal errors return generic 500, not stack traces
