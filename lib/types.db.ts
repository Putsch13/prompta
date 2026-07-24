export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_action_executions: {
        Row: {
          action_slug: string
          created_at: string | null
          error_message: string | null
          execution_key: string
          external_id: string | null
          id: string
          result_output: string | null
          run_id: string
          status: string
          step_index: number
          updated_at: string | null
        }
        Insert: {
          action_slug: string
          created_at?: string | null
          error_message?: string | null
          execution_key: string
          external_id?: string | null
          id?: string
          result_output?: string | null
          run_id: string
          status?: string
          step_index: number
          updated_at?: string | null
        }
        Update: {
          action_slug?: string
          created_at?: string | null
          error_message?: string | null
          execution_key?: string
          external_id?: string | null
          id?: string
          result_output?: string | null
          run_id?: string
          status?: string
          step_index?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_executions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approvals: {
        Row: {
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          payload: Json
          run_id: string
          status: string
          step_id: string | null
          step_index: number | null
        }
        Insert: {
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json
          run_id: string
          status?: string
          step_id?: string | null
          step_index?: number | null
        }
        Update: {
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json
          run_id?: string
          status?: string
          step_id?: string | null
          step_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_browser_tasks: {
        Row: {
          created_at: string
          id: string
          request: Json
          responded_at: string | null
          response: Json | null
          run_id: string
          status: string
          step_index: number
        }
        Insert: {
          created_at?: string
          id?: string
          request: Json
          responded_at?: string | null
          response?: Json | null
          run_id: string
          status?: string
          step_index: number
        }
        Update: {
          created_at?: string
          id?: string
          request?: Json
          responded_at?: string | null
          response?: Json | null
          run_id?: string
          status?: string
          step_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_browser_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_budget: {
        Row: {
          daily_cap_usd: number
          daily_reset_date: string
          daily_spent_usd: number
          id: number
          is_paused: boolean
          mode: string
          monthly_cap_usd: number
          monthly_reset_month: string
          monthly_spent_usd: number
          updated_at: string
        }
        Insert: {
          daily_cap_usd?: number
          daily_reset_date?: string
          daily_spent_usd?: number
          id?: number
          is_paused?: boolean
          mode?: string
          monthly_cap_usd?: number
          monthly_reset_month?: string
          monthly_spent_usd?: number
          updated_at?: string
        }
        Update: {
          daily_cap_usd?: number
          daily_reset_date?: string
          daily_spent_usd?: number
          id?: number
          is_paused?: boolean
          mode?: string
          monthly_cap_usd?: number
          monthly_reset_month?: string
          monthly_spent_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_definitions: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          max_runs_per_day: number
          name: string
          requires_review: boolean
          slug: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          max_runs_per_day?: number
          name: string
          requires_review?: boolean
          slug: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          max_runs_per_day?: number
          name?: string
          requires_review?: boolean
          slug?: string
        }
        Relationships: []
      }
      agent_deliverables: {
        Row: {
          content_text: string | null
          created_at: string | null
          filename: string
          id: string
          kind: string
          listing_id: string | null
          mime_type: string
          preview_text: string | null
          run_id: string
          size_bytes: number | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          content_text?: string | null
          created_at?: string | null
          filename: string
          id?: string
          kind?: string
          listing_id?: string | null
          mime_type?: string
          preview_text?: string | null
          run_id: string
          size_bytes?: number | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          content_text?: string | null
          created_at?: string | null
          filename?: string
          id?: string
          kind?: string
          listing_id?: string | null
          mime_type?: string
          preview_text?: string | null
          run_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_deliverables_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "agent_deliverables_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deliverables_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge_chunks: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          source_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          source_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "agent_knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge_sources: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          label: string | null
          listing_id: string
          owner_id: string
          source_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          label?: string | null
          listing_id: string
          owner_id: string
          source_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          label?: string | null
          listing_id?: string
          owner_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_sources_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "agent_knowledge_sources_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_logs: {
        Row: {
          agent_slug: string
          created_at: string
          id: string
          level: string
          message: string
          run_id: string | null
        }
        Insert: {
          agent_slug: string
          created_at?: string
          id?: string
          level?: string
          message: string
          run_id?: string | null
        }
        Update: {
          agent_slug?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          content: string
          created_at: string | null
          id: string
          key: string | null
          listing_id: string
          memory_type: string
          metadata: Json | null
          run_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          key?: string | null
          listing_id: string
          memory_type?: string
          metadata?: Json | null
          run_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          key?: string | null
          listing_id?: string
          memory_type?: string
          metadata?: Json | null
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memories_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "agent_memories_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memories_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_outputs: {
        Row: {
          agent_slug: string
          created_at: string
          id: string
          is_sandbox: boolean
          kind: string
          payload: Json
          published_ref: string | null
          quality_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string | null
          status: string
          title: string | null
        }
        Insert: {
          agent_slug: string
          created_at?: string
          id?: string
          is_sandbox?: boolean
          kind: string
          payload: Json
          published_ref?: string | null
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          agent_slug?: string
          created_at?: string
          id?: string
          is_sandbox?: boolean
          kind?: string
          payload?: Json
          published_ref?: string | null
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_outputs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_slug: string
          cost_usd: number
          error: string | null
          finished_at: string | null
          id: string
          input_tokens: number
          is_sandbox: boolean
          items_produced: number
          output_tokens: number
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          agent_slug: string
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          is_sandbox?: boolean
          items_produced?: number
          output_tokens?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          agent_slug?: string
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number
          is_sandbox?: boolean
          items_produced?: number
          output_tokens?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      agent_schedules: {
        Row: {
          agent_slug: string
          created_at: string
          days: number[]
          hours: number[]
          id: string
          is_enabled: boolean
        }
        Insert: {
          agent_slug: string
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          is_enabled?: boolean
        }
        Update: {
          agent_slug?: string
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          is_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_schedules_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "agent_definitions"
            referencedColumns: ["slug"]
          },
        ]
      }
      agent_trigger_events: {
        Row: {
          created_at: string | null
          id: string
          payload: Json | null
          run_id: string | null
          trigger_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          run_id?: string | null
          trigger_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json | null
          run_id?: string | null
          trigger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_trigger_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trigger_events_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "agent_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_triggers: {
        Row: {
          config: Json
          created_at: string | null
          enabled: boolean
          id: string
          listing_id: string
          owner_id: string
          type: string
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          enabled?: boolean
          id?: string
          listing_id: string
          owner_id: string
          type: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          enabled?: boolean
          id?: string
          listing_id?: string
          owner_id?: string
          type?: string
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_triggers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "agent_triggers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          id: string
          label: string | null
          slug: string | null
        }
        Insert: {
          id?: string
          label?: string | null
          slug?: string | null
        }
        Update: {
          id?: string
          label?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      creator_badges: {
        Row: {
          awarded_at: string | null
          badge_id: string
          creator_id: string
        }
        Insert: {
          awarded_at?: string | null
          badge_id: string
          creator_id: string
        }
        Update: {
          awarded_at?: string | null
          badge_id?: string
          creator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_badges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          agent_run_id: string | null
          amount_cents: number
          created_at: string | null
          description: string | null
          id: string
          kind: string
          prompt_run_id: string | null
          run_id: string | null
          run_type: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          agent_run_id?: string | null
          amount_cents: number
          created_at?: string | null
          description?: string | null
          id?: string
          kind: string
          prompt_run_id?: string | null
          run_id?: string | null
          run_type?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          agent_run_id?: string | null
          amount_cents?: number
          created_at?: string | null
          description?: string | null
          id?: string
          kind?: string
          prompt_run_id?: string | null
          run_id?: string | null
          run_type?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_prompt_run_id_fkey"
            columns: ["prompt_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          user_id: string | null
          version_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          user_id?: string | null
          version_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          user_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downloads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "downloads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          creator_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          follower_id: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      free_run_quota: {
        Row: {
          last_reset: string | null
          runs_today: number | null
          user_id: string
        }
        Insert: {
          last_reset?: string | null
          runs_today?: number | null
          user_id: string
        }
        Update: {
          last_reset?: string | null
          runs_today?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_run_quota_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      key_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          owner_id: string
          provider: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          owner_id: string
          provider: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          owner_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshots: {
        Row: {
          created_at: string
          day: string
          new_signups: number
          platform_fee_cents: number
          published_listings: number
          revenue_cents: number
          total_downloads: number
          total_listings: number
          total_purchases: number
          total_users: number
        }
        Insert: {
          created_at?: string
          day?: string
          new_signups?: number
          platform_fee_cents?: number
          published_listings?: number
          revenue_cents?: number
          total_downloads?: number
          total_listings?: number
          total_purchases?: number
          total_users?: number
        }
        Update: {
          created_at?: string
          day?: string
          new_signups?: number
          platform_fee_cents?: number
          published_listings?: number
          revenue_cents?: number
          total_downloads?: number
          total_listings?: number
          total_purchases?: number
          total_users?: number
        }
        Relationships: []
      }
      listing_agent_run_steps: {
        Row: {
          action_slug: string | null
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_detail: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_preview: Json | null
          label: string | null
          model: string | null
          output_preview: Json | null
          provider: string | null
          run_id: string
          started_at: string | null
          status: string
          step_id: string | null
          step_index: number
          step_type: string
          tool_slug: string | null
          usage: Json | null
        }
        Insert: {
          action_slug?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_detail?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_preview?: Json | null
          label?: string | null
          model?: string | null
          output_preview?: Json | null
          provider?: string | null
          run_id: string
          started_at?: string | null
          status: string
          step_id?: string | null
          step_index: number
          step_type: string
          tool_slug?: string | null
          usage?: Json | null
        }
        Update: {
          action_slug?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_detail?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_preview?: Json | null
          label?: string | null
          model?: string | null
          output_preview?: Json | null
          provider?: string | null
          run_id?: string
          started_at?: string | null
          status?: string
          step_id?: string | null
          step_index?: number
          step_type?: string
          tool_slug?: string | null
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_agent_runs: {
        Row: {
          cancel_requested: boolean
          cancelled_at: string | null
          claimed_by: string | null
          created_at: string | null
          credit_hold_estimate_cents: number | null
          dry_run: boolean
          error_message: string | null
          heartbeat_at: string | null
          id: string
          inputs: Json | null
          listing_id: string | null
          max_steps: number | null
          output: Json | null
          paused_at_step: number | null
          queued_at: string | null
          resume_from_step: number | null
          started_at: string | null
          status: string
          steps_completed: number | null
          used_credits: boolean | null
          user_id: string
          version_id: string | null
        }
        Insert: {
          cancel_requested?: boolean
          cancelled_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          credit_hold_estimate_cents?: number | null
          dry_run?: boolean
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          inputs?: Json | null
          listing_id?: string | null
          max_steps?: number | null
          output?: Json | null
          paused_at_step?: number | null
          queued_at?: string | null
          resume_from_step?: number | null
          started_at?: string | null
          status?: string
          steps_completed?: number | null
          used_credits?: boolean | null
          user_id: string
          version_id?: string | null
        }
        Update: {
          cancel_requested?: boolean
          cancelled_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          credit_hold_estimate_cents?: number | null
          dry_run?: boolean
          error_message?: string | null
          heartbeat_at?: string | null
          id?: string
          inputs?: Json | null
          listing_id?: string | null
          max_steps?: number | null
          output?: Json | null
          paused_at_step?: number | null
          queued_at?: string | null
          resume_from_step?: number | null
          started_at?: string | null
          status?: string
          steps_completed?: number | null
          used_credits?: boolean | null
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "agent_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_agent_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_versions: {
        Row: {
          bundle_path: string | null
          changelog: string | null
          contract: Json | null
          created_at: string | null
          env: Json | null
          id: string
          listing_id: string
          prompt_body: string | null
          semver: string
        }
        Insert: {
          bundle_path?: string | null
          changelog?: string | null
          contract?: Json | null
          created_at?: string | null
          env?: Json | null
          id?: string
          listing_id: string
          prompt_body?: string | null
          semver: string
        }
        Update: {
          bundle_path?: string | null
          changelog?: string | null
          contract?: Json | null
          created_at?: string | null
          env?: Json | null
          id?: string
          listing_id?: string
          prompt_body?: string | null
          semver?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_versions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_versions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category_id: string | null
          content_flags: Json | null
          created_at: string | null
          creator_id: string
          currency: string | null
          current_version_id: string | null
          description: string | null
          hosting_fee_cents: number
          id: string
          integrations: string[] | null
          models: string[] | null
          price_cents: number | null
          pricing_mode: string | null
          provisioning_mode: string
          reason_rejected: string | null
          search_vector: unknown
          slug: string
          status: string | null
          subscription_price_cents: number | null
          tags: string[] | null
          tech_stack: string[] | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          content_flags?: Json | null
          created_at?: string | null
          creator_id: string
          currency?: string | null
          current_version_id?: string | null
          description?: string | null
          hosting_fee_cents?: number
          id?: string
          integrations?: string[] | null
          models?: string[] | null
          price_cents?: number | null
          pricing_mode?: string | null
          provisioning_mode?: string
          reason_rejected?: string | null
          search_vector?: unknown
          slug: string
          status?: string | null
          subscription_price_cents?: number | null
          tags?: string[] | null
          tech_stack?: string[] | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          content_flags?: Json | null
          created_at?: string | null
          creator_id?: string
          currency?: string | null
          current_version_id?: string | null
          description?: string | null
          hosting_fee_cents?: number
          id?: string
          integrations?: string[] | null
          models?: string[] | null
          price_cents?: number | null
          pricing_mode?: string | null
          provisioning_mode?: string
          reason_rejected?: string | null
          search_vector?: unknown
          slug?: string
          status?: string | null
          subscription_price_cents?: number | null
          tags?: string[] | null
          tech_stack?: string[] | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          flag_id: string | null
          id: string
          listing_id: string | null
          metadata: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          flag_id?: string | null
          id?: string
          listing_id?: string | null
          metadata?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          flag_id?: string | null
          id?: string
          listing_id?: string | null
          metadata?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "moderation_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "moderation_actions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          created_at: string | null
          flagged_by: string | null
          id: string
          listing_id: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          flagged_by?: string | null
          id?: string
          listing_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          flagged_by?: string | null
          id?: string
          listing_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "moderation_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_api_keys: {
        Row: {
          created_at: string | null
          encrypted_key: string
          id: string
          is_valid: boolean | null
          last_checked_at: string | null
          last4: string
          org_id: string
          provider: string
        }
        Insert: {
          created_at?: string | null
          encrypted_key: string
          id?: string
          is_valid?: boolean | null
          last_checked_at?: string | null
          last4: string
          org_id: string
          provider: string
        }
        Update: {
          created_at?: string | null
          encrypted_key?: string
          id?: string
          is_valid?: boolean | null
          last_checked_at?: string | null
          last4?: string
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_api_keys_org_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_listings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          org_id: string
          source_listing_id: string | null
          status: string | null
          title: string
          type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id: string
          source_listing_id?: string | null
          status?: string | null
          title: string
          type: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          org_id?: string
          source_listing_id?: string | null
          status?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_listings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_listings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_listings_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "org_listings_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          joined_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          seat_limit: number | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string | null
          seat_limit?: number | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string | null
          seat_limit?: number | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      partner_integrations: {
        Row: {
          active: boolean | null
          affiliate_param: string | null
          id: string
          name: string | null
          run_url_template: string | null
        }
        Insert: {
          active?: boolean | null
          affiliate_param?: string | null
          id?: string
          name?: string | null
          run_url_template?: string | null
        }
        Update: {
          active?: boolean | null
          affiliate_param?: string | null
          id?: string
          name?: string | null
          run_url_template?: string | null
        }
        Relationships: []
      }
      personas: {
        Row: {
          created_at: string
          daily_quota: number
          display_name: string
          email: string
          id: string
          is_active: boolean
          language: string
          last_used_at: string | null
          profile_id: string | null
          specialty: string
          tone: string
          username: string
        }
        Insert: {
          created_at?: string
          daily_quota?: number
          display_name: string
          email: string
          id?: string
          is_active?: boolean
          language?: string
          last_used_at?: string | null
          profile_id?: string | null
          specialty: string
          tone: string
          username: string
        }
        Update: {
          created_at?: string
          daily_quota?: number
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          language?: string
          last_used_at?: string | null
          profile_id?: string | null
          specialty?: string
          tone?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_credit_guard: {
        Row: {
          daily_cost_cents: number
          daily_margin_cents: number
          guard_day: string
          id: number
          is_paused: boolean
          updated_at: string
        }
        Insert: {
          daily_cost_cents?: number
          daily_margin_cents?: number
          guard_day?: string
          id?: number
          is_paused?: boolean
          updated_at?: string
        }
        Update: {
          daily_cost_cents?: number
          daily_margin_cents?: number
          guard_day?: string
          id?: number
          is_paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_pro_revshare: {
        Row: {
          amount_cents: number
          created_at: string | null
          creator_id: string
          id: string
          listing_id: string | null
          period_month: string
          pool_cents: number
          run_count: number
          status: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string | null
          creator_id: string
          id?: string
          listing_id?: string | null
          period_month: string
          pool_cents?: number
          run_count?: number
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          creator_id?: string
          id?: string
          listing_id?: string | null
          period_month?: string
          pool_cents?: number
          run_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_pro_revshare_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_pro_revshare_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "platform_pro_revshare_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_pro_usage: {
        Row: {
          creator_id: string
          id: string
          listing_id: string
          period_month: string
          run_count: number
          updated_at: string | null
        }
        Insert: {
          creator_id: string
          id?: string
          listing_id: string
          period_month: string
          run_count?: number
          updated_at?: string | null
        }
        Update: {
          creator_id?: string
          id?: string
          listing_id?: string
          period_month?: string
          run_count?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_pro_usage_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_pro_usage_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "platform_pro_usage_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_run_economics: {
        Row: {
          actual_cost_cents: number
          billed_cents: number
          created_at: string
          id: string
          margin_cents: number
          run_id: string | null
          run_type: string
          user_id: string | null
        }
        Insert: {
          actual_cost_cents: number
          billed_cents: number
          created_at?: string
          id?: string
          margin_cents: number
          run_id?: string | null
          run_type: string
          user_id?: string | null
        }
        Update: {
          actual_cost_cents?: number
          billed_cents?: number
          created_at?: string
          id?: string
          margin_cents?: number
          run_id?: string | null
          run_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_run_economics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancel_requested_at: string | null
          created_at: string | null
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          headline: string | null
          id: string
          is_admin: boolean | null
          is_persona: boolean
          is_seed: boolean | null
          is_verified: boolean | null
          location: string | null
          unrestricted_usage: boolean
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          headline?: string | null
          id: string
          is_admin?: boolean | null
          is_persona?: boolean
          is_seed?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          unrestricted_usage?: boolean
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          headline?: string | null
          id?: string
          is_admin?: boolean | null
          is_persona?: boolean
          is_seed?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          unrestricted_usage?: boolean
          username?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_cents: number
          buyer_id: string
          created_at: string | null
          id: string
          listing_id: string
          platform_fee_cents: number
          status: string | null
          stripe_checkout_session: string | null
          stripe_payment_intent: string | null
          tax_cents: number | null
          version_id: string | null
        }
        Insert: {
          amount_cents: number
          buyer_id: string
          created_at?: string | null
          id?: string
          listing_id: string
          platform_fee_cents: number
          status?: string | null
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          tax_cents?: number | null
          version_id?: string | null
        }
        Update: {
          amount_cents?: number
          buyer_id?: string
          created_at?: string | null
          id?: string
          listing_id?: string
          platform_fee_cents?: number
          status?: string | null
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          tax_cents?: number | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          created_at: string | null
          id: string
          is_seed: boolean | null
          listing_id: string
          rating: number
          verified: boolean | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string | null
          id?: string
          is_seed?: boolean | null
          listing_id: string
          rating: number
          verified?: boolean | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string | null
          id?: string
          is_seed?: boolean | null
          listing_id?: string
          rating?: number
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          cost_estimate: number | null
          created_at: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          listing_id: string | null
          model: string | null
          output: string | null
          output_tokens: number | null
          provider: string | null
          status: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          listing_id?: string | null
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          provider?: string | null
          status?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          listing_id?: string | null
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          provider?: string | null
          status?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_runs: {
        Row: {
          active: boolean | null
          created_at: string | null
          cron_expression: string
          id: string
          inputs: Json | null
          last_run_at: string | null
          listing_id: string
          next_run_at: string | null
          notify_email: boolean | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          cron_expression: string
          id?: string
          inputs?: Json | null
          last_run_at?: string | null
          listing_id: string
          next_run_at?: string | null
          notify_email?: boolean | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          cron_expression?: string
          id?: string
          inputs?: Json | null
          last_run_at?: string | null
          listing_id?: string
          next_run_at?: string | null
          notify_email?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "scheduled_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_accounts: {
        Row: {
          charges_enabled: boolean | null
          payouts_enabled: boolean | null
          profile_id: string
          stripe_account_id: string
        }
        Insert: {
          charges_enabled?: boolean | null
          payouts_enabled?: boolean | null
          profile_id: string
          stripe_account_id: string
        }
        Update: {
          charges_enabled?: boolean | null
          payouts_enabled?: boolean | null
          profile_id?: string
          stripe_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancel_requested_at: string | null
          created_at: string | null
          current_period_end: string | null
          id: string
          listing_id: string
          pinned_version_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          listing_id: string
          pinned_version_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          listing_id?: string
          pinned_version_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "subscriptions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_pinned_version_id_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "listing_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          created_at: string | null
          encrypted_key: string
          id: string
          is_valid: boolean | null
          last_checked_at: string | null
          last4: string
          owner_id: string
          provider: string
        }
        Insert: {
          created_at?: string | null
          encrypted_key: string
          id?: string
          is_valid?: boolean | null
          last_checked_at?: string | null
          last4: string
          owner_id: string
          provider: string
        }
        Update: {
          created_at?: string | null
          encrypted_key?: string
          id?: string
          is_valid?: boolean | null
          last_checked_at?: string | null
          last4?: string
          owner_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_connections: {
        Row: {
          access_token_enc: string | null
          account_email: string | null
          account_name: string | null
          composio_account_id: string | null
          connector_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_checked_at: string | null
          owner_id: string
          provider: string
          refresh_token_enc: string | null
          scopes: string[] | null
          status: string
          updated_at: string | null
          workspace_name: string | null
        }
        Insert: {
          access_token_enc?: string | null
          account_email?: string | null
          account_name?: string | null
          composio_account_id?: string | null
          connector_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_checked_at?: string | null
          owner_id: string
          provider?: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string | null
          workspace_name?: string | null
        }
        Update: {
          access_token_enc?: string | null
          account_email?: string | null
          account_name?: string | null
          composio_account_id?: string | null
          connector_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_checked_at?: string | null
          owner_id?: string
          provider?: string
          refresh_token_enc?: string | null
          scopes?: string[] | null
          status?: string
          updated_at?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_connections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance_cents: number
          held_cents: number
          plan_credits_cents: number
          plan_credits_expire_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_cents?: number
          held_cents?: number
          plan_credits_cents?: number
          plan_credits_expire_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_cents?: number
          held_cents?: number
          plan_credits_cents?: number
          plan_credits_expire_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number
          storage_path: string
          tags: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number
          storage_path: string
          tags?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_run_activity: {
        Row: {
          action_label: string
          action_type: string
          created_at: string
          detail: Json | null
          id: string
          listing_id: string | null
          run_id: string | null
          simulated: boolean
          user_id: string
        }
        Insert: {
          action_label: string
          action_type: string
          created_at?: string
          detail?: Json | null
          id?: string
          listing_id?: string | null
          run_id?: string | null
          simulated?: boolean
          user_id: string
        }
        Update: {
          action_label?: string
          action_type?: string
          created_at?: string
          detail?: Json | null
          id?: string
          listing_id?: string | null
          run_id?: string | null
          simulated?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_run_activity_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_stats"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "user_run_activity_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_run_activity_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_kpis: {
        Row: {
          avg_rating: number | null
          gross_revenue_cents: number | null
          listings_pending: number | null
          new_users_7d: number | null
          outputs_awaiting_review: number | null
          platform_revenue_cents: number | null
          published_listings: number | null
          revenue_30d_cents: number | null
          total_downloads: number | null
          total_listings: number | null
          total_purchases: number | null
          total_users: number | null
        }
        Relationships: []
      }
      listing_stats: {
        Row: {
          avg_rating: number | null
          category_id: string | null
          created_at: string | null
          creator_id: string | null
          currency: string | null
          description: string | null
          download_count: number | null
          listing_id: string | null
          models: string[] | null
          price_cents: number | null
          review_count: number | null
          slug: string | null
          status: string | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_summary: {
        Row: {
          current_mode: string | null
          sandbox_outputs: number | null
          sandbox_pending: number | null
          sandbox_runs: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_credits: {
        Args: {
          p_amount_cents: number
          p_user_id: string
        }
        Returns: undefined
      }
      consume_free_run_quota: {
        Args: {
          p_limit: number
          p_user_id: string
        }
        Returns: boolean
      }
      grant_plan_credits: {
        Args: {
          p_amount_cents: number
          p_expire_at: string
          p_user_id: string
        }
        Returns: number
      }
      spend_credits: {
        Args: {
          p_amount_cents: number
          p_user_id: string
        }
        Returns: number
      }
      hold_credits_for_run: {
        Args: {
          p_amount_cents: number
          p_run_id: string
          p_run_type: string
          p_user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      purge_sandbox: { Args: never; Returns: undefined }
      record_platform_daily_cost: {
        Args: {
          p_cap_cents: number
          p_cost_cents: number
          p_margin_cents: number
        }
        Returns: undefined
      }
      release_credit_hold: {
        Args: {
          p_held_cents: number
          p_run_id: string
          p_run_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      settle_credits_for_run: {
        Args: {
          p_actual_cents: number
          p_held_cents: number
          p_run_id: string
          p_run_type: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
