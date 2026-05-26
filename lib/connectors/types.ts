export type AuthType = "oauth" | "api_key";

export interface ActionInput {
  key: string;
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
}

export interface ConnectorAction {
  id: string;
  label: string;
  inputs: ActionInput[];
}

export interface Connector {
  id: string;
  label: string;
  authType: AuthType;
  category: string;
  helpUrl?: string;
  why?: string;
  actions: ConnectorAction[];
}

export interface ExecuteContext {
  userId: string;
  accessToken?: string;
  apiKey?: string;
}

export interface ExecuteResult {
  output: string;
  metadata?: Record<string, unknown>;
}
