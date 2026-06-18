# AI Collaboration Log (AI_LOG.md)

This log provides a "peek behind the curtain" of how the AI Agent (Antigravity) and the developer collaborated to design, implement, and containerize the Pulse Uptime Monitor application.

---

## 🛠️ The AI Tech Stack

- **Primary AI Agent:** Antigravity (Advanced Agentic Coding Assistant by Google DeepMind)
- **Underlying LLM:** Gemini 3.5 Flash (High)
- **Environment:** Windows 11 Shell, Node.js v22.17, Docker v28.4
- **Capabilities Used:** 
  - Directory listing & file views for scaffolding inspection.
  - File generation (`write_to_file`) and code modification (`replace_file_content`).
  - Terminal access (`run_command`) for checking system capabilities, scaffolding projects, and executing help commands.

---

## 📝 The Prompts that Shipped It

Here is the sequence of key directives and structural prompts that generated the codebase:

1. **Environment Discovery:**
   - *Prompt:* `node -v; npm -v; docker -v` (to determine if Docker and Node versions support Vite, Express, and multi-stage containerization).
2. **Backend API Generation:**
   - *Prompt:* Express API server creation with an in-memory scheduler executing HTTP `fetch` requests with an `AbortController` timeout, database connection setup with standard pool retry logic, and standard endpoints for monitors CRUD and history.
3. **Frontend Project Initialization:**
   - *Prompt:* `npx -y create-vite --help` followed by `npx -y create-vite frontend --template react --no-interactive` to initialize the project according to Vite frameworks guidelines.
4. **Glassmorphic Design Integration:**
   - *Prompt:* Full overwrite of global styles (`index.css`) and creation of application-specific layout rules (`App.css`) defining glassmorphic filters (`backdrop-filter`), keyframe animations for online/offline pulses, and custom CSS tooltips.
5. **Vite React Implementation:**
   - *Prompt:* Implementing state routines for polling (every 15 seconds), form validation, and drawing a custom responsive sparkline path utilizing dynamic SVG coordinate math.

---

## 🔄 The Course Corrections

Below are two key instances where the AI corrected its execution path to deliver clean, working code:

### 1. Tool-Call Parameter Constraint Correction
- **The Issue:** While trying to write the backend `/backend/package.json` file, the AI included the `ArtifactMetadata` object. The system returned an error:
  ```
  c:\Users\Acer\Desktop\Epifi Technologies\backend\package.json is not a valid artifact path; artifacts must be in C:\Users\Acer\.gemini\antigravity\brain\...
  ```
- **The Rationale:** In the Antigravity system, `ArtifactMetadata` is strictly reserved for planning-mode files (like `task.md`, `implementation_plan.md`, `walkthrough.md`) placed inside the dedicated brain/conversation directory. It cannot be used for writing normal codebase files to the workspace.
- **The Correction:** The agent analyzed the error, removed the `ArtifactMetadata` block, kept `Overwrite: true`, and called the tool again to successfully create `backend/package.json`.

### 2. Vite Build-Time Variable Injection in Docker
- **The Issue:** The React frontend uses client-side JavaScript that executes in the user's browser, meaning it needs access to the backend API endpoint address. In standard Docker configurations, environment variables passed via `docker-compose.yml` to a containerized React app are not visible to the browser client at runtime because the static bundle is compiled inside the container.
- **The Rationale:** Vite only bakes environment variables starting with `VITE_` into the static distribution folder (`/dist`) during the `npm run build` command.
- **The Correction:** The agent modified `/frontend/Dockerfile` to declare a build-time argument `ARG VITE_API_URL` and exported it as `ENV VITE_API_URL` prior to building. In `docker-compose.yml`, this arg is mapped as `VITE_API_URL=http://localhost:5000`, which correctly hard-bakes the local API endpoint address into the client bundle at build-time.
