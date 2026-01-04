# Genarch Pipeline API

REST API for the genarch floor plan and A1 sheet generation pipeline.

## Overview

The genarch API provides async job-based floor plan generation. Jobs run in the background and can be polled for status. When complete, artifacts (PDF, DXF, GLB) can be downloaded via their URLs.

**Base URL (Development):** `http://localhost:3001/api/genarch`

---

## Endpoints

### Create Job

```http
POST /api/genarch/jobs
```

Creates and starts a new genarch pipeline job.

**Request Body:**

```json
{
  "prompt": "modern minimalist villa 200sqm",
  "seed": 42,
  "skipPhase2": true,
  "skipPhase4": false,
  "driftThreshold": 0.15,
  "strict": false,
  "waitForResult": false
}
```

| Field             | Type    | Required | Default | Description                                      |
| ----------------- | ------- | -------- | ------- | ------------------------------------------------ |
| `prompt`          | string  | Yes\*    | -       | Natural language description                     |
| `constraintsPath` | string  | Yes\*    | -       | Path to constraints JSON (alternative to prompt) |
| `seed`            | number  | No       | random  | Random seed for reproducibility                  |
| `skipPhase2`      | boolean | No       | true    | Skip Blender rendering                           |
| `skipPhase3`      | boolean | No       | true    | Skip AI perspective (not implemented)            |
| `skipPhase4`      | boolean | No       | false   | Skip A1 PDF assembly                             |
| `driftThreshold`  | number  | No       | 0.15    | Max drift score (0.0-1.0)                        |
| `strict`          | boolean | No       | false   | Fail on validation errors                        |
| `blenderPath`     | string  | No       | -       | Path to Blender executable                       |
| `waitForResult`   | boolean | No       | false   | Wait for job to complete                         |

\*Either `prompt` or `constraintsPath` is required.

**Response (202 Accepted):**

```json
{
  "success": true,
  "message": "Job created and started",
  "job": {
    "id": "gen-m1abc2d3-x4y5z6",
    "status": "running",
    "createdAt": 1704067200000,
    "progress": {
      "phase": 1,
      "phaseName": "Floor Plan Generation",
      "percent": 10,
      "message": "Generating floor plan..."
    }
  }
}
```

---

### Get Job Status

```http
GET /api/genarch/jobs/:jobId
```

Get the status and progress of a job.

**Response (200 OK):**

```json
{
  "success": true,
  "job": {
    "id": "gen-m1abc2d3-x4y5z6",
    "status": "completed",
    "createdAt": 1704067200000,
    "startedAt": 1704067201000,
    "completedAt": 1704067220000,
    "progress": {
      "phase": 4,
      "phaseName": "A1 PDF Assembly",
      "percent": 100,
      "message": "Pipeline complete"
    },
    "result": {
      "phases": { "1": { "status": "success" }, "4": { "status": "success" } },
      "validation": { "assets": { "passed": true } }
    },
    "artifacts": {
      "planJson": {
        "url": "/api/genarch/runs/gen-m1abc2d3-x4y5z6/plan.json",
        "filename": "plan.json",
        "type": "application/json",
        "size": 12345
      },
      "planDxf": {
        "url": "/api/genarch/runs/gen-m1abc2d3-x4y5z6/plan.dxf",
        "filename": "plan.dxf",
        "type": "application/dxf",
        "size": 54321
      },
      "a1Sheet": {
        "url": "/api/genarch/runs/gen-m1abc2d3-x4y5z6/phase4/A1_sheet.pdf",
        "filename": "A1_sheet.pdf",
        "type": "application/pdf",
        "size": 76543
      }
    }
  }
}
```

**Job Statuses:**

| Status      | Description                   |
| ----------- | ----------------------------- |
| `queued`    | Job created, waiting to start |
| `running`   | Job is executing              |
| `completed` | Job finished successfully     |
| `failed`    | Job encountered an error      |
| `cancelled` | Job was cancelled             |

---

### List Jobs

```http
GET /api/genarch/jobs
GET /api/genarch/jobs?status=running
```

List all jobs, optionally filtered by status.

**Response (200 OK):**

```json
{
  "success": true,
  "jobs": [
    {
      "id": "gen-m1abc2d3-x4y5z6",
      "status": "completed",
      "createdAt": 1704067200000,
      "progress": { "percent": 100 }
    }
  ],
  "count": 1
}
```

---

### Cancel Job

```http
DELETE /api/genarch/jobs/:jobId
```

Cancel a running job.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Job gen-m1abc2d3-x4y5z6 cancelled"
}
```

---

### Download Artifact

```http
GET /api/genarch/runs/:jobId/:path
```

Download an artifact from a completed job.

**Examples:**

```bash
# Download A1 PDF
curl -O http://localhost:3001/api/genarch/runs/gen-m1abc2d3-x4y5z6/phase4/A1_sheet.pdf

# Download floor plan JSON
curl http://localhost:3001/api/genarch/runs/gen-m1abc2d3-x4y5z6/plan.json

# Download DXF (CAD file)
curl -O http://localhost:3001/api/genarch/runs/gen-m1abc2d3-x4y5z6/plan.dxf

# Download 3D mesh
curl -O http://localhost:3001/api/genarch/runs/gen-m1abc2d3-x4y5z6/model.glb
```

---

## Usage Examples

### JavaScript/TypeScript

```javascript
// Create a job
const createJob = async (prompt) => {
  const response = await fetch('http://localhost:3001/api/genarch/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      seed: 42,
      skipPhase2: true, // Skip Blender unless installed
    }),
  });
  return response.json();
};

// Poll for completion
const pollJob = async (jobId, intervalMs = 2000) => {
  while (true) {
    const response = await fetch(`http://localhost:3001/api/genarch/jobs/${jobId}`);
    const data = await response.json();

    if (data.job.status === 'completed' || data.job.status === 'failed') {
      return data.job;
    }

    console.log(`Progress: ${data.job.progress.percent}% - ${data.job.progress.message}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

// Full workflow
const generateFloorPlan = async () => {
  // Start job
  const { job } = await createJob('modern 3-bedroom house 180sqm');
  console.log(`Job started: ${job.id}`);

  // Wait for completion
  const result = await pollJob(job.id);

  if (result.status === 'completed') {
    console.log('Artifacts:');
    console.log(`  PDF: ${result.artifacts.a1Sheet?.url}`);
    console.log(`  DXF: ${result.artifacts.planDxf?.url}`);
    console.log(`  JSON: ${result.artifacts.planJson?.url}`);
  } else {
    console.error('Job failed:', result.error);
  }
};
```

### cURL

```bash
# Create job
JOB_ID=$(curl -s -X POST http://localhost:3001/api/genarch/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm", "seed": 42}' \
  | jq -r '.job.id')

echo "Job ID: $JOB_ID"

# Poll for completion
while true; do
  STATUS=$(curl -s http://localhost:3001/api/genarch/jobs/$JOB_ID | jq -r '.job.status')
  PERCENT=$(curl -s http://localhost:3001/api/genarch/jobs/$JOB_ID | jq -r '.job.progress.percent')
  echo "Status: $STATUS ($PERCENT%)"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done

# Download PDF
curl -O "http://localhost:3001/api/genarch/runs/$JOB_ID/phase4/A1_sheet.pdf"
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "MISSING_INPUT",
  "message": "Either prompt or constraintsPath is required"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "JOB_NOT_FOUND",
  "message": "Job gen-invalid-id not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "JOB_FAILED",
  "message": "Pipeline exited with code 1",
  "job": {
    "logs": {
      "stdout": "...",
      "stderr": "..."
    }
  }
}
```

---

## Environment Variables

| Variable                    | Default          | Description                |
| --------------------------- | ---------------- | -------------------------- |
| `GENARCH_RUNS_DIR`          | `./genarch_runs` | Directory for job output   |
| `GENARCH_PYTHON`            | `python`         | Python executable path     |
| `GENARCH_PACKAGE_DIR`       | `./genarch`      | Path to genarch package    |
| `GENARCH_MAX_JOB_AGE_HOURS` | `24`             | Auto-cleanup after N hours |
| `BLENDER_PATH`              | `blender`        | Path to Blender executable |

---

## Deployment Notes

### Development (Express Server)

```bash
# Start the Express server
npm run server

# Or run both React + Express
npm run dev
```

### Production

The genarch pipeline requires Python and cannot run in serverless environments like Vercel. Options:

1. **Dedicated Python Service**: Deploy genarch as a Cloud Run, EC2, or Kubernetes service
2. **Queue-Based**: Use SQS/Cloud Tasks to trigger a worker
3. **Self-Hosted**: Run the Express server on a VM or container

See `docs/GENARCH_SETUP.md` for detailed deployment instructions.
