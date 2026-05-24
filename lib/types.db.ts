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
          status: "draft" | "under_review" | "published" | "rejected";
          current_version_id: string | null;
          search_vector: string | null;
          reason_rejected: string | null;
          content_flags: Json;
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
          status?: "draft" | "under_review" | "published" | "rejected";
          current_version_id?: string | null;
          search_vector?: string | null;
          reason_rejected?: string | null;
          content_flags?: Json;
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
          status?: "draft" | "under_review" | "published" | "rejected";
          current_version_id?: string | null;
          search_vector?: string | null;
          reason_rejected?: string | null;
          content_flags?: Json;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
