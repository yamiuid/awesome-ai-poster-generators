export type Json =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: Json | undefined }
  | readonly Json[];

type TableDefinition<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<{
        id: string;
        email: string | null;
        display_name: string | null;
        created_at: string;
        updated_at: string;
      }>;
      subscriptions: TableDefinition<{
        id: string;
        user_id: string;
        waffo_order_id: string | null;
        waffo_subscription_id: string | null;
        plan: "monthly" | "yearly";
        tier: "creator" | "studio";
        status: "active" | "canceling" | "canceled" | "past_due" | "refunded";
        activated_at: string;
        period_start: string;
        period_end: string;
        cancel_at_period_end: boolean;
        last_event_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      entitlement_periods: TableDefinition<{
        id: string;
        user_id: string;
        period_start: string;
        period_end: string;
        credits_granted: number;
        created_at: string;
      }>;
      generations: TableDefinition<{
        id: string;
        user_id: string | null;
        guest_key: string | null;
        guest_limit_key: string | null;
        guest_claimed_at: string | null;
        provider_task_id: string | null;
        prompt: string;
        style: string;
        aspect_ratio: string;
        resolution: string;
        quality: string;
        image_count: number;
        mode: string;
        status: string;
        progress: number;
        reserved_credits: number;
        poll_failures: number;
        input_type: string;
        error_code: string | null;
        error_message: string | null;
        next_poll_at: string | null;
        submitted_at: string;
        completed_at: string | null;
        created_at: string;
      }>;
      generated_assets: TableDefinition<{
        id: string;
        generation_id: string;
        user_id: string | null;
        guest_key: string | null;
        storage_path: string;
        alt_text: string;
        watermarked: boolean;
        expires_at: string | null;
        created_at: string;
      }>;
      credit_reservations: TableDefinition<{
        id: string;
        generation_id: string;
        user_id: string;
        period_id: string;
        amount: number;
        status: string;
        created_at: string;
        settled_at: string | null;
      }>;
      credit_transactions: TableDefinition<{
        id: string;
        user_id: string;
        period_id: string;
        generation_id: string | null;
        kind: string;
        amount: number;
        idempotency_key: string;
        created_at: string;
      }>;
      payment_events: TableDefinition<{
        id: string;
        waffo_event_id: string;
        event_type: string;
        event_mode: string;
        payload: Json;
        received_at: string;
        processed_at: string | null;
      }>;
      guest_usage: TableDefinition<{
        guest_key: string;
        last_generation_at: string | null;
        generation_count: number;
        window_started_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      reserve_credits: {
        Args: { p_user_id: string; p_generation_id: string; p_amount: number };
        Returns: boolean;
      };
      settle_credits: {
        Args: {
          p_generation_id: string;
          p_successful_images: number;
          p_cost_per_image: number;
        };
        Returns: boolean;
      };
      claim_guest_generation: {
        Args: { p_guest_key: string };
        Returns: boolean;
      };
      release_guest_generation: {
        Args: { p_guest_key: string };
        Returns: null;
      };
      create_limited_generation: {
        Args: {
          p_user_id: string | null;
          p_guest_key: string | null;
          p_legacy_guest_key: string | null;
          p_guest_limit_key: string | null;
          p_prompt: string;
          p_style: string;
          p_aspect_ratio: string;
          p_resolution: string;
          p_quality: string;
          p_image_count: number;
          p_mode: string;
          p_reserved_credits: number;
        };
        Returns: Json;
      };
      fail_limited_generation: {
        Args: {
          p_generation_id: string;
          p_status: string;
          p_message: string;
        };
        Returns: Json;
      };
      migrate_legacy_guest_generations: {
        Args: { p_legacy_key: string; p_stable_key: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
