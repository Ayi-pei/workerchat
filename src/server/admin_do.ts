import { nanoid } from "nanoid";

interface AgentKey {
  seatId: number; // 1-30
  nanoid: string;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  isActive: boolean; // To mark if this specific key is the currently active one for the seat
}

export class AdminStateDO implements DurableObject {
  state: DurableObjectState;
  agentKeys: AgentKey[] = [];
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
      console.log("AdminStateDO: Loaded agent keys from storage.");
    } else {
      console.log("AdminStateDO: No agent keys found in storage, initializing new keys.");
      this.initializeAgentKeys();
      await this.state.storage.put("agentKeys", this.agentKeys);
      console.log("AdminStateDO: New agent keys initialized and stored.");
    }
    this.initialized = true;
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

    console.log(`AdminStateDO: Path ${path} not found or method ${method} not allowed for external/admin access.`);
    return new Response("Admin action not found or internal path mismatch", { status: 404 });
  }
}

interface Env {
  // This interface can be expanded with bindings defined in wrangler.toml
}
