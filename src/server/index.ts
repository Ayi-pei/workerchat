import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };
  private adminDOStub: DurableObjectStub;

  messages = [] as ChatMessage[];
  customerQueue: string[] = [];
  availableAgents: string[] = [];
  activeConversations: Map<string, string> = new Map(); // customerId (connection.id) -> agentId (nanoid)

  constructor(state: DurableObjectState, env: Env) {
    super(state, env); // Call the parent Server constructor
    const doId = env.ADMIN_STATE_DO.idFromName("admin_singleton_id");
    this.adminDOStub = env.ADMIN_STATE_DO.get(doId);
    console.log("Chat DO: AdminStateDO stub initialized.");
  }

  broadcastMessage(message: Message, exclude?: string[]) {
    console.log(`Broadcasting message: ${message.type}`, message);
    this.broadcast(JSON.stringify(message), exclude);
  }

  sendToConnection(connectionId: string, message: Message) {
    const conn = this.getConnection(connectionId);
    if (conn) {
      console.log(`Sending message to ${connectionId}: ${message.type}`, message);
      conn.send(JSON.stringify(message));
    } else {
      console.log(`Attempted to send message to offline/non-existent connection: ${connectionId}. Message type: ${message.type}`, message);
    }
  }

  onStart() {
    console.log("Server onStart: Initializing...");
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT, userType TEXT)`,
    );

    // load the messages from the database
    const result = this.ctx.storage.sql.exec(
      `SELECT id, user, role, content, userType FROM messages`,
    );
    this.messages = result.results as ChatMessage[];
    console.log("Server onStart: Messages loaded.", this.messages);
  }

  // Agent Availability Management
  makeAgentAvailable(agentId: string) {
    console.log(`makeAgentAvailable called for agentId: ${agentId}. Before: availableAgents = [${this.availableAgents.join(", ")}]`);
    if (!this.availableAgents.includes(agentId)) {
      this.availableAgents.push(agentId);
      console.log(`Agent ${agentId} made available. After: availableAgents = [${this.availableAgents.join(", ")}]`);
      this.broadcastMessage({ type: "agent_now_available", agentId } satisfies Message);
      this.assignAgentIfPossible();
    } else {
      console.log(`Agent ${agentId} was already in availableAgents.`);
    }
  }

  makeAgentUnavailable(agentId: string) {
    console.log(`makeAgentUnavailable called for agentId: ${agentId}. Before: availableAgents = [${this.availableAgents.join(", ")}]`);
    const initialLength = this.availableAgents.length;
    this.availableAgents = this.availableAgents.filter((id) => id !== agentId);
    if (this.availableAgents.length < initialLength) {
      console.log(`Agent ${agentId} made unavailable. After: availableAgents = [${this.availableAgents.join(", ")}]`);
    } else {
      console.log(`Agent ${agentId} was not found in availableAgents.`);
    }
  }

  // Customer Queue Management
  enqueueCustomer(customerId: string) {
    console.log(`enqueueCustomer called for customerId: ${customerId}. Before: customerQueue = [${this.customerQueue.join(", ")}]`);
    if (!this.customerQueue.includes(customerId)) {
      this.customerQueue.push(customerId);
      const position = this.customerQueue.indexOf(customerId) + 1;
      console.log(`Customer ${customerId} enqueued at position ${position}. After: customerQueue = [${this.customerQueue.join(", ")}]`);
      this.sendToConnection(customerId, {
        type: "customer_queued",
        customerId,
        position,
      } satisfies Message);
      this.assignAgentIfPossible();
    } else {
      console.log(`Customer ${customerId} was already in customerQueue.`);
    }
  }

  dequeueCustomer(): string | undefined {
    console.log(`dequeueCustomer called. Before: customerQueue = [${this.customerQueue.join(", ")}]`);
    const customerId = this.customerQueue.shift();
    if (customerId) {
      console.log(`Customer ${customerId} dequeued. After: customerQueue = [${this.customerQueue.join(", ")}]`);
      // Update remaining customers about their new queue position
      this.customerQueue.forEach((id, index) => {
        this.sendToConnection(id, {
          type: "customer_queued",
          customerId: id,
          position: index + 1,
        } satisfies Message);
      });
    } else {
      console.log("dequeueCustomer called but queue was empty.");
    }
    return customerId;
  }

  assignAgentIfPossible() {
    console.log(`assignAgentIfPossible called. Queue length: ${this.customerQueue.length}, Available agents: ${this.availableAgents.length}`);
    if (this.customerQueue.length > 0 && this.availableAgents.length > 0) {
      const customerId = this.dequeueCustomer();
      const agentId = this.availableAgents.shift();

      if (customerId && agentId) {
        // Note: makeAgentUnavailable is called inside assignAgentIfPossible (which is fine, but we already shifted agent from availableAgents)
        // For clarity, we ensure the agent is marked unavailable if not already.
        // this.makeAgentUnavailable(agentId); // This will filter them out if they are still in, or do nothing if already removed.
        // The current logic is: agent is removed from availableAgents by shift(), then makeAgentUnavailable called on them (which will find they are not in the list and log that).
        // This is okay, but could be streamlined. For now, preserving existing calls.
        this.makeAgentUnavailable(agentId);

        this.activeConversations.set(customerId, agentId);
        console.log(`ASSIGNED: Agent ${agentId} to Customer ${customerId}. ActiveConvos: ${this.activeConversations.size}, AvailAgents: [${this.availableAgents.join(", ")}], CustQueue: [${this.customerQueue.join(", ")}]`);

        const assignmentMessage: Message = {
          type: "agent_assigned",
          customerId,
          agentId,
        };
        this.sendToConnection(customerId, assignmentMessage);
        this.sendToConnection(agentId, assignmentMessage);
        // this.broadcastMessage(assignmentMessage); // Changed to specific sends
      } else {
        console.log("assignAgentIfPossible: Could not assign. Customer or Agent ID missing after dequeue/shift.");
        if (customerId) {
          console.log(`Re-enqueuing customer ${customerId} due to missing agent.`);
          this.enqueueCustomer(customerId);
        }
        if (agentId) {
          console.log(`Making agent ${agentId} available again due to missing customer.`);
          this.makeAgentAvailable(agentId);
        }
      }
    } else {
      console.log("assignAgentIfPossible: No assignment possible (queue empty or no agents available).");
    }
  }

  async onConnect(connection: Connection) {
    // const-partykit ConnectionContext is not available here, using connection.request.url
    const url = new URL(connection.request.url);
    const pathSegments = url.pathname.split("/").filter(segment => segment.length > 0);
    // Example agent URL structure: ws://host/room_name/agent/agent_nanoid_key
    // pathSegments might be: ["room_name", "agent", "agent_nanoid_key"]

    let isPotentialAgent = false;
    let agentKeyFromUrl: string | undefined;

    if (pathSegments.length >= 2 && pathSegments[pathSegments.length - 2].toLowerCase() === "agent") {
      agentKeyFromUrl = pathSegments[pathSegments.length - 1];
      isPotentialAgent = true;
      console.log(`Chat DO: Potential agent connection from ${connection.id} with key ${agentKeyFromUrl} for room ${pathSegments[0]}`);
    }

    if (isPotentialAgent && agentKeyFromUrl) {
      try {
        // Use a unique URL for DO-to-DO communication to avoid potential routing conflicts
        const validationRequestUrl = `http://internal-do-communication/_internal/validate_agent_key/${agentKeyFromUrl}`;
        const validationResponse = await this.adminDOStub.fetch(new Request(validationRequestUrl));

        if (validationResponse.ok) {
          const agentData = await validationResponse.json<{ seatId: number; agentId: string }>();
          console.log(`Chat DO: AGENT AUTH SUCCESS - Key ${agentKeyFromUrl} validated for agentId (nanoid): ${agentData.agentId} (Seat ${agentData.seatId}). Connection ID: ${connection.id}`);

          connection.state = { agentId: agentData.agentId, userType: "agent" };
          this.makeAgentAvailable(agentData.agentId);

        } else {
          const errorText = await validationResponse.text();
          console.warn(`Chat DO: AGENT AUTH FAILED - Key ${agentKeyFromUrl} invalid. Reason: ${validationResponse.status} ${errorText}. Closing connection ${connection.id}.`);
          connection.close(1008, "Invalid or expired agent key");
          return;
        }
      } catch (e: any) {
        console.error(`Chat DO: AGENT AUTH ERROR - Error validating agent key ${agentKeyFromUrl}. Error: ${e.message}. Closing connection ${connection.id}.`);
        connection.close(1011, "Error during agent authentication");
        return;
      }
    } else { // Customer connection
      const customerId = connection.id; // Use connection.id as customerId
      // PartyKit specific: connection.setState({ userType: "customer", connectionId: customerId });
      connection.state = { userType: "customer" };
      console.log(`Chat DO: Customer connected. ID: ${customerId}, Room: ${pathSegments[0] || 'default'}`);
      if (this.availableAgents.length > 0) {
        const agentIdToAssign = this.availableAgents.shift(); // agentIdToAssign is a nanoid
        if (agentIdToAssign) {
            this.makeAgentUnavailable(agentIdToAssign);
            this.activeConversations.set(customerId, agentIdToAssign); // Map customer's connection.id to agent's nanoid
            console.log(`IMMEDIATE ASSIGNMENT (Customer ${customerId}): Agent ${agentIdToAssign}. ActiveConvos: ${this.activeConversations.size}, AvailAgents: [${this.availableAgents.join(", ")}]`);
            const assignmentMessage: Message = { type: "agent_assigned", customerId: customerId, agentId: agentIdToAssign };
            this.sendToConnection(customerId, assignmentMessage);
            this.sendToConnection(agentIdToAssign, assignmentMessage); // Need a way to send to agent by their nanoid
        } else {
            console.error(`Chat DO: Error in onConnect (Customer ${customerId}): availableAgents.length > 0 but shift() returned undefined. Enqueuing customer.`);
            this.enqueueCustomer(customerId);
            this.sendToConnection(customerId, { type: "no_agents_available" } satisfies Message);
        }
      } else {
        console.log(`Chat DO: No agents available for customer ${customerId}. Enqueuing.`);
        this.enqueueCustomer(customerId);
        this.sendToConnection(customerId, { type: "no_agents_available" } satisfies Message);
      }
    }

    // Send existing messages to the newly connected user (both agent and customer)
    console.log(`Chat DO: Sending existing messages to ${connection.id}. Count: ${this.messages.length}`);
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  async onClose(connection: Connection) {
    const disconnectedUserId = connection.id; // This is the connection.id
    const state = connection.state as { agentId?: string; userType?: string } | undefined;

    console.log(`Chat DO: onClose - User disconnected. Connection ID: ${disconnectedUserId}, Stored State:`, state);

    if (state?.userType === "agent" && state.agentId) {
      const agentNanoId = state.agentId; // This is the nanoid
      console.log(`Chat DO: Agent ${agentNanoId} (Conn ID: ${disconnectedUserId}) disconnected.`);
      this.makeAgentUnavailable(agentNanoId);

      let customerToNotifyConnectionId: string | null = null;
      // Iterate over activeConversations to find if this agent (nanoid) was mapped
      for (const [customerConnId, assignedAgentNanoId] of this.activeConversations.entries()) {
        if (assignedAgentNanoId === agentNanoId) {
          customerToNotifyConnectionId = customerConnId;
          break;
        }
      }

      if (customerToNotifyConnectionId) {
        console.log(`Chat DO: Agent ${agentNanoId} disconnected from active conversation with customer ${customerToNotifyConnectionId}.`);
        this.activeConversations.delete(customerToNotifyConnectionId);
        this.sendToConnection(customerToNotifyConnectionId, {type: "add", id:nanoid(), content: "Your agent has disconnected. We will try to find another agent for you.", user:"System", role:"assistant", userType: UserType.AGENT});
        console.log(`Chat DO: Re-enqueuing customer ${customerToNotifyConnectionId} after agent ${agentNanoId} disconnected.`);
        this.enqueueCustomer(customerToNotifyConnectionId);
        this.assignAgentIfPossible();
      }
    } else { // Customer disconnected (or agent whose state wasn't properly set)
      console.log(`Chat DO: Customer ${disconnectedUserId} disconnected.`);
      const wasInQueue = this.customerQueue.includes(disconnectedUserId);
      if (wasInQueue) {
        console.log(`Chat DO: Customer ${disconnectedUserId} was in queue. Removing. Before: customerQueue = [${this.customerQueue.join(", ")}]`);
        this.customerQueue = this.customerQueue.filter((id) => id !== disconnectedUserId);
        console.log(`Chat DO: After: customerQueue = [${this.customerQueue.join(", ")}]`);
      }

      let agentToMakeAvailableNanoId: string | null = null;
      if (this.activeConversations.has(disconnectedUserId)) {
        agentToMakeAvailableNanoId = this.activeConversations.get(disconnectedUserId)!; // This is agent's nanoid
        this.activeConversations.delete(disconnectedUserId);
        console.log(`Chat DO: Customer ${disconnectedUserId} disconnected from active conversation with agent ${agentToMakeAvailableNanoId}.`);
        // Need a way to send to agent by their nanoid if their connection is still active
        this.sendToConnection(agentToMakeAvailableNanoId, {type: "add", id:nanoid(), content: "The customer has disconnected.", user:"System", role:"assistant", userType: UserType.AGENT});
        this.makeAgentAvailable(agentToMakeAvailableNanoId);
      }
    }
  }

  saveMessage(message: ChatMessage) {
    console.log(`saveMessage called for message ID: ${message.id}, User: ${message.user}, Type: ${message.userType}`);
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, userType) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}, '${message.userType}') ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}, userType = '${message.userType}'`,
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    // this.broadcast(message); // Raw message is WSMessage, not our Message type.
    // The client should send stringified Message objects.

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message; // Assuming message is stringified Message
    console.log(`onMessage: Received message type ${parsed.type} from connection ${connection.id}`);

    if (parsed.type === "add" || parsed.type === "update") {
      // These are ChatMessage with userType, id, content etc.
      // Ensure the message is saved
      this.saveMessage(parsed as ChatMessage); // Type assertion

      // Broadcast the chat message to relevant parties (e.g., other user in conversation)
      // For now, simple broadcast. In a real app, target specific users.
      const chatMessage = parsed as ChatMessage;
      const recipientId = this.activeConversations.get(connection.id) ||
                          Array.from(this.activeConversations.entries()).find(([, agentId]) => agentId === connection.id)?.[0];

      if (recipientId) {
        console.log(`Relaying chat message from ${connection.id} to ${recipientId}`);
        this.sendToConnection(recipientId, chatMessage);
      } else {
         // If not in active conversation, broadcast to all (or handle differently)
         // This is likely a message from someone not yet assigned or an agent not in a convo.
         // For now, we'll just broadcast it.
         console.log(`Broadcasting chat message from ${connection.id} as no specific recipient found in activeConversations.`);
         this.broadcastMessage(chatMessage, [connection.id]); // Broadcast to others
      }

    } else {
      // Handle other message types if necessary, though client primarily sends "add"
      console.log(`onMessage: Received non-chat message type ${parsed.type}. Ignoring for save/broadcast here.`);
    }
  }
}

// Need to import nanoid for message IDs and UserType for system messages
import { nanoid } from "nanoid";
import { UserType } from "../shared";

const MASTER_ADMIN_KEY = "adminayi888"; // As specified in the subtask

// isAdminRequest is no longer used directly in fetch, path is checked explicitly.
// It can be kept for other potential uses or removed if no longer needed.
// function isAdminApiRequest(request: Request): boolean {
//   const url = new URL(request.url);
//   return url.pathname.startsWith("/api/admin/");
// }

function isValidAdminKey(request: Request): boolean {
  return request.headers.get("X-Admin-Key") === MASTER_ADMIN_KEY;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Serve admin.html for /admin or /admin/* paths (excluding specific assets)
    if (url.pathname === "/admin" || (url.pathname.startsWith("/admin/") && !url.pathname.match(/\.(js|css|ico|png|jpg|jpeg|gif|svg)$/i))) {
      console.log(`Serving admin.html for SPA route: ${url.pathname}`);
      try {
        // Create a new request for admin.html to avoid modifying the original request's URL for ASSETS.fetch
        const adminHtmlRequest = new Request(new URL("/admin.html", request.url).toString(), {
          headers: request.headers,
          method: "GET", // Ensure it's a GET request for the HTML file
        });
        const adminHtmlResponse = await env.ASSETS.fetch(adminHtmlRequest);
        if (adminHtmlResponse.ok) {
          return new Response(adminHtmlResponse.body, {
            headers: { ...adminHtmlResponse.headers, 'Content-Type': 'text/html' }, // Ensure correct content type
            status: adminHtmlResponse.status
          });
        } else {
          console.error(`Failed to fetch admin.html, status: ${adminHtmlResponse.status}`);
          return new Response("admin.html not found or error fetching asset", { status: adminHtmlResponse.status });
        }
      } catch (e: any) {
        console.error(`Error fetching admin.html: ${e.message}`);
        return new Response("Error serving admin dashboard.", { status: 500 });
      }
    }

    // 2. Handle Admin API calls (e.g., /api/admin/*)
    if (url.pathname.startsWith("/api/admin/")) {
      console.log("Admin API request detected for path:", url.pathname);
      if (!isValidAdminKey(request)) {
        console.warn("Admin API request REJECTED: Missing or invalid X-Admin-Key header.");
        return new Response("Unauthorized: Missing or invalid admin key for API", { status: 401 });
      }
      console.log("Admin API request AUTHORIZED: X-Admin-Key is valid.");

      try {
        const doId = env.ADMIN_STATE_DO.idFromName("admin_singleton_id");
        const stub = env.ADMIN_STATE_DO.get(doId);

        // Create a new request for the DO, stripping /api prefix
        const doUrl = new URL(request.url);
        doUrl.pathname = doUrl.pathname.replace(/^\/api/, ""); // Changes /api/admin/foo -> /admin/foo

        console.log(`Forwarding Admin API request to DO. Original path: ${url.pathname}, New path for DO: ${doUrl.pathname}`);
        const doRequest = new Request(doUrl.toString(), request); // Pass original request's method, headers, body

        return await stub.fetch(doRequest);
      } catch (e: any) {
        console.error("Error obtaining or fetching from AdminStateDO stub for API:", e.message);
        return new Response("Error processing admin API request.", { status: 500 });
      }
    }

    // 3. Existing PartyKit and asset serving logic for non-admin routes
    // Ensure CHAT and USER bindings are correctly passed if they exist on env.
    // The `as any` cast might hide type errors; ensure env structure matches PartyKit expectations.
    const partykitEnv = { ...env } as any;
    // delete partykitEnv.ADMIN_STATE_DO; // PartyKit server doesn't need AdminStateDO directly

    console.log("Routing to PartyKit or ASSETS for path:", url.pathname);
    const partykitResponse = await routePartykitRequest(request, partykitEnv, ctx);
    if (partykitResponse) {
      return partykitResponse;
    }

    // Fallback to serving static assets from 'public' directory for any other request
    console.log("Falling back to ASSETS.fetch for path:", url.pathname);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
