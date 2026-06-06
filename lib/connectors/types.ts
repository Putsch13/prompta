export type AuthType = "oauth" | "api_key";

export type ParamKind = "static" | "input" | "step_ref" | "resource" | "identity";
export type ParamScope = "builder_test" | "end_user" | "dynamic";

export interface ActionInput {
  key: string;
  label: string;
  type?: "text" | "textarea" | "email";
  required?: boolean;
  kind?: ParamKind;
  resourceType?: string;
  defaultScope?: ParamScope;
  dependsOn?: string;
  help?: string;
  placeholder?: string;
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
  dryRun?: boolean;
}

export interface ExecuteResult {
  output: string;
  metadata?: Record<string, unknown>;
}
