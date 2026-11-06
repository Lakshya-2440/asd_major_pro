# Auto-ATC: 30-Prompt Development Roadmap

Direct serial list: **PR 1 to PR 30** (10 PRs / commits each for **Lakshya**, **Priyanshu**, and **Manoj**).

| PR Range | Assignee | Focus Area | Directory |
|---|---|---|---|
| **PR 1 – PR 10** | **Lakshya** | Computer Vision, HF Segmentation, Landmarks & Scoring | `src/`, `configs/`, `tests/` |
| **PR 11 – PR 20** | **Priyanshu** | Backend Express API, PostgreSQL DB & BPA Integration | `api/`, `docker-compose.yml` |
| **PR 21 – PR 30** | **Manoj** | Frontend React PWA, Interactive Canvas & UX | `app/` |

---

### PR 1: `chore(service): init python fastapi service and project structure`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Initialize the Python analysis microservice for the Auto-ATC project.
Target directory: src/ and root requirements.txt.

Requirements:
1. Create requirements.txt with: fastapi, uvicorn[standard], opencv-python-headless, numpy, pydantic, pyyaml, requests, huggingface_hub, pytest, python-multipart.
2. Create src/main.py with a FastAPI app exposing:
   - GET /health: returns {"status": "ok", "service": "analysis-service", "version": "0.2.0"}.
   - POST /predict: accepts multipart image file (side_view) and form fields (species, breed, tag_id). Returns dummy JSON matching PRD Section 13 schema:
     {
       "species": "cattle",
       "breed": "Gir",
       "pipeline_version": "0.2.0",
       "quality_flags": [],
       "landmarks": {},
       "measurements": {},
       "trait_scores": {},
       "overall_score": 0
     }
3. Implement Pydantic response models in src/schemas.py.
4. Ensure CORS middleware enabled for frontend origin.
5. Add unit test in tests/test_health.py verifying /health and dummy /predict.
```

---

### PR 2: `feat(cv): implement image quality checks for blur and lighting`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement an automated image quality validation module using OpenCV.
Target file: src/quality.py and tests/test_quality.py.

Requirements:
1. Create class ImageQualityChecker with method check_image(image_bytes: bytes) -> dict:
   - Blur detection: Compute variance of Laplacian. Flag "blurry" if score < threshold (default 100.0).
   - Under-exposure (dark): Compute mean luminance (Y channel in YCrCb or Grayscale). Flag "too_dark" if mean < 40.0.
   - Over-exposure (bright): Flag "too_bright" if mean luminance > 220.0 or >15% pixels saturated (>250).
   - Resolution / aspect check: Ensure image dimensions >= 800x600 px and landscape orientation. Flag "wrong_orientation" or "low_resolution".
2. Output format:
   {
     "is_acceptable": bool,
     "flags": list[str],
     "metrics": {"laplacian_var": float, "mean_brightness": float, "dimensions": [int, int]}
   }
3. Thresholds must be configurable via configs/quality_config.yaml.
4. Write pytest unit tests with synthetic numpy test images: sharp, blurred (Gaussian blur), pure dark, and bright images.
```

---

### PR 3: `feat(cv): implement aruco reference marker detection and scale factor`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement ArUco reference marker detection to calculate real-world pixel-to-centimeter scale.
Target file: src/marker.py and tests/test_marker.py.

Requirements:
1. Support standard ArUco dictionary (cv2.aruco.DICT_4X4_50 or DICT_5X5_100, configurable).
2. Function detect_reference_marker(image: np.ndarray, marker_real_size_cm: float = 10.0) -> dict:
   - Detect ArUco marker corners in the input image.
   - If marker detected:
     - Compute perimeter and mean edge length in pixels across all 4 edges.
     - Calculate pixels_per_cm = edge_length_px / marker_real_size_cm.
     - Calculate marker bounding box and center coordinate.
     - Return {"found": True, "pixels_per_cm": float, "corners": list, "confidence": float}.
   - If marker not found:
     - Return {"found": False, "pixels_per_cm": None, "error": "Reference marker not detected"}.
3. Handle corner cases: multiple markers detected (pick primary by ID), warped perspective, small marker area (< 0.05% of frame).
4. Add unit test with generated synthetic ArUco image ensuring scale factor matches expected pixel calculation.
```

---

### PR 4: `feat(ml): implement huggingface inference client for animal segmentation`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement Hugging Face Inference API client to obtain animal segmentation masks.
Target file: src/segmentation.py and configs/models.yaml.

Requirements:
1. Create configs/models.yaml: specify default segmentation model (e.g. facebook/detr-resnet-50-panoptic or compatible hosted model) and timeout/retry settings.
2. Create class HuggingFaceSegmenter:
   - Load HF_TOKEN from environment variable.
   - Call HF Inference API with raw image bytes.
   - Parse binary mask or polygon outputs. Extract binary mask isolating the target animal.
   - If multiple masks returned, select the largest connected component belonging to 'cow', 'cattle', 'ox', or 'animal'.
   - Post-process mask using OpenCV: cv2.morphologyEx to close small holes and cv2.findContours to smooth boundary.
   - Implement exponential backoff retry (3 attempts) on 503 (model cold start) or 429 rate limit errors.
   - Return binary mask (numpy uint8 array, 255 for animal, 0 for background).
3. Provide mock fallback mode when HF_TOKEN is absent or mock flag is set for local testing.
4. Add unit tests verifying mask post-processing and retry logic.
```

---

### PR 5: `feat(geometry): extract anatomical landmarks from segmentation mask`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement geometric landmark extraction from the animal segmentation mask.
Target file: src/landmarks.py and tests/test_landmarks.py.

Requirements:
1. Input: binary mask (numpy array) and side orientation (left-facing vs right-facing animal).
2. Detect animal orientation: determine head vs rear by analyzing horizontal centroid vs bounding box center and upper taper.
3. Extract side-view anatomical landmarks:
   - Hooves (front & rear): lowest contact points with ground plane (max Y coordinates).
   - Withers: highest dorsal point of backline in the anterior half (min Y along spine curve).
   - Pin bone: most posterior structural point along pelvic slope.
   - Hip point (hook bone): dorsal transition point between loin and rump.
   - Shoulder point: anterior-most prominent contour point of chest/shoulder junction.
   - Brisket: lowest ventral point of chest floor between front legs and belly line.
4. Output landmark dictionary format:
   {
     "withers": {"x": int, "y": int, "confidence": float},
     "shoulder_point": {"x": int, "y": int, "confidence": float},
     "hip_point": {"x": int, "y": int, "confidence": float},
     "pin_bone": {"x": int, "y": int, "confidence": float},
     "brisket": {"x": int, "y": int, "confidence": float},
     "front_hoof": {"x": int, "y": int, "confidence": float},
     "rear_hoof": {"x": int, "y": int, "confidence": float}
   }
5. Assign confidence score based on contour smoothness and local geometric curvature.
6. Write unit tests with synthetic binary silhouette of a cow.
```

---

### PR 6: `feat(measure): compute physical body measurements and angles`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement body measurement and angle calculation from extracted landmarks and scale factor.
Target file: src/measurements.py and tests/test_measurements.py.

Requirements:
1. Function compute_measurements(landmarks: dict, pixels_per_cm: float) -> dict:
   - Stature (Height at withers): Vertical distance from withers to front hoof ground level in cm.
   - Body length: Euclidean distance from shoulder point to pin bone in cm.
   - Body depth: Vertical distance from dorsal spine behind withers down to brisket floor in cm.
   - Rump angle: Angle (in degrees) of line connecting hip point to pin bone relative to horizontal reference line (slope angle).
2. Return structure:
   {
     "height_at_withers_cm": {"value": float, "confidence": float},
     "body_length_cm": {"value": float, "confidence": float},
     "body_depth_cm": {"value": float, "confidence": float},
     "rump_angle_deg": {"value": float, "confidence": float}
   }
3. Validate boundaries against plausible biological ranges (e.g., cattle height 100cm - 170cm). Flag warnings if values fall outside physiological norms.
4. Unit tests verifying mathematical correctness against synthetic landmark coordinates.
```

---

### PR 7: `feat(scoring): implement config-driven 1-9 trait scoring engine`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement a rule-based trait scoring engine based on breed standard thresholds.
Target files: src/scoring.py, configs/scoring_rules.yaml, and tests/test_scoring.py.

Requirements:
1. Create configs/scoring_rules.yaml containing species and breed linear classification criteria (1-9 scale):
   - Define piecewise ranges / interpolation thresholds for cattle (Gir, Sahiwal) and buffalo (Murrah).
   - Traits: stature, body_length, body_depth, rump_angle.
   - Define weighting factors for overall type score computation (0-100 scale).
2. Create ScoringEngine class:
   - Input: measurements dict, species: str, breed: str.
   - Map each measurement into 1 to 9 integer score using piecewise linear bins from YAML.
   - Compute overall score: weighted sum mapped to 1-100 scale.
   - Output format:
     {
       "trait_scores": {
         "stature": 7,
         "body_length": 6,
         "body_depth": 7,
         "rump_angle": 5
       },
       "overall_score": 82.5,
       "scoring_version": "1.0.0"
     }
3. Raise error if species or breed is unsupported.
4. Unit tests verifying deterministic score generation against standard boundary values.
```

---

### PR 8: `feat(api): implement /recompute endpoint for manual landmark adjustments`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Implement the /recompute FastAPI endpoint to handle user-dragged landmark corrections.
Target files: src/main.py, src/schemas.py, tests/test_recompute.py.

Requirements:
1. Define Pydantic request model RecomputeRequest:
   - landmarks: dict[str, Coordinate] where Coordinate has x: int, y: int.
   - pixels_per_cm: float.
   - species: str.
   - breed: str.
2. Endpoint POST /recompute:
   - Validate received landmark coordinates.
   - Recalculate measurements using src/measurements.py.
   - Recalculate trait scores and overall score using src/scoring.py.
   - Mark recalculated traits with attribute "source": "user_adjusted".
   - Return updated measurements, trait_scores, and overall_score.
3. Handle missing landmarks or invalid pixels_per_cm with HTTP 422.
4. Write pytest testing /recompute with sample adjusted points.
```

---

### PR 9: `feat(pipeline): integrate full end-to-end predict pipeline`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Wire together all analysis components into an end-to-end inference pipeline in src/pipeline.py and link to POST /predict in src/main.py.

Requirements:
1. Pipeline flow:
   - Input: image bytes, species, breed.
   - Step 1: Run ImageQualityChecker. If unacceptable, return early with 200/400 containing quality_flags.
   - Step 2: Run detect_reference_marker. If not found, add flag "marker_missing".
   - Step 3: Run HuggingFaceSegmenter to get animal mask.
   - Step 4: Run landmark extraction on mask.
   - Step 5: If marker found, compute measurements in cm; else return pixel values and flag "uncalibrated".
   - Step 6: Compute linear 1-9 trait scores and overall score.
   - Step 7: Return consolidated output matching PRD Section 13.
2. Add execution timing metrics (latency breakdown per step).
3. Handle timeouts or HF failures gracefully: return structured error message instead of 500 crash.
4. Integration test running the full pipeline on a sample image fixture.
```

---

### PR 10: `test(pipeline): build automated test suite and validation benchmarks`
**Name:** Lakshya  
**Area:** Computer Vision & Analysis Pipeline (`src/`, `configs/`, `tests/`)  
**Prompt:**
```text
Build a test harness and validation benchmark script to evaluate measurement accuracy.
Target files: tests/test_validation_benchmarks.py, data/validation_manifest.json, scripts/run_benchmarks.py.

Requirements:
1. Create data/validation_manifest.json with metadata schema for test images:
   - image_path, species, breed, tape_height_cm, tape_length_cm, expert_stature_score.
2. Implement scripts/run_benchmarks.py:
   - Run pipeline over validation images in data/.
   - Compute Mean Absolute Error (MAE) for height_at_withers and body_length against ground truth tape measurements.
   - Compute score agreement percentage (within 1 score point) against expert scores.
   - Assert Section 15 metrics: height within 3cm tolerance on test set.
   - Output summary markdown table of results.
3. Add CI test command in Makefile or package script to run all unit and validation tests.
```

---

### PR 11: `chore(api): scaffold express typescript backend and env config`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Scaffold the Node.js Express backend API with TypeScript.
Target directory: api/.

Requirements:
1. Initialize package.json with dependencies: express, cors, dotenv, helmet, morgan, multer, pg, zod, jsonwebtoken, bcryptjs, ts-node, typescript, @types/*.
2. Setup tsconfig.json and project structure:
   - api/src/index.ts (entry point)
   - api/src/app.ts (Express app configuration)
   - api/src/routes/
   - api/src/controllers/
   - api/src/services/
   - api/src/middlewares/
   - api/src/config/
3. Configure environment variables via api/.env.example: PORT, DATABASE_URL, JWT_SECRET, ANALYSIS_SERVICE_URL, BPA_MOCK_URL.
4. Add health check endpoint GET /api/health returning status, uptime, and database connection state.
5. Setup npm scripts: dev, build, start, lint, test.
```

---

### PR 12: `feat(db): setup postgres docker-compose and knex/prisma migrations`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Setup PostgreSQL database with Docker Compose and initial database migration schema based on PRD Section 12.
Target files: docker-compose.yml, api/prisma/schema.prisma (or Knex migrations in api/src/db/migrations/).

Requirements:
1. Create docker-compose.yml with:
   - postgres:15 service with healthcheck, persistent volume, and exposed port 5432.
2. Implement relational schema covering:
   - users (id, name, email, password_hash, role ['typer', 'supervisor', 'admin'], created_at)
   - animals (id, tag_id UNIQUE, species, breed, owner_name, village, created_at)
   - evaluations (id, animal_id, evaluator_id, status ['draft', 'analyzed', 'confirmed', 'synced'], overall_score, pipeline_version, created_at, updated_at)
   - images (id, evaluation_id, view_type ['side', 'rear', 'front'], file_path, quality_flags JSONB)
   - landmarks (id, evaluation_id, name, estimated_pos JSONB, corrected_pos JSONB, confidence FLOAT)
   - measurements (id, evaluation_id, name, value FLOAT, unit, confidence FLOAT)
   - trait_scores (id, evaluation_id, trait_name, ai_score INT, final_score INT, override_reason TEXT)
   - bpa_sync (id, evaluation_id, status ['pending', 'synced', 'failed'], attempts INT, last_error TEXT, synced_at TIMESTAMP)
3. Add seed script (api/prisma/seed.ts or db/seed.js) creating default admin and field typer accounts.
```

---

### PR 13: `feat(auth): implement jwt auth and role-based access control`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement authentication and role-based access control middleware in the Express API.
Target files: api/src/routes/auth.ts, api/src/controllers/auth.controller.ts, api/src/middlewares/auth.middleware.ts.

Requirements:
1. Endpoint POST /api/auth/login:
   - Validate email/password using Zod schema.
   - Verify hashed password with bcrypt.
   - Generate JWT containing { userId, role, name }.
   - Return { token, user: { id, name, role, email } }.
2. Middleware authenticateToken:
   - Parse Bearer token from Authorization header.
   - Verify token signature, attach user to request object req.user.
3. Middleware authorizeRoles(...allowedRoles: string[]):
   - Check if req.user.role is authorized, otherwise return 403 Forbidden.
4. Add route GET /api/auth/me to return current session user profile.
5. Unit tests covering login success, invalid password, expired token, and forbidden role access.
```

---

### PR 14: `feat(animals): implement animal registration and tag lookup api`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement animal registry CRUD endpoints for field typers.
Target files: api/src/routes/animals.ts, api/src/controllers/animals.controller.ts, api/src/services/animals.service.ts.

Requirements:
1. Endpoint POST /api/animals:
   - Validate body: tag_id (unique string), species ('cattle' | 'buffalo'), breed (string), owner_name (string), village (string).
   - If tag_id already exists, return 409 Conflict.
   - Save to database and return created animal record.
2. Endpoint GET /api/animals:
   - Query param ?tag= to search by tag ID prefix or exact match.
   - Return animal details along with count of previous evaluations.
3. Endpoint GET /api/animals/:id:
   - Return animal profile and past evaluation history summary.
4. Input validation using Zod. Protected with authenticateToken.
5. Unit tests testing tag search, creation, and duplicate tag prevention.
```

---

### PR 15: `feat(evaluations): implement image upload and draft evaluation creation`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement multipart image upload handling and evaluation draft creation.
Target files: api/src/routes/evaluations.ts, api/src/controllers/evaluations.controller.ts, api/src/services/storage.service.ts.

Requirements:
1. Configure multer storage with disk destination (uploads/evaluations/) and filename sanitization (UUID + timestamp).
2. Validate incoming files: allowed mime types (image/jpeg, image/png), max file size 10MB.
3. Endpoint POST /api/evaluations:
   - Accepts multipart/form-data:
     - Fields: animal_id (UUID), view_type ('side' default).
     - File: image (required).
   - Verify animal exists.
   - Insert evaluation record with status 'pending_analysis' and link current evaluator (req.user.id).
   - Insert image record with stored file path and view type.
   - Return 201 with { evaluation_id, status, image_url }.
4. Ensure uploaded directory is served or accessible via secure static route.
5. Unit tests testing upload validation (file size limit, invalid file extension, missing animal_id).
```

---

### PR 16: `feat(integration): connect express api to python analysis service`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement HTTP client to call Python analysis service and persist results.
Target files: api/src/services/analysis.service.ts, updating api/src/controllers/evaluations.controller.ts.

Requirements:
1. Create AnalysisClient service using axios or fetch:
   - Configurable base URL ANALYSIS_SERVICE_URL (default: http://localhost:8000).
   - Method analyzeSideView(imagePath: string, species: string, breed: string):
     - Sends multipart request to Python POST /predict.
     - Timeout handling (15s) with structured error if analysis service is unavailable.
2. Update evaluation creation flow or add POST /api/evaluations/:id/analyze:
   - Fetch evaluation and image from DB.
   - Call analysis service.
   - If analysis returns quality errors: update evaluation status to 'failed_quality', store flags in image record, return flags to client.
   - If analysis succeeds:
     - Save landmarks to landmarks table (estimated_pos, confidence).
     - Save measurements to measurements table (name, value, unit, confidence).
     - Save trait scores to trait_scores table (trait_name, ai_score, final_score = ai_score).
     - Update evaluation overall_score, pipeline_version, and status to 'analyzed'.
3. Return full evaluation entity to caller.
4. Add mock testing using nock or axios-mock-adapter.
```

---

### PR 17: `feat(evaluations): implement evaluation listing, details, and filtering api`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement endpoints to view, list, and filter evaluation records.
Target files: api/src/routes/evaluations.ts, api/src/controllers/evaluations.controller.ts.

Requirements:
1. Endpoint GET /api/evaluations:
   - Query filters: page, limit, species, breed, status, village, evaluator_id, from_date, to_date.
   - Join with animals and users (evaluator) tables.
   - Return paginated results: { data: [...], pagination: { total, page, limit, totalPages } }.
2. Endpoint GET /api/evaluations/:id:
   - Return complete aggregate evaluation record:
     - Animal info
     - Evaluator info
     - Images list with URLs and quality flags
     - Landmarks (estimated and corrected)
     - Measurements
     - Trait scores (AI score, final score, override reason)
     - BPA sync status
3. Enforce role permissions: typers see their own or village evaluations; supervisors/admins see all.
4. Integration tests verifying pagination and multi-column filtering.
```

---

### PR 18: `feat(evaluations): implement landmark patch and score override audit api`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement landmark adjustment and manual score override endpoints with audit tracking.
Target files: api/src/routes/evaluations.ts, api/src/services/evaluations.service.ts.

Requirements:
1. Endpoint PATCH /api/evaluations/:id/landmarks:
   - Body: { landmarks: { [name: string]: { x: number, y: number } } }.
   - Fetch evaluation and pixels_per_cm scale.
   - Call Python analysis service POST /recompute.
   - Update landmarks table: set corrected_pos = new coordinates.
   - Update measurements and trait_scores tables with recomputed values.
   - Return updated evaluation record.
2. Endpoint PATCH /api/evaluations/:id/scores:
   - Body: { scores: [{ trait_name: string, final_score: number, override_reason: string }] }.
   - Validate scores are integers between 1 and 9.
   - Require override_reason (string, min 5 chars).
   - Update trait_scores table: final_score and override_reason.
   - Recalculate evaluation overall_score.
   - Update evaluation status to 'confirmed'.
3. Unit tests asserting audit history and rejection of invalid score overrides.
```

---

### PR 19: `feat(export): implement csv and json evaluation export endpoints`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement evaluation data export in CSV and JSON formats for supervisors and program officers.
Target files: api/src/routes/export.ts, api/src/services/export.service.ts.

Requirements:
1. Endpoint GET /api/evaluations/export:
   - Query params: format ('csv' | 'json'), from_date, to_date, breed, species.
   - Role check: Supervisor or Admin only.
2. JSON export:
   - Return structured array of evaluations matching standard livestock phenotype export schema.
   - Content-Disposition: attachment; filename="evaluations_export_<timestamp>.json".
3. CSV export:
   - Flatten evaluation records into columns:
     evaluation_id, tag_id, species, breed, owner_name, village, evaluator_name, date,
     height_at_withers_cm, body_length_cm, body_depth_cm, rump_angle_deg,
     stature_score, body_length_score, body_depth_score, rump_angle_score,
     overall_score, bpa_sync_status.
   - Stream CSV response using csv-stringify or json2csv.
   - Content-Disposition: attachment; filename="evaluations_export_<timestamp>.csv".
4. Unit tests checking header format and data integrity of exported files.
```

---

### PR 20: `feat(bpa): implement bpa mapping adapter, mock server, and sync retry`
**Name:** Priyanshu  
**Area:** Backend API, PostgreSQL DB & BPA Integration (`api/`, `docker-compose.yml`)  
**Prompt:**
```text
Implement the Bharat Pashudhan App (BPA) integration adapter, mock endpoint, and sync retry flow.
Target files: api/src/services/bpa.adapter.ts, api/src/mock/bpa.mock.ts, api/src/routes/bpa.ts.

Requirements:
1. Create BPA adapter interface and transformer:
   - Map internal evaluation model to BPA ATC payload schema:
     {
       "tagId": string,
       "evaluatorCode": string,
       "evaluationTimestamp": string,
       "linearScores": { "stature": number, "bodyLength": number, "bodyDepth": number, "rumpAngle": number },
       "overallScore": number,
       "deviceMetadata": { "pipelineVersion": string }
     }
2. Create mock BPA HTTP endpoint (POST /mock/bpa/atc-records):
   - Randomly simulate: 80% HTTP 200 Success with {"bpaReferenceId": "BPA-xxxx"}, 10% HTTP 500 Failure, 10% network timeout.
3. Endpoint POST /api/evaluations/:id/sync-bpa:
   - Fetch evaluation and check if status is 'confirmed'.
   - Record entry in bpa_sync table with status 'pending' and increment attempts counter.
   - Call BPA endpoint.
   - If success: update bpa_sync status = 'synced', record synced_at.
   - If failure: update bpa_sync status = 'failed', save last_error message.
4. Return current sync state to client.
5. Unit tests testing successful sync, payload mapping validation, and retry state progression.
```

---

### PR 21: `chore(app): scaffold react vite pwa with tailwind css and router`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Scaffold the frontend mobile-first PWA for Auto-ATC.
Target directory: app/.

Requirements:
1. Initialize Vite React project with TypeScript:
   - Install tailwindcss, postcss, autoprefixer, react-router-dom, lucide-react, vite-plugin-pwa, axios.
2. Configure Tailwind CSS with mobile-first sunlight-readable theme (high contrast, clear typography, large touch targets min 48px).
3. Setup vite-plugin-pwa in vite.config.ts with manifest:
   - name: "Auto-ATC"
   - short_name: "AutoATC"
   - theme_color: "#16a34a"
   - icons for 192x192 and 512x512.
4. Setup React Router in app/src/App.tsx with route layout and placeholders:
   - /login
   - /dashboard
   - /animals/new
   - /evaluations/capture
   - /evaluations/:id/adjust
   - /evaluations/:id/review
   - /evaluations
5. Create mobile navigation shell with bottom navigation bar (Home, New Scan, History, Profile).
```

---

### PR 22: `feat(ui): implement login screen and auth session state`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement authentication UI and session management in the React app.
Target files: app/src/pages/Login.tsx, app/src/context/AuthContext.tsx, app/src/services/api.ts.

Requirements:
1. Create AuthContext providing: user, token, login(email, password), logout(), isAuthenticated, role.
2. Configure Axios instance in app/src/services/api.ts with request interceptor attaching Bearer token from localStorage.
3. Build Login page:
   - Clean, outdoor-friendly UI with high contrast input fields for Email and Password.
   - "Remember Me" toggle and role indicator.
   - Clear error alert for invalid credentials.
   - Loading spinner state during API request.
   - Redirect to /dashboard upon successful login.
4. Add ProtectedRoute component checking authentication and redirecting unauthorized users to /login.
5. Add unit tests for AuthContext and Login form submission.
```

---

### PR 23: `feat(ui): implement animal tag lookup and registration form`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement animal identification and selection workflow before image capture.
Target files: app/src/pages/AnimalLookup.tsx, app/src/components/AnimalFormModal.tsx.

Requirements:
1. Tag lookup screen:
   - Large numeric/alphanumeric search bar for Animal Tag ID.
   - Debounced search query against backend GET /api/animals?tag=.
   - If animal found: display card with Tag ID, Species, Breed, Village, Owner, and "Start Evaluation" button navigating to /evaluations/capture?animalId=...
   - If not found: show empty state with "Register New Animal" action.
2. Registration modal/form:
   - Fields: Tag ID (required), Species (Dropdown: "Cattle" | "Buffalo"), Breed (Dropdown dependent on species: Gir, Sahiwal, Murrah, Other), Owner Name, Village.
   - Form validation with error messages.
   - On submit, call POST /api/animals, select the newly created animal, and transition to capture.
3. Sunlight-friendly UI styling with large clickable cards.
```

---

### PR 24: `feat(camera): implement camera capture with alignment overlay and level sensor`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement the camera capture interface with live guidance overlay and device orientation level check.
Target files: app/src/pages/CaptureScreen.tsx, app/src/components/GuidanceOverlay.tsx, app/src/hooks/useDeviceOrientation.ts.

Requirements:
1. Device orientation hook (useDeviceOrientation):
   - Listen to window DeviceOrientationEvent (gamma/beta angles).
   - Calculate phone tilt. Provide isLevel: boolean (tolerance within +/- 5 degrees from vertical perpendicular).
2. Camera capture view:
   - HTML5 video stream using navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).
   - Fallback file input (<input type="file" accept="image/*" capture="environment">) for browsers without direct stream support.
3. Overlay HUD (GuidanceOverlay):
   - Translucent silhouette outline of cow side-profile to assist framing.
   - ArUco marker placement indicator box on the ground plane.
   - Level indicator bubble: turns green when phone is level, red with warning text ("Tilt camera perpendicular to ground") when misaligned.
   - Distance guidance tip: "Ensure all 4 hooves and full body are inside frame".
4. Capture action button: disabled if camera not level (with override toggle option).
5. On capture, pass image blob to review/preview step.
```

---

### PR 25: `feat(ui): implement image preview and quality check feedback modal`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement image preview, quality validation feedback, and upload progress UI.
Target files: app/src/pages/ImagePreview.tsx, app/src/components/QualityWarningModal.tsx.

Requirements:
1. Preview captured image with "Retake" and "Analyze Photo" buttons.
2. On click "Analyze Photo":
   - Show progress modal with animated steps: "Checking image quality...", "Contacting Hugging Face AI...", "Calculating scale and landmarks...".
   - Upload image to POST /api/evaluations and trigger analysis.
3. If backend returns quality flags (blurry, too_dark, too_bright, marker_missing):
   - Display QualityWarningModal listing specific issues with plain-language advice:
     - Blurry: "Hold phone steady or tap to focus."
     - Too dark: "Move to a well-lit area or face the sunlight."
     - Marker missing: "Ensure reference marker is placed on ground near animal."
   - Provide "Retake Photo" (recommended) and "Proceed Anyway" buttons.
4. If analysis succeeds, navigate directly to /evaluations/:id/adjust.
```

---

### PR 26: `feat(canvas): implement interactive landmark adjustment canvas`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement an interactive canvas component allowing field typers to inspect and drag anatomical landmarks.
Target files: app/src/pages/LandmarkAdjustment.tsx, app/src/components/LandmarkCanvas.tsx.

Requirements:
1. LandmarkCanvas component:
   - Render captured animal image scaled onto HTML5 <canvas> or SVG viewport with zoom and pan support.
   - Render landmark points (withers, shoulder_point, hip_point, pin_bone, brisket, front_hoof, rear_hoof) as colored draggable nodes with visible labels.
   - Connect anatomical points with faint guideline lines (e.g., wither to hoof for height, shoulder to pin for length, hip to pin for rump slope).
2. Interaction:
   - Touch/drag support optimized for mobile fingers (hitbox >= 32px radius around points).
   - On point drag, update coordinates in state in real-time.
   - "Reset to AI Default" button to restore initial positions.
3. "Confirm Landmarks" button:
   - Calls PATCH /api/evaluations/:id/landmarks with updated coordinates.
   - Shows brief recalculating spinner.
   - Navigates to /evaluations/:id/review on completion.
4. Add unit/component tests for touch events and coordinate scaling.
```

---

### PR 27: `feat(ui): implement evaluation results review and score override screen`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement the evaluation results review screen displaying measurements, scores, and manual override dialog.
Target files: app/src/pages/EvaluationReview.tsx, app/src/components/ScoreOverrideModal.tsx.

Requirements:
1. Results display:
   - Top card: Animal Tag ID, Breed, Overall Score (large badge, 1-100), Status.
   - Body measurements section: Height at withers (cm), Body length (cm), Body depth (cm), Rump angle (degrees).
   - Trait scores section (1-9 linear scale): Stature, Body Length, Body Depth, Rump Angle with horizontal visual gauge bars.
2. Score override:
   - Each trait score has an "Edit" / "Override" button.
   - Opens ScoreOverrideModal: slider or number picker (1 to 9), required text field for "Reason for Override" (e.g., "Animal stood on slope", "Shadow obscured brisket").
   - Dispatches PATCH /api/evaluations/:id/scores.
   - Shows badge "Modified" next to overridden scores.
3. Primary action footer:
   - "Save & Push to BPA" button.
   - "Save as Draft" button.
```

---

### PR 28: `feat(ui): implement past evaluations history, search, and filters`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement the evaluations history list with search, filtering, and detail navigation.
Target files: app/src/pages/EvaluationHistory.tsx, app/src/components/EvaluationCard.tsx, app/src/components/FilterDrawer.tsx.

Requirements:
1. Screen layout:
   - Search bar: filter by Tag ID or village.
   - Filter chips: All, Cattle, Buffalo, Synced, Pending Sync.
   - FilterDrawer modal: filter by date range, breed, and score range.
2. EvaluationCard component:
   - Animal thumbnail, Tag ID, Species/Breed, Date, Overall Score badge.
   - BPA Sync status badge: Green "Synced", Orange "Pending", Red "Sync Failed".
   - Tap card opens full evaluation summary.
3. Pagination / infinite scroll fetching from GET /api/evaluations.
4. Empty state with clear message and "Start New Evaluation" button.
```

---

### PR 29: `feat(ui): implement export triggers and bpa sync status widget`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement BPA synchronization controls and data export UI.
Target files: app/src/components/BpaSyncWidget.tsx, app/src/components/ExportModal.tsx, app/src/pages/EvaluationDetail.tsx.

Requirements:
1. BpaSyncWidget component:
   - Displays real-time sync status: "Synced with BPA (Ref: BPA-1234)", "Sync Pending", or "Sync Error: Connection Timeout".
   - "Retry Sync" button triggering POST /api/evaluations/:id/sync-bpa.
   - Shows animated spinner while syncing and toast notification on success/failure.
2. ExportModal component (for supervisors):
   - Triggered from history or header menu.
   - Radio selector: "CSV Spreadsheet" or "JSON Records".
   - Date range selector.
   - "Download Export" button triggering download from GET /api/evaluations/export?format=...
3. Add toast feedback notification system for download completions.
```

---

### PR 30: `feat(pwa): implement offline capture caching and service worker sync`
**Name:** Manoj  
**Area:** Frontend React PWA & Interactive UI (`app/`)  
**Prompt:**
```text
Implement offline capability for remote field evaluations using IndexedDB and Service Worker caching.
Target files: app/src/services/offlineStorage.ts, app/src/sw.ts, app/src/components/OfflineBanner.tsx.

Requirements:
1. Offline state detection:
   - Hook useNetworkStatus monitoring navigator.onLine and online/offline events.
   - Display Persistent OfflineBanner: "Working Offline - evaluations will be queued locally".
2. IndexedDB storage service (offlineStorage.ts):
   - Store offline drafts: animal details, image blob, timestamp.
   - Methods: saveDraft(evaluation), getQueuedDrafts(), removeDraft(id).
3. Background sync flow:
   - When network restores, prompt user: "You have X evaluations pending upload. Sync now?"
   - Sequential batch upload to POST /api/evaluations.
4. Cache UI assets via Vite PWA Workbox configuration so the app loads fully without network.
5. Unit tests validating IndexedDB persistence and queue flushing.
```

---

## Workflow Rules for Team

- **Branch naming:** `feat/<member>-<task-desc>`, e.g. `feat/lakshya-cv-marker-scale`
- **Commits:** Conventional Commits (`feat: ...`, `fix: ...`, `test: ...`, `chore: ...`)
- **Review policy:** 1 approval required before merge to `main`.
- **Merge sequence:**
  1. **PR 1, PR 11, PR 21** (Scaffolding across services).
  2. **PR 12** (PostgreSQL schema), **PR 2–PR 5** (Core CV & HF modules), **PR 22–PR 24** (Auth UI & Camera capture).
  3. **PR 6–PR 9** (Measurement & Pipeline), **PR 15–PR 18** (API wiring & recompute), **PR 25–PR 27** (Canvas adjustment & review UI).
  4. **PR 19–PR 20** (BPA sync & exports), **PR 28–PR 30** (History, offline PWA), **PR 10** (Validation benchmarks).
