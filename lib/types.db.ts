export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          headline: string | null;
          bio: string | null;
          location: string | null;
          avatar_url: string | null;
          is_verified: boolean;
          is_admin: boolean;
          is_persona: boolean;
          unrestricted_usage: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          headline?: string | null;
          bio?: string | null;
          location?: string | null;
          avatar_url?: string | null;
          is_verified?: boolean;
          is_admin?: boolean;
          is_persona?: boolean;
          unrestricted_usage?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          headline?: string | null;
          bio?: string | null;
          location?: string | null;
          avatar_url?: string | null;
          is_verified?: boolean;
          is_admin?: boolean;
          is_persona?: boolean;
          unrestricted_usage?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          icon: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          icon?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          icon?: string | null;
        };
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          creator_id: string;
          category_id: string | null;
          type: "prompt" | "agent" | "workflow";
          title: string;
          slug: string;
          description: string | null;
          models: string[];
          tags: string[];
          price_cents: number;
          currency: string;
          status: "draft" | "under_review" | "published" | "rejected" | "deleted" | "archived";
          current_version_id: string | null;
          search_vector: string | null;
          reason_rejected: string | null;
          content_flags: Json;
          subscription_price_cents: number;
          pricing_mode: "free" | "one_time" | "subscription";
          hosting_fee_cents: number;
          provisioning_mode: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          category_id?: string | null;
          type: "prompt" | "agent" | "workflow";
          title: string;
          slug: string;
          description?: string | null;
          models?: string[];
          tags?: string[];
          price_cents?: number;
          currency?: string;
          status?: "draft" | "under_review" | "published" | "rejected" | "deleted" | "archived";
          current_version_id?: string | null;
          search_vector?: string | null;
          reason_rejected?: string | null;
          content_flags?: Json;
          subscription_price_cents?: number;
          pricing_mode?: "free" | "one_time" | "subscription";
          hosting_fee_cents?: number;
          provisioning_mode?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          category_id?: string | null;
          type?: "prompt" | "agent" | "workflow";
          title?: string;
          slug?: string;
          description?: string | null;
          models?: string[];
          tags?: string[];
          price_cents?: number;
          currency?: string;
          status?: "draft" | "under_review" | "published" | "rejected" | "deleted" | "archived";
          current_version_id?: string | null;
          search_vector?: string | null;
          reason_rejected?: string | null;
          content_flags?: Json;
          subscription_price_cents?: number;
          pricing_mode?: "free" | "one_time" | "subscription";
          hosting_fee_cents?: number;
          provisioning_mode?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_versions: {
        Row: {
          id: string;
          listing_id: string;
          semver: string;
          changelog: string | null;
          prompt_body: string | null;
          env: Json | null;
          bundle_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          semver: string;
          changelog?: string | null;
          prompt_body?: string | null;
          env?: Json | null;
          bundle_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          semver?: string;
          changelog?: string | null;
          prompt_body?: string | null;
          env?: Json | null;
          bundle_path?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_versions_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_accounts: {
        Row: {
          profile_id: string;
          stripe_account_id: string;
          charges_enabled: boolean;
          payouts_enabled: boolean;
        };
        Insert: {
          profile_id: string;
          stripe_account_id: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
        };
        Update: {
          profile_id?: string;
          stripe_account_id?: string;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_accounts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          id: string;
          buyer_id: string;
          listing_id: string;
          version_id: string | null;
          amount_cents: number;
          platform_fee_cents: number;
          tax_cents: number;
          stripe_payment_intent: string | null;
          stripe_checkout_session: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          buyer_id: string;
          listing_id: string;
          version_id?: string | null;
          amount_cents: number;
          platform_fee_cents: number;
          tax_cents?: number;
          stripe_payment_intent?: string | null;
          stripe_checkout_session?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          buyer_id?: string;
          listing_id?: string;
          version_id?: string | null;
          amount_cents?: number;
          platform_fee_cents?: number;
          tax_cents?: number;
          stripe_payment_intent?: string | null;
          stripe_checkout_session?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      downloads: {
        Row: {
          id: string;
          user_id: string | null;
          listing_id: string;
          version_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          listing_id: string;
          version_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          listing_id?: string;
          version_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "downloads_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          listing_id: string;
          author_id: string;
          rating: number;
          body: string | null;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          author_id: string;
          rating: number;
          body?: string | null;
          verified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          author_id?: string;
          rating?: number;
          body?: string | null;
          verified?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          follower_id: string;
          creator_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          creator_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          creator_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      badges: {
        Row: {
          id: string;
          slug: string | null;
          label: string | null;
        };
        Insert: {
          id?: string;
          slug?: string | null;
          label?: string | null;
        };
        Update: {
          id?: string;
          slug?: string | null;
          label?: string | null;
        };
        Relationships: [];
      };
      creator_badges: {
        Row: {
          creator_id: string;
          badge_id: string;
          awarded_at: string;
        };
        Insert: {
          creator_id: string;
          badge_id: string;
          awarded_at?: string;
        };
        Update: {
          creator_id?: string;
          badge_id?: string;
          awarded_at?: string;
        };
        Relationships: [];
      };
      partner_integrations: {
        Row: {
          id: string;
          name: string | null;
          run_url_template: string | null;
          affiliate_param: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          name?: string | null;
          run_url_template?: string | null;
          affiliate_param?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          name?: string | null;
          run_url_template?: string | null;
          affiliate_param?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      moderation_flags: {
        Row: {
          id: string;
          listing_id: string | null;
          reason: string | null;
          status: string;
          flagged_by: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id?: string | null;
          reason?: string | null;
          status?: string;
          flagged_by?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string | null;
          reason?: string | null;
          status?: string;
          flagged_by?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          admin_id: string;
          listing_id: string | null;
          flag_id: string | null;
          action: string;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          listing_id?: string | null;
          flag_id?: string | null;
          action: string;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          listing_id?: string | null;
          flag_id?: string | null;
          action?: string;
          reason?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_api_keys: {
        Row: {
          id: string;
          owner_id: string;
          provider: string;
          encrypted_key: string;
          last4: string;
          is_valid: boolean;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          provider: string;
          encrypted_key: string;
          last4: string;
          is_valid?: boolean;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          provider?: string;
          encrypted_key?: string;
          last4?: string;
          is_valid?: boolean;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      key_events: {
        Row: {
          id: string;
          owner_id: string;
          provider: string;
          event_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          provider: string;
          event_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          provider?: string;
          event_type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      runs: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string | null;
          version_id: string | null;
          model: string | null;
          provider: string | null;
          status: string;
          input_tokens: number;
          output_tokens: number;
          cost_estimate: number;
          output: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id?: string | null;
          version_id?: string | null;
          model?: string | null;
          provider?: string | null;
          status?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_estimate?: number;
          output?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string | null;
          version_id?: string | null;
          model?: string | null;
          provider?: string | null;
          status?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_estimate?: number;
          output?: string | null;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      free_run_quota: {
        Row: {
          user_id: string;
          runs_today: number;
          last_reset: string;
        };
        Insert: {
          user_id: string;
          runs_today?: number;
          last_reset?: string;
        };
        Update: {
          user_id?: string;
          runs_today?: number;
          last_reset?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          agent_slug: string;
          trigger: string;
          status: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          items_produced: number;
          error: string | null;
          is_sandbox: boolean;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          agent_slug: string;
          trigger?: string;
          status?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          items_produced?: number;
          error?: string | null;
          is_sandbox?: boolean;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          agent_slug?: string;
          trigger?: string;
          status?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          items_produced?: number;
          error?: string | null;
          is_sandbox?: boolean;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      agent_action_executions: {
        Row: {
          id: string;
          run_id: string;
          step_index: number;
          action_slug: string;
          execution_key: string;
          result_output: string | null;
          status: "started" | "completed" | "failed";
          error_message: string | null;
          external_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          step_index: number;
          action_slug: string;
          execution_key: string;
          result_output?: string | null;
          status?: "started" | "completed" | "failed";
          error_message?: string | null;
          external_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          run_id?: string;
          step_index?: number;
          action_slug?: string;
          execution_key?: string;
          result_output?: string | null;
          status?: "started" | "completed" | "failed";
          error_message?: string | null;
          external_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      agent_approvals: {
        Row: {
          id: string;
          run_id: string;
          step_id: string | null;
          step_index: number;
          status: string;
          payload: Json;
          expires_at: string | null;
          decided_at: string | null;
          decided_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          step_id?: string | null;
          step_index: number;
          status?: string;
          payload?: Json;
          expires_at?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          step_id?: string | null;
          step_index?: number;
          status?: string;
          payload?: Json;
          expires_at?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_deliverables: {
        Row: {
          id: string;
          run_id: string;
          listing_id: string | null;
          user_id: string;
          kind: string;
          filename: string;
          mime_type: string;
          storage_path: string | null;
          content_text: string | null;
          preview_text: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          listing_id?: string | null;
          user_id: string;
          kind?: string;
          filename: string;
          mime_type?: string;
          storage_path?: string | null;
          content_text?: string | null;
          preview_text?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          listing_id?: string | null;
          user_id?: string;
          kind?: string;
          filename?: string;
          mime_type?: string;
          storage_path?: string | null;
          content_text?: string | null;
          preview_text?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      listing_agent_runs: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string | null;
          version_id: string | null;
          inputs: Json;
          status: string;
          steps_completed: number;
          max_steps: number;
          output: Json;
          error_message: string | null;
          dry_run: boolean;
          used_credits: boolean;
          credit_hold_estimate_cents: number | null;
          started_at: string | null;
          heartbeat_at: string | null;
          claimed_by: string | null;
          paused_at_step: number | null;
          resume_from_step: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id?: string | null;
          version_id?: string | null;
          inputs?: Json;
          status?: string;
          steps_completed?: number;
          max_steps?: number;
          output?: Json;
          error_message?: string | null;
          dry_run?: boolean;
          used_credits?: boolean;
          credit_hold_estimate_cents?: number | null;
          started_at?: string | null;
          heartbeat_at?: string | null;
          claimed_by?: string | null;
          paused_at_step?: number | null;
          resume_from_step?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string | null;
          version_id?: string | null;
          inputs?: Json;
          status?: string;
          steps_completed?: number;
          max_steps?: number;
          output?: Json;
          error_message?: string | null;
          dry_run?: boolean;
          used_credits?: boolean;
          credit_hold_estimate_cents?: number | null;
          started_at?: string | null;
          heartbeat_at?: string | null;
          claimed_by?: string | null;
          paused_at_step?: number | null;
          resume_from_step?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      listing_agent_run_steps: {
        Row: {
          id: string;
          run_id: string;
          step_index: number;
          step_id: string;
          step_type: string;
          label: string | null;
          status: string;
          output_preview: string | null;
          error_code: string | null;
          error_message: string | null;
          provider: string | null;
          model: string | null;
          tool_slug: string | null;
          action_slug: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          step_index: number;
          step_id: string;
          step_type: string;
          label?: string | null;
          status?: string;
          output_preview?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          provider?: string | null;
          model?: string | null;
          tool_slug?: string | null;
          action_slug?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          step_index?: number;
          step_id?: string;
          step_type?: string;
          label?: string | null;
          status?: string;
          output_preview?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          provider?: string | null;
          model?: string | null;
          tool_slug?: string | null;
          action_slug?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_run_activity: {
        Row: {
          id: string;
          user_id: string;
          run_id: string | null;
          listing_id: string | null;
          action_type: string;
          action_label: string;
          detail: Json;
          simulated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          run_id?: string | null;
          listing_id?: string | null;
          action_type: string;
          action_label: string;
          detail?: Json;
          simulated?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          run_id?: string | null;
          listing_id?: string | null;
          action_type?: string;
          action_label?: string;
          detail?: Json;
          simulated?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_outputs: {
        Row: {
          id: string;
          run_id: string | null;
          agent_slug: string;
          kind: string;
          status: string;
          title: string | null;
          payload: Json;
          quality_score: number | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          published_ref: string | null;
          is_sandbox: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id?: string | null;
          agent_slug: string;
          kind: string;
          status?: string;
          title?: string | null;
          payload: Json;
          quality_score?: number | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          published_ref?: string | null;
          is_sandbox?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string | null;
          agent_slug?: string;
          kind?: string;
          status?: string;
          title?: string | null;
          payload?: Json;
          quality_score?: number | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          published_ref?: string | null;
          is_sandbox?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_definitions: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          is_enabled: boolean;
          requires_review: boolean;
          max_runs_per_day: number;
          config: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_enabled?: boolean;
          requires_review?: boolean;
          max_runs_per_day?: number;
          config?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          is_enabled?: boolean;
          requires_review?: boolean;
          max_runs_per_day?: number;
          config?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_schedules: {
        Row: {
          id: string;
          agent_slug: string;
          days: number[];
          hours: number[];
          is_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_slug: string;
          days?: number[];
          hours?: number[];
          is_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_slug?: string;
          days?: number[];
          hours?: number[];
          is_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_budget: {
        Row: {
          id: number;
          daily_cap_usd: number;
          monthly_cap_usd: number;
          daily_spent_usd: number;
          monthly_spent_usd: number;
          daily_reset_date: string;
          monthly_reset_month: string;
          is_paused: boolean;
          mode: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          daily_cap_usd?: number;
          monthly_cap_usd?: number;
          daily_spent_usd?: number;
          monthly_spent_usd?: number;
          daily_reset_date?: string;
          monthly_reset_month?: string;
          is_paused?: boolean;
          mode?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          daily_cap_usd?: number;
          monthly_cap_usd?: number;
          daily_spent_usd?: number;
          monthly_spent_usd?: number;
          daily_reset_date?: string;
          monthly_reset_month?: string;
          is_paused?: boolean;
          mode?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_logs: {
        Row: {
          id: string;
          run_id: string | null;
          agent_slug: string;
          level: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id?: string | null;
          agent_slug: string;
          level?: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string | null;
          agent_slug?: string;
          level?: string;
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      personas: {
        Row: {
          id: string;
          profile_id: string | null;
          username: string;
          display_name: string;
          email: string;
          specialty: string;
          tone: string;
          language: string;
          is_active: boolean;
          daily_quota: number;
          last_used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          username: string;
          display_name: string;
          email: string;
          specialty: string;
          tone: string;
          language?: string;
          is_active?: boolean;
          daily_quota?: number;
          last_used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          username?: string;
          display_name?: string;
          email?: string;
          specialty?: string;
          tone?: string;
          language?: string;
          is_active?: boolean;
          daily_quota?: number;
          last_used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      kpi_snapshots: {
        Row: {
          day: string;
          total_users: number;
          total_listings: number;
          published_listings: number;
          total_purchases: number;
          revenue_cents: number;
          platform_fee_cents: number;
          total_downloads: number;
          new_signups: number;
          created_at: string;
        };
        Insert: {
          day?: string;
          total_users?: number;
          total_listings?: number;
          published_listings?: number;
          total_purchases?: number;
          revenue_cents?: number;
          platform_fee_cents?: number;
          total_downloads?: number;
          new_signups?: number;
          created_at?: string;
        };
        Update: {
          day?: string;
          total_users?: number;
          total_listings?: number;
          published_listings?: number;
          total_purchases?: number;
          revenue_cents?: number;
          platform_fee_cents?: number;
          total_downloads?: number;
          new_signups?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string;
          stripe_subscription_id: string | null;
          stripe_customer_id: string | null;
          status: string;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          cancel_requested_at: string | null;
          pinned_version_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id: string;
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          status?: string;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          cancel_requested_at?: string | null;
          pinned_version_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string;
          stripe_subscription_id?: string | null;
          stripe_customer_id?: string | null;
          status?: string;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          cancel_requested_at?: string | null;
          pinned_version_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string;
          seat_limit: number;
          plan: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string;
          seat_limit?: number;
          plan?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string;
          seat_limit?: number;
          plan?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      org_members: {
        Row: {
          org_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          role?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
      org_listings: {
        Row: {
          id: string;
          org_id: string;
          source_listing_id: string | null;
          title: string;
          type: string;
          status: string;
          content: Json;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          source_listing_id?: string | null;
          title: string;
          type: string;
          status?: string;
          content?: Json;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          source_listing_id?: string | null;
          title?: string;
          type?: string;
          status?: string;
          content?: Json;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      org_audit_log: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string | null;
          action?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_credits: {
        Row: {
          user_id: string;
          balance_cents: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          balance_cents?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          balance_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount_cents: number;
          kind: string;
          description: string | null;
          run_id: string | null;
          stripe_session_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount_cents: number;
          kind: string;
          description?: string | null;
          run_id?: string | null;
          stripe_session_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount_cents?: number;
          kind?: string;
          description?: string | null;
          run_id?: string | null;
          stripe_session_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      scheduled_runs: {
        Row: {
          id: string;
          user_id: string;
          listing_id: string;
          cron_expression: string;
          inputs: Json;
          notify_email: boolean;
          active: boolean;
          last_run_at: string | null;
          next_run_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          listing_id: string;
          cron_expression: string;
          inputs?: Json;
          notify_email?: boolean;
          active?: boolean;
          last_run_at?: string | null;
          next_run_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          listing_id?: string;
          cron_expression?: string;
          inputs?: Json;
          notify_email?: boolean;
          active?: boolean;
          last_run_at?: string | null;
          next_run_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      platform_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_subscription_id: string | null;
          plan: string;
          status: string;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          cancel_requested_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_subscription_id?: string | null;
          plan?: string;
          status?: string;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          cancel_requested_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_subscription_id?: string | null;
          plan?: string;
          status?: string;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          cancel_requested_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      platform_pro_usage: {
        Row: {
          id: string;
          period_month: string;
          listing_id: string;
          creator_id: string;
          run_count: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_month: string;
          listing_id: string;
          creator_id: string;
          run_count?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          period_month?: string;
          listing_id?: string;
          creator_id?: string;
          run_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_pro_revshare: {
        Row: {
          id: string;
          period_month: string;
          creator_id: string;
          listing_id: string | null;
          run_count: number;
          pool_cents: number;
          amount_cents: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          period_month: string;
          creator_id: string;
          listing_id?: string | null;
          run_count?: number;
          pool_cents?: number;
          amount_cents?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          period_month?: string;
          creator_id?: string;
          listing_id?: string | null;
          run_count?: number;
          pool_cents?: number;
          amount_cents?: number;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      platform_run_economics: {
        Row: {
          id: string;
          user_id: string | null;
          run_id: string | null;
          run_type: string;
          actual_cost_cents: number;
          billed_cents: number;
          margin_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          run_id?: string | null;
          run_type: string;
          actual_cost_cents: number;
          billed_cents: number;
          margin_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          run_id?: string | null;
          run_type?: string;
          actual_cost_cents?: number;
          billed_cents?: number;
          margin_cents?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      user_documents: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number;
          tags: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number;
          tags?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          storage_path?: string;
          mime_type?: string | null;
          size_bytes?: number;
          tags?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      platform_credit_guard: {
        Row: {
          id: number;
          is_paused: boolean;
          daily_cost_cents: number;
          daily_margin_cents: number;
          guard_day: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          is_paused?: boolean;
          daily_cost_cents?: number;
          daily_margin_cents?: number;
          guard_day?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          is_paused?: boolean;
          daily_cost_cents?: number;
          daily_margin_cents?: number;
          guard_day?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      admin_kpis: {
        Row: {
          total_users: number;
          new_users_7d: number;
          total_listings: number;
          published_listings: number;
          listings_pending: number;
          total_purchases: number;
          gross_revenue_cents: number;
          platform_revenue_cents: number;
          revenue_30d_cents: number;
          total_downloads: number;
          avg_rating: number;
          outputs_awaiting_review: number;
        };
        Relationships: [];
      };
      sandbox_summary: {
        Row: {
          current_mode: string;
          sandbox_runs: number;
          sandbox_outputs: number;
          sandbox_pending: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
