import { nanoid } from "nanoid";

interface AgentKey {
  seatId: number; // 1-30
  nanoid: string;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  isActive: boolean; // To mark if this specific key is the currently active one for the seat
}

interface AdminAgent {
  id: string; // Unique ID for the agent (e.g., generated using nanoid(10))
  nickname: string;
  accountStatus: 'enabled' | 'disabled';
  assignedKeyId: number | null; // Refers to AgentKey.seatId
  createdAt: string; // ISO string
}

export class AdminStateDO implements DurableObject {
  state: DurableObjectState;
  agentKeys: AgentKey[] = [];
  private adminAgents: AdminAgent[] = [];
  // Helper to ensure initialization only runs once per instance in memory
  private initialized: boolean = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    // `blockConcurrencyWhile()` ensures no other operations run on this DO instance until the constructor completes.
    this.state.blockConcurrencyWhile(async () => {
      await this.loadOrInitializeKeys();
    });
  }

  private async loadOrInitializeKeys(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const storedKeys = await this.state.storage.get<AgentKey[]>("agentKeys");
    if (storedKeys && storedKeys.length > 0) {
      this.agentKeys = storedKeys;
      console.log(`AdminStateDO: Loaded ${this.agentKeys.length} agent keys from storage.`);
    } else {
      console.log("AdminStateDO: No agent keys found in storage, initializing new keys.");
      this.initializeAgentKeys();
      await this.state.storage.put("agentKeys", this.agentKeys);
      console.log(`AdminStateDO: New agent keys initialized and stored (${this.agentKeys.length} keys).`);
    }

    // Load or initialize adminAgents
    const storedAdminAgents = await this.state.storage.get<AdminAgent[]>("adminAgents");
    if (storedAdminAgents) {
      this.adminAgents = storedAdminAgents;
      console.log(`AdminStateDO: Loaded ${this.adminAgents.length} admin agents from storage.`);
    } else {
      // Initialize with an empty array and save it.
      // Actual agent creation will be via an API endpoint later.
      this.adminAgents = []; // Ensure it's an empty array, not undefined
      await this.state.storage.put("adminAgents", this.adminAgents);
      console.log("AdminStateDO: Initialized empty adminAgents array in storage.");
    }

    this.initialized = true;
  }

  private async saveAdminAgents(): Promise<void> {
    await this.state.storage.put("adminAgents", this.adminAgents);
    console.log(`AdminStateDO: Saved ${this.adminAgents.length} admin agents to storage.`);
  }

  private getFutureISOString(hours: number): string {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  private initializeAgentKeys(): void {
    this.agentKeys = []; // Clear any existing keys in memory before initializing
    const now = new Date();

    // For end-of-day expiry:
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999); // Set to end of current day
    // If current time is already past today's EOD, set expiry for EOD tomorrow.
    // This is a simple way, could be more robust with timezones.
    if (now.getTime() > endOfDay.getTime()) {
        endOfDay.setDate(endOfDay.getDate() + 1);
    }
    const expiresAtISO = endOfDay.toISOString();

    for (let i = 1; i <= 30; i++) {
      this.agentKeys.push({
        seatId: i,
        nanoid: nanoid(16),
        createdAt: now.toISOString(),
        // expiresAt: this.getFutureISOString(24), // Simple 24-hour expiry
        expiresAt: expiresAtISO, // End of current day expiry
        isActive: true,
      });
    }
    console.log(`AdminStateDO: Generated ${this.agentKeys.length} new agent keys.`);
  }

  async fetch(request: Request): Promise<Response> {
    // Ensure keys are loaded/initialized before responding to any fetch requests.
    // blockConcurrencyWhile() is used in constructor, so by the time fetch is called,
    // this.initialized should be true. A direct check is fine.
    if (!this.initialized) {
      // This case should ideally not be hit if constructor logic is sound.
      // However, as a safeguard, explicitly run initialization.
      await this.state.blockConcurrencyWhile(() => this.loadOrInitializeKeys());
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    console.log(`AdminStateDO: Received fetch - Method: ${method}, Path: ${path}`);

    // Endpoint: GET /admin/agent_keys
    if (method === "GET" && path === "/admin/agent_keys") {
      console.log("AdminStateDO: Handling GET /admin/agent_keys");
      return new Response(JSON.stringify(this.agentKeys), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Endpoint: POST /admin/agent_keys/:seat_id/regenerate
    const regenerateAdminMatch = path.match(/^\/admin\/agent_keys\/(\d+)\/regenerate$/);
    if (method === "POST" && regenerateAdminMatch) {
      const seatIdNum = parseInt(regenerateAdminMatch[1], 10);
      console.log(`AdminStateDO: Handling POST /admin/agent_keys/${seatIdNum}/regenerate`);

      const keyIndex = this.agentKeys.findIndex(k => k.seatId === seatIdNum);

      if (keyIndex !== -1) {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        if (now.getTime() > endOfDay.getTime()) {
            endOfDay.setDate(endOfDay.getDate() + 1);
        }
        const expiresAtISO = endOfDay.toISOString();

        this.agentKeys[keyIndex].nanoid = nanoid(16);
        this.agentKeys[keyIndex].createdAt = now.toISOString();
        this.agentKeys[keyIndex].expiresAt = expiresAtISO;
        this.agentKeys[keyIndex].isActive = true; // Ensure it's active

        await this.state.storage.put("agentKeys", this.agentKeys);
        console.log(`AdminStateDO: Regenerated key for seatId ${seatIdNum}.`);
        return new Response(JSON.stringify(this.agentKeys[keyIndex]), {
          headers: { "Content-Type": "application/json" },
        });
      } else {
        console.log(`AdminStateDO: SeatId ${seatIdNum} not found for regeneration.`);
        return new Response("Agent key not found for seat_id: " + seatIdNum, { status: 404 });
      }
    }

    // Endpoint: GET /_internal/validate_agent_key/:nanoid_key (for DO-to-DO communication)
    const validateInternalMatch = path.match(/^\/_internal\/validate_agent_key\/([a-zA-Z0-9_-]{16})$/);
    if (method === "GET" && validateInternalMatch) {
      const nanoidKey = validateInternalMatch[1];
      console.log(`AdminStateDO: Handling GET /_internal/validate_agent_key/${nanoidKey}`);

      const agentKey = this.agentKeys.find(k => k.nanoid === nanoidKey);

      if (!agentKey) {
        console.warn(`AdminStateDO: VALIDATION FAILED - Key ${nanoidKey} not found.`);
        return new Response("Agent key not found", { status: 404 });
      }

      if (!agentKey.isActive) {
        console.warn(`AdminStateDO: VALIDATION FAILED - Key ${nanoidKey} (Seat ${agentKey.seatId}) is not active.`);
        return new Response("Agent key not active", { status: 403 });
      }

      const now = new Date();
      const expiresAt = new Date(agentKey.expiresAt);
      if (now >= expiresAt) {
        console.warn(`AdminStateDO: VALIDATION FAILED - Key ${nanoidKey} (Seat ${agentKey.seatId}) has expired. Expired at: ${agentKey.expiresAt}, Current time: ${now.toISOString()}`);
        // Optionally, set isActive to false and persist
        // agentKey.isActive = false;
        // await this.state.storage.put("agentKeys", this.agentKeys);
        return new Response("Agent key expired", { status: 403 });
      }

      console.log(`AdminStateDO: VALIDATION SUCCESS - Key ${nanoidKey} validated successfully for seatId ${agentKey.seatId}.`);
      return new Response(JSON.stringify({ seatId: agentKey.seatId, agentId: agentKey.nanoid, userType: "agent" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- AdminAgent CRUD Endpoints ---

    // GET /admin/agents - List all admin agents
    if (path === '/admin/agents' && method === 'GET') {
      console.log("AdminStateDO: Handling GET /admin/agents");
      return new Response(JSON.stringify(this.adminAgents), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /admin/agents - Create a new admin agent
    if (path === '/admin/agents' && method === 'POST') {
      console.log("AdminStateDO: Handling POST /admin/agents");
      try {
        const { nickname, assignedKeyId } = await request.json<{ nickname?: string; assignedKeyId?: number | null }>();

        if (!nickname || typeof nickname !== 'string' || nickname.trim() === '') {
          return new Response(JSON.stringify({ error: "Nickname is required and must be a non-empty string." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        if (assignedKeyId !== undefined && assignedKeyId !== null && typeof assignedKeyId !== 'number') {
            return new Response(JSON.stringify({ error: "assignedKeyId must be a number or null." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Optional: Validate assignedKeyId exists in this.agentKeys
        if (assignedKeyId !== null && assignedKeyId !== undefined) {
            const keyExists = this.agentKeys.some(key => key.seatId === assignedKeyId);
            if (!keyExists) {
                return new Response(JSON.stringify({ error: `AgentKey with seatId ${assignedKeyId} not found.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            // Optional: Check if key is already assigned to another agent
            const keyAssigned = this.adminAgents.some(agent => agent.assignedKeyId === assignedKeyId);
            if (keyAssigned) {
                 return new Response(JSON.stringify({ error: `AgentKey with seatId ${assignedKeyId} is already assigned to another agent.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }


        const newAgent: AdminAgent = {
          id: nanoid(10),
          nickname: nickname.trim(),
          accountStatus: 'enabled',
          assignedKeyId: assignedKeyId === undefined ? null : assignedKeyId, // Ensure it's explicitly null if not provided
          createdAt: new Date().toISOString(),
        };

        this.adminAgents.push(newAgent);
        await this.saveAdminAgents();
        console.log(`AdminStateDO: Created new admin agent ID ${newAgent.id} with nickname ${newAgent.nickname}.`);
        return new Response(JSON.stringify(newAgent), { status: 201, headers: { 'Content-Type': 'application/json' } });

      } catch (e: any) {
        console.error("AdminStateDO: Error processing POST /admin/agents:", e.message);
        if (e instanceof SyntaxError) {
            return new Response(JSON.stringify({ error: "Invalid JSON in request body." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: "Failed to create agent." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // PUT /admin/agents/:agentId - Update an admin agent
    const agentUpdateMatch = path.match(/^\/admin\/agents\/([a-zA-Z0-9_-]{10})$/); // Matches nanoid(10)
    if (agentUpdateMatch && method === 'PUT') {
      const agentId = agentUpdateMatch[1];
      console.log(`AdminStateDO: Handling PUT /admin/agents/${agentId}`);
      try {
        const { nickname, accountStatus, assignedKeyId } = await request.json<{ nickname?: string; accountStatus?: 'enabled' | 'disabled'; assignedKeyId?: number | null }>();

        const agentIndex = this.adminAgents.findIndex(a => a.id === agentId);
        if (agentIndex === -1) {
          return new Response(JSON.stringify({ error: `Agent with ID ${agentId} not found.`}), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        let updated = false;
        if (nickname !== undefined && typeof nickname === 'string' && nickname.trim() !== '') {
          this.adminAgents[agentIndex].nickname = nickname.trim();
          updated = true;
        }
        if (accountStatus !== undefined && (accountStatus === 'enabled' || accountStatus === 'disabled')) {
          this.adminAgents[agentIndex].accountStatus = accountStatus;
          updated = true;
        }
        if (assignedKeyId !== undefined) { // Allows setting to null
            if (assignedKeyId !== null && typeof assignedKeyId !== 'number') {
                 return new Response(JSON.stringify({ error: "assignedKeyId must be a number or null." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
             // Optional: Validate assignedKeyId exists and is not assigned to another agent (excluding current agent)
            if (assignedKeyId !== null) {
                const keyExists = this.agentKeys.some(key => key.seatId === assignedKeyId);
                if (!keyExists) {
                    return new Response(JSON.stringify({ error: `AgentKey with seatId ${assignedKeyId} not found.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }
                const keyAssignedToOther = this.adminAgents.some(agent => agent.id !== agentId && agent.assignedKeyId === assignedKeyId);
                if (keyAssignedToOther) {
                    return new Response(JSON.stringify({ error: `AgentKey with seatId ${assignedKeyId} is already assigned to another agent.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }
            }
          this.adminAgents[agentIndex].assignedKeyId = assignedKeyId;
          updated = true;
        }

        if (updated) {
          await this.saveAdminAgents();
          console.log(`AdminStateDO: Updated admin agent ID ${agentId}.`);
        }
        return new Response(JSON.stringify(this.adminAgents[agentIndex]), { headers: { 'Content-Type': 'application/json' } });

      } catch (e: any) {
        console.error(`AdminStateDO: Error processing PUT /admin/agents/${agentId}:`, e.message);
         if (e instanceof SyntaxError) {
            return new Response(JSON.stringify({ error: "Invalid JSON in request body." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: "Failed to update agent." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // DELETE /admin/agents/:agentId - Delete an admin agent
    const agentDeleteMatch = path.match(/^\/admin\/agents\/([a-zA-Z0-9_-]{10})$/);
    if (agentDeleteMatch && method === 'DELETE') {
      const agentId = agentDeleteMatch[1];
      console.log(`AdminStateDO: Handling DELETE /admin/agents/${agentId}`);

      const initialLength = this.adminAgents.length;
      this.adminAgents = this.adminAgents.filter(a => a.id !== agentId);

      if (this.adminAgents.length < initialLength) {
        await this.saveAdminAgents();
        console.log(`AdminStateDO: Deleted admin agent ID ${agentId}.`);
        return new Response(JSON.stringify({ message: "Agent deleted successfully." }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        // Alternatively, return status 204 No Content:
        // return new Response(null, { status: 204 });
      } else {
        return new Response(JSON.stringify({ error: `Agent with ID ${agentId} not found.` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
    }


    console.log(`AdminStateDO: Path ${path} not found or method ${method} not allowed for external/admin access.`);
    return new Response("Admin action not found or internal path mismatch", { status: 404 });
  }
}

interface Env {
  // This interface can be expanded with bindings defined in wrangler.toml
}
