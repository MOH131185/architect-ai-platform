<!-- c0efd4b4-552f-4838-a9b8-bc39fef9374c 48578329-39ce-49f2-bff8-79da584e0c13 -->
# Fix local A1 generation not producing a sheet

### Steps

1. **Confirm correct dev commands**

- Verify you have run either `npm run dev` (recommended) or both `npm start` and `npm run server` in two terminals, so the Express proxy on port 3001 is available.
- Ensure no previous crashed server is still holding port 3001.

2. **Check required environment variables**

- Open your `.env` file and confirm at least `TOGETHER_API_KEY` is set to a real Together API key (not a placeholder) and that the React dev server picked it up (restart if you change it).
- Optionally verify `REACT_APP_GOOGLE_MAPS_API_KEY` and `REACT_APP_OPENWEATHER_API_KEY` are set, though missing keys should not prevent basic A1 generation.

3. **Inspect browser Network panel during generation**

- With DevTools open, click “Generate AI Designs” and watch for requests to `/api/together/chat`, `/api/together/image`, `/api/sheet`, and `/api/overlay`.
- Note whether they:
 - return 404 (likely Express not running or wrong path),
 - return 500 with an error payload (likely env/API issue), or
 - succeed (200) but UI still shows “No A1 sheet available”.

4. **Inspect browser Console for errors**

- Look for React or fetch errors such as `Failed to fetch`, `CORS`, `TOGETHER_API_KEY missing`, or JSON parsing issues when generation is triggered.
- Copy the top 1–2 relevant error messages so we can correlate them with the known pipeline.

5. **Correlate failures to known pipeline points**

- If `/api/together/chat` or `/api/together/image` fail: focus on Express proxy, Together API key, and internet access.
- If those succeed but `/api/sheet` or `/api/overlay` fail: focus on new deterministic export/overlay endpoints.
- If all API calls succeed but UI still shows no image: focus on `SheetResult` wiring between `useArchitectAIWorkflow`, `ArchitectAIWizardContainer`, and `A1SheetViewer`.

6. **Decide next action based on findings**

- If the issue is clearly environment/runtime (servers or env vars), fix commands/config only.
- If the issue is clearly in client wiring (e.g., successful API but empty `sheet` prop), plan a small, targeted code fix in the workflow hook or viewer component.

### To-dos

- [ ] Ensure both React and Express proxy servers are running (use `npm run dev` or `npm start` + `npm run server`).
- [ ] Verify `.env` has a valid TOGETHER_API_KEY and restart dev servers if edited.
- [ ] Use browser DevTools Network tab during generation to inspect `/api/*` requests and their status codes.
- [ ] Check browser Console for errors when clicking “Generate AI Designs” and capture key messages.
- [ ] Based on Network/Console findings, identify whether the failure is at API/proxy level or UI wiring level.