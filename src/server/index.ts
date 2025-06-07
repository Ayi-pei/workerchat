import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];
  customerQueue: string[] = [];
  availableAgents: string[] = [];
  activeConversations: Map<string, string> = new Map(); // customerId -> agentId

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

  onConnect(connection: Connection) {
    const userId = connection.id;
    const isAgent = connection.uri.includes("/agent/");
    const userType = isAgent ? "agent" : "customer";
    console.log(`onConnect: User connected. ID: ${userId}, Type: ${userType}, URI: ${connection.uri}`);

    if (isAgent) {
      this.makeAgentAvailable(userId);
    } else { // Customer
      console.log(`Customer ${userId} connecting. Available agents: ${this.availableAgents.length}`);
      if (this.availableAgents.length > 0) {
        const agentId = this.availableAgents.shift(); // Take agent from front
        if (agentId) {
            this.makeAgentUnavailable(agentId); // Mark as busy
            this.activeConversations.set(userId, agentId);
            console.log(`IMMEDIATE ASSIGNMENT: Agent ${agentId} to Customer ${userId}. ActiveConvos: ${this.activeConversations.size}, AvailAgents: [${this.availableAgents.join(", ")}]`);
            const assignmentMessage: Message = { type: "agent_assigned", customerId: userId, agentId };
            this.sendToConnection(userId, assignmentMessage);
            this.sendToConnection(agentId, assignmentMessage);
        } else {
            // This case should ideally not be reached if availableAgents.length > 0 was true
            console.error(`Error in onConnect: availableAgents.length > 0 but shift() returned undefined. Enqueuing customer ${userId}.`);
            this.enqueueCustomer(userId);
            this.sendToConnection(userId, { type: "no_agents_available" } satisfies Message);
        }
      } else {
        console.log(`No agents available for customer ${userId}. Enqueuing.`);
        this.enqueueCustomer(userId);
        this.sendToConnection(userId, { type: "no_agents_available" } satisfies Message);
      }
    }

    // Send existing messages to the newly connected user
    console.log(`Sending existing messages to ${userId}. Count: ${this.messages.length}`);
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  onClose(connection: Connection) {
    const userId = connection.id;
    const isAgent = connection.uri.includes("/agent/");
    const userType = isAgent ? "agent" : "customer";
    console.log(`onClose: User disconnected. ID: ${userId}, Type: ${userType}`);

    if (isAgent) {
      this.makeAgentUnavailable(userId);
      // If agent was in a conversation, notify the customer and manage customer state
      let customerToNotify: string | null = null;
      for (const [customerId, agentId] of this.activeConversations.entries()) {
        if (agentId === userId) {
          customerToNotify = customerId;
          break;
        }
      }
      if (customerToNotify) {
        console.log(`Agent ${userId} disconnected from active conversation with customer ${customerToNotify}.`);
        this.activeConversations.delete(customerToNotify);
        // Decide what to do with the customer: re-queue, send message, etc.
        // For now, just log and perhaps send a message to customer.
        this.sendToConnection(customerToNotify, {type: "add", id:nanoid(), content: "Your agent has disconnected. We will try to find another agent for you.", user:"System", role:"assistant", userType: UserType.AGENT});
        console.log(`Re-enqueuing customer ${customerToNotify} after agent ${userId} disconnected.`);
        this.enqueueCustomer(customerToNotify); // Re-queue the customer
        this.assignAgentIfPossible(); // Try to find a new agent
      }
    } else { // Customer disconnected
      const wasInQueue = this.customerQueue.includes(userId);
      if (wasInQueue) {
        console.log(`Customer ${userId} was in queue. Removing. Before: customerQueue = [${this.customerQueue.join(", ")}]`);
        this.customerQueue = this.customerQueue.filter((id) => id !== userId);
        console.log(`After: customerQueue = [${this.customerQueue.join(", ")}]`);
        // No need to update other queue positions here as they are only informed on dequeue or new enqueue.
      }

      // If customer was in an active conversation, notify the agent and make the agent available
      let agentToNotify: string | null = null;
      if (this.activeConversations.has(userId)) {
        agentToNotify = this.activeConversations.get(userId)!;
        this.activeConversations.delete(userId);
        console.log(`Customer ${userId} disconnected from active conversation with agent ${agentToNotify}.`);
        this.sendToConnection(agentToNotify, {type: "add", id:nanoid(), content: "The customer has disconnected.", user:"System", role:"assistant", userType: UserType.AGENT});
        this.makeAgentAvailable(agentToNotify);
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

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
