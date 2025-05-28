# Manual Testing Guide for Agent Queue System

This guide outlines steps to manually test the agent queuing and assignment functionality.

## Prerequisites

1.  **Node.js and npm:** Ensure you have a recent version installed.
2.  **Project Setup:** Clone the repository and run `npm install`.

## Starting the Development Server

1.  Open your terminal in the project's root directory.
2.  Run the command:
    ```bash
    npm run dev
    ```
    This will typically start the development server (using Wrangler for PartyKit) on `localhost:1999` (or another port if configured). Observe the terminal output for the correct URL.

## Testing Scenarios

For each scenario, open browser windows/tabs as described and observe the server logs in your terminal. Optionally, you can use the browser's Developer Tools (Network > WS tab) to inspect WebSocket messages.

**Connection URLs:**
*   **Customer:** `http://localhost:1999/[room_name]` (e.g., `http://localhost:1999/test-room`)
*   **Agent:** `http://localhost:1999/[room_name]/agent` (e.g., `http://localhost:1999/test-room/agent`)

Replace `[room_name]` with any string, but ensure it's consistent for users intended to be in the same "room".

---

### Scenario 1: Customer Connects, No Agents Available

1.  **Action:** Open a new browser tab and navigate to a customer URL (e.g., `http://localhost:1999/room1`).
2.  **Server Logs Observation:**
    *   `onConnect`: Log for customer connection (ID, type 'customer').
    *   `enqueueCustomer`: Log for customer being added to `customerQueue`. `customerQueue` before/after.
    *   `assignAgentIfPossible`: Log showing it was called, but no assignment happened (due to no agents).
    *   Message Sent: `customer_queued` (to the customer), `no_agents_available` (to the customer).
3.  **Client Observation (Optional):**
    *   Customer UI should indicate they are waiting.
    *   WebSocket messages: `customer_queued`, `no_agents_available`.

---

### Scenario 2: Agent Connects

1.  **Action:** Open a new browser tab and navigate to an agent URL (e.g., `http://localhost:1999/room1/agent`).
2.  **Server Logs Observation:**
    *   `onConnect`: Log for agent connection (ID, type 'agent').
    *   `makeAgentAvailable`: Log for agent being added to `availableAgents`. `availableAgents` before/after.
    *   Message Sent: `agent_now_available` (broadcasted).
    *   `assignAgentIfPossible`: Log showing it was called.
        *   If Scenario 1 was done first and the customer is still waiting: Assignment should happen. See Scenario 3 logs.
        *   If no customers waiting: No assignment.
3.  **Client Observation (Optional):**
    *   Agent UI should indicate they are available.

---

### Scenario 3: Customer Connects, Agent Becomes Available, Assignment Happens

*This can follow Scenario 1, then have an agent connect (Scenario 2), or have an agent connect first, then a customer.*

1.  **Setup:**
    *   Ensure one customer is waiting in the queue (from Scenario 1).
    *   Connect an agent (Scenario 2).
    *   OR: Connect an agent first, then connect a new customer.
2.  **Server Logs Observation (when assignment occurs):**
    *   `makeAgentAvailable` (if agent just connected).
    *   `assignAgentIfPossible`: Called, assignment happens.
        *   Log customer ID and agent ID.
        *   `dequeueCustomer`: Log for customer being removed from `customerQueue`.
        *   `makeAgentUnavailable`: Log for the assigned agent being removed from `availableAgents`.
        *   Contents of `availableAgents`, `customerQueue`, `activeConversations` after assignment.
    *   Message Sent: `agent_assigned` (to both customer and agent involved).
    *   Message Sent (to other customers in queue): `customer_queued` with updated positions.
3.  **Client Observation (Optional):**
    *   Customer and Agent UIs should update to show they are connected.
    *   WebSocket messages: `agent_assigned`.

---

### Scenario 4: Multiple Customers Connect, Then an Agent Connects

1.  **Action:**
    *   Open 2-3 browser tabs as customers to the same room (e.g., `http://localhost:1999/room2`).
    *   Observe logs for each customer being enqueued (as in Scenario 1).
    *   Then, open 1 browser tab as an agent to `http://localhost:1999/room2/agent`.
2.  **Server Logs Observation:**
    *   Agent connects (`onConnect`, `makeAgentAvailable`).
    *   `assignAgentIfPossible` is called.
    *   First customer is dequeued (`dequeueCustomer`) and assigned to the agent (`agent_assigned`, `makeAgentUnavailable` for the agent).
    *   Logs for `activeConversations`, `availableAgents` (should be empty if only one agent), `customerQueue` (should have remaining customers).
    *   Messages: `agent_assigned` to the pair. `customer_queued` to the remaining customers with updated positions.
3.  **Follow-up:** If another agent connects, the next customer in line should be assigned.

---

### Scenario 5: Agent Disconnects While in Conversation

1.  **Setup:** Have an active conversation between a customer and an agent (from Scenario 3 or 4).
2.  **Action:** Close the agent's browser tab/window.
3.  **Server Logs Observation:**
    *   `onClose`: Log for agent disconnection.
    *   `makeAgentUnavailable`: Agent removed from `availableAgents` (if they weren't already, e.g. if it was an abrupt close).
    *   Active conversation check: Log indicating the agent was in a conversation with a specific customer.
    *   `activeConversations`: Map updated (conversation removed).
    *   Customer re-enqueued: `enqueueCustomer` for the disconnected customer.
    *   Message Sent: System message to customer about agent disconnection (e.g., an 'add' message with content "Your agent has disconnected...").
    *   `assignAgentIfPossible`: Called to see if another agent can take over.
4.  **Client Observation (Optional):**
    *   Customer receives a message about agent disconnecting and being re-queued.

---

### Scenario 6: Customer Disconnects While in Queue

1.  **Setup:** Have a customer waiting in the queue (Scenario 1).
2.  **Action:** Close the customer's browser tab/window.
3.  **Server Logs Observation:**
    *   `onClose`: Log for customer disconnection.
    *   Queue update: Customer ID removed from `customerQueue`. Log `customerQueue` before/after.
    *   (No agent interaction if customer was only in queue).

---

### Scenario 7: Customer Disconnects While in Conversation

1.  **Setup:** Have an active conversation between a customer and an agent.
2.  **Action:** Close the customer's browser tab/window.
3.  **Server Logs Observation:**
    *   `onClose`: Log for customer disconnection.
    *   Active conversation check: Log indicating customer was in conversation with agent.
    *   `activeConversations`: Map updated (conversation removed).
    *   Agent made available: `makeAgentAvailable` for the now-free agent.
    *   Message Sent: System message to agent about customer disconnection.
    *   `assignAgentIfPossible`: Called (as agent became available).
4.  **Client Observation (Optional):**
    *   Agent receives a message that the customer disconnected. Agent becomes available.

---

This guide should help in manually verifying the core server-side logic. Adjust room names and URLs as needed for your local setup.
Happy Testing!
