export type AuthType = "oauth" | "api_key";

export type ParamKind = "static" | "input" | "step_ref" | "resource" | "identity";
export type ParamScope = "builder_test" | "end_user" | "dynamic";

export interface ActionInput {
  key: string;
  label: string;
  type?: "text" | "textarea" | "email";
  required?: boolean;
  /**
   * `kind` est désormais **requis** (P4.1) — il pilote le widget UI et la
   * logique du Résolveur. Pour les paramètres optionnels purement informatifs,
   * utilisez `kind: "input"` avec `required: false`.
   */
  kind: ParamKind;
  resourceType?: string;
  defaultScope?: ParamScope;
  dependsOn?: string;
  help?: string;
  placeholder?: string;
  /** Appliqué si le param est vide ou non résolu à l'exécution. */
  defaultValue?: string;
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
