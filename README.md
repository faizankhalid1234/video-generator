# Kie Video Studio

Simple Next.js frontend to generate videos from **image + audio + prompt** using Kie AI APIs.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure `.env` (already created):

```env
KIE_API_TOKEN=your_token
KIE_CREATE_TASK_URL=https://api.kie.ai/api/v1/jobs/createTask
KIE_UPLOAD_URL=https://kieai.redpandaai.co/api/file-stream-upload
KIE_TASK_STATUS_URL=https://api.kie.ai/api/v1/jobs/recordInfo
KIE_MODEL=infinitalk/from-audio
KIE_UPLOAD_PATH=kieai/uploads
```

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Flow

1. User selects image, audio and writes a prompt
2. Click **Generate Video**
3. Image uploads to Kie file storage
4. Audio uploads to Kie file storage
5. `createTask` starts video generation (`infinitalk/from-audio`)
6. App polls task status and shows the video when ready

## API Routes (server-side, token stays private)

- `POST /api/upload` → file upload proxy
- `POST /api/generate` → create video task
- `GET /api/status?taskId=...` → poll task result
