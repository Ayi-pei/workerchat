# Manual Testing Guide: Admin & Agent Authentication

This guide outlines steps to manually test the admin APIs for agent key management and the agent WebSocket connection authentication.

## I. Prerequisites

1.  **Node.js and npm:** Ensure you have a recent version installed.
2.  **Project Setup:** Clone the repository and run `npm install`.
3.  **Terminal:** You'll need a terminal for `curl` commands and potentially `websocat`.
4.  **WebSocket Tool (Optional but Recommended):**
    *   `websocat`: A versatile command-line WebSocket client. Installation varies by OS (e.g., `brew install websocat` on macOS).
    *   `wscat`: Another Node.js based WebSocket client (`npm install -g wscat`).
    *   Browser DevTools: You can also use the browser's console to run simple WebSocket connection scripts.

## II. Starting the Development Server

1.  Open your terminal in the project's root directory.
2.  Run the command:
    ```bash
    npm run dev
    ```
    This will typically start the development server (using Wrangler for PartyKit) on `http://localhost:1999` (or another port if configured). Observe the terminal output for the correct URL and server logs. Let's assume `http://localhost:1999` for this guide.

## III. Testing Admin APIs for Agent Key Management

Use `curl` or a similar tool (like Postman) for these tests.

### A. Get Agent Keys (Unauthorized)

*   **Command:**
    ```bash
    curl http://localhost:1999/admin/agent_keys
    ```
*   **Expected Server Log:**
    *   `Admin request detected for path: /admin/agent_keys`
    *   `Admin request REJECTED: Missing or invalid X-Admin-Key header.`
*   **Expected Response:**
    *   HTTP Status: `401 Unauthorized`
    *   Body: `Unauthorized: Missing or invalid admin key`

### B. Get Agent Keys (Authorized)

*   **Command:**
    ```bash
    curl -H "X-Admin-Key: adminayi888" http://localhost:1999/admin/agent_keys
    ```
*   **Expected Server Log (AdminStateDO):**
    *   `AdminStateDO: Received fetch - Method: GET, Path: /admin/agent_keys`
    *   `AdminStateDO: Handling GET /admin/agent_keys`
*   **Expected Response:**
    *   HTTP Status: `200 OK`
    *   Body: A JSON array of 30 agent key objects. Each object should have:
        *   `seatId` (number from 1 to 30)
        *   `nanoid` (a 16-character string)
        *   `createdAt` (ISO date string)
        *   `expiresAt` (ISO date string, should be end of current day or next day if initialized after EOD)
        *   `isActive` (boolean, should be `true` for all initially)
    *   **Action:** Note down a `nanoid` and its corresponding `seatId` from the response for use in later tests (e.g., `SEAT_ID_TO_TEST=1`, `NANOID_TO_TEST=...`).

### C. Regenerate Agent Key (Unauthorized)

*   **Command (using `SEAT_ID_TO_TEST` from step B, e.g., 1):**
    ```bash
    curl -X POST http://localhost:1999/admin/agent_keys/1/regenerate
    ```
*   **Expected Server Log:**
    *   `Admin request detected for path: /admin/agent_keys/1/regenerate`
    *   `Admin request REJECTED: Missing or invalid X-Admin-Key header.`
*   **Expected Response:**
    *   HTTP Status: `401 Unauthorized`

### D. Regenerate Agent Key (Authorized - Valid Seat ID)

*   **Command (using `SEAT_ID_TO_TEST`):**
    ```bash
    curl -X POST -H "X-Admin-Key: adminayi888" http://localhost:1999/admin/agent_keys/1/regenerate
    ```
*   **Expected Server Log (AdminStateDO):**
    *   `AdminStateDO: Received fetch - Method: POST, Path: /admin/agent_keys/1/regenerate`
    *   `AdminStateDO: Handling POST /admin/agent_keys/1/regenerate`
    *   `AdminStateDO: Regenerated key for seatId 1.`
*   **Expected Response:**
    *   HTTP Status: `200 OK`
    *   Body: A JSON object for the updated agent key (e.g., for seat 1). Verify its `nanoid` and `expiresAt` have changed from what you noted in step B. `isActive` should be `true`.
*   **Follow-up:**
    *   Repeat **Test B** (`curl -H "X-Admin-Key: adminayi888" http://localhost:1999/admin/agent_keys`).
    *   Verify that the key for `SEAT_ID_TO_TEST` in the full list now shows the new `nanoid` and `expiresAt` values. Note the new `nanoid` for this seat for Section IV tests.

### E. Regenerate Agent Key (Authorized - Invalid Seat ID)

*   **Command:**
    ```bash
    curl -X POST -H "X-Admin-Key: adminayi888" http://localhost:1999/admin/agent_keys/99/regenerate
    ```
*   **Expected Server Log (AdminStateDO):**
    *   `AdminStateDO: Received fetch - Method: POST, Path: /admin/agent_keys/99/regenerate`
    *   `AdminStateDO: Handling POST /admin/agent_keys/99/regenerate`
    *   `AdminStateDO: SeatId 99 not found for regeneration.`
*   **Expected Response:**
    *   HTTP Status: `404 Not Found`
    *   Body: `Agent key not found for seat_id: 99`

## IV. Testing Agent WebSocket Connection Authentication

Replace `YOUR_VALID_NANOID` with a key obtained from **Test B** or **Test D**.
Replace `ROOM_NAME` with any string (e.g., `testroom`).

### F. Connect Agent with Valid Key

*   **Command (using `websocat`):**
    ```bash
    websocat ws://localhost:1999/ROOM_NAME/agent/YOUR_VALID_NANOID
    ```
*   **Expected Server Log (Chat DO):**
    *   `Chat DO: Potential agent connection from ... with key YOUR_VALID_NANOID for room ROOM_NAME`
    *   `Chat DO: AGENT AUTH SUCCESS - Key YOUR_VALID_NANOID validated for agentId (nanoid): YOUR_VALID_NANOID (Seat ...). Connection ID: ...`
    *   `makeAgentAvailable called for agentId: YOUR_VALID_NANOID. ...`
    *   `Agent YOUR_VALID_NANOID made available. ...`
*   **Expected `websocat` Output:**
    *   Connection remains open. You can try typing messages.

### G. Connect Agent with Invalid Key

*   **Command (using `websocat`):**
    ```bash
    websocat ws://localhost:1999/ROOM_NAME/agent/THIS_IS_AN_INVALID_KEY
    ```
*   **Expected Server Log (Chat DO & AdminStateDO):**
    *   `Chat DO: Potential agent connection from ... with key THIS_IS_AN_INVALID_KEY ...`
    *   (AdminStateDO) `AdminStateDO: Received fetch - Method: GET, Path: /_internal/validate_agent_key/THIS_IS_AN_INVALID_KEY`
    *   (AdminStateDO) `AdminStateDO: VALIDATION FAILED - Key THIS_IS_AN_INVALID_KEY not found.` (or similar if key format is different than 16 chars)
    *   `Chat DO: AGENT AUTH FAILED - Key THIS_IS_AN_INVALID_KEY invalid. Reason: 404 Not Found. Closing connection ...`
*   **Expected `websocat` Output:**
    *   Connection is closed by the server, likely with code 1008. `websocat` might show "Connection refused" or "Connection closed".

### H. Connect Agent with Expired Key (Conceptual / How to Simulate)

*   **Simulation Strategy 1 (Easiest if keys are fresh):**
    1.  In `src/server/admin_do.ts`, inside `initializeAgentKeys()`, temporarily change the expiry logic for one key to be in the past. E.g., for `seatId === 1`:
        ```typescript
        // Inside initializeAgentKeys loop
        let tempExpiresAtISO = expiresAtISO;
        if (i === 1) { // For seatId 1
            tempExpiresAtISO = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
            console.log(`AdminStateDO: DEBUG - Setting seatId 1 to expire at ${tempExpiresAtISO}`);
        }
        // ... then use tempExpiresAtISO for this key
        // expiresAt: tempExpiresAtISO,
        ```
    2.  Restart the dev server. This might clear the DO storage or it might persist. If it clears, the first admin call to `/admin/agent_keys` will initialize new keys with this debug logic.
    3.  Use the `nanoid` for seat 1 (obtained from `GET /admin/agent_keys`) to attempt connection.
*   **Simulation Strategy 2 (If keys persist and one is old):**
    *   If you have a key that was generated more than 24 hours ago (or before the last end-of-day cut-off), use that key.
*   **Command (using `websocat` with the "expired" NANOID):**
    ```bash
    websocat ws://localhost:1999/ROOM_NAME/agent/YOUR_EXPIRED_NANOID
    ```
*   **Expected Server Log (Chat DO & AdminStateDO):**
    *   `Chat DO: Potential agent connection ...`
    *   (AdminStateDO) `AdminStateDO: Received fetch ... /_internal/validate_agent_key/YOUR_EXPIRED_NANOID`
    *   (AdminStateDO) `AdminStateDO: VALIDATION FAILED - Key YOUR_EXPIRED_NANOID (...) has expired. ...`
    *   `Chat DO: AGENT AUTH FAILED - Key YOUR_EXPIRED_NANOID invalid. Reason: 403 Forbidden. Closing connection ...`
*   **Expected `websocat` Output:**
    *   Connection closed by server (e.g., code 1008).

### I. Connect as Customer (for Comparison)

*   **Command (using `websocat`):**
    ```bash
    websocat ws://localhost:1999/ROOM_NAME/customer_anything
    # Or just ws://localhost:1999/ROOM_NAME if that's the customer pattern
    ```
    *(Adjust URL based on how customer connections are identified by the `Chat` DO's `onConnect` logic if it's not simply non-agent URLs. The current code treats any non-`/agent/` path as customer for that room).*
*   **Expected Server Log (Chat DO):**
    *   `Chat DO: Customer connected. ID: ... Room: ROOM_NAME`
    *   Potentially logs about queueing or `no_agents_available` if no agents are connected and available.
*   **Expected `websocat` Output:**
    *   Connection remains open.

---
This guide should provide a good basis for testing the implemented backend features. Remember to replace placeholders like `xxxx`, `ROOM_NAME`, `YOUR_VALID_NANOID`, etc., with actual values from your testing environment.
