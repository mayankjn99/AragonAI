# Setup Guide

## Prerequisites

- Node.js >= 18
- pnpm (`npm install -g pnpm`)
- PostgreSQL 16 running locally

## 1. Clone the repo

```bash
git clone git@github.com:mayankjn99/AragonAI.git
cd AragonAI
```

## 2. Backend Setup

```bash
# Install dependencies
pnpm install

# Create .env file
cp .env.example .env
# Edit .env with your database URL:
# DATABASE_URL="postgresql://username:password@localhost:5432/image_upload?schema=public"

# Run database migrations
pnpm run migrate

# Generate Prisma client
pnpm run generate

# Start the backend (dev mode with hot reload)
pnpm run dev
```

Server runs at `http://localhost:3000`.

## 3. Frontend Setup

```bash
cd client

# Install dependencies
pnpm install

# Start the Vite dev server
pnpm run dev
```

Frontend runs at `http://localhost:5173`.

## 4. Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/image_upload?schema=public"
PORT=3000
```

## 5. Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start backend with nodemon |
| `pnpm run start` | Start backend (production) |
| `pnpm run migrate` | Run Prisma migrations |
| `pnpm run generate` | Regenerate Prisma client |
| `pnpm run studio` | Open Prisma Studio (DB GUI) |

## 6. Project Structure

```
├── src/
│   ├── server.js          # Entry point
│   ├── app.js             # Express app config
│   ├── routes/upload.js   # Upload endpoint + validation pipeline
│   ├── middleware/upload.js # Multer config (disk storage, file filter)
│   ├── validators/
│   │   ├── format.js      # HEIC → JPEG conversion
│   │   ├── resolution.js  # Min 500×500 check
│   │   ├── blurriness.js  # Laplacian variance check
│   │   └── face.js        # UltraFace ONNX face detection
│   └── lib/prisma.js      # Prisma client instance
├── prisma/
│   └── schema.prisma      # Database schema
├── models/
│   └── version-RFB-320.onnx  # Face detection model
├── uploads/               # Uploaded files (gitignored)
└── client/                # React frontend (Vite)
```
