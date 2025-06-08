export enum UserType {
  AGENT = "agent",
  CUSTOMER = "customer",
}

export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
  userType: UserType;
};

export type Message =
  | {
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
    }
  | {
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
  userType: UserType;
    }
  | {
      type: "all";
      messages: ChatMessage[];
    }
  | {
      type: "customer_queued";
      customerId: string;
      position: number;
    }
  | {
      type: "agent_assigned";
      customerId: string;
      agentId: string;
    }
  | {
      type: "no_agents_available";
    }
  | {
      type: "agent_now_available";
      agentId: string;
    };

export const names = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Kevin",
  "Linda",
  "Mallory",
  "Nancy",
  "Oscar",
  "Peggy",
  "Quentin",
  "Randy",
  "Steve",
  "Trent",
  "Ursula",
  "Victor",
  "Walter",
  "Xavier",
  "Yvonne",
  "Zoe",
];
