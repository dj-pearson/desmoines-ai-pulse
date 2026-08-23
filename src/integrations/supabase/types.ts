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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      account_deletion_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_feed: {
        Row: {
          activity_type: string
          created_at: string
          event_id: string | null
          id: string
          metadata: Json | null
          target_user_id: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_clicks: {
        Row: {
          campaign_id: string
          creative_id: string
          date: string
          id: string
          impression_id: string | null
          timestamp: string
        }
        Insert: {
          campaign_id: string
          creative_id: string
          date?: string
          id?: string
          impression_id?: string | null
          timestamp?: string
        }
        Update: {
          campaign_id?: string
          creative_id?: string
          date?: string
          id?: string
          impression_id?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_clicks_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "campaign_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_clicks_impression_id_fkey"
            columns: ["impression_id"]
            isOneToOne: false
            referencedRelation: "ad_impressions"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          browser: string | null
          campaign_id: string
          creative_id: string
          date: string
          device_type: string | null
          id: string
          ip_address: string | null
          page_url: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          referrer_url: string | null
          session_id: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          campaign_id: string
          creative_id: string
          date?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          page_url?: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          referrer_url?: string | null
          session_id: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          campaign_id?: string
          creative_id?: string
          date?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          page_url?: string | null
          placement_type?: Database["public"]["Enums"]["placement_type"]
          referrer_url?: string | null
          session_id?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "campaign_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_policies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          policy_description: string
          policy_name: string
          updated_at: string
          violation_severity: Database["public"]["Enums"]["violation_severity"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          policy_description: string
          policy_name: string
          updated_at?: string
          violation_severity?: Database["public"]["Enums"]["violation_severity"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          policy_description?: string
          policy_name?: string
          updated_at?: string
          violation_severity?: Database["public"]["Enums"]["violation_severity"]
        }
        Relationships: []
      }
      ad_price_list: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          product_key: string
          sort_order: number
          tier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          product_key: string
          sort_order?: number
          tier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          product_key?: string
          sort_order?: number
          tier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      ad_rate_card: {
        Row: {
          base_daily_rate: number
          cpm_rate: number | null
          created_at: string | null
          discount_14_day: number | null
          discount_30_day: number | null
          discount_7_day: number | null
          high_multiplier: number | null
          id: string
          is_active: boolean | null
          max_days: number | null
          min_days: number | null
          min_lead_time_days: number | null
          peak_multiplier: number | null
          placement_type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          base_daily_rate: number
          cpm_rate?: number | null
          created_at?: string | null
          discount_14_day?: number | null
          discount_30_day?: number | null
          discount_7_day?: number | null
          high_multiplier?: number | null
          id?: string
          is_active?: boolean | null
          max_days?: number | null
          min_days?: number | null
          min_lead_time_days?: number | null
          peak_multiplier?: number | null
          placement_type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          base_daily_rate?: number
          cpm_rate?: number | null
          created_at?: string | null
          discount_14_day?: number | null
          discount_30_day?: number | null
          discount_7_day?: number | null
          high_multiplier?: number | null
          id?: string
          is_active?: boolean | null
          max_days?: number | null
          min_days?: number | null
          min_lead_time_days?: number | null
          peak_multiplier?: number | null
          placement_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_action_logs: {
        Row: {
          action_description: string
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          target_id: string | null
          target_resource: string | null
          user_agent: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_resource?: string | null
          user_agent?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_resource?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      advertising_packages: {
        Row: {
          ad_placements: string[] | null
          created_at: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_ads_per_month: number | null
          package_description: string | null
          package_name: string
          price_monthly: number
        }
        Insert: {
          ad_placements?: string[] | null
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ads_per_month?: number | null
          package_description?: string | null
          package_name: string
          price_monthly: number
        }
        Update: {
          ad_placements?: string[] | null
          created_at?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ads_per_month?: number | null
          package_description?: string | null
          package_name?: string
          price_monthly?: number
        }
        Relationships: []
      }
      agent_action_approvals: {
        Row: {
          action_type: string
          agent_key: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          proposed_payload: Json | null
          reason: string | null
          status: Database["public"]["Enums"]["agent_approval_status"]
          updated_at: string
        }
        Insert: {
          action_type: string
          agent_key: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          proposed_payload?: Json | null
          reason?: string | null
          status?: Database["public"]["Enums"]["agent_approval_status"]
          updated_at?: string
        }
        Update: {
          action_type?: string
          agent_key?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          proposed_payload?: Json | null
          reason?: string | null
          status?: Database["public"]["Enums"]["agent_approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_approvals_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_month_spend"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_action_approvals_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_action_approvals_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_run_summary"
            referencedColumns: ["agent_key"]
          },
        ]
      }
      agent_action_log: {
        Row: {
          action: string
          agent_key: string
          created_at: string
          id: string
          input: Json | null
          output_summary: string | null
          run_correlation: string | null
          step: number
          tool_name: string | null
        }
        Insert: {
          action: string
          agent_key: string
          created_at?: string
          id?: string
          input?: Json | null
          output_summary?: string | null
          run_correlation?: string | null
          step?: number
          tool_name?: string | null
        }
        Update: {
          action?: string
          agent_key?: string
          created_at?: string
          id?: string
          input?: Json | null
          output_summary?: string | null
          run_correlation?: string | null
          step?: number
          tool_name?: string | null
        }
        Relationships: []
      }
      agent_audit_log: {
        Row: {
          action_type: string
          actor: string
          after: Json | null
          agent_key: string
          before: Json | null
          created_at: string
          id: string
          run_id: string | null
          shadow: boolean
          target_ref: string | null
        }
        Insert: {
          action_type: string
          actor?: string
          after?: Json | null
          agent_key: string
          before?: Json | null
          created_at?: string
          id?: string
          run_id?: string | null
          shadow?: boolean
          target_ref?: string | null
        }
        Update: {
          action_type?: string
          actor?: string
          after?: Json | null
          agent_key?: string
          before?: Json | null
          created_at?: string
          id?: string
          run_id?: string | null
          shadow?: boolean
          target_ref?: string | null
        }
        Relationships: []
      }
      agent_quality_scores: {
        Row: {
          agent_key: string
          category: string
          content_preview: string | null
          created_at: string
          dimensions: Json | null
          eval_cost_usd: number
          id: string
          passed: boolean
          reasons: string | null
          run_id: string | null
          score: number
          task_id: string | null
          threshold: number
        }
        Insert: {
          agent_key: string
          category: string
          content_preview?: string | null
          created_at?: string
          dimensions?: Json | null
          eval_cost_usd?: number
          id?: string
          passed: boolean
          reasons?: string | null
          run_id?: string | null
          score: number
          task_id?: string | null
          threshold: number
        }
        Update: {
          agent_key?: string
          category?: string
          content_preview?: string | null
          created_at?: string
          dimensions?: Json | null
          eval_cost_usd?: number
          id?: string
          passed?: boolean
          reasons?: string | null
          run_id?: string | null
          score?: number
          task_id?: string | null
          threshold?: number
        }
        Relationships: []
      }
      agent_registry: {
        Row: {
          agent_key: string
          auto_override: boolean
          category: Database["public"]["Enums"]["agent_category"]
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          mode: Database["public"]["Enums"]["agent_mode"]
          monthly_cost_budget_usd: number | null
          name: string
          owner_role: string
          provider: string | null
          schedule_cron: string | null
          tier1_confidence_threshold: number
          updated_at: string
        }
        Insert: {
          agent_key: string
          auto_override?: boolean
          category: Database["public"]["Enums"]["agent_category"]
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["agent_mode"]
          monthly_cost_budget_usd?: number | null
          name: string
          owner_role?: string
          provider?: string | null
          schedule_cron?: string | null
          tier1_confidence_threshold?: number
          updated_at?: string
        }
        Update: {
          agent_key?: string
          auto_override?: boolean
          category?: Database["public"]["Enums"]["agent_category"]
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["agent_mode"]
          monthly_cost_budget_usd?: number | null
          name?: string
          owner_role?: string
          provider?: string | null
          schedule_cron?: string | null
          tier1_confidence_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          agent_key: string
          assigned_to: string | null
          category: Database["public"]["Enums"]["agent_category"]
          confidence: number | null
          created_at: string
          dedupe_key: string | null
          id: string
          payload: Json | null
          queue: string | null
          resolution: Json | null
          routed_at: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["agent_task_status"]
          tier: number
          title: string
          updated_at: string
        }
        Insert: {
          agent_key: string
          assigned_to?: string | null
          category: Database["public"]["Enums"]["agent_category"]
          confidence?: number | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          payload?: Json | null
          queue?: string | null
          resolution?: Json | null
          routed_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["agent_task_status"]
          tier?: number
          title: string
          updated_at?: string
        }
        Update: {
          agent_key?: string
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["agent_category"]
          confidence?: number | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          payload?: Json | null
          queue?: string | null
          resolution?: Json | null
          routed_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["agent_task_status"]
          tier?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_month_spend"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_run_summary"
            referencedColumns: ["agent_key"]
          },
        ]
      }
      ai_configuration: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_environment_config: {
        Row: {
          config_key: string
          config_type: string | null
          coolify_variable: string | null
          created_at: string | null
          default_value: string | null
          description: string | null
          id: string
          is_required: boolean | null
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_type?: string | null
          coolify_variable?: string | null
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_type?: string | null
          coolify_variable?: string | null
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_model_configurations: {
        Row: {
          api_endpoint: string | null
          auth_method: string
          auto_update_alias: boolean | null
          context_window: number | null
          cost_rating: number | null
          created_at: string | null
          deprecated_date: string | null
          deprecation_reason: string | null
          description: string | null
          env_var_model_override: string | null
          id: string
          is_active: boolean | null
          is_alias: boolean | null
          is_default: boolean | null
          last_updated: string | null
          max_tokens: number | null
          model_alias: string | null
          model_display_name: string
          model_family: string | null
          model_name: string
          points_to_model: string | null
          priority_order: number | null
          provider: string
          quality_rating: number | null
          speed_rating: number | null
          task_type: string | null
          usage_category: string | null
        }
        Insert: {
          api_endpoint?: string | null
          auth_method?: string
          auto_update_alias?: boolean | null
          context_window?: number | null
          cost_rating?: number | null
          created_at?: string | null
          deprecated_date?: string | null
          deprecation_reason?: string | null
          description?: string | null
          env_var_model_override?: string | null
          id?: string
          is_active?: boolean | null
          is_alias?: boolean | null
          is_default?: boolean | null
          last_updated?: string | null
          max_tokens?: number | null
          model_alias?: string | null
          model_display_name: string
          model_family?: string | null
          model_name: string
          points_to_model?: string | null
          priority_order?: number | null
          provider: string
          quality_rating?: number | null
          speed_rating?: number | null
          task_type?: string | null
          usage_category?: string | null
        }
        Update: {
          api_endpoint?: string | null
          auth_method?: string
          auto_update_alias?: boolean | null
          context_window?: number | null
          cost_rating?: number | null
          created_at?: string | null
          deprecated_date?: string | null
          deprecation_reason?: string | null
          description?: string | null
          env_var_model_override?: string | null
          id?: string
          is_active?: boolean | null
          is_alias?: boolean | null
          is_default?: boolean | null
          last_updated?: string | null
          max_tokens?: number | null
          model_alias?: string | null
          model_display_name?: string
          model_family?: string | null
          model_name?: string
          points_to_model?: string | null
          priority_order?: number | null
          provider?: string
          quality_rating?: number | null
          speed_rating?: number | null
          task_type?: string | null
          usage_category?: string | null
        }
        Relationships: []
      }
      ai_models: {
        Row: {
          context_window: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_output_tokens: number | null
          model_id: string
          model_name: string
          provider: string
          supports_vision: boolean | null
          updated_at: string
        }
        Insert: {
          context_window?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_output_tokens?: number | null
          model_id: string
          model_name: string
          provider: string
          supports_vision?: boolean | null
          updated_at?: string
        }
        Update: {
          context_window?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_output_tokens?: number | null
          model_id?: string
          model_name?: string
          provider?: string
          supports_vision?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      analytics_properties: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          metadata: Json | null
          property_id: string
          property_name: string
          property_url: string | null
          provider_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          property_id: string
          property_name: string
          property_url?: string | null
          provider_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          property_id?: string
          property_name?: string
          property_url?: string | null
          provider_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      analytics_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          end_date: string | null
          error_message: string | null
          id: string
          job_type: string
          property_id: string | null
          provider_name: string
          records_synced: number | null
          start_date: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          end_date?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          property_id?: string | null
          provider_name: string
          records_synced?: number | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          end_date?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          property_id?: string | null
          provider_name?: string
          records_synced?: number | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      archived_events: {
        Row: {
          ai_writeup: string | null
          archived_at: string | null
          category: string
          city: string | null
          created_at: string | null
          date: string
          enhanced_description: string | null
          event_start_local: string | null
          event_start_utc: string | null
          event_timezone: string | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          id: string
          image_url: string | null
          is_enhanced: boolean | null
          is_featured: boolean | null
          latitude: number | null
          location: string
          longitude: number | null
          original_description: string | null
          price: string | null
          search_vector: unknown
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          source_url: string | null
          title: string
          updated_at: string | null
          venue: string | null
          writeup_generated_at: string | null
          writeup_prompt_used: string | null
        }
        Insert: {
          ai_writeup?: string | null
          archived_at?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date: string
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          location: string
          longitude?: number | null
          original_description?: string | null
          price?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
          venue?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Update: {
          ai_writeup?: string | null
          archived_at?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date?: string
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string
          longitude?: number | null
          original_description?: string | null
          price?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
          venue?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Relationships: []
      }
      article_comments: {
        Row: {
          article_id: string
          content: string
          created_at: string
          id: string
          is_approved: boolean | null
          parent_comment_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "article_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      article_webhooks: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      apple_notification_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notification_type: string | null
          notification_uuid: string
          original_transaction_id: string | null
          processed_at: string
          status: string
          subtype: string | null
          user_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type?: string | null
          notification_uuid: string
          original_transaction_id?: string | null
          processed_at?: string
          status: string
          subtype?: string | null
          user_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type?: string | null
          notification_uuid?: string
          original_transaction_id?: string | null
          processed_at?: string
          status?: string
          subtype?: string | null
          user_subscription_id?: string | null
        }
        Relationships: []
      }
      articles: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string
          excerpt: string | null
          featured_image_url: string | null
          generated_from_suggestion_id: string | null
          id: string
          is_auto_published: boolean
          pipeline_reasons: string[] | null
          published_at: string | null
          quality_score: number | null
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content: string
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          generated_from_suggestion_id?: string | null
          id?: string
          is_auto_published?: boolean
          pipeline_reasons?: string[] | null
          published_at?: string | null
          quality_score?: number | null
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          generated_from_suggestion_id?: string | null
          id?: string
          is_auto_published?: boolean
          pipeline_reasons?: string[] | null
          published_at?: string | null
          quality_score?: number | null
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_generated_from_suggestion_id_fkey"
            columns: ["generated_from_suggestion_id"]
            isOneToOne: false
            referencedRelation: "content_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      attractions: {
        Row: {
          accessibility_notes: string | null
          address: string | null
          created_at: string | null
          description: string | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          heal_attempts: number
          hours: Json | null
          hours_summary: string | null
          id: string
          image_checked_at: string | null
          image_url: string | null
          is_active: boolean
          is_featured: boolean | null
          is_free: boolean | null
          is_indoor: boolean | null
          is_kid_friendly: boolean | null
          is_sponsored: boolean
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          needs_manual_verification: boolean
          rating: number | null
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          sponsored_until: string | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          address?: string | null
          created_at?: string | null
          description?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          heal_attempts?: number
          hours?: Json | null
          hours_summary?: string | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          is_free?: boolean | null
          is_indoor?: boolean | null
          is_kid_friendly?: boolean | null
          is_sponsored?: boolean
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          needs_manual_verification?: boolean
          rating?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          sponsored_until?: string | null
          type: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          address?: string | null
          created_at?: string | null
          description?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          heal_attempts?: number
          hours?: Json | null
          hours_summary?: string | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          is_free?: boolean | null
          is_indoor?: boolean | null
          is_kid_friendly?: boolean | null
          is_sponsored?: boolean
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          needs_manual_verification?: boolean
          rating?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          sponsored_until?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      auto_approval_rules: {
        Row: {
          application_count: number | null
          conditions: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          enabled: boolean | null
          id: string
          last_applied_at: string | null
          min_confidence_score: number | null
          priority: number | null
          rule_description: string | null
          rule_name: string
          updated_at: string | null
        }
        Insert: {
          application_count?: number | null
          conditions: Json
          content_type: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          id?: string
          last_applied_at?: string | null
          min_confidence_score?: number | null
          priority?: number | null
          rule_description?: string | null
          rule_name: string
          updated_at?: string | null
        }
        Update: {
          application_count?: number | null
          conditions?: Json
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          id?: string
          last_applied_at?: string | null
          min_confidence_score?: number | null
          priority?: number | null
          rule_description?: string | null
          rule_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      automation_job_runs: {
        Row: {
          agent_key: string | null
          attempts: number
          cost_usd: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          items_escalated: number
          items_failed: number
          items_processed: number
          job_name: string
          metadata: Json | null
          started_at: string
          status: string
          summary: string | null
          tokens_used: number
        }
        Insert: {
          agent_key?: string | null
          attempts?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          items_escalated?: number
          items_failed?: number
          items_processed?: number
          job_name: string
          metadata?: Json | null
          started_at?: string
          status?: string
          summary?: string | null
          tokens_used?: number
        }
        Update: {
          agent_key?: string | null
          attempts?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          items_escalated?: number
          items_failed?: number
          items_processed?: number
          job_name?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          summary?: string | null
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_job_runs_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_month_spend"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "automation_job_runs_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "automation_job_runs_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_run_summary"
            referencedColumns: ["agent_key"]
          },
        ]
      }
      backup_checks: {
        Row: {
          backup_age_hours: number | null
          checked_at: string
          details: Json | null
          id: string
          latest_backup_at: string | null
          method: string
          ok: boolean
          row_counts: Json | null
        }
        Insert: {
          backup_age_hours?: number | null
          checked_at?: string
          details?: Json | null
          id?: string
          latest_backup_at?: string | null
          method?: string
          ok: boolean
          row_counts?: Json | null
        }
        Update: {
          backup_age_hours?: number | null
          checked_at?: string
          details?: Json | null
          id?: string
          latest_backup_at?: string | null
          method?: string
          ok?: boolean
          row_counts?: Json | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          badge_type: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          points_value: number
          rarity: string
          requirements: Json
        }
        Insert: {
          badge_type: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_value?: number
          rarity?: string
          requirements: Json
        }
        Update: {
          badge_type?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_value?: number
          rarity?: string
          requirements?: Json
        }
        Relationships: []
      }
      blocked_email_domains: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          notes: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          notes?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          ip_address: string
          is_permanent: boolean | null
          reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          is_permanent?: boolean | null
          reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          is_permanent?: boolean | null
          reason?: string | null
        }
        Relationships: []
      }
      brewery_trail_checkins: {
        Row: {
          beer_name: string | null
          checked_in_at: string | null
          id: string
          photo_url: string | null
          rating: number | null
          restaurant_id: string
          user_id: string
        }
        Insert: {
          beer_name?: string | null
          checked_in_at?: string | null
          id?: string
          photo_url?: string | null
          rating?: number | null
          restaurant_id: string
          user_id: string
        }
        Update: {
          beer_name?: string | null
          checked_in_at?: string | null
          id?: string
          photo_url?: string | null
          rating?: number | null
          restaurant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      business_analytics: {
        Row: {
          ad_clicks: number | null
          ad_impressions: number | null
          business_id: string
          created_at: string
          date: string
          direction_requests: number | null
          id: string
          phone_clicks: number | null
          profile_views: number | null
          social_media_clicks: number | null
          website_clicks: number | null
        }
        Insert: {
          ad_clicks?: number | null
          ad_impressions?: number | null
          business_id: string
          created_at?: string
          date?: string
          direction_requests?: number | null
          id?: string
          phone_clicks?: number | null
          profile_views?: number | null
          social_media_clicks?: number | null
          website_clicks?: number | null
        }
        Update: {
          ad_clicks?: number | null
          ad_impressions?: number | null
          business_id?: string
          created_at?: string
          date?: string
          direction_requests?: number | null
          id?: string
          phone_clicks?: number | null
          profile_views?: number | null
          social_media_clicks?: number | null
          website_clicks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_analytics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          address: string | null
          amenities: string[] | null
          business_hours: Json | null
          business_name: string
          business_type: string
          city: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_featured: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          monthly_fee: number | null
          partnership_tier: string | null
          phone: string | null
          social_media_links: Json | null
          state: string | null
          updated_at: string
          user_id: string
          verification_status: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          business_hours?: Json | null
          business_name: string
          business_type?: string
          city?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_featured?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          monthly_fee?: number | null
          partnership_tier?: string | null
          phone?: string | null
          social_media_links?: Json | null
          state?: string | null
          updated_at?: string
          user_id: string
          verification_status?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          business_hours?: Json | null
          business_name?: string
          business_type?: string
          city?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_featured?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          monthly_fee?: number | null
          partnership_tier?: string | null
          phone?: string | null
          social_media_links?: Json | null
          state?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          calendar_id: string
          created_at: string
          description: string | null
          end_time: string
          external_event_id: string
          id: string
          is_all_day: boolean | null
          location: string | null
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          calendar_id: string
          created_at?: string
          description?: string | null
          end_time: string
          external_event_id: string
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          start_time: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          external_event_id?: string
          id?: string
          is_all_day?: boolean | null
          location?: string | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "user_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_preferences: {
        Row: {
          auto_suggest_events: boolean | null
          buffer_time_minutes: number | null
          created_at: string
          id: string
          location_radius_km: number | null
          max_daily_events: number | null
          notification_preferences: Json | null
          preferred_event_duration: number | null
          updated_at: string
          user_id: string
          work_days: number[] | null
          work_hours_end: string | null
          work_hours_start: string | null
        }
        Insert: {
          auto_suggest_events?: boolean | null
          buffer_time_minutes?: number | null
          created_at?: string
          id?: string
          location_radius_km?: number | null
          max_daily_events?: number | null
          notification_preferences?: Json | null
          preferred_event_duration?: number | null
          updated_at?: string
          user_id: string
          work_days?: number[] | null
          work_hours_end?: string | null
          work_hours_start?: string | null
        }
        Update: {
          auto_suggest_events?: boolean | null
          buffer_time_minutes?: number | null
          created_at?: string
          id?: string
          location_radius_km?: number | null
          max_daily_events?: number | null
          notification_preferences?: Json | null
          preferred_event_duration?: number | null
          updated_at?: string
          user_id?: string
          work_days?: number[] | null
          work_hours_end?: string | null
          work_hours_start?: string | null
        }
        Relationships: []
      }
      campaign_analytics_daily: {
        Row: {
          campaign_id: string
          clicks: number | null
          cost: number | null
          created_at: string
          creative_id: string
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          unique_viewers: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          clicks?: number | null
          cost?: number | null
          created_at?: string
          creative_id: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          unique_viewers?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number | null
          cost?: number | null
          created_at?: string
          creative_id?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          unique_viewers?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_analytics_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_analytics_daily_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "campaign_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_creatives: {
        Row: {
          auto_review_checks: Json | null
          auto_review_reasons: string[] | null
          auto_reviewed: boolean
          campaign_id: string
          created_at: string
          cta_text: string | null
          description: string | null
          dimensions_height: number | null
          dimensions_width: number | null
          file_size: number | null
          file_type: string | null
          id: string
          image_url: string | null
          is_approved: boolean | null
          link_url: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          rejection_reason: string | null
          review_path: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auto_review_checks?: Json | null
          auto_review_reasons?: string[] | null
          auto_reviewed?: boolean
          campaign_id: string
          created_at?: string
          cta_text?: string | null
          description?: string | null
          dimensions_height?: number | null
          dimensions_width?: number | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          link_url?: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          rejection_reason?: string | null
          review_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auto_review_checks?: Json | null
          auto_review_reasons?: string[] | null
          auto_reviewed?: boolean
          campaign_id?: string
          created_at?: string
          cta_text?: string | null
          description?: string | null
          dimensions_height?: number | null
          dimensions_width?: number | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          link_url?: string | null
          placement_type?: Database["public"]["Enums"]["placement_type"]
          rejection_reason?: string | null
          review_path?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_notifications: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          recipient_email: string | null
          recipient_user_id: string | null
          title: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          title: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          recipient_email?: string | null
          recipient_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_placements: {
        Row: {
          campaign_id: string
          created_at: string
          daily_cost: number
          days_count: number
          estimated_daily_impressions: number | null
          id: string
          placement_type: Database["public"]["Enums"]["placement_type"]
          pricing_model: string | null
          total_cost: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          daily_cost: number
          days_count: number
          estimated_daily_impressions?: number | null
          id?: string
          placement_type: Database["public"]["Enums"]["placement_type"]
          pricing_model?: string | null
          total_cost: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          daily_cost?: number
          days_count?: number
          estimated_daily_impressions?: number | null
          id?: string
          placement_type?: Database["public"]["Enums"]["placement_type"]
          pricing_model?: string | null
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_placements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_team_members: {
        Row: {
          accepted_at: string | null
          campaign_owner_id: string
          created_at: string
          expires_at: string
          id: string
          invitation_status: Database["public"]["Enums"]["invitation_status"]
          invitation_token: string | null
          invited_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_member_email: string
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          campaign_owner_id: string
          created_at?: string
          expires_at?: string
          id?: string
          invitation_status?: Database["public"]["Enums"]["invitation_status"]
          invitation_token?: string | null
          invited_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_member_email: string
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          campaign_owner_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invitation_status?: Database["public"]["Enums"]["invitation_status"]
          invitation_token?: string | null
          invited_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_member_email?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          approval_notes: string | null
          auto_renew: boolean | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          original_campaign_id: string | null
          rejected_reason: string | null
          renewal_eligible: boolean | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_cost: number | null
          traffic_tier: Database["public"]["Enums"]["traffic_tier"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_notes?: string | null
          auto_renew?: boolean | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          original_campaign_id?: string | null
          rejected_reason?: string | null
          renewal_eligible?: boolean | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_cost?: number | null
          traffic_tier?: Database["public"]["Enums"]["traffic_tier"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_notes?: string | null
          auto_renew?: boolean | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          original_campaign_id?: string | null
          rejected_reason?: string | null
          renewal_eligible?: boolean | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_cost?: number | null
          traffic_tier?: Database["public"]["Enums"]["traffic_tier"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_original_campaign_id_fkey"
            columns: ["original_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_runs: {
        Row: {
          branch: string | null
          conclusion: string
          created_at: string
          duration_s: number | null
          flaky_count: number
          head_sha: string | null
          id: string
          run_id: string | null
          workflow: string
        }
        Insert: {
          branch?: string | null
          conclusion: string
          created_at?: string
          duration_s?: number | null
          flaky_count?: number
          head_sha?: string | null
          id?: string
          run_id?: string | null
          workflow: string
        }
        Update: {
          branch?: string | null
          conclusion?: string
          created_at?: string
          duration_s?: number | null
          flaky_count?: number
          head_sha?: string | null
          id?: string
          run_id?: string | null
          workflow?: string
        }
        Relationships: []
      }
      community_challenges: {
        Row: {
          challenge_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          max_participants: number | null
          requirements: Json
          reward_badges: string[] | null
          reward_points: number | null
          start_date: string
          title: string
        }
        Insert: {
          challenge_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          max_participants?: number | null
          requirements: Json
          reward_badges?: string[] | null
          reward_points?: number | null
          start_date: string
          title: string
        }
        Update: {
          challenge_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          max_participants?: number | null
          requirements?: Json
          reward_badges?: string[] | null
          reward_points?: number | null
          start_date?: string
          title?: string
        }
        Relationships: []
      }
      competitor_content: {
        Row: {
          category: string | null
          competitor_id: string
          content_score: number | null
          content_type: string
          description: string | null
          engagement_metrics: Json | null
          id: string
          publish_date: string | null
          scraped_at: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          competitor_id: string
          content_score?: number | null
          content_type: string
          description?: string | null
          engagement_metrics?: Json | null
          id?: string
          publish_date?: string | null
          scraped_at?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          competitor_id?: string
          content_score?: number | null
          content_type?: string
          description?: string | null
          engagement_metrics?: Json | null
          id?: string
          publish_date?: string | null
          scraped_at?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_content_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_reports: {
        Row: {
          average_content_score: number | null
          competitive_advantages: Json | null
          competitor_id: string
          content_gaps_identified: number | null
          created_at: string
          id: string
          recommendations: Json | null
          report_date: string
          suggestions_generated: number | null
          top_performing_categories: string[] | null
          total_content_pieces: number | null
        }
        Insert: {
          average_content_score?: number | null
          competitive_advantages?: Json | null
          competitor_id: string
          content_gaps_identified?: number | null
          created_at?: string
          id?: string
          recommendations?: Json | null
          report_date?: string
          suggestions_generated?: number | null
          top_performing_categories?: string[] | null
          total_content_pieces?: number | null
        }
        Update: {
          average_content_score?: number | null
          competitive_advantages?: Json | null
          competitor_id?: string
          content_gaps_identified?: number | null
          created_at?: string
          id?: string
          recommendations?: Json | null
          report_date?: string
          suggestions_generated?: number | null
          top_performing_categories?: string[] | null
          total_content_pieces?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_reports_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          primary_focus: string | null
          updated_at: string
          website_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          primary_focus?: string | null
          updated_at?: string
          website_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          primary_focus?: string | null
          updated_at?: string
          website_url?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_type: string
          email_hash: string | null
          granted: boolean
          id: number
          ip_address: unknown
          metadata: Json
          policy_version: string | null
          recorded_at: string
          source: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_type: string
          email_hash?: string | null
          granted: boolean
          id?: never
          ip_address?: unknown
          metadata?: Json
          policy_version?: string | null
          recorded_at?: string
          source?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          email_hash?: string | null
          granted?: boolean
          id?: never
          ip_address?: unknown
          metadata?: Json
          policy_version?: string | null
          recorded_at?: string
          source?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          created_at: string
          email: string
          id: string
          inquiry_type: string
          ip_address: unknown
          message: string
          moderation_status: string
          name: string
          phone: string | null
          priority: string | null
          referrer: string | null
          responded_at: string | null
          source_page: string | null
          status: string
          subject: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          created_at?: string
          email: string
          id?: string
          inquiry_type?: string
          ip_address?: unknown
          message: string
          moderation_status?: string
          name: string
          phone?: string | null
          priority?: string | null
          referrer?: string | null
          responded_at?: string | null
          source_page?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          created_at?: string
          email?: string
          id?: string
          inquiry_type?: string
          ip_address?: unknown
          message?: string
          moderation_status?: string
          name?: string
          phone?: string | null
          priority?: string | null
          referrer?: string | null
          responded_at?: string | null
          source_page?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      content_favorites: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      content_helpful_votes: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          id: string
          is_helpful: boolean
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          is_helpful: boolean
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          is_helpful?: boolean
          user_id?: string
        }
        Relationships: []
      }
      content_link_checks: {
        Row: {
          consecutive_failures: number
          first_failed_at: string | null
          id: string
          last_checked_at: string
          marked_dead: boolean
          ok: boolean
          row_id: string
          status_code: number | null
          target_table: string
          updated_at: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          first_failed_at?: string | null
          id?: string
          last_checked_at?: string
          marked_dead?: boolean
          ok?: boolean
          row_id: string
          status_code?: number | null
          target_table: string
          updated_at?: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          first_failed_at?: string | null
          id?: string
          last_checked_at?: string
          marked_dead?: boolean
          ok?: boolean
          row_id?: string
          status_code?: number | null
          target_table?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      content_merge_candidates: {
        Row: {
          confidence: number
          content_type: string
          created_at: string
          distance_meters: number | null
          id: string
          loser_id: string
          name_similarity: number | null
          reasons: Json
          resolved_at: string | null
          resolved_by: string | null
          same_date: boolean | null
          status: string
          survivor_id: string
        }
        Insert: {
          confidence: number
          content_type: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          loser_id: string
          name_similarity?: number | null
          reasons?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          same_date?: boolean | null
          status?: string
          survivor_id: string
        }
        Update: {
          confidence?: number
          content_type?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          loser_id?: string
          name_similarity?: number | null
          reasons?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          same_date?: boolean | null
          status?: string
          survivor_id?: string
        }
        Relationships: []
      }
      content_merges: {
        Row: {
          confidence: number | null
          content_type: string
          created_at: string
          decided_by: string
          id: string
          loser_id: string
          repointed: Json
          reversed: boolean
          reversed_at: string | null
          reversed_by: string | null
          survivor_id: string
        }
        Insert: {
          confidence?: number | null
          content_type: string
          created_at?: string
          decided_by?: string
          id?: string
          loser_id: string
          repointed?: Json
          reversed?: boolean
          reversed_at?: string | null
          reversed_by?: string | null
          survivor_id: string
        }
        Update: {
          confidence?: number | null
          content_type?: string
          created_at?: string
          decided_by?: string
          id?: string
          loser_id?: string
          repointed?: Json
          reversed?: boolean
          reversed_at?: string | null
          reversed_by?: string | null
          survivor_id?: string
        }
        Relationships: []
      }
      content_metrics: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          date: string
          hour: number | null
          id: string
          metric_type: string
          metric_value: number | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          date?: string
          hour?: number | null
          id?: string
          metric_type: string
          metric_value?: number | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          date?: string
          hour?: number | null
          id?: string
          metric_type?: string
          metric_value?: number | null
        }
        Relationships: []
      }
      content_moderation: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_kind: string
          excerpt: string | null
          id: string
          off_topic: number | null
          reasons: Json
          spam: number | null
          status: string
          toxicity: number | null
          updated_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_kind?: string
          excerpt?: string | null
          id?: string
          off_topic?: number | null
          reasons?: Json
          spam?: number | null
          status?: string
          toxicity?: number | null
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_kind?: string
          excerpt?: string | null
          id?: string
          off_topic?: number | null
          reasons?: Json
          spam?: number | null
          status?: string
          toxicity?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      content_performance_metrics: {
        Row: {
          avg_view_duration: number | null
          bookmarks_count: number | null
          bounce_rate: number | null
          click_through_rate: number | null
          content_freshness_score: number | null
          content_id: string
          content_type: string
          conversion_rate: number | null
          date: string
          id: string
          last_updated: string | null
          search_result_clicks: number | null
          search_result_position: number | null
          shares_count: number | null
          total_views: number | null
          unique_viewers: number | null
          user_rating: number | null
        }
        Insert: {
          avg_view_duration?: number | null
          bookmarks_count?: number | null
          bounce_rate?: number | null
          click_through_rate?: number | null
          content_freshness_score?: number | null
          content_id: string
          content_type: string
          conversion_rate?: number | null
          date?: string
          id?: string
          last_updated?: string | null
          search_result_clicks?: number | null
          search_result_position?: number | null
          shares_count?: number | null
          total_views?: number | null
          unique_viewers?: number | null
          user_rating?: number | null
        }
        Update: {
          avg_view_duration?: number | null
          bookmarks_count?: number | null
          bounce_rate?: number | null
          click_through_rate?: number | null
          content_freshness_score?: number | null
          content_id?: string
          content_type?: string
          conversion_rate?: number | null
          date?: string
          id?: string
          last_updated?: string | null
          search_result_clicks?: number | null
          search_result_position?: number | null
          shares_count?: number | null
          total_views?: number | null
          unique_viewers?: number | null
          user_rating?: number | null
        }
        Relationships: []
      }
      content_queue: {
        Row: {
          confidence_score: number | null
          content_data: Json
          content_id: string | null
          content_type: string
          created_at: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
          validation_results: Json | null
        }
        Insert: {
          confidence_score?: number | null
          content_data: Json
          content_id?: string | null
          content_type: string
          created_at?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_results?: Json | null
        }
        Update: {
          confidence_score?: number | null
          content_data?: Json
          content_id?: string | null
          content_type?: string
          created_at?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_results?: Json | null
        }
        Relationships: []
      }
      content_rating_aggregates: {
        Row: {
          average_rating: number
          content_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          id: string
          last_updated: string
          rating_distribution: Json | null
          total_ratings: number
          weighted_average: number
        }
        Insert: {
          average_rating?: number
          content_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          id?: string
          last_updated?: string
          rating_distribution?: Json | null
          total_ratings?: number
          weighted_average?: number
        }
        Update: {
          average_rating?: number
          content_id?: string
          content_type?: Database["public"]["Enums"]["content_type"]
          id?: string
          last_updated?: string
          rating_distribution?: Json | null
          total_ratings?: number
          weighted_average?: number
        }
        Relationships: []
      }
      content_suggestions: {
        Row: {
          ai_analysis: Json | null
          competitor_content_id: string | null
          created_at: string
          id: string
          improvement_areas: string[] | null
          priority_score: number | null
          status: string | null
          suggested_description: string | null
          suggested_tags: string[] | null
          suggested_title: string
          suggestion_type: string
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          competitor_content_id?: string | null
          created_at?: string
          id?: string
          improvement_areas?: string[] | null
          priority_score?: number | null
          status?: string | null
          suggested_description?: string | null
          suggested_tags?: string[] | null
          suggested_title: string
          suggestion_type: string
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          competitor_content_id?: string | null
          created_at?: string
          id?: string
          improvement_areas?: string[] | null
          priority_score?: number | null
          status?: string | null
          suggested_description?: string | null
          suggested_tags?: string[] | null
          suggested_title?: string
          suggestion_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_suggestions_competitor_content_id_fkey"
            columns: ["competitor_content_id"]
            isOneToOne: false
            referencedRelation: "competitor_content"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_accounts: {
        Row: {
          advertiser_user_id: string | null
          business_ref: string | null
          category: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          owner: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          advertiser_user_id?: string | null
          business_ref?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          owner?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          advertiser_user_id?: string | null
          business_ref?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          owner?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          lead_id: string | null
          note: string | null
          opportunity_id: string | null
          type: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          note?: string | null
          opportunity_id?: string | null
          type?: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          note?: string | null
          opportunity_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          account_id: string | null
          business_name: string
          category: string | null
          contact_email: string | null
          created_at: string
          enriched_at: string | null
          enrichment: Json | null
          fit_rationale: string | null
          fit_score: number | null
          id: string
          next_action: string | null
          next_action_at: string | null
          outreach_stopped: boolean
          owner: string | null
          priority: string | null
          prospect_lead_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          business_name: string
          category?: string | null
          contact_email?: string | null
          created_at?: string
          enriched_at?: string | null
          enrichment?: Json | null
          fit_rationale?: string | null
          fit_score?: number | null
          id?: string
          next_action?: string | null
          next_action_at?: string | null
          outreach_stopped?: boolean
          owner?: string | null
          priority?: string | null
          prospect_lead_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          business_name?: string
          category?: string | null
          contact_email?: string | null
          created_at?: string
          enriched_at?: string | null
          enrichment?: Json | null
          fit_rationale?: string | null
          fit_score?: number | null
          id?: string
          next_action?: string | null
          next_action_at?: string | null
          outreach_stopped?: boolean
          owner?: string | null
          priority?: string | null
          prospect_lead_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_prospect_lead_id_fkey"
            columns: ["prospect_lead_id"]
            isOneToOne: false
            referencedRelation: "prospect_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          account_id: string | null
          assigned_closer: string | null
          campaign_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          lead_id: string | null
          name: string
          next_action: string | null
          next_action_at: string | null
          onboarding_started: boolean
          owner: string | null
          stage: Database["public"]["Enums"]["crm_opp_stage"]
          updated_at: string
          value: number
        }
        Insert: {
          account_id?: string | null
          assigned_closer?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          name: string
          next_action?: string | null
          next_action_at?: string | null
          onboarding_started?: boolean
          owner?: string | null
          stage?: Database["public"]["Enums"]["crm_opp_stage"]
          updated_at?: string
          value?: number
        }
        Update: {
          account_id?: string | null
          assigned_closer?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          name?: string
          next_action?: string | null
          next_action_at?: string | null
          onboarding_started?: boolean
          owner?: string | null
          stage?: Database["public"]["Enums"]["crm_opp_stage"]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_logs: {
        Row: {
          created_at: string | null
          error_details: string | null
          id: string
          job_id: string | null
          message: string
        }
        Insert: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_id?: string | null
          message: string
        }
        Update: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_id?: string | null
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scraping_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      csp_violation_logs: {
        Row: {
          blocked_uri: string
          disposition: string | null
          document_uri: string
          effective_directive: string | null
          id: string
          ip_address: string | null
          original_policy: string | null
          referrer: string | null
          status_code: number | null
          timestamp: string
          user_agent: string | null
          violated_directive: string
          violation_type: Database["public"]["Enums"]["csp_violation_type"]
        }
        Insert: {
          blocked_uri: string
          disposition?: string | null
          document_uri: string
          effective_directive?: string | null
          id?: string
          ip_address?: string | null
          original_policy?: string | null
          referrer?: string | null
          status_code?: number | null
          timestamp?: string
          user_agent?: string | null
          violated_directive: string
          violation_type: Database["public"]["Enums"]["csp_violation_type"]
        }
        Update: {
          blocked_uri?: string
          disposition?: string | null
          document_uri?: string
          effective_directive?: string | null
          id?: string
          ip_address?: string | null
          original_policy?: string | null
          referrer?: string | null
          status_code?: number | null
          timestamp?: string
          user_agent?: string | null
          violated_directive?: string
          violation_type?: Database["public"]["Enums"]["csp_violation_type"]
        }
        Relationships: []
      }
      curated_itineraries: {
        Row: {
          cover_image: string | null
          created_at: string | null
          description: string | null
          duration: string
          id: string
          is_published: boolean | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          stops: Json
          theme: string
          title: string
          updated_at: string | null
        }
        Insert: {
          cover_image?: string | null
          created_at?: string | null
          description?: string | null
          duration: string
          id?: string
          is_published?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          stops?: Json
          theme: string
          title: string
          updated_at?: string | null
        }
        Update: {
          cover_image?: string | null
          created_at?: string | null
          description?: string | null
          duration?: string
          id?: string
          is_published?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          stops?: Json
          theme?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      data_quality_issues: {
        Row: {
          attempts: number
          first_seen: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          missing_fields: string[]
          resolved_at: string | null
          row_id: string
          status: string
          target_table: string
        }
        Insert: {
          attempts?: number
          first_seen?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          missing_fields?: string[]
          resolved_at?: string | null
          row_id: string
          status?: string
          target_table: string
        }
        Update: {
          attempts?: number
          first_seen?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          missing_fields?: string[]
          resolved_at?: string | null
          row_id?: string
          status?: string
          target_table?: string
        }
        Relationships: []
      }
      data_quality_scans: {
        Row: {
          auto_fixed_count: number | null
          content_type: string
          id: string
          issues_found: Json | null
          manual_review_count: number | null
          scan_date: string | null
          scan_duration_ms: number | null
          total_items_scanned: number | null
        }
        Insert: {
          auto_fixed_count?: number | null
          content_type: string
          id?: string
          issues_found?: Json | null
          manual_review_count?: number | null
          scan_date?: string | null
          scan_duration_ms?: number | null
          total_items_scanned?: number | null
        }
        Update: {
          auto_fixed_count?: number | null
          content_type?: string
          id?: string
          issues_found?: Json | null
          manual_review_count?: number | null
          scan_date?: string | null
          scan_duration_ms?: number | null
          total_items_scanned?: number | null
        }
        Relationships: []
      }
      data_quality_snapshots: {
        Row: {
          captured_at: string
          fill_rate: number
          id: string
          missing_coords: number
          missing_geo: number
          missing_image: number
          missing_seo: number
          table_name: string
          total: number
        }
        Insert: {
          captured_at?: string
          fill_rate?: number
          id?: string
          missing_coords?: number
          missing_geo?: number
          missing_image?: number
          missing_seo?: number
          table_name: string
          total?: number
        }
        Update: {
          captured_at?: string
          fill_rate?: number
          id?: string
          missing_coords?: number
          missing_geo?: number
          missing_image?: number
          missing_seo?: number
          table_name?: string
          total?: number
        }
        Relationships: []
      }
      deals: {
        Row: {
          business_name: string
          code: string | null
          created_at: string | null
          created_by: string | null
          days_of_week: string[] | null
          deal_type: string
          description: string | null
          discount_value: string | null
          end_date: string | null
          end_time: string | null
          entity_id: string | null
          entity_type: string
          id: string
          image_url: string | null
          is_featured: boolean | null
          is_verified: boolean | null
          redemption_count: number | null
          start_date: string
          start_time: string | null
          terms: string | null
          title: string
        }
        Insert: {
          business_name: string
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          days_of_week?: string[] | null
          deal_type: string
          description?: string | null
          discount_value?: string | null
          end_date?: string | null
          end_time?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_verified?: boolean | null
          redemption_count?: number | null
          start_date?: string
          start_time?: string | null
          terms?: string | null
          title: string
        }
        Update: {
          business_name?: string
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          days_of_week?: string[] | null
          deal_type?: string
          description?: string | null
          discount_value?: string | null
          end_date?: string | null
          end_time?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_verified?: boolean | null
          redemption_count?: number | null
          start_date?: string
          start_time?: string | null
          terms?: string | null
          title?: string
        }
        Relationships: []
      }
      discover_chat_usage: {
        Row: {
          count: number
          created_at: string
          id: string
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          updated_at?: string
          usage_date: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      discussion_forums: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      discussion_likes: {
        Row: {
          created_at: string
          discussion_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_likes_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "event_discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_replies: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          parent_reply_id: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          parent_reply_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          parent_reply_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "discussion_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "discussion_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_threads: {
        Row: {
          content: string
          created_at: string
          created_by: string
          forum_id: string
          id: string
          is_locked: boolean | null
          is_pinned: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          forum_id: string
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          forum_id?: string
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_threads_forum_id_fkey"
            columns: ["forum_id"]
            isOneToOne: false
            referencedRelation: "discussion_forums"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_highlights: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          domain?: string
          id?: string
        }
        Relationships: []
      }
      edge_function_metrics: {
        Row: {
          created_at: string
          duration_ms: number | null
          function_name: string
          id: string
          method: string | null
          status_class: string | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          function_name: string
          id?: string
          method?: string | null
          status_class?: string | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          function_name?: string
          id?: string
          method?: string | null
          status_class?: string | null
          status_code?: number | null
        }
        Relationships: []
      }
      error_events: {
        Row: {
          action: string | null
          component: string | null
          created_at: string
          id: string
          message_redacted: string
          route: string | null
          severity: string
          signature: string
          source: string
          user_id: string | null
        }
        Insert: {
          action?: string | null
          component?: string | null
          created_at?: string
          id?: string
          message_redacted: string
          route?: string | null
          severity?: string
          signature: string
          source?: string
          user_id?: string | null
        }
        Update: {
          action?: string | null
          component?: string | null
          created_at?: string
          id?: string
          message_redacted?: string
          route?: string | null
          severity?: string
          signature?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      event_archive: {
        Row: {
          archive_reason: string
          archived_at: string
          category: string | null
          date: string | null
          id: string
          location: string | null
          source_url: string | null
          title: string | null
          venue: string | null
        }
        Insert: {
          archive_reason?: string
          archived_at?: string
          category?: string | null
          date?: string | null
          id: string
          location?: string | null
          source_url?: string | null
          title?: string | null
          venue?: string | null
        }
        Update: {
          archive_reason?: string
          archived_at?: string
          category?: string | null
          date?: string | null
          id?: string
          location?: string | null
          source_url?: string | null
          title?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notification_preferences: Json | null
          status: string
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notification_preferences?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notification_preferences?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: []
      }
      event_checkins: {
        Row: {
          checkin_latitude: number | null
          checkin_longitude: number | null
          checkin_message: string | null
          created_at: string
          distance_from_venue_meters: number | null
          event_id: string
          id: string
          is_verified: boolean | null
          user_id: string
        }
        Insert: {
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkin_message?: string | null
          created_at?: string
          distance_from_venue_meters?: number | null
          event_id: string
          id?: string
          is_verified?: boolean | null
          user_id: string
        }
        Update: {
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkin_message?: string | null
          created_at?: string
          distance_from_venue_meters?: number | null
          event_id?: string
          id?: string
          is_verified?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_reactions: {
        Row: {
          created_at: string
          discussion_id: string
          id: string
          reaction_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          id?: string
          reaction_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          id?: string
          reaction_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      event_discussions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_deleted: boolean | null
          is_pinned: boolean | null
          likes_count: number
          media_url: string | null
          message: string
          message_type: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number
          media_url?: string | null
          message: string
          message_type?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          likes_count?: number
          media_url?: string | null
          message?: string
          message_type?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_discussions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "event_discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_hotels: {
        Row: {
          created_at: string | null
          distance_miles: number | null
          event_id: string | null
          hotel_id: string | null
          id: string
          notes: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          distance_miles?: number | null
          event_id?: string | null
          hotel_id?: string | null
          id?: string
          notes?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          distance_miles?: number | null
          event_id?: string | null
          hotel_id?: string | null
          id?: string
          notes?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_hotels_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      event_live_feed: {
        Row: {
          content: string | null
          content_type: string
          created_at: string
          engagement_score: number | null
          event_id: string
          id: string
          is_highlighted: boolean | null
          media_url: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          content?: string | null
          content_type: string
          created_at?: string
          engagement_score?: number | null
          event_id: string
          id?: string
          is_highlighted?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          content?: string | null
          content_type?: string
          created_at?: string
          engagement_score?: number | null
          event_id?: string
          id?: string
          is_highlighted?: boolean | null
          media_url?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      event_live_stats: {
        Row: {
          average_rating: number | null
          current_attendees: number | null
          discussion_count: number | null
          event_id: string
          last_activity: string | null
          photos_count: number | null
          total_checkins: number | null
          trending_score: number | null
          updated_at: string
        }
        Insert: {
          average_rating?: number | null
          current_attendees?: number | null
          discussion_count?: number | null
          event_id: string
          last_activity?: string | null
          photos_count?: number | null
          total_checkins?: number | null
          trending_score?: number | null
          updated_at?: string
        }
        Update: {
          average_rating?: number | null
          current_attendees?: number | null
          discussion_count?: number | null
          event_id?: string
          last_activity?: string | null
          photos_count?: number | null
          total_checkins?: number | null
          trending_score?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      event_photos: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          id: string
          is_featured: boolean | null
          likes_count: number
          photo_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          id?: string
          is_featured?: boolean | null
          likes_count?: number
          photo_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          id?: string
          is_featured?: boolean | null
          likes_count?: number
          photo_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promotion_analytics: {
        Row: {
          created_at: string | null
          data: Json | null
          event_type: string
          id: string
          session_id: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      event_promotion_email_captures: {
        Row: {
          created_at: string | null
          email: string
          event_date: string
          event_name: string | null
          event_type: string
          id: string
          organization_name: string | null
          referral_code: string | null
          send_reminders: boolean | null
          unlocked_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          event_date: string
          event_name?: string | null
          event_type: string
          id?: string
          organization_name?: string | null
          referral_code?: string | null
          send_reminders?: boolean | null
          unlocked_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          event_date?: string
          event_name?: string | null
          event_type?: string
          id?: string
          organization_name?: string | null
          referral_code?: string | null
          send_reminders?: boolean | null
          unlocked_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      event_promotion_email_sequences: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          email: string
          email_type: string
          id: string
          opened_at: string | null
          sent_at: string | null
          sequence_day: number
          status: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          email: string
          email_type: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          sequence_day: number
          status?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          email?: string
          email_type?: string
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          sequence_day?: number
          status?: string | null
        }
        Relationships: []
      }
      event_promotion_referrals: {
        Row: {
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string | null
          referrer_email: string
          reward_claimed: boolean | null
          used: boolean | null
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email?: string | null
          referrer_email: string
          reward_claimed?: boolean | null
          used?: boolean | null
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string | null
          referrer_email?: string
          reward_claimed?: boolean | null
          used?: boolean | null
          used_at?: string | null
        }
        Relationships: []
      }
      event_promotion_task_completions: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          email: string
          id: string
          task_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          task_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          task_id?: string
        }
        Relationships: []
      }
      event_reviews: {
        Row: {
          attended: boolean | null
          created_at: string
          event_id: string
          helpful_votes: number | null
          id: string
          rating: number | null
          review_text: string
          user_id: string
        }
        Insert: {
          attended?: boolean | null
          created_at?: string
          event_id: string
          helpful_votes?: number | null
          id?: string
          rating?: number | null
          review_text: string
          user_id: string
        }
        Update: {
          attended?: boolean | null
          created_at?: string
          event_id?: string
          helpful_votes?: number | null
          id?: string
          rating?: number | null
          review_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_social_metrics: {
        Row: {
          created_at: string
          date: string
          event_id: string
          going_count: number | null
          id: string
          interested_count: number | null
          social_buzz_score: number | null
          total_saves: number | null
          total_shares: number | null
          total_views: number | null
          trending_score: number | null
        }
        Insert: {
          created_at?: string
          date?: string
          event_id: string
          going_count?: number | null
          id?: string
          interested_count?: number | null
          social_buzz_score?: number | null
          total_saves?: number | null
          total_shares?: number | null
          total_views?: number | null
          trending_score?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          event_id?: string
          going_count?: number | null
          id?: string
          interested_count?: number | null
          social_buzz_score?: number | null
          total_saves?: number | null
          total_shares?: number | null
          total_views?: number | null
          trending_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_social_metrics_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tips: {
        Row: {
          created_at: string
          event_id: string
          helpful_votes: number | null
          id: string
          tip_category: string | null
          tip_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          helpful_votes?: number | null
          id?: string
          tip_category?: string | null
          tip_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          helpful_votes?: number | null
          id?: string
          tip_category?: string | null
          tip_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tips_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          ai_writeup: string | null
          category: string
          city: string | null
          created_at: string | null
          date: string
          end_date: string | null
          enhanced_description: string | null
          event_start_local: string | null
          event_start_utc: string | null
          event_timezone: string | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          geom: unknown
          heal_attempts: number
          hidden_at: string | null
          id: string
          image_checked_at: string | null
          image_url: string | null
          instance_date: string | null
          is_enhanced: boolean | null
          is_featured: boolean | null
          is_hidden: boolean
          is_merged: boolean
          is_recurring: boolean | null
          is_recurring_instance: boolean | null
          is_sponsored: boolean
          latitude: number | null
          location: string
          longitude: number | null
          merged_at: string | null
          merged_into: string | null
          needs_manual_verification: boolean
          original_description: string | null
          popularity_score: number | null
          price: string | null
          recurrence_end_date: string | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          recurrence_start_date: string | null
          search_vector: unknown
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          source: string | null
          source_url: string | null
          source_url_broken: boolean
          source_url_checked_at: string | null
          sponsored_until: string | null
          title: string
          trending_score: number
          updated_at: string | null
          venue: string | null
          view_count: number | null
          writeup_generated_at: string | null
          writeup_prompt_used: string | null
        }
        Insert: {
          ai_writeup?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date: string
          end_date?: string | null
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          geom?: unknown
          heal_attempts?: number
          hidden_at?: string | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          instance_date?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          is_hidden?: boolean
          is_merged?: boolean
          is_recurring?: boolean | null
          is_recurring_instance?: boolean | null
          is_sponsored?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          merged_at?: string | null
          merged_into?: string | null
          needs_manual_verification?: boolean
          original_description?: string | null
          popularity_score?: number | null
          price?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_start_date?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          source?: string | null
          source_url?: string | null
          source_url_broken?: boolean
          source_url_checked_at?: string | null
          sponsored_until?: string | null
          title: string
          trending_score?: number
          updated_at?: string | null
          venue?: string | null
          view_count?: number | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Update: {
          ai_writeup?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date?: string
          end_date?: string | null
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          geom?: unknown
          heal_attempts?: number
          hidden_at?: string | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          instance_date?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          is_hidden?: boolean
          is_merged?: boolean
          is_recurring?: boolean | null
          is_recurring_instance?: boolean | null
          is_sponsored?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          merged_at?: string | null
          merged_into?: string | null
          needs_manual_verification?: boolean
          original_description?: string | null
          popularity_score?: number | null
          price?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_start_date?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          source?: string | null
          source_url?: string | null
          source_url_broken?: boolean
          source_url_checked_at?: string | null
          sponsored_until?: string | null
          title?: string
          trending_score?: number
          updated_at?: string | null
          venue?: string | null
          view_count?: number | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          flag_key: string
          id: string
          session_id: string | null
          user_id: string | null
          variant: string
        }
        Insert: {
          assigned_at?: string
          flag_key: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          variant: string
        }
        Update: {
          assigned_at?: string
          flag_key?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["flag_key"]
          },
        ]
      }
      failed_auth_attempts: {
        Row: {
          attempt_type: string
          created_at: string
          email: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_type?: string
          created_at?: string
          email?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_type?: string
          created_at?: string
          email?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      failed_login_attempts: {
        Row: {
          attempt_time: string | null
          created_at: string | null
          email: string
          id: string
          ip_address: string
          lockout_until: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempt_time?: string | null
          created_at?: string | null
          email: string
          id?: string
          ip_address: string
          lockout_until?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempt_time?: string | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string
          lockout_until?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          target_tiers: string[] | null
          traffic_split: number | null
          updated_at: string
          variants: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          target_tiers?: string[] | null
          traffic_split?: number | null
          updated_at?: string
          variants?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          target_tiers?: string[] | null
          traffic_split?: number | null
          updated_at?: string
          variants?: Json | null
        }
        Relationships: []
      }
      feedback_replies: {
        Row: {
          body_html: string
          created_at: string
          direction: string
          id: string
          resend_message_id: string | null
          sent_at: string
          sent_by: string | null
          submission_id: string
        }
        Insert: {
          body_html: string
          created_at?: string
          direction?: string
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          submission_id: string
        }
        Update: {
          body_html?: string
          created_at?: string
          direction?: string
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_replies_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "contact_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "friend_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_planning_sessions: {
        Row: {
          active_users: Json | null
          created_at: string
          expires_at: string | null
          group_id: string
          id: string
          notes: string | null
          selected_events: Json | null
          session_name: string
          updated_at: string
          voting_data: Json | null
        }
        Insert: {
          active_users?: Json | null
          created_at?: string
          expires_at?: string | null
          group_id: string
          id?: string
          notes?: string | null
          selected_events?: Json | null
          session_name: string
          updated_at?: string
          voting_data?: Json | null
        }
        Update: {
          active_users?: Json | null
          created_at?: string
          expires_at?: string | null
          group_id?: string
          id?: string
          notes?: string | null
          selected_events?: Json | null
          session_name?: string
          updated_at?: string
          voting_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "group_planning_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "friend_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_keyword_performance: {
        Row: {
          clicks: number | null
          clicks_change: number | null
          country: string | null
          ctr: number | null
          date: string
          fetched_at: string | null
          id: string
          impressions: number | null
          impressions_change: number | null
          impressions_desktop: number | null
          impressions_mobile: number | null
          impressions_tablet: number | null
          keyword_id: string | null
          page_url: string | null
          position: number | null
          position_change: number | null
          property_id: string
          query: string
        }
        Insert: {
          clicks?: number | null
          clicks_change?: number | null
          country?: string | null
          ctr?: number | null
          date: string
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          impressions_desktop?: number | null
          impressions_mobile?: number | null
          impressions_tablet?: number | null
          keyword_id?: string | null
          page_url?: string | null
          position?: number | null
          position_change?: number | null
          property_id: string
          query: string
        }
        Update: {
          clicks?: number | null
          clicks_change?: number | null
          country?: string | null
          ctr?: number | null
          date?: string
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          impressions_desktop?: number | null
          impressions_mobile?: number | null
          impressions_tablet?: number | null
          keyword_id?: string | null
          page_url?: string | null
          position?: number | null
          position_change?: number | null
          property_id?: string
          query?: string
        }
        Relationships: [
          {
            foreignKeyName: "gsc_keyword_performance_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_oauth_credentials: {
        Row: {
          access_token: string
          created_at: string | null
          error_count: number | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_error: string | null
          last_error_at: string | null
          last_refreshed_at: string | null
          last_used_at: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          error_count?: number | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_refreshed_at?: string | null
          last_used_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          error_count?: number | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_refreshed_at?: string | null
          last_used_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gsc_page_performance: {
        Row: {
          clicks: number | null
          clicks_change: number | null
          clicks_desktop: number | null
          clicks_mobile: number | null
          clicks_tablet: number | null
          country: string | null
          ctr: number | null
          date: string
          fetched_at: string | null
          id: string
          impressions: number | null
          impressions_change: number | null
          impressions_desktop: number | null
          impressions_mobile: number | null
          impressions_tablet: number | null
          page_url: string
          position: number | null
          position_change: number | null
          property_id: string
          top_queries: Json | null
        }
        Insert: {
          clicks?: number | null
          clicks_change?: number | null
          clicks_desktop?: number | null
          clicks_mobile?: number | null
          clicks_tablet?: number | null
          country?: string | null
          ctr?: number | null
          date: string
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          impressions_desktop?: number | null
          impressions_mobile?: number | null
          impressions_tablet?: number | null
          page_url: string
          position?: number | null
          position_change?: number | null
          property_id: string
          top_queries?: Json | null
        }
        Update: {
          clicks?: number | null
          clicks_change?: number | null
          clicks_desktop?: number | null
          clicks_mobile?: number | null
          clicks_tablet?: number | null
          country?: string | null
          ctr?: number | null
          date?: string
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          impressions_change?: number | null
          impressions_desktop?: number | null
          impressions_mobile?: number | null
          impressions_tablet?: number | null
          page_url?: string
          position?: number | null
          position_change?: number | null
          property_id?: string
          top_queries?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_page_performance_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "gsc_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_properties: {
        Row: {
          added_by: string | null
          average_ctr: number | null
          average_position: number | null
          created_at: string | null
          default_date_range_days: number | null
          error_message: string | null
          id: string
          is_syncing: boolean | null
          is_verified: boolean | null
          last_sync_at: string | null
          next_sync_at: string | null
          oauth_credential_id: string | null
          permission_level: string | null
          property_type: string | null
          property_url: string
          status: string | null
          sync_enabled: boolean | null
          sync_frequency_hours: number | null
          total_clicks: number | null
          total_impressions: number | null
          updated_at: string | null
          verification_method: string | null
        }
        Insert: {
          added_by?: string | null
          average_ctr?: number | null
          average_position?: number | null
          created_at?: string | null
          default_date_range_days?: number | null
          error_message?: string | null
          id?: string
          is_syncing?: boolean | null
          is_verified?: boolean | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          oauth_credential_id?: string | null
          permission_level?: string | null
          property_type?: string | null
          property_url: string
          status?: string | null
          sync_enabled?: boolean | null
          sync_frequency_hours?: number | null
          total_clicks?: number | null
          total_impressions?: number | null
          updated_at?: string | null
          verification_method?: string | null
        }
        Update: {
          added_by?: string | null
          average_ctr?: number | null
          average_position?: number | null
          created_at?: string | null
          default_date_range_days?: number | null
          error_message?: string | null
          id?: string
          is_syncing?: boolean | null
          is_verified?: boolean | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          oauth_credential_id?: string | null
          permission_level?: string | null
          property_type?: string | null
          property_url?: string
          status?: string | null
          sync_enabled?: boolean | null
          sync_frequency_hours?: number | null
          total_clicks?: number | null
          total_impressions?: number | null
          updated_at?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gsc_properties_oauth_credential_id_fkey"
            columns: ["oauth_credential_id"]
            isOneToOne: false
            referencedRelation: "gsc_oauth_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_requests: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string | null
          email: string
          fulfilled: boolean | null
          id: string
          name: string | null
          request_type: string
          state: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string | null
          email: string
          fulfilled?: boolean | null
          id?: string
          name?: string | null
          request_type: string
          state?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string | null
          email?: string
          fulfilled?: boolean | null
          id?: string
          name?: string | null
          request_type?: string
          state?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      hotel_areas: {
        Row: {
          area_name: string
          hotel_id: string | null
          id: string
        }
        Insert: {
          area_name: string
          hotel_id?: string | null
          id?: string
        }
        Update: {
          area_name?: string
          hotel_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_areas_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_blacklist: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          expires_at: string | null
          formatted_address: string | null
          google_place_id: string | null
          hotel_name: string
          id: string
          reason: string
          reason_category: string
          updated_at: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          hotel_name: string
          id?: string
          reason: string
          reason_category: string
          updated_at?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          hotel_name?: string
          id?: string
          reason?: string
          reason_category?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hotels: {
        Row: {
          address: string
          affiliate_provider: string | null
          affiliate_url: string | null
          affiliate_url_updated_at: string | null
          amenities: string[] | null
          area: string | null
          avg_nightly_rate: number | null
          brand_parent: string | null
          chain_name: string | null
          check_in_time: string | null
          check_out_time: string | null
          city: string
          created_at: string | null
          description: string | null
          email: string | null
          gallery_urls: string[] | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          google_place_id: string | null
          hotel_type: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          price_range: string | null
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          slug: string
          sort_order: number | null
          star_rating: number | null
          state: string
          total_rooms: number | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address: string
          affiliate_provider?: string | null
          affiliate_url?: string | null
          affiliate_url_updated_at?: string | null
          amenities?: string[] | null
          area?: string | null
          avg_nightly_rate?: number | null
          brand_parent?: string | null
          chain_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          gallery_urls?: string[] | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          google_place_id?: string | null
          hotel_type?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          price_range?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          slug: string
          sort_order?: number | null
          star_rating?: number | null
          state?: string
          total_rooms?: number | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string
          affiliate_provider?: string | null
          affiliate_url?: string | null
          affiliate_url_updated_at?: string | null
          amenities?: string[] | null
          area?: string | null
          avg_nightly_rate?: number | null
          brand_parent?: string | null
          chain_name?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          gallery_urls?: string[] | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          google_place_id?: string | null
          hotel_type?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          price_range?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          slug?: string
          sort_order?: number | null
          star_rating?: number | null
          state?: string
          total_rooms?: number | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      image_optimization_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          error_message: string | null
          generate_avif: boolean | null
          generate_thumbnail: boolean | null
          generate_webp: boolean | null
          id: string
          max_attempts: number | null
          media_asset_id: string | null
          priority: number | null
          quality_avif: number | null
          quality_jpeg: number | null
          quality_webp: number | null
          queued_at: string
          result_avif_url: string | null
          result_srcset: Json | null
          result_thumbnail_url: string | null
          result_webp_url: string | null
          source_url: string
          started_at: string | null
          status: string | null
          target_sizes: number[] | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          error_message?: string | null
          generate_avif?: boolean | null
          generate_thumbnail?: boolean | null
          generate_webp?: boolean | null
          id?: string
          max_attempts?: number | null
          media_asset_id?: string | null
          priority?: number | null
          quality_avif?: number | null
          quality_jpeg?: number | null
          quality_webp?: number | null
          queued_at?: string
          result_avif_url?: string | null
          result_srcset?: Json | null
          result_thumbnail_url?: string | null
          result_webp_url?: string | null
          source_url: string
          started_at?: string | null
          status?: string | null
          target_sizes?: number[] | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          error_message?: string | null
          generate_avif?: boolean | null
          generate_thumbnail?: boolean | null
          generate_webp?: boolean | null
          id?: string
          max_attempts?: number | null
          media_asset_id?: string | null
          priority?: number | null
          quality_avif?: number | null
          quality_jpeg?: number | null
          quality_webp?: number | null
          queued_at?: string
          result_avif_url?: string | null
          result_srcset?: Json | null
          result_thumbnail_url?: string | null
          result_webp_url?: string | null
          source_url?: string
          started_at?: string | null
          status?: string | null
          target_sizes?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "image_optimization_queue_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          content_type: string
          created_at: string | null
          created_by: string | null
          error_log: Json | null
          failed_rows: number | null
          file_name: string | null
          id: string
          imported_rows: number | null
          skipped_rows: number | null
          started_at: string | null
          status: string | null
          total_rows: number | null
          validation_summary: Json | null
        }
        Insert: {
          completed_at?: string | null
          content_type: string
          created_at?: string | null
          created_by?: string | null
          error_log?: Json | null
          failed_rows?: number | null
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          skipped_rows?: number | null
          started_at?: string | null
          status?: string | null
          total_rows?: number | null
          validation_summary?: Json | null
        }
        Update: {
          completed_at?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          error_log?: Json | null
          failed_rows?: number | null
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          skipped_rows?: number | null
          started_at?: string | null
          status?: string | null
          total_rows?: number | null
          validation_summary?: Json | null
        }
        Relationships: []
      }
      keyword_rankings: {
        Row: {
          competition: string | null
          cpc: number | null
          created_at: string | null
          id: string
          keyword: string
          metadata: Json | null
          position: number | null
          property_id: string
          provider_name: string
          search_volume: number | null
          tracked_date: string
          trend: string | null
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          competition?: string | null
          cpc?: number | null
          created_at?: string | null
          id?: string
          keyword: string
          metadata?: Json | null
          position?: number | null
          property_id: string
          provider_name: string
          search_volume?: number | null
          tracked_date: string
          trend?: string | null
          updated_at?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          competition?: string | null
          cpc?: number | null
          created_at?: string | null
          id?: string
          keyword?: string
          metadata?: Json | null
          position?: number | null
          property_id?: string
          provider_name?: string
          search_volume?: number | null
          tracked_date?: string
          trend?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      known_venues: {
        Row: {
          address: string | null
          aliases: string[] | null
          capacity: number | null
          city: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          seo_keywords: string[] | null
          state: string | null
          updated_at: string | null
          venue_type: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          aliases?: string[] | null
          capacity?: number | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          seo_keywords?: string[] | null
          state?: string | null
          updated_at?: string | null
          venue_type?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          aliases?: string[] | null
          capacity?: number | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          seo_keywords?: string[] | null
          state?: string | null
          updated_at?: string | null
          venue_type?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          client_info: string | null
          client_ip: string | null
          email: string
          id: number
        }
        Insert: {
          attempted_at?: string
          client_info?: string | null
          client_ip?: string | null
          email: string
          id?: never
        }
        Update: {
          attempted_at?: string
          client_info?: string | null
          client_ip?: string | null
          email?: string
          id?: never
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt_text: string | null
          blur_hash: string | null
          bucket_id: string
          content_hash: string | null
          content_id: string | null
          content_type: string | null
          created_at: string
          description: string | null
          dominant_color: string | null
          downloads_count: number | null
          duration_seconds: number | null
          file_name: string
          file_path: string
          file_size: number
          height: number | null
          id: string
          is_optimized: boolean | null
          mime_type: string
          optimized_versions: Json | null
          original_file_name: string
          processing_error: string | null
          processing_status: string | null
          source_url: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string | null
          views_count: number | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          blur_hash?: string | null
          bucket_id?: string
          content_hash?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          dominant_color?: string | null
          downloads_count?: number | null
          duration_seconds?: number | null
          file_name: string
          file_path: string
          file_size: number
          height?: number | null
          id?: string
          is_optimized?: boolean | null
          mime_type: string
          optimized_versions?: Json | null
          original_file_name: string
          processing_error?: string | null
          processing_status?: string | null
          source_url?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          views_count?: number | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          blur_hash?: string | null
          bucket_id?: string
          content_hash?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          dominant_color?: string | null
          downloads_count?: number | null
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          file_size?: number
          height?: number | null
          id?: string
          is_optimized?: boolean | null
          mime_type?: string
          optimized_versions?: Json | null
          original_file_name?: string
          processing_error?: string | null
          processing_status?: string | null
          source_url?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          views_count?: number | null
          width?: number | null
        }
        Relationships: []
      }
      media_performance_metrics: {
        Row: {
          browser: string | null
          connection_type: string | null
          device_type: string | null
          format_delivered: string | null
          id: string
          load_time_ms: number | null
          media_asset_id: string | null
          page_url: string | null
          recorded_at: string
          size_delivered: number | null
          viewport_width: number | null
        }
        Insert: {
          browser?: string | null
          connection_type?: string | null
          device_type?: string | null
          format_delivered?: string | null
          id?: string
          load_time_ms?: number | null
          media_asset_id?: string | null
          page_url?: string | null
          recorded_at?: string
          size_delivered?: number | null
          viewport_width?: number | null
        }
        Update: {
          browser?: string | null
          connection_type?: string | null
          device_type?: string | null
          format_delivered?: string | null
          id?: string
          load_time_ms?: number | null
          media_asset_id?: string | null
          page_url?: string | null
          recorded_at?: string
          size_delivered?: number | null
          viewport_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_performance_metrics_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_venues: {
        Row: {
          amenities: string[] | null
          av_equipment: boolean | null
          catering: string | null
          contact_email: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          latitude: number | null
          longitude: number | null
          max_capacity: number | null
          min_capacity: number | null
          name: string
          slug: string
          sq_footage: number | null
          venue_type: string | null
          website: string | null
        }
        Insert: {
          amenities?: string[] | null
          av_equipment?: boolean | null
          catering?: string | null
          contact_email?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          max_capacity?: number | null
          min_capacity?: number | null
          name: string
          slug: string
          sq_footage?: number | null
          venue_type?: string | null
          website?: string | null
        }
        Update: {
          amenities?: string[] | null
          av_equipment?: boolean | null
          catering?: string | null
          contact_email?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          max_capacity?: number | null
          min_capacity?: number | null
          name?: string
          slug?: string
          sq_footage?: number | null
          venue_type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      newsletter_campaigns: {
        Row: {
          body_html: string
          bounces: number
          campaign_type: string | null
          clicks: number
          complaints: number
          created_at: string
          delivered: number
          error_message: string | null
          failed: number
          id: string
          opens: number
          preheader: string | null
          recipient_count: number
          scheduled_for: string | null
          segment: Json
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          bounces?: number
          campaign_type?: string | null
          clicks?: number
          complaints?: number
          created_at?: string
          delivered?: number
          error_message?: string | null
          failed?: number
          id?: string
          opens?: number
          preheader?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          segment?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          bounces?: number
          campaign_type?: string | null
          clicks?: number
          complaints?: number
          created_at?: string
          delivered?: number
          error_message?: string | null
          failed?: number
          id?: string
          opens?: number
          preheader?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          segment?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_deliveries: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error_message: string | null
          event_at: string | null
          id: string
          resend_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error_message?: string | null
          event_at?: string | null
          id?: string
          resend_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          event_at?: string | null
          id?: string
          resend_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          ip_address: string | null
          preferences: Json | null
          source: string | null
          status: string | null
          subscribed_at: string | null
          unsubscribe_token: string | null
          unsubscribed_at: string | null
          updated_at: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          ip_address?: string | null
          preferences?: Json | null
          source?: string | null
          status?: string | null
          subscribed_at?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          ip_address?: string | null
          preferences?: Json | null
          source?: string | null
          status?: string | null
          subscribed_at?: string | null
          unsubscribe_token?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      nurture_sends: {
        Row: {
          activated_at: string | null
          agent_key: string
          clicked_at: string | null
          created_at: string
          email: string
          id: string
          kind: string
          opened_at: string | null
          quality_score: number | null
          resend_message_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          agent_key: string
          clicked_at?: string | null
          created_at?: string
          email: string
          id?: string
          kind: string
          opened_at?: string | null
          quality_score?: number | null
          resend_message_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          agent_key?: string
          clicked_at?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          opened_at?: string | null
          quality_score?: number | null
          resend_message_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      oauth_providers: {
        Row: {
          authorization_url: string
          client_id: string | null
          client_secret: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          provider_name: string
          scopes: string[]
          token_url: string
          updated_at: string | null
        }
        Insert: {
          authorization_url: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_name: string
          scopes: string[]
          token_url: string
          updated_at?: string | null
        }
        Update: {
          authorization_url?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider_name?: string
          scopes?: string[]
          token_url?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ops_notification_log: {
        Row: {
          channels: string[]
          created_at: string
          dedupe_key: string
          id: string
          last_sent_at: string
          severity: string
          suppressed_count: number
          title: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          dedupe_key: string
          id?: string
          last_sent_at?: string
          severity: string
          suppressed_count?: number
          title?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          dedupe_key?: string
          id?: string
          last_sent_at?: string
          severity?: string
          suppressed_count?: number
          title?: string | null
        }
        Relationships: []
      }
      outreach_sends: {
        Row: {
          created_at: string
          email: string
          id: string
          lead_id: string | null
          replied_at: string | null
          resend_message_id: string | null
          status: string
          step: number
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          lead_id?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          status?: string
          step: number
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          lead_id?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          status?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_suppression: {
        Row: {
          created_at: string
          domain: string | null
          email: string | null
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      outreach_templates: {
        Row: {
          approval_id: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          id: string
          step: number
          subject: string
          updated_at: string
        }
        Insert: {
          approval_id?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          body: string
          created_at?: string
          id?: string
          step: number
          subject: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          id?: string
          step?: number
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      partnership_applications: {
        Row: {
          admin_notes: string | null
          business_name: string
          business_type: string
          contact_email: string
          contact_phone: string | null
          created_at: string
          description: string | null
          desired_tier: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          admin_notes?: string | null
          business_name: string
          business_type: string
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          desired_tier?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          admin_notes?: string | null
          business_name?: string
          business_type?: string
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          desired_tier?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      partnership_benefits: {
        Row: {
          benefit_description: string | null
          benefit_name: string
          created_at: string
          id: string
          is_active: boolean | null
          sort_order: number | null
          tier: string
        }
        Insert: {
          benefit_description?: string | null
          benefit_name: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tier: string
        }
        Update: {
          benefit_description?: string | null
          benefit_name?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tier?: string
        }
        Relationships: []
      }
      permission_definitions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          resource: string
          scope: string
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id: string
          resource: string
          scope: string
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          resource?: string
          scope?: string
        }
        Relationships: []
      }
      personalized_recommendations: {
        Row: {
          algorithm_version: string | null
          clicked_by_user: boolean | null
          content_id: string
          content_type: string
          context_factors: Json | null
          created_at: string
          expires_at: string
          generated_at: string
          id: string
          recommendation_reason: string | null
          recommendation_score: number
          session_id: string | null
          shown_to_user: boolean | null
          user_feedback: number | null
          user_id: string | null
        }
        Insert: {
          algorithm_version?: string | null
          clicked_by_user?: boolean | null
          content_id: string
          content_type: string
          context_factors?: Json | null
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          recommendation_reason?: string | null
          recommendation_score: number
          session_id?: string | null
          shown_to_user?: boolean | null
          user_feedback?: number | null
          user_id?: string | null
        }
        Update: {
          algorithm_version?: string | null
          clicked_by_user?: boolean | null
          content_id?: string
          content_type?: string
          context_factors?: Json | null
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          recommendation_reason?: string | null
          recommendation_score?: number
          session_id?: string | null
          shown_to_user?: boolean | null
          user_feedback?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      photo_likes: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "event_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      play_rtdn_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          notification_type: string | null
          processed_at: string
          purchase_token: string | null
          status: string
          subscription_id: string | null
          user_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          notification_type?: string | null
          processed_at?: string
          purchase_token?: string | null
          status: string
          subscription_id?: string | null
          user_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          notification_type?: string | null
          processed_at?: string
          purchase_token?: string | null
          status?: string
          subscription_id?: string | null
          user_subscription_id?: string | null
        }
        Relationships: []
      }
      playgrounds: {
        Row: {
          accessibility_notes: string | null
          age_range: string | null
          amenities: string[] | null
          created_at: string | null
          description: string | null
          has_restrooms: boolean | null
          has_shade: boolean | null
          id: string
          image_checked_at: string | null
          image_url: string | null
          is_featured: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          manually_curated: boolean
          name: string
          rating: number | null
          source: string
          surface_type: string | null
          updated_at: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          age_range?: string | null
          amenities?: string[] | null
          created_at?: string | null
          description?: string | null
          has_restrooms?: boolean | null
          has_shade?: boolean | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manually_curated?: boolean
          name: string
          rating?: number | null
          source?: string
          surface_type?: string | null
          updated_at?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          age_range?: string | null
          amenities?: string[] | null
          created_at?: string | null
          description?: string | null
          has_restrooms?: boolean | null
          has_shade?: boolean | null
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          manually_curated?: boolean
          name?: string
          rating?: number | null
          source?: string
          surface_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      policy_violations: {
        Row: {
          action_taken: string | null
          campaign_id: string
          created_at: string
          creative_id: string | null
          id: string
          policy_id: string | null
          reported_by: string | null
          violation_details: string
        }
        Insert: {
          action_taken?: string | null
          campaign_id: string
          created_at?: string
          creative_id?: string | null
          id?: string
          policy_id?: string | null
          reported_by?: string | null
          violation_details: string
        }
        Update: {
          action_taken?: string | null
          campaign_id?: string
          created_at?: string
          creative_id?: string | null
          id?: string
          policy_id?: string | null
          reported_by?: string | null
          violation_details?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_violations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_violations_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "campaign_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_violations_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "ad_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_overrides: {
        Row: {
          admin_user_id: string | null
          campaign_id: string
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          original_price: number
          override_price: number
          reason: string
        }
        Insert: {
          admin_user_id?: string | null
          campaign_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          original_price: number
          override_price: number
          reason: string
        }
        Update: {
          admin_user_id?: string | null
          campaign_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          original_price?: number
          override_price?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_overrides_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          base_price: number
          created_at: string
          demand_multiplier: number | null
          id: string
          is_active: boolean | null
          max_price: number
          min_price: number
          placement_type: Database["public"]["Enums"]["placement_type"]
          traffic_multiplier: number | null
          updated_at: string
        }
        Insert: {
          base_price: number
          created_at?: string
          demand_multiplier?: number | null
          id?: string
          is_active?: boolean | null
          max_price: number
          min_price: number
          placement_type: Database["public"]["Enums"]["placement_type"]
          traffic_multiplier?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          demand_multiplier?: number | null
          id?: string
          is_active?: boolean | null
          max_price?: number
          min_price?: number
          placement_type?: Database["public"]["Enums"]["placement_type"]
          traffic_multiplier?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          churn_risk_score: number | null
          churn_scored_at: string | null
          communication_preferences: Json | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          interests: string[] | null
          last_name: string | null
          lifecycle_signals: Json | null
          lifecycle_stage: string | null
          lifecycle_updated_at: string | null
          location: string | null
          phone: string | null
          reengage_suppressed_at: string | null
          updated_at: string
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          churn_risk_score?: number | null
          churn_scored_at?: string | null
          communication_preferences?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          last_name?: string | null
          lifecycle_signals?: Json | null
          lifecycle_stage?: string | null
          lifecycle_updated_at?: string | null
          location?: string | null
          phone?: string | null
          reengage_suppressed_at?: string | null
          updated_at?: string
          user_id: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          churn_risk_score?: number | null
          churn_scored_at?: string | null
          communication_preferences?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          last_name?: string | null
          lifecycle_signals?: Json | null
          lifecycle_stage?: string | null
          lifecycle_updated_at?: string | null
          location?: string | null
          phone?: string | null
          reengage_suppressed_at?: string | null
          updated_at?: string
          user_id?: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      proposals: {
        Row: {
          account_id: string | null
          content: Json | null
          created_at: string
          html: string | null
          id: string
          opportunity_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          content?: Json | null
          created_at?: string
          html?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          content?: Json | null
          created_at?: string
          html?: string | null
          id?: string
          opportunity_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_leads: {
        Row: {
          business_name: string
          category: string | null
          city: string | null
          created_at: string
          dedupe_key: string | null
          fit_reason: string | null
          fit_score: number | null
          id: string
          source: string
          source_ref: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          business_name: string
          category?: string | null
          city?: string | null
          created_at?: string
          dedupe_key?: string | null
          fit_reason?: string | null
          fit_score?: number | null
          id?: string
          source: string
          source_ref?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_name?: string
          category?: string | null
          city?: string | null
          created_at?: string
          dedupe_key?: string | null
          fit_reason?: string | null
          fit_score?: number | null
          id?: string
          source?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      provider_budgets: {
        Row: {
          auto_paused_agents: string[]
          hard_pct: number
          monthly_budget_usd: number
          note: string | null
          paused: boolean
          provider: string
          soft_pct: number
          throttled: boolean
          updated_at: string
        }
        Insert: {
          auto_paused_agents?: string[]
          hard_pct?: number
          monthly_budget_usd?: number
          note?: string | null
          paused?: boolean
          provider: string
          soft_pct?: number
          throttled?: boolean
          updated_at?: string
        }
        Update: {
          auto_paused_agents?: string[]
          hard_pct?: number
          monthly_budget_usd?: number
          note?: string | null
          paused?: boolean
          provider?: string
          soft_pct?: number
          throttled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      provider_usage: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          meta: Json | null
          provider: string
          usage_date: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          meta?: Json | null
          provider: string
          usage_date?: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          meta?: Json | null
          provider?: string
          usage_date?: string
        }
        Relationships: []
      }
      pseo_generation_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          generation_time_ms: number | null
          id: number
          input_tokens: number | null
          model_used: string | null
          output_tokens: number | null
          page_id: string
          quality_score: number | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          generation_time_ms?: number | null
          id?: number
          input_tokens?: number | null
          model_used?: string | null
          output_tokens?: number | null
          page_id: string
          quality_score?: number | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          generation_time_ms?: number | null
          id?: number
          input_tokens?: number | null
          model_used?: string | null
          output_tokens?: number | null
          page_id?: string
          quality_score?: number | null
        }
        Relationships: []
      }
      pseo_generation_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string | null
          dimensions: Json
          error_message: string | null
          id: string
          max_attempts: number
          page_type_id: string
          priority: number
          scheduled_at: string | null
          started_at: string | null
          status: string
          tier: number
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          dimensions: Json
          error_message?: string | null
          id: string
          max_attempts?: number
          page_type_id: string
          priority?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tier?: number
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          dimensions?: Json
          error_message?: string | null
          id?: string
          max_attempts?: number
          page_type_id?: string
          priority?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tier?: number
        }
        Relationships: []
      }
      pseo_pages: {
        Row: {
          created_at: string | null
          dimensions: Json
          generation_meta: Json
          id: string
          is_published: boolean
          page_type_id: string
          published_at: string | null
          quality_score: number | null
          related_pages: Json
          sections: Json
          seo: Json
          slug: string
          structured_data: Json
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          dimensions?: Json
          generation_meta?: Json
          id: string
          is_published?: boolean
          page_type_id: string
          published_at?: string | null
          quality_score?: number | null
          related_pages?: Json
          sections?: Json
          seo?: Json
          slug: string
          structured_data?: Json
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          dimensions?: Json
          generation_meta?: Json
          id?: string
          is_published?: boolean
          page_type_id?: string
          published_at?: string | null
          quality_score?: number | null
          related_pages?: Json
          sections?: Json
          seo?: Json
          slug?: string
          structured_data?: Json
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      rate_limit_entries: {
        Row: {
          client_id: string
          created_at: string
          endpoint: string
          id: number
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          client_id: string
          created_at?: string
          endpoint?: string
          id?: never
          request_count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          client_id?: string
          created_at?: string
          endpoint?: string
          id?: never
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      rating_abuse_reports: {
        Row: {
          created_at: string
          id: string
          rating_id: string
          reason: string
          reported_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          rating_id: string
          reason: string
          reported_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          rating_id?: string
          reason?: string
          reported_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_abuse_reports_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "user_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_helpful_votes: {
        Row: {
          created_at: string
          id: string
          is_helpful: boolean
          rating_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_helpful: boolean
          rating_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_helpful?: boolean
          rating_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_helpful_votes_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "user_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          content_id: string
          content_type: string
          href: string
          image_url: string | null
          subtitle: string | null
          title: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          href: string
          image_url?: string | null
          subtitle?: string | null
          title: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          href?: string
          image_url?: string | null
          subtitle?: string | null
          title?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string | null
          id: string
          referral_code: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          reward_claimed_at: string | null
          reward_type: string | null
          status: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          referral_code: string
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          reward_claimed_at?: string | null
          reward_type?: string | null
          status?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string | null
          id?: string
          referral_code?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          reward_claimed_at?: string | null
          reward_type?: string | null
          status?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          admin_user_id: string | null
          amount: number
          campaign_id: string
          created_at: string
          id: string
          policy_violation: string | null
          processed_at: string | null
          reason: string
          refund_reason: string | null
          refund_reason_notes: string | null
          status: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id: string | null
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          campaign_id: string
          created_at?: string
          id?: string
          policy_violation?: string | null
          processed_at?: string | null
          reason: string
          refund_reason?: string | null
          refund_reason_notes?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          campaign_id?: string
          created_at?: string
          id?: string
          policy_violation?: string | null
          processed_at?: string | null
          reason?: string
          refund_reason?: string | null
          refund_reason_notes?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_blacklist: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          expires_at: string | null
          formatted_address: string | null
          google_place_id: string | null
          id: string
          reason: string
          reason_category: string
          restaurant_name: string
          updated_at: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          reason: string
          reason_category: string
          restaurant_name: string
          updated_at?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          reason?: string
          reason_category?: string
          restaurant_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurant_menu_items: {
        Row: {
          created_at: string
          dietary_tags: string[] | null
          id: string
          is_popular: boolean | null
          item_description: string | null
          item_name: string
          menu_id: string
          price: string | null
          price_numeric: number | null
          section_name: string
          section_sort_order: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          dietary_tags?: string[] | null
          id?: string
          is_popular?: boolean | null
          item_description?: string | null
          item_name: string
          menu_id: string
          price?: string | null
          price_numeric?: number | null
          section_name?: string
          section_sort_order?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          dietary_tags?: string[] | null
          id?: string
          is_popular?: boolean | null
          item_description?: string | null
          item_name?: string
          menu_id?: string
          price?: string | null
          price_numeric?: number | null
          section_name?: string
          section_sort_order?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_menus: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          is_current: boolean
          notes: string | null
          raw_text: string | null
          restaurant_id: string
          source_type: string
          source_url: string | null
          updated_at: string
          version: number
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          is_current?: boolean
          notes?: string | null
          raw_text?: string | null
          restaurant_id: string
          source_type?: string
          source_url?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          is_current?: boolean
          notes?: string | null
          raw_text?: string | null
          restaurant_id?: string
          source_type?: string
          source_url?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_openings: {
        Row: {
          created_at: string | null
          cuisine: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          opening_date: string | null
          opening_timeframe: string | null
          source_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cuisine?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          opening_date?: string | null
          opening_timeframe?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cuisine?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          opening_date?: string | null
          opening_timeframe?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          ai_writeup: string | null
          city: string | null
          created_at: string | null
          cuisine: string | null
          data_quality_score: number | null
          description: string | null
          enhanced: string | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          geom: unknown
          google_place_id: string | null
          heal_attempts: number
          id: string
          image_checked_at: string | null
          image_url: string | null
          is_featured: boolean | null
          is_merged: boolean
          is_sponsored: boolean
          latitude: number | null
          location: string | null
          longitude: number | null
          menu_scrape_enabled: boolean
          menu_url: string | null
          merged_at: string | null
          merged_into: string | null
          name: string
          needs_manual_verification: boolean
          opening: string | null
          opening_date: string | null
          opening_timeframe: string | null
          phone: string | null
          popularity_score: number | null
          price_range: string | null
          rating: number | null
          search_vector: unknown
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          slug: string | null
          source_url: string | null
          sponsored_until: string | null
          status: string | null
          updated_at: string | null
          website: string | null
          writeup_generated_at: string | null
          writeup_prompt_used: string | null
        }
        Insert: {
          ai_writeup?: string | null
          city?: string | null
          created_at?: string | null
          cuisine?: string | null
          data_quality_score?: number | null
          description?: string | null
          enhanced?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          geom?: unknown
          google_place_id?: string | null
          heal_attempts?: number
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          is_merged?: boolean
          is_sponsored?: boolean
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          menu_scrape_enabled?: boolean
          menu_url?: string | null
          merged_at?: string | null
          merged_into?: string | null
          name: string
          needs_manual_verification?: boolean
          opening?: string | null
          opening_date?: string | null
          opening_timeframe?: string | null
          phone?: string | null
          popularity_score?: number | null
          price_range?: string | null
          rating?: number | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug?: string | null
          source_url?: string | null
          sponsored_until?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Update: {
          ai_writeup?: string | null
          city?: string | null
          created_at?: string | null
          cuisine?: string | null
          data_quality_score?: number | null
          description?: string | null
          enhanced?: string | null
          geo_faq?: Json | null
          geo_key_facts?: string[] | null
          geo_summary?: string | null
          geom?: unknown
          google_place_id?: string | null
          heal_attempts?: number
          id?: string
          image_checked_at?: string | null
          image_url?: string | null
          is_featured?: boolean | null
          is_merged?: boolean
          is_sponsored?: boolean
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          menu_scrape_enabled?: boolean
          menu_url?: string | null
          merged_at?: string | null
          merged_into?: string | null
          name?: string
          needs_manual_verification?: boolean
          opening?: string | null
          opening_date?: string | null
          opening_timeframe?: string | null
          phone?: string | null
          popularity_score?: number | null
          price_range?: string | null
          rating?: number | null
          search_vector?: unknown
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          slug?: string | null
          source_url?: string | null
          sponsored_until?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Relationships: []
      }
      rfp_submissions: {
        Row: {
          budget_range: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string | null
          event_dates: string | null
          event_name: string
          expected_attendance: number | null
          id: string
          notes: string | null
          organization: string | null
          status: string | null
          venue_requirements: string | null
        }
        Insert: {
          budget_range?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string | null
          event_dates?: string | null
          event_name: string
          expected_attendance?: number | null
          id?: string
          notes?: string | null
          organization?: string | null
          status?: string | null
          venue_requirements?: string | null
        }
        Update: {
          budget_range?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string | null
          event_dates?: string | null
          event_name?: string
          expected_attendance?: number | null
          id?: string
          notes?: string | null
          organization?: string | null
          status?: string | null
          venue_requirements?: string | null
        }
        Relationships: []
      }
      role_definitions: {
        Row: {
          created_at: string | null
          description: string | null
          level: number
          role: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          level: number
          role: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          level?: number
          role?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "role_definitions"
            referencedColumns: ["role"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alerts_enabled: boolean
          created_at: string
          filters: Json
          id: string
          last_alerted_at: string | null
          last_used: string | null
          name: string
          search_type: string
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          created_at?: string
          filters?: Json
          id?: string
          last_alerted_at?: string | null
          last_used?: string | null
          name: string
          search_type?: string
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          alerts_enabled?: boolean
          created_at?: string
          filters?: Json
          id?: string
          last_alerted_at?: string | null
          last_used?: string | null
          name?: string
          search_type?: string
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      scene_updates: {
        Row: {
          author: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          image_url: string | null
          is_published: boolean | null
          neighborhood: string | null
          publish_date: string | null
          source_url: string | null
          title: string
          update_type: string
        }
        Insert: {
          author?: string | null
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          neighborhood?: string | null
          publish_date?: string | null
          source_url?: string | null
          title: string
          update_type: string
        }
        Update: {
          author?: string | null
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          neighborhood?: string | null
          publish_date?: string | null
          source_url?: string | null
          title?: string
          update_type?: string
        }
        Relationships: []
      }
      scraping_jobs: {
        Row: {
          config: Json
          created_at: string | null
          events_found: number | null
          id: string
          job_type: string
          last_run: string | null
          name: string
          next_run: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          events_found?: number | null
          id?: string
          job_type?: string
          last_run?: string | null
          name: string
          next_run?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          events_found?: number | null
          id?: string
          job_type?: string
          last_run?: string | null
          name?: string
          next_run?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      search_analytics: {
        Row: {
          clicked_event_id: string | null
          clicked_position: number | null
          created_at: string
          id: string
          results_count: number
          search_filters: Json | null
          search_query: string
          user_id: string | null
        }
        Insert: {
          clicked_event_id?: string | null
          clicked_position?: number | null
          created_at?: string
          id?: string
          results_count?: number
          search_filters?: Json | null
          search_query: string
          user_id?: string | null
        }
        Update: {
          clicked_event_id?: string | null
          clicked_position?: number | null
          created_at?: string
          id?: string
          results_count?: number
          search_filters?: Json | null
          search_query?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_analytics_clicked_event_id_fkey"
            columns: ["clicked_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      search_performance: {
        Row: {
          clicks: number | null
          country: string | null
          created_at: string | null
          ctr: number | null
          device: string | null
          id: string
          impressions: number | null
          metric_date: string
          page: string | null
          position: number | null
          property_id: string
          provider_name: string
          query: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clicks?: number | null
          country?: string | null
          created_at?: string | null
          ctr?: number | null
          device?: string | null
          id?: string
          impressions?: number | null
          metric_date: string
          page?: string | null
          position?: number | null
          property_id: string
          provider_name: string
          query?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clicks?: number | null
          country?: string | null
          created_at?: string | null
          ctr?: number | null
          device?: string | null
          id?: string
          impressions?: number | null
          metric_date?: string
          page?: string | null
          position?: number | null
          property_id?: string
          provider_name?: string
          query?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seasonal_guides: {
        Row: {
          content: Json | null
          cover_image: string | null
          created_at: string | null
          description: string | null
          id: string
          is_published: boolean | null
          publish_date: string | null
          season: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          cover_image?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          publish_date?: string | null
          season?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          cover_image?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          publish_date?: string | null
          season?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          action: string | null
          created_at: string
          details: Json | null
          endpoint: string | null
          error_code: string | null
          event_type: string
          id: string
          identifier: string
          ip_address: string | null
          permission_checked: string | null
          resource: string | null
          security_layer: string | null
          severity: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          details?: Json | null
          endpoint?: string | null
          error_code?: string | null
          event_type: string
          id?: string
          identifier: string
          ip_address?: string | null
          permission_checked?: string | null
          resource?: string | null
          security_layer?: string | null
          severity: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          details?: Json | null
          endpoint?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          permission_checked?: string | null
          resource?: string | null
          security_layer?: string | null
          severity?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_tracking: {
        Row: {
          created_at: string | null
          description: string
          id: string
          issue_type: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          issue_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          issue_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      security_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      seo_content_optimization: {
        Row: {
          ai_analysis_date: string | null
          ai_model_used: string | null
          ai_recommendations: Json | null
          analyzed_at: string | null
          average_time_on_page_seconds: number | null
          average_words_per_sentence: number | null
          bounce_rate_percentage: number | null
          character_count: number | null
          competitor_average_score: number | null
          competitor_average_word_count: number | null
          content_age_days: number | null
          content_gap_topics: string[] | null
          content_intent: string | null
          content_type: string | null
          conversion_rate_percentage: number | null
          engagement_score: number | null
          external_links_count: number | null
          h1: string | null
          has_call_to_action: boolean | null
          has_conclusion: boolean | null
          has_featured_image: boolean | null
          has_images: boolean | null
          has_introduction: boolean | null
          has_lists: boolean | null
          has_table_of_contents: boolean | null
          has_videos: boolean | null
          heading_hierarchy_issues: string[] | null
          heading_structure_valid: boolean | null
          id: string
          images_count: number | null
          implementation_progress_percentage: number | null
          improvement_percentage: number | null
          internal_links_count: number | null
          is_evergreen: boolean | null
          issues: Json | null
          issues_count: number | null
          keyword_density: number | null
          keyword_frequency: number | null
          keyword_in_description: boolean | null
          keyword_in_first_paragraph: boolean | null
          keyword_in_h1: boolean | null
          keyword_in_title: boolean | null
          keyword_optimization_score: number | null
          last_optimized_at: string | null
          last_updated_date: string | null
          lsi_keywords: string[] | null
          lsi_keywords_count: number | null
          meta_description: string | null
          missing_lsi_keywords: string[] | null
          next_review_date: string | null
          optimization_priority: string | null
          optimization_status: string | null
          optimized_by: string | null
          overall_content_score: number | null
          paragraph_count: number | null
          readability_grade_level: string | null
          readability_score: number | null
          readability_score_rating: number | null
          reading_time_minutes: number | null
          recommendations_implemented: number | null
          recommendations_total: number | null
          score_after_optimization: number | null
          score_before_optimization: number | null
          sentence_count: number | null
          structure_score: number | null
          suggested_content_additions: string[] | null
          suggested_content_length_words: number | null
          suggested_h1: string | null
          suggested_meta_description: string | null
          suggested_title: string | null
          target_keyword: string | null
          title: string | null
          update_frequency: string | null
          url: string
          word_count: number | null
        }
        Insert: {
          ai_analysis_date?: string | null
          ai_model_used?: string | null
          ai_recommendations?: Json | null
          analyzed_at?: string | null
          average_time_on_page_seconds?: number | null
          average_words_per_sentence?: number | null
          bounce_rate_percentage?: number | null
          character_count?: number | null
          competitor_average_score?: number | null
          competitor_average_word_count?: number | null
          content_age_days?: number | null
          content_gap_topics?: string[] | null
          content_intent?: string | null
          content_type?: string | null
          conversion_rate_percentage?: number | null
          engagement_score?: number | null
          external_links_count?: number | null
          h1?: string | null
          has_call_to_action?: boolean | null
          has_conclusion?: boolean | null
          has_featured_image?: boolean | null
          has_images?: boolean | null
          has_introduction?: boolean | null
          has_lists?: boolean | null
          has_table_of_contents?: boolean | null
          has_videos?: boolean | null
          heading_hierarchy_issues?: string[] | null
          heading_structure_valid?: boolean | null
          id?: string
          images_count?: number | null
          implementation_progress_percentage?: number | null
          improvement_percentage?: number | null
          internal_links_count?: number | null
          is_evergreen?: boolean | null
          issues?: Json | null
          issues_count?: number | null
          keyword_density?: number | null
          keyword_frequency?: number | null
          keyword_in_description?: boolean | null
          keyword_in_first_paragraph?: boolean | null
          keyword_in_h1?: boolean | null
          keyword_in_title?: boolean | null
          keyword_optimization_score?: number | null
          last_optimized_at?: string | null
          last_updated_date?: string | null
          lsi_keywords?: string[] | null
          lsi_keywords_count?: number | null
          meta_description?: string | null
          missing_lsi_keywords?: string[] | null
          next_review_date?: string | null
          optimization_priority?: string | null
          optimization_status?: string | null
          optimized_by?: string | null
          overall_content_score?: number | null
          paragraph_count?: number | null
          readability_grade_level?: string | null
          readability_score?: number | null
          readability_score_rating?: number | null
          reading_time_minutes?: number | null
          recommendations_implemented?: number | null
          recommendations_total?: number | null
          score_after_optimization?: number | null
          score_before_optimization?: number | null
          sentence_count?: number | null
          structure_score?: number | null
          suggested_content_additions?: string[] | null
          suggested_content_length_words?: number | null
          suggested_h1?: string | null
          suggested_meta_description?: string | null
          suggested_title?: string | null
          target_keyword?: string | null
          title?: string | null
          update_frequency?: string | null
          url: string
          word_count?: number | null
        }
        Update: {
          ai_analysis_date?: string | null
          ai_model_used?: string | null
          ai_recommendations?: Json | null
          analyzed_at?: string | null
          average_time_on_page_seconds?: number | null
          average_words_per_sentence?: number | null
          bounce_rate_percentage?: number | null
          character_count?: number | null
          competitor_average_score?: number | null
          competitor_average_word_count?: number | null
          content_age_days?: number | null
          content_gap_topics?: string[] | null
          content_intent?: string | null
          content_type?: string | null
          conversion_rate_percentage?: number | null
          engagement_score?: number | null
          external_links_count?: number | null
          h1?: string | null
          has_call_to_action?: boolean | null
          has_conclusion?: boolean | null
          has_featured_image?: boolean | null
          has_images?: boolean | null
          has_introduction?: boolean | null
          has_lists?: boolean | null
          has_table_of_contents?: boolean | null
          has_videos?: boolean | null
          heading_hierarchy_issues?: string[] | null
          heading_structure_valid?: boolean | null
          id?: string
          images_count?: number | null
          implementation_progress_percentage?: number | null
          improvement_percentage?: number | null
          internal_links_count?: number | null
          is_evergreen?: boolean | null
          issues?: Json | null
          issues_count?: number | null
          keyword_density?: number | null
          keyword_frequency?: number | null
          keyword_in_description?: boolean | null
          keyword_in_first_paragraph?: boolean | null
          keyword_in_h1?: boolean | null
          keyword_in_title?: boolean | null
          keyword_optimization_score?: number | null
          last_optimized_at?: string | null
          last_updated_date?: string | null
          lsi_keywords?: string[] | null
          lsi_keywords_count?: number | null
          meta_description?: string | null
          missing_lsi_keywords?: string[] | null
          next_review_date?: string | null
          optimization_priority?: string | null
          optimization_status?: string | null
          optimized_by?: string | null
          overall_content_score?: number | null
          paragraph_count?: number | null
          readability_grade_level?: string | null
          readability_score?: number | null
          readability_score_rating?: number | null
          reading_time_minutes?: number | null
          recommendations_implemented?: number | null
          recommendations_total?: number | null
          score_after_optimization?: number | null
          score_before_optimization?: number | null
          sentence_count?: number | null
          structure_score?: number | null
          suggested_content_additions?: string[] | null
          suggested_content_length_words?: number | null
          suggested_h1?: string | null
          suggested_meta_description?: string | null
          suggested_title?: string | null
          target_keyword?: string | null
          title?: string | null
          update_frequency?: string | null
          url?: string
          word_count?: number | null
        }
        Relationships: []
      }
      seo_duplicate_content: {
        Row: {
          canonical_relationship: string | null
          common_text: string | null
          common_word_count: number | null
          content_hash_1: string | null
          content_hash_2: string | null
          description_similarity_percentage: number | null
          detected_at: string | null
          detection_method: string | null
          headings_similarity_percentage: number | null
          id: string
          impact_severity: string | null
          last_checked_at: string | null
          reason: string | null
          recommended_canonical: string | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          similarity_percentage: number | null
          similarity_type: string | null
          status: string | null
          title_similarity_percentage: number | null
          total_words_url_1: number | null
          total_words_url_2: number | null
          url_1: string
          url_2: string
        }
        Insert: {
          canonical_relationship?: string | null
          common_text?: string | null
          common_word_count?: number | null
          content_hash_1?: string | null
          content_hash_2?: string | null
          description_similarity_percentage?: number | null
          detected_at?: string | null
          detection_method?: string | null
          headings_similarity_percentage?: number | null
          id?: string
          impact_severity?: string | null
          last_checked_at?: string | null
          reason?: string | null
          recommended_canonical?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          similarity_percentage?: number | null
          similarity_type?: string | null
          status?: string | null
          title_similarity_percentage?: number | null
          total_words_url_1?: number | null
          total_words_url_2?: number | null
          url_1: string
          url_2: string
        }
        Update: {
          canonical_relationship?: string | null
          common_text?: string | null
          common_word_count?: number | null
          content_hash_1?: string | null
          content_hash_2?: string | null
          description_similarity_percentage?: number | null
          detected_at?: string | null
          detection_method?: string | null
          headings_similarity_percentage?: number | null
          id?: string
          impact_severity?: string | null
          last_checked_at?: string | null
          reason?: string | null
          recommended_canonical?: string | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          similarity_percentage?: number | null
          similarity_type?: string | null
          status?: string | null
          title_similarity_percentage?: number | null
          total_words_url_1?: number | null
          total_words_url_2?: number | null
          url_1?: string
          url_2?: string
        }
        Relationships: []
      }
      seo_link_analysis: {
        Row: {
          anchor_text_length: number | null
          checked_at: string | null
          crawl_session_id: string | null
          domain_authority: number | null
          final_url: string | null
          id: string
          is_branded: boolean | null
          is_broken: boolean | null
          is_exact_match: boolean | null
          is_follow: boolean | null
          is_generic: boolean | null
          is_in_content: boolean | null
          is_in_footer: boolean | null
          is_in_navigation: boolean | null
          is_nofollow: boolean | null
          is_partial_match: boolean | null
          is_reputable_domain: boolean | null
          is_spam: boolean | null
          issues: string[] | null
          link_text: string | null
          link_type: string | null
          link_url: string
          passes_link_equity: boolean | null
          position_on_page: number | null
          redirect_count: number | null
          rel_attributes: string[] | null
          response_time_ms: number | null
          seo_value: string | null
          source_url: string
          status_code: number | null
          surrounding_text: string | null
          target_attribute: string | null
        }
        Insert: {
          anchor_text_length?: number | null
          checked_at?: string | null
          crawl_session_id?: string | null
          domain_authority?: number | null
          final_url?: string | null
          id?: string
          is_branded?: boolean | null
          is_broken?: boolean | null
          is_exact_match?: boolean | null
          is_follow?: boolean | null
          is_generic?: boolean | null
          is_in_content?: boolean | null
          is_in_footer?: boolean | null
          is_in_navigation?: boolean | null
          is_nofollow?: boolean | null
          is_partial_match?: boolean | null
          is_reputable_domain?: boolean | null
          is_spam?: boolean | null
          issues?: string[] | null
          link_text?: string | null
          link_type?: string | null
          link_url: string
          passes_link_equity?: boolean | null
          position_on_page?: number | null
          redirect_count?: number | null
          rel_attributes?: string[] | null
          response_time_ms?: number | null
          seo_value?: string | null
          source_url: string
          status_code?: number | null
          surrounding_text?: string | null
          target_attribute?: string | null
        }
        Update: {
          anchor_text_length?: number | null
          checked_at?: string | null
          crawl_session_id?: string | null
          domain_authority?: number | null
          final_url?: string | null
          id?: string
          is_branded?: boolean | null
          is_broken?: boolean | null
          is_exact_match?: boolean | null
          is_follow?: boolean | null
          is_generic?: boolean | null
          is_in_content?: boolean | null
          is_in_footer?: boolean | null
          is_in_navigation?: boolean | null
          is_nofollow?: boolean | null
          is_partial_match?: boolean | null
          is_reputable_domain?: boolean | null
          is_spam?: boolean | null
          issues?: string[] | null
          link_text?: string | null
          link_type?: string | null
          link_url?: string
          passes_link_equity?: boolean | null
          position_on_page?: number | null
          redirect_count?: number | null
          rel_attributes?: string[] | null
          response_time_ms?: number | null
          seo_value?: string | null
          source_url?: string
          status_code?: number | null
          surrounding_text?: string | null
          target_attribute?: string | null
        }
        Relationships: []
      }
      seo_mobile_analysis: {
        Row: {
          amp_validation_errors: string[] | null
          analyzed_at: string | null
          assessment: string | null
          blocking_resources: string[] | null
          blocks_mobile_rendering: boolean | null
          content_parity_with_desktop: boolean | null
          content_wider_than_screen: boolean | null
          content_width_px: number | null
          crawl_session_id: string | null
          critical_issues_count: number | null
          has_accelerated_mobile_pages: boolean | null
          has_app_links: boolean | null
          has_intrusive_interstitials: boolean | null
          has_viewport_meta: boolean | null
          id: string
          interstitial_types: string[] | null
          is_mobile_friendly: boolean | null
          is_responsive: boolean | null
          min_font_size: number | null
          min_touch_target_size: number | null
          missing_content_on_mobile: string[] | null
          mobile_first_contentful_paint_ms: number | null
          mobile_first_issues: string[] | null
          mobile_first_ready: boolean | null
          mobile_friendly_score: number | null
          mobile_page_load_time_ms: number | null
          mobile_time_to_interactive_ms: number | null
          mobile_usability_issues: Json | null
          overall_mobile_score: number | null
          readable_font_size_percentage: number | null
          recommendations: string[] | null
          recommended_touch_target_size: number | null
          requires_horizontal_scroll: boolean | null
          responsive_method: string | null
          text_size_issues: string[] | null
          text_too_small: boolean | null
          touch_elements_too_close: boolean | null
          touch_target_issues: string[] | null
          url: string
          viewport_content: string | null
          viewport_initial_scale: number | null
          viewport_width: string | null
          viewport_width_px: number | null
          warning_issues_count: number | null
        }
        Insert: {
          amp_validation_errors?: string[] | null
          analyzed_at?: string | null
          assessment?: string | null
          blocking_resources?: string[] | null
          blocks_mobile_rendering?: boolean | null
          content_parity_with_desktop?: boolean | null
          content_wider_than_screen?: boolean | null
          content_width_px?: number | null
          crawl_session_id?: string | null
          critical_issues_count?: number | null
          has_accelerated_mobile_pages?: boolean | null
          has_app_links?: boolean | null
          has_intrusive_interstitials?: boolean | null
          has_viewport_meta?: boolean | null
          id?: string
          interstitial_types?: string[] | null
          is_mobile_friendly?: boolean | null
          is_responsive?: boolean | null
          min_font_size?: number | null
          min_touch_target_size?: number | null
          missing_content_on_mobile?: string[] | null
          mobile_first_contentful_paint_ms?: number | null
          mobile_first_issues?: string[] | null
          mobile_first_ready?: boolean | null
          mobile_friendly_score?: number | null
          mobile_page_load_time_ms?: number | null
          mobile_time_to_interactive_ms?: number | null
          mobile_usability_issues?: Json | null
          overall_mobile_score?: number | null
          readable_font_size_percentage?: number | null
          recommendations?: string[] | null
          recommended_touch_target_size?: number | null
          requires_horizontal_scroll?: boolean | null
          responsive_method?: string | null
          text_size_issues?: string[] | null
          text_too_small?: boolean | null
          touch_elements_too_close?: boolean | null
          touch_target_issues?: string[] | null
          url: string
          viewport_content?: string | null
          viewport_initial_scale?: number | null
          viewport_width?: string | null
          viewport_width_px?: number | null
          warning_issues_count?: number | null
        }
        Update: {
          amp_validation_errors?: string[] | null
          analyzed_at?: string | null
          assessment?: string | null
          blocking_resources?: string[] | null
          blocks_mobile_rendering?: boolean | null
          content_parity_with_desktop?: boolean | null
          content_wider_than_screen?: boolean | null
          content_width_px?: number | null
          crawl_session_id?: string | null
          critical_issues_count?: number | null
          has_accelerated_mobile_pages?: boolean | null
          has_app_links?: boolean | null
          has_intrusive_interstitials?: boolean | null
          has_viewport_meta?: boolean | null
          id?: string
          interstitial_types?: string[] | null
          is_mobile_friendly?: boolean | null
          is_responsive?: boolean | null
          min_font_size?: number | null
          min_touch_target_size?: number | null
          missing_content_on_mobile?: string[] | null
          mobile_first_contentful_paint_ms?: number | null
          mobile_first_issues?: string[] | null
          mobile_first_ready?: boolean | null
          mobile_friendly_score?: number | null
          mobile_page_load_time_ms?: number | null
          mobile_time_to_interactive_ms?: number | null
          mobile_usability_issues?: Json | null
          overall_mobile_score?: number | null
          readable_font_size_percentage?: number | null
          recommendations?: string[] | null
          recommended_touch_target_size?: number | null
          requires_horizontal_scroll?: boolean | null
          responsive_method?: string | null
          text_size_issues?: string[] | null
          text_too_small?: boolean | null
          touch_elements_too_close?: boolean | null
          touch_target_issues?: string[] | null
          url?: string
          viewport_content?: string | null
          viewport_initial_scale?: number | null
          viewport_width?: string | null
          viewport_width_px?: number | null
          warning_issues_count?: number | null
        }
        Relationships: []
      }
      seo_performance_budget: {
        Row: {
          alert_on_violation: boolean | null
          alert_threshold_percentage: number | null
          applies_to: string | null
          budget_name: string
          budget_type: string | null
          consecutive_failures: number | null
          created_at: string | null
          created_by: string | null
          custom_metrics: Json | null
          description: string | null
          id: string
          is_active: boolean | null
          is_passing: boolean | null
          last_check_results: Json | null
          last_checked_at: string | null
          last_failed_at: string | null
          last_passed_at: string | null
          max_cls: number | null
          max_css_requests: number | null
          max_css_size_bytes: number | null
          max_fid_ms: number | null
          max_first_contentful_paint_ms: number | null
          max_font_size_bytes: number | null
          max_html_size_bytes: number | null
          max_image_requests: number | null
          max_image_size_bytes: number | null
          max_js_requests: number | null
          max_js_size_bytes: number | null
          max_largest_contentful_paint_ms: number | null
          max_lcp_ms: number | null
          max_load_time_ms: number | null
          max_time_to_interactive_ms: number | null
          max_total_blocking_time_ms: number | null
          max_total_requests: number | null
          max_total_size_bytes: number | null
          updated_at: string | null
          url: string | null
          url_pattern: string | null
          violations: string[] | null
          violations_count: number | null
        }
        Insert: {
          alert_on_violation?: boolean | null
          alert_threshold_percentage?: number | null
          applies_to?: string | null
          budget_name: string
          budget_type?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_metrics?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_passing?: boolean | null
          last_check_results?: Json | null
          last_checked_at?: string | null
          last_failed_at?: string | null
          last_passed_at?: string | null
          max_cls?: number | null
          max_css_requests?: number | null
          max_css_size_bytes?: number | null
          max_fid_ms?: number | null
          max_first_contentful_paint_ms?: number | null
          max_font_size_bytes?: number | null
          max_html_size_bytes?: number | null
          max_image_requests?: number | null
          max_image_size_bytes?: number | null
          max_js_requests?: number | null
          max_js_size_bytes?: number | null
          max_largest_contentful_paint_ms?: number | null
          max_lcp_ms?: number | null
          max_load_time_ms?: number | null
          max_time_to_interactive_ms?: number | null
          max_total_blocking_time_ms?: number | null
          max_total_requests?: number | null
          max_total_size_bytes?: number | null
          updated_at?: string | null
          url?: string | null
          url_pattern?: string | null
          violations?: string[] | null
          violations_count?: number | null
        }
        Update: {
          alert_on_violation?: boolean | null
          alert_threshold_percentage?: number | null
          applies_to?: string | null
          budget_name?: string
          budget_type?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_metrics?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_passing?: boolean | null
          last_check_results?: Json | null
          last_checked_at?: string | null
          last_failed_at?: string | null
          last_passed_at?: string | null
          max_cls?: number | null
          max_css_requests?: number | null
          max_css_size_bytes?: number | null
          max_fid_ms?: number | null
          max_first_contentful_paint_ms?: number | null
          max_font_size_bytes?: number | null
          max_html_size_bytes?: number | null
          max_image_requests?: number | null
          max_image_size_bytes?: number | null
          max_js_requests?: number | null
          max_js_size_bytes?: number | null
          max_largest_contentful_paint_ms?: number | null
          max_lcp_ms?: number | null
          max_load_time_ms?: number | null
          max_time_to_interactive_ms?: number | null
          max_total_blocking_time_ms?: number | null
          max_total_requests?: number | null
          max_total_size_bytes?: number | null
          updated_at?: string | null
          url?: string | null
          url_pattern?: string | null
          violations?: string[] | null
          violations_count?: number | null
        }
        Relationships: []
      }
      seo_security_analysis: {
        Row: {
          checked_at: string | null
          cookies: Json | null
          crawl_session_id: string | null
          critical_issues: string[] | null
          csp_directives: Json | null
          csp_violations: string[] | null
          has_csp: boolean | null
          has_hsts: boolean | null
          has_known_vulnerabilities: boolean | null
          has_mixed_content: boolean | null
          has_permissions_policy: boolean | null
          has_referrer_policy: boolean | null
          has_x_content_type_options: boolean | null
          has_x_frame_options: boolean | null
          hsts_include_subdomains: boolean | null
          hsts_max_age: number | null
          hsts_preload: boolean | null
          id: string
          insecure_cookies_count: number | null
          insecure_third_party_count: number | null
          is_https: boolean | null
          mixed_content_urls: string[] | null
          overall_assessment: string | null
          permissions_policy_value: string | null
          recommendations: string[] | null
          referrer_policy_value: string | null
          security_score: number | null
          ssl_days_until_expiry: number | null
          ssl_expiry_date: string | null
          ssl_issuer: string | null
          ssl_valid: boolean | null
          third_party_scripts: Json | null
          url: string
          vulnerabilities: Json | null
          warnings: string[] | null
          x_content_type_options_value: string | null
          x_frame_options_value: string | null
        }
        Insert: {
          checked_at?: string | null
          cookies?: Json | null
          crawl_session_id?: string | null
          critical_issues?: string[] | null
          csp_directives?: Json | null
          csp_violations?: string[] | null
          has_csp?: boolean | null
          has_hsts?: boolean | null
          has_known_vulnerabilities?: boolean | null
          has_mixed_content?: boolean | null
          has_permissions_policy?: boolean | null
          has_referrer_policy?: boolean | null
          has_x_content_type_options?: boolean | null
          has_x_frame_options?: boolean | null
          hsts_include_subdomains?: boolean | null
          hsts_max_age?: number | null
          hsts_preload?: boolean | null
          id?: string
          insecure_cookies_count?: number | null
          insecure_third_party_count?: number | null
          is_https?: boolean | null
          mixed_content_urls?: string[] | null
          overall_assessment?: string | null
          permissions_policy_value?: string | null
          recommendations?: string[] | null
          referrer_policy_value?: string | null
          security_score?: number | null
          ssl_days_until_expiry?: number | null
          ssl_expiry_date?: string | null
          ssl_issuer?: string | null
          ssl_valid?: boolean | null
          third_party_scripts?: Json | null
          url: string
          vulnerabilities?: Json | null
          warnings?: string[] | null
          x_content_type_options_value?: string | null
          x_frame_options_value?: string | null
        }
        Update: {
          checked_at?: string | null
          cookies?: Json | null
          crawl_session_id?: string | null
          critical_issues?: string[] | null
          csp_directives?: Json | null
          csp_violations?: string[] | null
          has_csp?: boolean | null
          has_hsts?: boolean | null
          has_known_vulnerabilities?: boolean | null
          has_mixed_content?: boolean | null
          has_permissions_policy?: boolean | null
          has_referrer_policy?: boolean | null
          has_x_content_type_options?: boolean | null
          has_x_frame_options?: boolean | null
          hsts_include_subdomains?: boolean | null
          hsts_max_age?: number | null
          hsts_preload?: boolean | null
          id?: string
          insecure_cookies_count?: number | null
          insecure_third_party_count?: number | null
          is_https?: boolean | null
          mixed_content_urls?: string[] | null
          overall_assessment?: string | null
          permissions_policy_value?: string | null
          recommendations?: string[] | null
          referrer_policy_value?: string | null
          security_score?: number | null
          ssl_days_until_expiry?: number | null
          ssl_expiry_date?: string | null
          ssl_issuer?: string | null
          ssl_valid?: boolean | null
          third_party_scripts?: Json | null
          url?: string
          vulnerabilities?: Json | null
          warnings?: string[] | null
          x_content_type_options_value?: string | null
          x_frame_options_value?: string | null
        }
        Relationships: []
      }
      seo_semantic_analysis: {
        Row: {
          ai_content_angle_suggestions: string[] | null
          ai_keyword_suggestions: string[] | null
          ai_model_used: string | null
          ai_topic_suggestions: string[] | null
          analyzed_at: string | null
          auto_suggest_queries: string[] | null
          competitor_semantic_keywords: string[] | null
          competitor_semantic_overlap_percentage: number | null
          complexity_level: string | null
          content_comprehensiveness_score: number | null
          detected_intent: string | null
          entities: Json | null
          entities_count: number | null
          featured_snippet_opportunity: boolean | null
          featured_snippet_type: string | null
          id: string
          intent_confidence: number | null
          keyword_co_occurrences: Json | null
          last_updated_at: string | null
          long_tail_keywords: string[] | null
          main_topics: string[] | null
          missing_keywords: string[] | null
          missing_topics: string[] | null
          next_analysis_date: string | null
          paa_opportunity: boolean | null
          paa_questions: string[] | null
          primary_keyword: string
          priority_keywords_to_add: string[] | null
          priority_topics_to_cover: string[] | null
          query_variations: string[] | null
          question_keywords: string[] | null
          questions_people_ask: string[] | null
          ranking_improvement: number | null
          recommended_content_additions: string[] | null
          related_searches: string[] | null
          semantic_keywords: Json | null
          semantic_keywords_count: number | null
          semantic_optimization_recommendations: string[] | null
          semantic_richness_score: number | null
          semantic_score_after: number | null
          semantic_score_before: number | null
          sentiment_score: number | null
          serp_avg_word_count: number | null
          serp_common_topics: string[] | null
          serp_keyword_density_competitors: number | null
          subtopics: string[] | null
          tfidf_top_terms: Json | null
          tone: string | null
          topic_clusters: Json | null
          topic_depth_score: number | null
          unique_semantic_keywords: string[] | null
          url: string
        }
        Insert: {
          ai_content_angle_suggestions?: string[] | null
          ai_keyword_suggestions?: string[] | null
          ai_model_used?: string | null
          ai_topic_suggestions?: string[] | null
          analyzed_at?: string | null
          auto_suggest_queries?: string[] | null
          competitor_semantic_keywords?: string[] | null
          competitor_semantic_overlap_percentage?: number | null
          complexity_level?: string | null
          content_comprehensiveness_score?: number | null
          detected_intent?: string | null
          entities?: Json | null
          entities_count?: number | null
          featured_snippet_opportunity?: boolean | null
          featured_snippet_type?: string | null
          id?: string
          intent_confidence?: number | null
          keyword_co_occurrences?: Json | null
          last_updated_at?: string | null
          long_tail_keywords?: string[] | null
          main_topics?: string[] | null
          missing_keywords?: string[] | null
          missing_topics?: string[] | null
          next_analysis_date?: string | null
          paa_opportunity?: boolean | null
          paa_questions?: string[] | null
          primary_keyword: string
          priority_keywords_to_add?: string[] | null
          priority_topics_to_cover?: string[] | null
          query_variations?: string[] | null
          question_keywords?: string[] | null
          questions_people_ask?: string[] | null
          ranking_improvement?: number | null
          recommended_content_additions?: string[] | null
          related_searches?: string[] | null
          semantic_keywords?: Json | null
          semantic_keywords_count?: number | null
          semantic_optimization_recommendations?: string[] | null
          semantic_richness_score?: number | null
          semantic_score_after?: number | null
          semantic_score_before?: number | null
          sentiment_score?: number | null
          serp_avg_word_count?: number | null
          serp_common_topics?: string[] | null
          serp_keyword_density_competitors?: number | null
          subtopics?: string[] | null
          tfidf_top_terms?: Json | null
          tone?: string | null
          topic_clusters?: Json | null
          topic_depth_score?: number | null
          unique_semantic_keywords?: string[] | null
          url: string
        }
        Update: {
          ai_content_angle_suggestions?: string[] | null
          ai_keyword_suggestions?: string[] | null
          ai_model_used?: string | null
          ai_topic_suggestions?: string[] | null
          analyzed_at?: string | null
          auto_suggest_queries?: string[] | null
          competitor_semantic_keywords?: string[] | null
          competitor_semantic_overlap_percentage?: number | null
          complexity_level?: string | null
          content_comprehensiveness_score?: number | null
          detected_intent?: string | null
          entities?: Json | null
          entities_count?: number | null
          featured_snippet_opportunity?: boolean | null
          featured_snippet_type?: string | null
          id?: string
          intent_confidence?: number | null
          keyword_co_occurrences?: Json | null
          last_updated_at?: string | null
          long_tail_keywords?: string[] | null
          main_topics?: string[] | null
          missing_keywords?: string[] | null
          missing_topics?: string[] | null
          next_analysis_date?: string | null
          paa_opportunity?: boolean | null
          paa_questions?: string[] | null
          primary_keyword?: string
          priority_keywords_to_add?: string[] | null
          priority_topics_to_cover?: string[] | null
          query_variations?: string[] | null
          question_keywords?: string[] | null
          questions_people_ask?: string[] | null
          ranking_improvement?: number | null
          recommended_content_additions?: string[] | null
          related_searches?: string[] | null
          semantic_keywords?: Json | null
          semantic_keywords_count?: number | null
          semantic_optimization_recommendations?: string[] | null
          semantic_richness_score?: number | null
          semantic_score_after?: number | null
          semantic_score_before?: number | null
          sentiment_score?: number | null
          serp_avg_word_count?: number | null
          serp_common_topics?: string[] | null
          serp_keyword_density_competitors?: number | null
          subtopics?: string[] | null
          tfidf_top_terms?: Json | null
          tone?: string | null
          topic_clusters?: Json | null
          topic_depth_score?: number | null
          unique_semantic_keywords?: string[] | null
          url?: string
        }
        Relationships: []
      }
      seo_structured_data: {
        Row: {
          crawl_session_id: string | null
          eligible_for_rich_results: boolean | null
          google_testing_url: string | null
          has_address: boolean | null
          has_author: boolean | null
          has_availability: boolean | null
          has_headline: boolean | null
          has_image: boolean | null
          has_location: boolean | null
          has_logo: boolean | null
          has_name: boolean | null
          has_offer: boolean | null
          has_opening_hours: boolean | null
          has_phone: boolean | null
          has_price: boolean | null
          has_publish_date: boolean | null
          has_recommended_properties: boolean | null
          has_required_properties: boolean | null
          has_review: boolean | null
          has_start_date: boolean | null
          id: string
          is_valid: boolean | null
          last_modified_at: string | null
          missing_recommended_properties: string[] | null
          missing_required_properties: string[] | null
          nested_depth: number | null
          property_count: number | null
          raw_data: Json
          rich_result_types: string[] | null
          rich_results_issues: string[] | null
          schema_format: string | null
          schema_type: string
          testing_results: Json | null
          url: string
          validated_at: string | null
          validation_errors: string[] | null
          validation_warnings: string[] | null
        }
        Insert: {
          crawl_session_id?: string | null
          eligible_for_rich_results?: boolean | null
          google_testing_url?: string | null
          has_address?: boolean | null
          has_author?: boolean | null
          has_availability?: boolean | null
          has_headline?: boolean | null
          has_image?: boolean | null
          has_location?: boolean | null
          has_logo?: boolean | null
          has_name?: boolean | null
          has_offer?: boolean | null
          has_opening_hours?: boolean | null
          has_phone?: boolean | null
          has_price?: boolean | null
          has_publish_date?: boolean | null
          has_recommended_properties?: boolean | null
          has_required_properties?: boolean | null
          has_review?: boolean | null
          has_start_date?: boolean | null
          id?: string
          is_valid?: boolean | null
          last_modified_at?: string | null
          missing_recommended_properties?: string[] | null
          missing_required_properties?: string[] | null
          nested_depth?: number | null
          property_count?: number | null
          raw_data: Json
          rich_result_types?: string[] | null
          rich_results_issues?: string[] | null
          schema_format?: string | null
          schema_type: string
          testing_results?: Json | null
          url: string
          validated_at?: string | null
          validation_errors?: string[] | null
          validation_warnings?: string[] | null
        }
        Update: {
          crawl_session_id?: string | null
          eligible_for_rich_results?: boolean | null
          google_testing_url?: string | null
          has_address?: boolean | null
          has_author?: boolean | null
          has_availability?: boolean | null
          has_headline?: boolean | null
          has_image?: boolean | null
          has_location?: boolean | null
          has_logo?: boolean | null
          has_name?: boolean | null
          has_offer?: boolean | null
          has_opening_hours?: boolean | null
          has_phone?: boolean | null
          has_price?: boolean | null
          has_publish_date?: boolean | null
          has_recommended_properties?: boolean | null
          has_required_properties?: boolean | null
          has_review?: boolean | null
          has_start_date?: boolean | null
          id?: string
          is_valid?: boolean | null
          last_modified_at?: string | null
          missing_recommended_properties?: string[] | null
          missing_required_properties?: string[] | null
          nested_depth?: number | null
          property_count?: number | null
          raw_data?: Json
          rich_result_types?: string[] | null
          rich_results_issues?: string[] | null
          schema_format?: string | null
          schema_type?: string
          testing_results?: Json | null
          url?: string
          validated_at?: string | null
          validation_errors?: string[] | null
          validation_warnings?: string[] | null
        }
        Relationships: []
      }
      site_health_metrics: {
        Row: {
          affected_urls: number | null
          check_date: string
          created_at: string | null
          id: string
          issue_description: string | null
          metadata: Json | null
          metric_type: string
          property_id: string
          provider_name: string
          severity: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          affected_urls?: number | null
          check_date: string
          created_at?: string | null
          id?: string
          issue_description?: string | null
          metadata?: Json | null
          metric_type: string
          property_id: string
          provider_name: string
          severity?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          affected_urls?: number | null
          check_date?: string
          created_at?: string | null
          id?: string
          issue_description?: string | null
          metadata?: Json | null
          metric_type?: string
          property_id?: string
          provider_name?: string
          severity?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sitemap_change_queue: {
        Row: {
          action: string
          content_id: string | null
          content_type: string
          created_at: string
          id: string
          processed_at: string | null
        }
        Insert: {
          action?: string
          content_id?: string | null
          content_type: string
          created_at?: string
          id?: string
          processed_at?: string | null
        }
        Update: {
          action?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          id?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      smart_event_suggestions: {
        Row: {
          confidence_score: number | null
          created_at: string
          event_id: string
          id: string
          is_accepted: boolean | null
          is_dismissed: boolean | null
          optimal_time: string | null
          reason: string
          suggested_at: string
          travel_time_minutes: number | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          event_id: string
          id?: string
          is_accepted?: boolean | null
          is_dismissed?: boolean | null
          optimal_time?: string | null
          reason: string
          suggested_at?: string
          travel_time_minutes?: number | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          event_id?: string
          id?: string
          is_accepted?: boolean | null
          is_dismissed?: boolean | null
          optimal_time?: string | null
          reason?: string
          suggested_at?: string
          travel_time_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_event_suggestions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          created_by: string | null
          handle: string
          id: string
          is_active: boolean
          last_validated_at: string | null
          last_validation_error: string | null
          notes: string | null
          platform: string
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          created_by?: string | null
          handle: string
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          last_validation_error?: string | null
          notes?: string | null
          platform: string
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          created_by?: string | null
          handle?: string
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          last_validation_error?: string | null
          notes?: string | null
          platform?: string
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_media_automation_settings: {
        Row: {
          created_at: string
          enabled: boolean
          event_time: string
          id: string
          restaurant_time: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_time?: string
          id?: string
          restaurant_time?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_time?: string
          id?: string
          restaurant_time?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_media_posts: {
        Row: {
          ai_prompt_used: string | null
          content_id: string | null
          content_type: string
          content_url: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          metadata: Json | null
          platform_type: string
          post_content: string
          post_title: string | null
          posted_at: string | null
          scheduled_for: string | null
          status: string | null
          subject_type: string
          updated_at: string | null
          webhook_urls: Json | null
        }
        Insert: {
          ai_prompt_used?: string | null
          content_id?: string | null
          content_type: string
          content_url?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          metadata?: Json | null
          platform_type: string
          post_content: string
          post_title?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          subject_type: string
          updated_at?: string | null
          webhook_urls?: Json | null
        }
        Update: {
          ai_prompt_used?: string | null
          content_id?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          metadata?: Json | null
          platform_type?: string
          post_content?: string
          post_title?: string | null
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          subject_type?: string
          updated_at?: string | null
          webhook_urls?: Json | null
        }
        Relationships: []
      }
      social_media_schedules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_run: string | null
          next_run: string | null
          schedule_type: string
          scheduled_time: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          next_run?: string | null
          schedule_type: string
          scheduled_time: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_run?: string | null
          next_run?: string | null
          schedule_type?: string
          scheduled_time?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      social_media_webhooks: {
        Row: {
          created_at: string | null
          created_by: string | null
          headers: Json | null
          id: string
          is_active: boolean | null
          name: string
          platform: string
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          platform: string
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          platform?: string
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      sponsored_listing_links: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          listing_id: string
          listing_type: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          listing_id: string
          listing_type: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          listing_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_listing_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_type: string | null
          id: string
          processed_at: string
        }
        Insert: {
          event_type?: string | null
          id: string
          processed_at?: string
        }
        Update: {
          event_type?: string | null
          id?: string
          processed_at?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          platform: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          platform?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          platform?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          limits: Json | null
          name: string
          price_monthly: number
          price_yearly: number | null
          sort_order: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          limits?: Json | null
          name: string
          price_monthly: number
          price_yearly?: number | null
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          limits?: Json | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_split_audit: {
        Row: {
          id: string
          legacy_platform: string
          legacy_subscription_id: string
          split_at: string
          stripe_subscription_id: string | null
          user_id: string
          web_subscription_id: string | null
        }
        Insert: {
          id?: string
          legacy_platform: string
          legacy_subscription_id: string
          split_at?: string
          stripe_subscription_id?: string | null
          user_id: string
          web_subscription_id?: string | null
        }
        Update: {
          id?: string
          legacy_platform?: string
          legacy_subscription_id?: string
          split_at?: string
          stripe_subscription_id?: string | null
          user_id?: string
          web_subscription_id?: string | null
        }
        Relationships: []
      }
      support_canned_responses: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_csat: {
        Row: {
          channel: string | null
          comment: string | null
          created_at: string
          id: string
          resolved_by: string | null
          run_id: string | null
          score: number
          ticket_id: string
        }
        Insert: {
          channel?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          resolved_by?: string | null
          run_id?: string | null
          score: number
          ticket_id: string
        }
        Update: {
          channel?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          resolved_by?: string | null
          run_id?: string | null
          score?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_csat_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_kb: {
        Row: {
          category: string | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          is_active: boolean
          needs_embedding: boolean
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          needs_embedding?: boolean
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          needs_embedding?: boolean
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          metadata: Json | null
          sender: Database["public"]["Enums"]["support_sender"]
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender?: Database["public"]["Enums"]["support_sender"]
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender?: Database["public"]["Enums"]["support_sender"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_feedback: {
        Row: {
          actor: string | null
          corrected_category: string | null
          corrected_priority: string | null
          corrected_sentiment: string | null
          corrected_urgency: string | null
          created_at: string
          id: string
          prior: Json | null
          ticket_id: string
        }
        Insert: {
          actor?: string | null
          corrected_category?: string | null
          corrected_priority?: string | null
          corrected_sentiment?: string | null
          corrected_urgency?: string | null
          created_at?: string
          id?: string
          prior?: Json | null
          ticket_id: string
        }
        Update: {
          actor?: string | null
          corrected_category?: string | null
          corrected_priority?: string | null
          corrected_sentiment?: string | null
          corrected_urgency?: string | null
          created_at?: string
          id?: string
          prior?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_feedback_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          body: string
          category: string | null
          channel: Database["public"]["Enums"]["support_channel"]
          classification_confidence: number | null
          classification_source: string | null
          classified_at: string | null
          contact_email: string | null
          created_at: string
          csat_prompt_sent_at: string | null
          csat_score: number | null
          id: string
          merged_into: string | null
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          sentiment: string | null
          sla_due_at: string | null
          sla_escalated_at: string | null
          source_ref: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string | null
          updated_at: string
          urgency: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          body: string
          category?: string | null
          channel?: Database["public"]["Enums"]["support_channel"]
          classification_confidence?: number | null
          classification_source?: string | null
          classified_at?: string | null
          contact_email?: string | null
          created_at?: string
          csat_prompt_sent_at?: string | null
          csat_score?: number | null
          id?: string
          merged_into?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          sla_escalated_at?: string | null
          source_ref?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string | null
          updated_at?: string
          urgency?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          body?: string
          category?: string | null
          channel?: Database["public"]["Enums"]["support_channel"]
          classification_confidence?: number | null
          classification_source?: string | null
          classified_at?: string | null
          contact_email?: string | null
          created_at?: string
          csat_prompt_sent_at?: string | null
          csat_score?: number | null
          id?: string
          merged_into?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          sla_escalated_at?: string | null
          source_ref?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string | null
          updated_at?: string
          urgency?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      surprise_pick_outcomes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          outcome: string
          reason_template: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          outcome: string
          reason_template?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          outcome?: string
          reason_template?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      swipe_interactions: {
        Row: {
          action: string
          anon_id: string | null
          created_at: string
          id: string
          item_id: string
          item_type: string
          session_id: string | null
          source_context: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          anon_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          session_id?: string | null
          source_context?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          anon_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          session_id?: string | null
          source_context?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swipe_interactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swipe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_session_participants: {
        Row: {
          anon_id: string | null
          display_name: string | null
          id: string
          joined_at: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          anon_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          anon_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swipe_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swipe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      swipe_sessions: {
        Row: {
          code: string
          created_at: string
          ended_at: string | null
          expires_at: string
          filter_context: Json | null
          host_user_id: string
          id: string
          mode: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          filter_context?: Json | null
          host_user_id: string
          id?: string
          mode: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          filter_context?: Json | null
          host_user_id?: string
          id?: string
          mode?: string
          status?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          event_type: string
          id: string
          message: string
          metadata: Json | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: number | null
          source: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number | null
          source: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number | null
          source?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          setting_type: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_type: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_type?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          league: string
          logo_url: string | null
          name: string
          schedule_url: string | null
          slug: string
          sport: string
          venue_id: string | null
          venue_name: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          league: string
          logo_url?: string | null
          name: string
          schedule_url?: string | null
          slug: string
          sport: string
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          league?: string
          logo_url?: string | null
          name?: string
          schedule_url?: string | null
          slug?: string
          sport?: string
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_metrics: {
        Row: {
          avg_session_duration: number | null
          bounce_rate: number | null
          country: string | null
          created_at: string | null
          device_category: string | null
          id: string
          metadata: Json | null
          metric_date: string
          new_users: number | null
          pageviews: number | null
          property_id: string
          provider_name: string
          sessions: number | null
          updated_at: string | null
          user_id: string
          users: number | null
        }
        Insert: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          country?: string | null
          created_at?: string | null
          device_category?: string | null
          id?: string
          metadata?: Json | null
          metric_date: string
          new_users?: number | null
          pageviews?: number | null
          property_id: string
          provider_name: string
          sessions?: number | null
          updated_at?: string | null
          user_id: string
          users?: number | null
        }
        Update: {
          avg_session_duration?: number | null
          bounce_rate?: number | null
          country?: string | null
          created_at?: string | null
          device_category?: string | null
          id?: string
          metadata?: Json | null
          metric_date?: string
          new_users?: number | null
          pageviews?: number | null
          property_id?: string
          provider_name?: string
          sessions?: number | null
          updated_at?: string | null
          user_id?: string
          users?: number | null
        }
        Relationships: []
      }
      trails: {
        Row: {
          activities: string[] | null
          created_at: string | null
          description: string | null
          difficulty: string | null
          highlights: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          latitude: number | null
          length_miles: number | null
          longitude: number | null
          name: string
          slug: string
          surface_type: string | null
          trailhead_address: string | null
          website: string | null
        }
        Insert: {
          activities?: string[] | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          highlights?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          length_miles?: number | null
          longitude?: number | null
          name: string
          slug: string
          surface_type?: string | null
          trailhead_address?: string | null
          website?: string | null
        }
        Update: {
          activities?: string[] | null
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          highlights?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          length_miles?: number | null
          longitude?: number | null
          name?: string
          slug?: string
          surface_type?: string | null
          trailhead_address?: string | null
          website?: string | null
        }
        Relationships: []
      }
      trending_config: {
        Row: {
          click_weight: number
          favorite_weight: number
          featured_boost: number
          id: number
          min_age_hours: number
          recency_half_life_hours: number
          share_weight: number
          updated_at: string
          updated_by: string | null
          view_weight: number
        }
        Insert: {
          click_weight?: number
          favorite_weight?: number
          featured_boost?: number
          id?: number
          min_age_hours?: number
          recency_half_life_hours?: number
          share_weight?: number
          updated_at?: string
          updated_by?: string | null
          view_weight?: number
        }
        Update: {
          click_weight?: number
          favorite_weight?: number
          featured_boost?: number
          id?: number
          min_age_hours?: number
          recency_half_life_hours?: number
          share_weight?: number
          updated_at?: string
          updated_by?: string | null
          view_weight?: number
        }
        Relationships: []
      }
      trending_config_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          click_weight: number
          favorite_weight: number
          featured_boost: number
          id: number
          min_age_hours: number
          recency_half_life_hours: number
          share_weight: number
          view_weight: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          click_weight: number
          favorite_weight: number
          featured_boost: number
          id?: number
          min_age_hours: number
          recency_half_life_hours: number
          share_weight: number
          view_weight: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          click_weight?: number
          favorite_weight?: number
          featured_boost?: number
          id?: number
          min_age_hours?: number
          recency_half_life_hours?: number
          share_weight?: number
          view_weight?: number
        }
        Relationships: []
      }
      trending_scores: {
        Row: {
          computed_at: string
          content_id: string
          content_type: string
          date: string
          id: string
          rank: number | null
          score: number
          searches_24h: number | null
          searches_7d: number | null
          velocity_score: number | null
          views_24h: number | null
          views_7d: number | null
        }
        Insert: {
          computed_at?: string
          content_id: string
          content_type: string
          date?: string
          id?: string
          rank?: number | null
          score?: number
          searches_24h?: number | null
          searches_7d?: number | null
          velocity_score?: number | null
          views_24h?: number | null
          views_7d?: number | null
        }
        Update: {
          computed_at?: string
          content_id?: string
          content_type?: string
          date?: string
          id?: string
          rank?: number | null
          score?: number
          searches_24h?: number | null
          searches_7d?: number | null
          velocity_score?: number | null
          views_24h?: number | null
          views_7d?: number | null
        }
        Relationships: []
      }
      trending_scores_realtime: {
        Row: {
          avg_engagement_time: number | null
          bookmark_count: number | null
          content_id: string
          content_type: string
          conversion_rate: number | null
          created_at: string | null
          date: string
          engagement_score: number | null
          id: string
          last_updated: string | null
          momentum_score: number | null
          peak_hour: number | null
          score_1h: number | null
          score_24h: number | null
          score_30d: number | null
          score_6h: number | null
          score_7d: number | null
          share_count: number | null
          total_interactions_1h: number | null
          total_interactions_24h: number | null
          trending_locations: Json | null
          unique_views_1h: number | null
          unique_views_24h: number | null
          unique_views_6h: number | null
          unique_views_7d: number | null
          velocity_score: number | null
        }
        Insert: {
          avg_engagement_time?: number | null
          bookmark_count?: number | null
          content_id: string
          content_type: string
          conversion_rate?: number | null
          created_at?: string | null
          date?: string
          engagement_score?: number | null
          id?: string
          last_updated?: string | null
          momentum_score?: number | null
          peak_hour?: number | null
          score_1h?: number | null
          score_24h?: number | null
          score_30d?: number | null
          score_6h?: number | null
          score_7d?: number | null
          share_count?: number | null
          total_interactions_1h?: number | null
          total_interactions_24h?: number | null
          trending_locations?: Json | null
          unique_views_1h?: number | null
          unique_views_24h?: number | null
          unique_views_6h?: number | null
          unique_views_7d?: number | null
          velocity_score?: number | null
        }
        Update: {
          avg_engagement_time?: number | null
          bookmark_count?: number | null
          content_id?: string
          content_type?: string
          conversion_rate?: number | null
          created_at?: string | null
          date?: string
          engagement_score?: number | null
          id?: string
          last_updated?: string | null
          momentum_score?: number | null
          peak_hour?: number | null
          score_1h?: number | null
          score_24h?: number | null
          score_30d?: number | null
          score_6h?: number | null
          score_7d?: number | null
          share_count?: number | null
          total_interactions_1h?: number | null
          total_interactions_24h?: number | null
          trending_locations?: Json | null
          unique_views_1h?: number | null
          unique_views_24h?: number | null
          unique_views_6h?: number | null
          unique_views_7d?: number | null
          velocity_score?: number | null
        }
        Relationships: []
      }
      uptime_probes: {
        Row: {
          checked_at: string
          error: string | null
          id: string
          latency_ms: number | null
          ok: boolean
          status_code: number | null
          target_key: string
          target_kind: string
          url: string
        }
        Insert: {
          checked_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok: boolean
          status_code?: number | null
          target_key: string
          target_kind?: string
          url: string
        }
        Update: {
          checked_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          status_code?: number | null
          target_key?: string
          target_kind?: string
          url?: string
        }
        Relationships: []
      }
      url_sources: {
        Row: {
          category: string
          crawl_frequency: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_crawled: string | null
          name: string
          success_rate: number | null
          total_crawls: number | null
          updated_at: string
          url: string
        }
        Insert: {
          category: string
          crawl_frequency?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_crawled?: string | null
          name: string
          success_rate?: number | null
          total_crawls?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          category?: string
          crawl_frequency?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_crawled?: string | null
          name?: string
          success_rate?: number | null
          total_crawls?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      user_activities: {
        Row: {
          activity_type: string
          content_id: string | null
          content_type: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          points_earned: number
          user_id: string
        }
        Insert: {
          activity_type: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_earned?: number
          user_id: string
        }
        Update: {
          activity_type?: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          points_earned?: number
          user_id?: string
        }
        Relationships: []
      }
      user_analytics: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          device_type: string | null
          event_type: string
          filters_used: Json | null
          id: string
          ip_address: unknown
          page_url: string | null
          referrer: string | null
          search_query: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          device_type?: string | null
          event_type: string
          filters_used?: Json | null
          id?: string
          ip_address?: unknown
          page_url?: string | null
          referrer?: string | null
          search_query?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          device_type?: string | null
          event_type?: string
          filters_used?: Json | null
          id?: string
          ip_address?: unknown
          page_url?: string | null
          referrer?: string | null
          search_query?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          progress: Json | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          progress?: Json | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          progress?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendars: {
        Row: {
          access_token_encrypted: string | null
          calendar_id: string
          calendar_name: string
          color: string | null
          created_at: string
          id: string
          is_primary: boolean | null
          provider: string
          refresh_token_encrypted: string | null
          sync_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          calendar_id: string
          calendar_name: string
          color?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          provider: string
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          calendar_id?: string
          calendar_name?: string
          color?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          provider?: string
          refresh_token_encrypted?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_challenge_participation: {
        Row: {
          challenge_id: string
          completed_at: string | null
          id: string
          joined_at: string | null
          points_earned: number | null
          progress: Json | null
          rank: number | null
          submission_data: Json | null
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          id?: string
          joined_at?: string | null
          points_earned?: number | null
          progress?: Json | null
          rank?: number | null
          submission_data?: Json | null
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          id?: string
          joined_at?: string | null
          points_earned?: number | null
          progress?: Json | null
          rank?: number | null
          submission_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_participation_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "community_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_email_preferences: {
        Row: {
          categories_filter: string[] | null
          created_at: string
          digest_day_of_week: number | null
          digest_time_hour: number | null
          event_alerts_enabled: boolean
          id: string
          max_distance_miles: number | null
          updated_at: string
          user_id: string
          weekly_digest_enabled: boolean | null
        }
        Insert: {
          categories_filter?: string[] | null
          created_at?: string
          digest_day_of_week?: number | null
          digest_time_hour?: number | null
          event_alerts_enabled?: boolean
          id?: string
          max_distance_miles?: number | null
          updated_at?: string
          user_id: string
          weekly_digest_enabled?: boolean | null
        }
        Update: {
          categories_filter?: string[] | null
          created_at?: string
          digest_day_of_week?: number | null
          digest_time_hour?: number | null
          event_alerts_enabled?: boolean
          id?: string
          max_distance_miles?: number | null
          updated_at?: string
          user_id?: string
          weekly_digest_enabled?: boolean | null
        }
        Relationships: []
      }
      user_event_feedback: {
        Row: {
          created_at: string
          event_id: string
          feedback_type: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          feedback_type: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          feedback_type?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_event_interactions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          interaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          interaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          interaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_interactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_event_reminders: {
        Row: {
          created_at: string | null
          delivery_method: string | null
          delivery_status: string | null
          error_message: string | null
          event_id: string
          id: string
          reminder_type: string
          sent_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_method?: string | null
          delivery_status?: string | null
          error_message?: string | null
          event_id: string
          id?: string
          reminder_type: string
          sent_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivery_method?: string | null
          delivery_status?: string | null
          error_message?: string | null
          event_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_friends: {
        Row: {
          accepted_at: string | null
          created_at: string
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_interactions_enhanced: {
        Row: {
          click_position: string | null
          content_id: string | null
          content_type: string
          created_at: string
          device_type: string | null
          duration_ms: number | null
          element_id: string | null
          element_type: string | null
          id: string
          interaction_type: string
          interaction_value: string | null
          latitude: number | null
          longitude: number | null
          page_context: string
          referrer: string | null
          scroll_depth: number | null
          session_id: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
          viewport_size: string | null
        }
        Insert: {
          click_position?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          device_type?: string | null
          duration_ms?: number | null
          element_id?: string | null
          element_type?: string | null
          id?: string
          interaction_type: string
          interaction_value?: string | null
          latitude?: number | null
          longitude?: number | null
          page_context: string
          referrer?: string | null
          scroll_depth?: number | null
          session_id: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
          viewport_size?: string | null
        }
        Update: {
          click_position?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          device_type?: string | null
          duration_ms?: number | null
          element_id?: string | null
          element_type?: string | null
          id?: string
          interaction_type?: string
          interaction_value?: string | null
          latitude?: number | null
          longitude?: number | null
          page_context?: string
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
          viewport_size?: string | null
        }
        Relationships: []
      }
      user_journeys: {
        Row: {
          conversion_content_id: string | null
          conversion_content_type: string | null
          conversion_type: string | null
          converted: boolean | null
          created_at: string
          device_type: string | null
          entry_page: string
          entry_point: string
          exit_page: string | null
          filters_used: Json | null
          id: string
          interaction_sequence: Json | null
          page_sequence: Json | null
          referrer: string | null
          search_terms: Json | null
          searches_count: number | null
          session_duration: number | null
          session_end: string | null
          session_id: string
          session_start: string
          total_pages_viewed: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          conversion_content_id?: string | null
          conversion_content_type?: string | null
          conversion_type?: string | null
          converted?: boolean | null
          created_at?: string
          device_type?: string | null
          entry_page: string
          entry_point: string
          exit_page?: string | null
          filters_used?: Json | null
          id?: string
          interaction_sequence?: Json | null
          page_sequence?: Json | null
          referrer?: string | null
          search_terms?: Json | null
          searches_count?: number | null
          session_duration?: number | null
          session_end?: string | null
          session_id: string
          session_start?: string
          total_pages_viewed?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          conversion_content_id?: string | null
          conversion_content_type?: string | null
          conversion_type?: string | null
          converted?: boolean | null
          created_at?: string
          device_type?: string | null
          entry_page?: string
          entry_point?: string
          exit_page?: string | null
          filters_used?: Json | null
          id?: string
          interaction_sequence?: Json | null
          page_sequence?: Json | null
          referrer?: string | null
          search_terms?: Json | null
          searches_count?: number | null
          session_duration?: number | null
          session_end?: string | null
          session_id?: string
          session_start?: string
          total_pages_viewed?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_lifecycle_history: {
        Row: {
          created_at: string
          from_stage: string | null
          id: string
          reason: string | null
          signals: Json | null
          to_stage: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_stage?: string | null
          id?: string
          reason?: string | null
          signals?: Json | null
          to_stage: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_stage?: string | null
          id?: string
          reason?: string | null
          signals?: Json | null
          to_stage?: string
          user_id?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          id: string
          is_public: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_public?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_public?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_milestones: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          emailed: boolean
          id: string
          label: string | null
          milestone_type: string
          milestone_value: number
          send_id: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          emailed?: boolean
          id?: string
          label?: string | null
          milestone_type: string
          milestone_value: number
          send_id?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          emailed?: boolean
          id?: string
          label?: string | null
          milestone_type?: string
          milestone_value?: number
          send_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          property_id: string | null
          provider_name: string
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          property_id?: string | null
          provider_name: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          property_id?: string | null
          provider_name?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_oauth_tokens_provider_name_fkey"
            columns: ["provider_name"]
            isOneToOne: false
            referencedRelation: "oauth_providers"
            referencedColumns: ["provider_name"]
          },
        ]
      }
      user_preference_profiles: {
        Row: {
          avg_session_duration: number | null
          content_preferences: Json | null
          created_at: string | null
          id: string
          interaction_patterns: Json | null
          last_updated: string | null
          preference_confidence: Json | null
          preferred_cuisines: Json | null
          preferred_event_types: Json | null
          preferred_locations: Json | null
          preferred_price_ranges: Json | null
          preferred_times: Json | null
          primary_device: string | null
          search_patterns: Json | null
          session_id: string | null
          total_interactions: number | null
          total_sessions: number | null
          user_id: string | null
        }
        Insert: {
          avg_session_duration?: number | null
          content_preferences?: Json | null
          created_at?: string | null
          id?: string
          interaction_patterns?: Json | null
          last_updated?: string | null
          preference_confidence?: Json | null
          preferred_cuisines?: Json | null
          preferred_event_types?: Json | null
          preferred_locations?: Json | null
          preferred_price_ranges?: Json | null
          preferred_times?: Json | null
          primary_device?: string | null
          search_patterns?: Json | null
          session_id?: string | null
          total_interactions?: number | null
          total_sessions?: number | null
          user_id?: string | null
        }
        Update: {
          avg_session_duration?: number | null
          content_preferences?: Json | null
          created_at?: string | null
          id?: string
          interaction_patterns?: Json | null
          last_updated?: string | null
          preference_confidence?: Json | null
          preferred_cuisines?: Json | null
          preferred_event_types?: Json | null
          preferred_locations?: Json | null
          preferred_price_ranges?: Json | null
          preferred_times?: Json | null
          primary_device?: string | null
          search_patterns?: Json | null
          session_id?: string | null
          total_interactions?: number | null
          total_sessions?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_ratings: {
        Row: {
          content_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          id: string
          is_verified: boolean | null
          moderation_status: string
          photo_urls: string[]
          rating: Database["public"]["Enums"]["rating_value"]
          review_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          id?: string
          is_verified?: boolean | null
          moderation_status?: string
          photo_urls?: string[]
          rating: Database["public"]["Enums"]["rating_value"]
          review_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          id?: string
          is_verified?: boolean | null
          moderation_status?: string
          photo_urls?: string[]
          rating?: Database["public"]["Enums"]["rating_value"]
          review_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reputation: {
        Row: {
          created_at: string
          current_level: number | null
          current_level_progress: number | null
          experience_points: number | null
          helpful_votes: number
          id: string
          last_activity_date: string | null
          level: Database["public"]["Enums"]["reputation_level"]
          next_level_xp: number | null
          points: number
          rank_position: number | null
          streak_days: number | null
          total_badges: number | null
          total_ratings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level?: number | null
          current_level_progress?: number | null
          experience_points?: number | null
          helpful_votes?: number
          id?: string
          last_activity_date?: string | null
          level?: Database["public"]["Enums"]["reputation_level"]
          next_level_xp?: number | null
          points?: number
          rank_position?: number | null
          streak_days?: number | null
          total_badges?: number | null
          total_ratings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number | null
          current_level_progress?: number | null
          experience_points?: number | null
          helpful_votes?: number
          id?: string
          last_activity_date?: string | null
          level?: Database["public"]["Enums"]["reputation_level"]
          next_level_xp?: number | null
          points?: number
          rank_position?: number | null
          streak_days?: number | null
          total_badges?: number | null
          total_ratings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_restaurant_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_submitted_events: {
        Row: {
          address: string | null
          admin_notes: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          auto_decided: boolean
          category: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          date: string | null
          description: string | null
          end_time: string | null
          id: string
          image_url: string | null
          location: string | null
          price: string | null
          quality_score: number | null
          start_time: string | null
          status: string | null
          submitted_at: string | null
          tags: string[] | null
          title: string
          triage_reasons: Json | null
          triaged_at: string | null
          updated_at: string | null
          user_id: string
          venue: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          auto_decided?: boolean
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          price?: string | null
          quality_score?: number | null
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          title: string
          triage_reasons?: Json | null
          triaged_at?: string | null
          updated_at?: string | null
          user_id: string
          venue?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          auto_decided?: boolean
          category?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          price?: string | null
          quality_score?: number | null
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          title?: string
          triage_reasons?: Json | null
          triaged_at?: string | null
          updated_at?: string | null
          user_id?: string
          venue?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          apple_original_transaction_id: string | null
          apple_product_id: string | null
          apple_transaction_id: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          google_order_id: string | null
          google_product_id: string | null
          google_purchase_token: string | null
          id: string
          plan_id: string
          platform: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          apple_transaction_id?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          google_order_id?: string | null
          google_product_id?: string | null
          google_purchase_token?: string | null
          id?: string
          plan_id: string
          platform?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          apple_transaction_id?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          google_order_id?: string | null
          google_product_id?: string | null
          google_purchase_token?: string | null
          id?: string
          plan_id?: string
          platform?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          latitude: number | null
          longitude: number | null
          name: string
          slug: string
          updated_at: string | null
          venue_type: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          slug: string
          updated_at?: string | null
          venue_type?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          slug?: string
          updated_at?: string | null
          venue_type?: string | null
          website?: string | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          category_id: string
          created_at: string
          custom_entry: string | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_entry?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_entry?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "voting_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          voting_end: string | null
          voting_start: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          voting_end?: string | null
          voting_start?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          voting_end?: string | null
          voting_start?: string | null
        }
        Relationships: []
      }
      web_vitals: {
        Row: {
          created_at: string
          id: string
          metric: string
          page_group: string
          path: string | null
          rating: string | null
          session_id: string | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          page_group: string
          path?: string | null
          rating?: string | null
          session_id?: string | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          page_group?: string
          path?: string | null
          rating?: string | null
          session_id?: string | null
          value?: number
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          attempt: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          request_payload: Json | null
          response_body: Json | null
          response_code: number | null
          retry_scheduled: string | null
          status: string
          triggered_at: string | null
          webhook_name: string
        }
        Insert: {
          attempt?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          request_payload?: Json | null
          response_body?: Json | null
          response_code?: number | null
          retry_scheduled?: string | null
          status: string
          triggered_at?: string | null
          webhook_name: string
        }
        Update: {
          attempt?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          request_payload?: Json | null
          response_body?: Json | null
          response_code?: number | null
          retry_scheduled?: string | null
          status?: string
          triggered_at?: string | null
          webhook_name?: string
        }
        Relationships: []
      }
      weekend_guides: {
        Row: {
          content: string
          created_at: string | null
          events_count: number | null
          events_featured: Json | null
          id: string
          updated_at: string | null
          week_start: string
        }
        Insert: {
          content: string
          created_at?: string | null
          events_count?: number | null
          events_featured?: Json | null
          id?: string
          updated_at?: string | null
          week_start: string
        }
        Update: {
          content?: string
          created_at?: string | null
          events_count?: number | null
          events_featured?: Json | null
          id?: string
          updated_at?: string | null
          week_start?: string
        }
        Relationships: []
      }
      weekly_digest_log: {
        Row: {
          created_at: string
          email_status: string
          error_message: string | null
          events_included: number
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_status?: string
          error_message?: string | null
          events_included?: number
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_status?: string
          error_message?: string | null
          events_included?: number
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whitelisted_ips: {
        Row: {
          added_by: string | null
          created_at: string | null
          description: string | null
          id: string
          ip_address: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      winback_interventions: {
        Row: {
          approval_id: string | null
          churn_score: number | null
          created_at: string
          id: string
          offer_pct: number | null
          outcome_at: string | null
          play: string
          send_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          approval_id?: string | null
          churn_score?: number | null
          created_at?: string
          id?: string
          offer_pct?: number | null
          outcome_at?: string | null
          play: string
          send_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          approval_id?: string | null
          churn_score?: number | null
          created_at?: string
          id?: string
          offer_pct?: number | null
          outcome_at?: string | null
          play?: string
          send_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_month_spend: {
        Row: {
          agent_key: string | null
          category: Database["public"]["Enums"]["agent_category"] | null
          monthly_cost_budget_usd: number | null
          name: string | null
          runs_mtd: number | null
          spend_mtd: number | null
          tokens_mtd: number | null
        }
        Relationships: []
      }
      agent_quality_summary: {
        Row: {
          agent_key: string | null
          avg_score_30d: number | null
          eval_cost_30d: number | null
          evals_30d: number | null
          failed_30d: number | null
          passed_30d: number | null
        }
        Relationships: []
      }
      agent_run_summary: {
        Row: {
          agent_key: string | null
          category: Database["public"]["Enums"]["agent_category"] | null
          cost_usd_30d: number | null
          cost_usd_7d: number | null
          enabled: boolean | null
          escalations_7d: number | null
          failures_30d: number | null
          failures_7d: number | null
          items_escalated_30d: number | null
          items_escalated_7d: number | null
          items_processed_30d: number | null
          items_processed_7d: number | null
          last_cost_usd: number | null
          last_error: string | null
          last_finished_at: string | null
          last_items_escalated: number | null
          last_items_processed: number | null
          last_run_at: string | null
          last_status: string | null
          last_summary: string | null
          last_tokens_used: number | null
          monthly_cost_budget_usd: number | null
          name: string | null
          runs_30d: number | null
          runs_7d: number | null
          skips_7d: number | null
          successes_30d: number | null
          successes_7d: number | null
          tokens_used_7d: number | null
        }
        Relationships: []
      }
      agent_tasks_overdue: {
        Row: {
          agent_key: string | null
          assigned_to: string | null
          category: Database["public"]["Enums"]["agent_category"] | null
          confidence: number | null
          created_at: string | null
          id: string | null
          overdue_by: string | null
          payload: Json | null
          resolution: Json | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["agent_task_status"] | null
          tier: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agent_key?: string | null
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["agent_category"] | null
          confidence?: number | null
          created_at?: string | null
          id?: string | null
          overdue_by?: never
          payload?: Json | null
          resolution?: Json | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["agent_task_status"] | null
          tier?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_key?: string | null
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["agent_category"] | null
          confidence?: number | null
          created_at?: string | null
          id?: string | null
          overdue_by?: never
          payload?: Json | null
          resolution?: Json | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["agent_task_status"] | null
          tier?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_month_spend"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_registry"
            referencedColumns: ["agent_key"]
          },
          {
            foreignKeyName: "agent_tasks_agent_key_fkey"
            columns: ["agent_key"]
            isOneToOne: false
            referencedRelation: "agent_run_summary"
            referencedColumns: ["agent_key"]
          },
        ]
      }
      analytics_dashboard_summary: {
        Row: {
          device_breakdown: Json | null
          interactions_today: number | null
          sessions_today: number | null
          trending_content: Json | null
          unique_users_today: number | null
        }
        Relationships: []
      }
      automation_job_health: {
        Row: {
          items_failed_7d: number | null
          items_processed_7d: number | null
          job_name: string | null
          last_attempts: number | null
          last_error: string | null
          last_finished_at: string | null
          last_items_failed: number | null
          last_items_processed: number | null
          last_run_at: string | null
          last_status: string | null
          runs_7d: number | null
          successes_7d: number | null
        }
        Relationships: []
      }
      event_promotion_analytics_summary: {
        Row: {
          date: string | null
          event_count: number | null
          event_type: string | null
          unique_sessions: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      provider_spend_mtd: {
        Row: {
          hard_pct: number | null
          monthly_budget_usd: number | null
          paused: boolean | null
          provider: string | null
          soft_pct: number | null
          spend_mtd: number | null
          throttled: boolean | null
        }
        Relationships: []
      }
      restaurant_quality_stats: {
        Row: {
          avg_quality_score: number | null
          excellent_quality: number | null
          fair_quality: number | null
          good_quality: number | null
          missing_coordinates: number | null
          missing_description: number | null
          missing_image: number | null
          missing_phone: number | null
          missing_rating: number | null
          missing_website: number | null
          poor_quality: number | null
          total_restaurants: number | null
        }
        Relationships: []
      }
      social_accounts_admin: {
        Row: {
          created_at: string | null
          created_by: string | null
          handle: string | null
          has_access_token: boolean | null
          has_refresh_token: boolean | null
          id: string | null
          is_active: boolean | null
          last_validated_at: string | null
          last_validation_error: string | null
          notes: string | null
          platform: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          handle?: string | null
          has_access_token?: never
          has_refresh_token?: never
          id?: string | null
          is_active?: boolean | null
          last_validated_at?: string | null
          last_validation_error?: string | null
          notes?: string | null
          platform?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          handle?: string | null
          has_access_token?: never
          has_refresh_token?: never
          id?: string | null
          is_active?: boolean | null
          last_validated_at?: string | null
          last_validation_error?: string | null
          notes?: string | null
          platform?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_lifecycle_summary: {
        Row: {
          stage: string | null
          users: number | null
        }
        Relationships: []
      }
      v_broken_links_summary: {
        Row: {
          broken_links_count: number | null
          broken_urls: string[] | null
          last_checked: string | null
          source_url: string | null
        }
        Relationships: []
      }
      v_content_optimization_dashboard: {
        Row: {
          analyzed_at: string | null
          implementation_progress_percentage: number | null
          improvement_percentage: number | null
          issues_count: number | null
          last_optimized_at: string | null
          optimization_priority: string | null
          optimization_status: string | null
          overall_content_score: number | null
          readability_grade_level: string | null
          recommendations_implemented: number | null
          recommendations_total: number | null
          title: string | null
          url: string | null
          word_count: number | null
        }
        Insert: {
          analyzed_at?: string | null
          implementation_progress_percentage?: number | null
          improvement_percentage?: number | null
          issues_count?: number | null
          last_optimized_at?: string | null
          optimization_priority?: string | null
          optimization_status?: string | null
          overall_content_score?: number | null
          readability_grade_level?: string | null
          recommendations_implemented?: number | null
          recommendations_total?: number | null
          title?: string | null
          url?: string | null
          word_count?: number | null
        }
        Update: {
          analyzed_at?: string | null
          implementation_progress_percentage?: number | null
          improvement_percentage?: number | null
          issues_count?: number | null
          last_optimized_at?: string | null
          optimization_priority?: string | null
          optimization_status?: string | null
          overall_content_score?: number | null
          readability_grade_level?: string | null
          recommendations_implemented?: number | null
          recommendations_total?: number | null
          title?: string | null
          url?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      v_duplicate_content_summary: {
        Row: {
          avg_similarity: number | null
          duplicate_count: number | null
          last_detected: string | null
          max_similarity: number | null
          url_1: string | null
        }
        Relationships: []
      }
      v_high_priority_content_issues: {
        Row: {
          analyzed_at: string | null
          issues_count: number | null
          keyword_optimization_score: number | null
          optimization_priority: string | null
          overall_content_score: number | null
          readability_score_rating: number | null
          target_keyword: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          analyzed_at?: string | null
          issues_count?: number | null
          keyword_optimization_score?: number | null
          optimization_priority?: string | null
          overall_content_score?: number | null
          readability_score_rating?: number | null
          target_keyword?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          analyzed_at?: string | null
          issues_count?: number | null
          keyword_optimization_score?: number | null
          optimization_priority?: string | null
          overall_content_score?: number | null
          readability_score_rating?: number | null
          target_keyword?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: []
      }
      v_semantic_opportunities: {
        Row: {
          analyzed_at: string | null
          content_comprehensiveness_score: number | null
          featured_snippet_opportunity: boolean | null
          missing_keywords_count: number | null
          paa_opportunity: boolean | null
          primary_keyword: string | null
          priority_topics_count: number | null
          semantic_richness_score: number | null
          url: string | null
        }
        Insert: {
          analyzed_at?: string | null
          content_comprehensiveness_score?: number | null
          featured_snippet_opportunity?: boolean | null
          missing_keywords_count?: never
          paa_opportunity?: boolean | null
          primary_keyword?: string | null
          priority_topics_count?: never
          semantic_richness_score?: number | null
          url?: string | null
        }
        Update: {
          analyzed_at?: string | null
          content_comprehensiveness_score?: number | null
          featured_snippet_opportunity?: boolean | null
          missing_keywords_count?: never
          paa_opportunity?: boolean | null
          primary_keyword?: string | null
          priority_topics_count?: never
          semantic_richness_score?: number | null
          url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      // Hand-added with migration 20260822000011 (WEB-QA-019 AC2). Remove when
      // the generated types are next regenerated against production.
      batch_increment_views: {
        Args: { event_ids: string[] }
        Returns: undefined
      }
      get_content_view_stats: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: {
          recent_views_24h: number
          total_views: number
          trending_score: number
        }[]
      }
      increment_event_view: {
        Args: { event_id: string }
        Returns: undefined
      }
      increment_restaurant_view: {
        Args: { restaurant_id: string }
        Returns: undefined
      }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      aggregate_ad_analytics_for_date: {
        Args: { p_date: string }
        Returns: {
          message: string
          rows_affected: number
          success: boolean
        }[]
      }
      aggregate_daily_ad_analytics: { Args: never; Returns: undefined }
      archive_and_purge_events: {
        Args: { delete_after_days?: number }
        Returns: Json
      }
      award_user_xp: {
        Args: {
          p_activity_type: string
          p_content_id?: string
          p_content_type?: string
          p_metadata?: Json
          p_points: number
          p_user_id: string
        }
        Returns: undefined
      }
      backfill_ad_analytics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          date: string
          rows_affected: number
          success: boolean
        }[]
      }
      bump_newsletter_campaign_counter: {
        Args: { p_campaign_id: string; p_field: string }
        Returns: undefined
      }
      calculate_campaign_pricing:
        | {
            Args: {
              p_days_count: number
              p_placement_type: Database["public"]["Enums"]["placement_type"]
            }
            Returns: {
              base_price: number
              daily_price: number
              demand_multiplier: number
              total_price: number
              traffic_multiplier: number
            }[]
          }
        | {
            Args: { p_days_count: number; p_placement_type: string }
            Returns: {
              daily_price: number
              discount_percent: number
              original_daily_price: number
              total_price: number
              traffic_multiplier: number
            }[]
          }
      calculate_event_popularity_score: {
        Args: {
          days_until_event: number
          is_featured: boolean
          saved_count?: number
          view_count?: number
        }
        Returns: number
      }
      calculate_flesch_reading_ease: {
        Args: {
          p_total_sentences: number
          p_total_syllables: number
          p_total_words: number
        }
        Returns: number
      }
      calculate_keyword_density: {
        Args: { p_keyword_frequency: number; p_total_words: number }
        Returns: number
      }
      calculate_level_xp: { Args: { level: number }; Returns: number }
      calculate_reputation_level: {
        Args: { points: number }
        Returns: Database["public"]["Enums"]["reputation_level"]
      }
      calculate_restaurant_popularity_score: {
        Args: {
          days_since_created: number
          is_featured: boolean
          restaurant_rating: number
          review_count?: number
        }
        Returns: number
      }
      calculate_restaurant_quality_score: {
        Args: {
          restaurant_row: Database["public"]["Tables"]["restaurants"]["Row"]
        }
        Returns: number
      }
      calculate_social_buzz_score: {
        Args: {
          going_count: number
          interested_count: number
          saves_count: number
          shares_count: number
          views_count: number
        }
        Returns: number
      }
      calculate_trending_scores: { Args: never; Returns: number }
      check_auth_rate_limit: {
        Args: { p_email: string; p_ip_address: string }
        Returns: Json
      }
      check_calendar_conflicts: {
        Args: { p_end_time: string; p_start_time: string; p_user_id: string }
        Returns: {
          conflict_count: number
          conflicting_events: Json
        }[]
      }
      check_campaign_access: {
        Args: {
          p_campaign_id: string
          p_required_role?: Database["public"]["Enums"]["team_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      check_performance_budget: {
        Args: { p_actual_metrics: Json; p_budget_id: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_client_id: string
          p_endpoint?: string
          p_max_requests?: number
          p_window_ms?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          max_allowed: number
          remaining: number
          reset_at: string
        }[]
      }
      check_reminder_cron_status: {
        Args: never
        Returns: {
          active: boolean
          command: string
          database: string
          jobid: number
          jobname: string
          nodename: string
          nodeport: number
          schedule: string
          username: string
        }[]
      }
      check_vault_security_status: { Args: never; Returns: Json }
      checkin_to_event: {
        Args: {
          p_event_id: string
          p_latitude: number
          p_longitude: number
          p_message?: string
        }
        Returns: Json
      }
      claim_scheduled_newsletter_campaigns: {
        Args: { p_limit?: number }
        Returns: {
          body_html: string
          id: string
          preheader: string
          segment: Json
          subject: string
        }[]
      }
      cleanup_login_attempts: { Args: never; Returns: undefined }
      cleanup_old_events: {
        Args: { archive_before_delete?: boolean; days_old?: number }
        Returns: {
          events_archived: number
          events_deleted: number
        }[]
      }
      cleanup_old_security_logs: { Args: never; Returns: undefined }
      cleanup_old_system_events: { Args: never; Returns: undefined }
      cleanup_old_webhook_logs: { Args: never; Returns: undefined }
      cleanup_rate_limit_entries: { Args: never; Returns: undefined }
      cleanup_security_logs: { Args: never; Returns: undefined }
      clone_event: {
        Args: { p_event_id: string; p_new_date?: string; p_new_title?: string }
        Returns: string
      }
      create_event_saved_search: {
        Args: { p_filters: Json; p_name: string }
        Returns: {
          alerts_enabled: boolean
          created_at: string
          filters: Json
          id: string
          last_alerted_at: string | null
          last_used: string | null
          name: string
          search_type: string
          updated_at: string
          use_count: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_searches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_email: { Args: never; Returns: string }
      db_health_report: {
        Args: {
          dead_tuple_ratio?: number
          min_rows?: number
          min_seq_scans?: number
          slow_ms_threshold?: number
        }
        Returns: Json
      }
      decide_moderation: {
        Args: { p_decision: string; p_id: string }
        Returns: Json
      }
      determine_optimization_priority: {
        Args: {
          p_current_score: number
          p_keyword_position: number
          p_traffic_potential: string
        }
        Returns: string
      }
      disablelongtransactions: { Args: never; Returns: string }
      dismiss_merge_candidate: { Args: { p_id: string }; Returns: boolean }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enhanced_event_search: {
        Args: {
          p_category?: string
          p_date_end?: string
          p_date_start?: string
          p_limit?: number
          p_location?: string
          p_offset?: number
          p_price_range?: string
          p_query: string
        }
        Returns: {
          category: string
          city: string
          date: string
          enhanced_description: string
          event_start_local: string
          event_start_utc: string
          id: string
          image_url: string
          is_featured: boolean
          latitude: number
          location: string
          longitude: number
          price: string
          search_rank: number
          similarity_score: number
          title: string
          venue: string
        }[]
      }
      enqueue_pseo_generation: {
        Args: {
          p_dimensions: Json
          p_id: string
          p_page_type_id: string
          p_priority?: number
          p_tier?: number
        }
        Returns: undefined
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      events_within_radius: {
        Args: {
          center_lat: number
          center_lng: number
          limit_count?: number
          radius_miles: number
        }
        Returns: {
          date: string
          distance_miles: number
          id: string
          latitude: number
          location: string
          longitude: number
          title: string
          venue: string
        }[]
      }
      fetch_events_by_popularity_rotated: {
        Args: { p_limit?: number; p_offset?: number; p_seed?: number }
        Returns: {
          ai_writeup: string | null
          category: string
          city: string | null
          created_at: string | null
          date: string
          end_date: string | null
          enhanced_description: string | null
          event_start_local: string | null
          event_start_utc: string | null
          event_timezone: string | null
          geo_faq: Json | null
          geo_key_facts: string[] | null
          geo_summary: string | null
          geom: unknown
          heal_attempts: number
          hidden_at: string | null
          id: string
          image_checked_at: string | null
          image_url: string | null
          instance_date: string | null
          is_enhanced: boolean | null
          is_featured: boolean | null
          is_hidden: boolean
          is_merged: boolean
          is_recurring: boolean | null
          is_recurring_instance: boolean | null
          is_sponsored: boolean
          latitude: number | null
          location: string
          longitude: number | null
          merged_at: string | null
          merged_into: string | null
          needs_manual_verification: boolean
          original_description: string | null
          popularity_score: number | null
          price: string | null
          recurrence_end_date: string | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          recurrence_start_date: string | null
          search_vector: unknown
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          source: string | null
          source_url: string | null
          source_url_broken: boolean
          source_url_checked_at: string | null
          sponsored_until: string | null
          title: string
          trending_score: number
          updated_at: string | null
          venue: string | null
          view_count: number | null
          writeup_generated_at: string | null
          writeup_prompt_used: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      find_duplicate_events: {
        Args: { p_max?: number; p_threshold?: number }
        Returns: {
          a_id: string
          a_richness: number
          b_id: string
          b_richness: number
          distance_m: number
          name_sim: number
          same_date: boolean
        }[]
      }
      find_duplicate_restaurants: {
        Args: { p_max?: number; p_threshold?: number }
        Returns: {
          a_id: string
          a_richness: number
          b_id: string
          b_richness: number
          distance_m: number
          name_sim: number
          same_date: boolean
        }[]
      }
      find_matching_venue: { Args: { venue_text: string }; Returns: string }
      fuzzy_search_events:
        | {
            Args: { search_limit?: number; search_query: string }
            Returns: {
              ai_writeup: string
              category: string
              city: string
              date: string
              description: string
              enhanced_description: string
              id: string
              image_url: string
              latitude: number
              location: string
              longitude: number
              original_description: string
              price: string
              relevance_score: number
              source_url: string
              title: string
              venue: string
            }[]
          }
        | {
            Args: {
              limit_count?: number
              search_query: string
              similarity_threshold?: number
            }
            Returns: {
              date: string
              id: string
              location: string
              similarity_score: number
              title: string
              venue: string
            }[]
          }
      fuzzy_search_restaurants:
        | {
            Args: { search_limit?: number; search_query: string }
            Returns: {
              city: string
              cuisine: string
              description: string
              id: string
              image_url: string
              latitude: number
              location: string
              longitude: number
              name: string
              phone: string
              price_range: string
              rating: number
              relevance_score: number
              website: string
            }[]
          }
        | {
            Args: {
              limit_count?: number
              search_query: string
              similarity_threshold?: number
            }
            Returns: {
              city: string
              cuisine: string
              id: string
              location: string
              name: string
              similarity_score: number
            }[]
          }
      generate_article_slug: {
        Args: { article_title: string }
        Returns: string
      }
      generate_content_optimization_report: {
        Args: never
        Returns: {
          avg_content_score: number
          avg_readability_score: number
          avg_word_count: number
          high_priority_pages: number
          pages_need_optimization: number
          pages_optimized: number
          total_issues: number
          total_pages: number
        }[]
      }
      generate_recurring_event_instances: {
        Args: { p_lookforward_days?: number; p_parent_event_id: string }
        Returns: number
      }
      generate_restaurant_slug: {
        Args: { restaurant_name: string }
        Returns: string
      }
      generate_smart_suggestions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      generate_swipe_session_code: { Args: never; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_ads:
        | {
            Args: {
              p_placement_type: Database["public"]["Enums"]["placement_type"]
              p_session_id?: string
              p_user_id?: string
            }
            Returns: {
              campaign_id: string
              creative_id: string
              cta_text: string
              description: string
              image_url: string
              link_url: string
              title: string
            }[]
          }
        | {
            Args: { p_placement_type: string }
            Returns: {
              campaign_id: string
              creative_id: string
              cta_text: string
              description: string
              image_url: string
              link_url: string
              title: string
            }[]
          }
      get_activity_feed: {
        Args: { p_limit?: number; p_user_id?: string }
        Returns: {
          activity_type: string
          created_at: string
          event_id: string
          event_title: string
          id: string
          metadata: Json
          user_id: string
          user_name: string
        }[]
      }
      get_campaign_analytics_summary: {
        Args: {
          p_campaign_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          avg_ctr: number
          days_active: number
          total_clicks: number
          total_cost: number
          total_impressions: number
          unique_viewers: number
        }[]
      }
      get_database_metrics: { Args: never; Returns: Json }
      get_event_categories: {
        Args: never
        Returns: {
          category: string
        }[]
      }
      get_event_suggestions: {
        Args: { limit_count?: number; search_query: string }
        Returns: {
          similarity_score: number
          suggestion: string
          suggestion_type: string
        }[]
      }
      get_friends_near_event: {
        Args: {
          p_event_latitude: number
          p_event_longitude: number
          p_radius_km?: number
          p_user_id: string
        }
        Returns: {
          distance_km: number
          friend_id: string
          friend_name: string
        }[]
      }
      get_level_from_xp: { Args: { xp: number }; Returns: number }
      get_next_optimal_posting_time: {
        Args: { base_time?: string }
        Returns: string
      }
      get_optimized_image_url: {
        Args: { p_format?: string; p_media_asset_id: string; p_width?: number }
        Returns: string
      }
      get_pending_reminders: {
        Args: { reminder_window?: string }
        Returns: {
          event_date: string
          event_id: string
          event_location: string
          event_start_utc: string
          event_title: string
          event_venue: string
          reminder_id: string
          reminder_type: string
          time_until_event: string
          user_email: string
          user_id: string
        }[]
      }
      get_personalized_recommendations: {
        Args: { p_limit?: number; p_user_lat?: number; p_user_lon?: number }
        Returns: {
          category: string
          city: string
          date: string
          enhanced_description: string
          event_start_local: string
          event_start_utc: string
          id: string
          image_url: string
          is_featured: boolean
          latitude: number
          location: string
          longitude: number
          price: string
          recommendation_reason: string
          recommendation_score: number
          title: string
          venue: string
        }[]
      }
      get_platform_advertising_metrics: { Args: never; Returns: Json }
      get_popular_searches: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          avg_results: number
          search_count: number
          search_query: string
        }[]
      }
      get_readability_grade: {
        Args: { p_flesch_score: number }
        Returns: string
      }
      get_restaurant_cuisines: {
        Args: never
        Returns: {
          cuisine: string
        }[]
      }
      get_restaurant_filter_options: { Args: never; Returns: Json }
      get_restaurant_locations: {
        Args: never
        Returns: {
          location: string
        }[]
      }
      get_restaurants_needing_enrichment: {
        Args: { limit_count?: number; max_score?: number }
        Returns: {
          data_quality_score: number
          id: string
          missing_fields: string[]
          name: string
        }[]
      }
      get_rotated_restaurants: {
        Args: {
          cuisine_filter?: string[]
          featured_only?: boolean
          limit_count?: number
          location_filter?: string[]
          max_rating?: number
          min_rating?: number
          offset_count?: number
          price_filter?: string[]
          rotation_seed?: number
          search_query?: string
        }
        Returns: {
          restaurant_data: Json
          total_count: number
        }[]
      }
      get_search_suggestions: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          event_count: number
          suggestion: string
          suggestion_type: string
        }[]
      }
      get_security_recommendations: { Args: never; Returns: Json }
      get_seo_opportunities: {
        Args: { p_days_back?: number; p_user_id: string }
        Returns: {
          clicks: number
          ctr: number
          impressions: number
          opportunity_type: string
          page: string
          position: number
          potential_impact: string
          query: string
          recommendation: string
        }[]
      }
      get_surprise_pick: {
        Args: { p_user_lat?: number; p_user_lon?: number }
        Returns: {
          description: string
          image_url: string
          item_id: string
          item_type: string
          reason: string
          reason_template: string
          title: string
        }[]
      }
      get_swipe_session_matches: {
        Args: { p_session_id: string }
        Returns: {
          item_id: string
          item_type: string
          match_count: number
        }[]
      }
      get_top_keywords: {
        Args: {
          p_end_date: string
          p_limit?: number
          p_start_date: string
          p_user_id: string
        }
        Returns: {
          avg_ctr: number
          avg_position: number
          query: string
          total_clicks: number
          total_impressions: number
        }[]
      }
      get_traffic_summary: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          avg_bounce_rate: number
          avg_session_duration: number
          metric_date: string
          total_pageviews: number
          total_sessions: number
          total_users: number
        }[]
      }
      get_trending_events: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          city: string
          date: string
          enhanced_description: string
          event_start_local: string
          event_start_utc: string
          id: string
          image_url: string
          is_featured: boolean
          latitude: number
          location: string
          longitude: number
          price: string
          recommendation_reason: string
          recommendation_score: number
          title: string
          venue: string
        }[]
      }
      get_user_profile_safe: {
        Args: { target_user_id: string }
        Returns: {
          communication_preferences: Json
          created_at: string
          email: string
          first_name: string
          id: string
          interests: string[]
          last_name: string
          location: string
          phone: string
          updated_at: string
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_user_reminders_for_event: {
        Args: { p_event_id: string }
        Returns: Json
      }
      get_user_reputation_weight: { Args: { user_id: string }; Returns: number }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_role_simple: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_weekly_digest_content: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_venue_details: {
        Args: { venue_id: string }
        Returns: {
          full_location: string
          venue_address: string
          venue_city: string
          venue_email: string
          venue_latitude: number
          venue_longitude: number
          venue_name: string
          venue_phone: string
          venue_state: string
          venue_website: string
          venue_zip: string
        }[]
      }
      get_weekly_digest_recipients: {
        Args: never
        Returns: {
          categories_filter: string[]
          email: string
          first_name: string
          home_latitude: number
          home_longitude: number
          last_name: string
          max_distance_miles: number
          user_id: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      hide_stale_events: { Args: { hide_after_days?: number }; Returns: Json }
      increment_media_views: {
        Args: { p_media_asset_id: string }
        Returns: undefined
      }
      increment_pseo_page_views: {
        Args: { page_slug: string }
        Returns: undefined
      }
      is_account_locked: { Args: { p_email: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_root: { Args: never; Returns: boolean }
      is_admin_or_sales: { Args: never; Returns: boolean }
      is_email_domain_blocked: { Args: { p_email: string }; Returns: boolean }
      is_ip_blocked: { Args: { p_ip_address: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action_description: string
          p_action_type: string
          p_admin_user_id: string
          p_new_values?: Json
          p_old_values?: Json
          p_target_id?: string
          p_target_resource?: string
        }
        Returns: string
      }
      log_pseo_generation: {
        Args: {
          p_action: string
          p_details?: Json
          p_input_tokens?: number
          p_model?: string
          p_output_tokens?: number
          p_page_id: string
          p_quality?: number
          p_time_ms?: number
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_error_code?: string
          p_event_type: string
          p_ip_address?: string
          p_metadata?: Json
          p_permission_checked?: string
          p_resource_id?: string
          p_resource_type?: string
          p_security_layer?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: string
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_reminder_sent: {
        Args: {
          p_error_message?: string
          p_reminder_id: string
          p_status?: string
        }
        Returns: undefined
      }
      match_support_kb: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          source: string
          title: string
        }[]
      }
      merge_duplicate_content: {
        Args: {
          p_confidence?: number
          p_content_type: string
          p_decided_by?: string
          p_loser: string
          p_survivor: string
        }
        Returns: string
      }
      meters_to_miles: { Args: { meters: number }; Returns: number }
      newsletter_unsubscribe_by_token: {
        Args: { p_token: string }
        Returns: {
          already_unsubscribed: boolean
          success: boolean
        }[]
      }
      optimize_database_performance: { Args: never; Returns: Json }
      parse_recurrence_pattern: {
        Args: {
          p_end_date?: string
          p_max_instances?: number
          p_rule: string
          p_start_date: string
        }
        Returns: {
          occurrence_date: string
        }[]
      }
      populate_event_live_stats: { Args: never; Returns: undefined }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_campaign_lifecycle: { Args: never; Returns: Json }
      purge_old_events: { Args: { retention_months?: number }; Returns: Json }
      record_login_attempt: {
        Args: {
          p_email: string
          p_ip_address: string
          p_success: boolean
          p_user_agent: string
        }
        Returns: undefined
      }
      refresh_event_promotion_analytics: { Args: never; Returns: undefined }
      refresh_oauth_token: {
        Args: { p_provider_name: string; p_user_id: string }
        Returns: Json
      }
      regenerate_all_recurring_instances: {
        Args: never
        Returns: {
          instances_created: number
          parent_event_id: string
          parent_title: string
        }[]
      }
      report_review: { Args: { p_rating_id: string }; Returns: undefined }
      restaurants_within_radius: {
        Args: {
          center_lat: number
          center_lng: number
          limit_count?: number
          radius_miles: number
        }
        Returns: {
          city: string
          cuisine: string
          distance_miles: number
          id: string
          latitude: number
          location: string
          longitude: number
          name: string
          rating: number
        }[]
      }
      run_scraping_jobs: { Args: never; Returns: undefined }
      run_scraping_jobs_simple: { Args: never; Returns: undefined }
      run_social_media_automation: { Args: never; Returns: undefined }
      run_social_media_publishing: { Args: never; Returns: undefined }
      search_events: {
        Args: {
          limit_count?: number
          search_query: string
          start_date?: string
        }
        Returns: {
          category: string
          date: string
          id: string
          location: string
          rank: number
          title: string
          venue: string
        }[]
      }
      search_events_near_location: {
        Args: {
          radius_meters?: number
          search_limit?: number
          user_lat: number
          user_lon: number
        }
        Returns: {
          category: string
          city: string
          date: string
          distance_meters: number
          enhanced_description: string
          event_start_local: string
          event_start_utc: string
          id: string
          image_url: string
          is_featured: boolean
          latitude: number
          location: string
          longitude: number
          price: string
          title: string
          venue: string
        }[]
      }
      search_menu_items: {
        Args: {
          dietary_filter?: string[]
          max_price?: number
          result_limit?: number
          search_query: string
        }
        Returns: {
          dietary_tags: string[]
          item_description: string
          item_id: string
          item_name: string
          price: string
          price_numeric: number
          restaurant_id: string
          restaurant_name: string
          restaurant_slug: string
          section_name: string
        }[]
      }
      search_restaurants: {
        Args: { limit_count?: number; search_query: string }
        Returns: {
          city: string
          cuisine: string
          id: string
          location: string
          name: string
          rank: number
          rating: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      sync_oauth_user_role: { Args: { p_user_id: string }; Returns: string }
      toggle_discussion_like: {
        Args: { p_discussion_id: string }
        Returns: Json
      }
      toggle_event_reminder: {
        Args: {
          p_enabled?: boolean
          p_event_id: string
          p_reminder_type: string
        }
        Returns: Json
      }
      trigger_due_scraping_jobs: { Args: never; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      unhide_stale_event: { Args: { p_event_id: string }; Returns: Json }
      unlockrows: { Args: { "": string }; Returns: number }
      unmerge_content: { Args: { p_merge_id: string }; Returns: boolean }
      update_content_rating_aggregate: {
        Args: {
          p_content_id: string
          p_content_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: undefined
      }
      update_trending_scores: { Args: never; Returns: undefined }
      update_user_gamification: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_user_reputation: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_has_permission: {
        Args: { p_permission_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_role_or_higher: {
        Args: {
          required_role: Database["public"]["Enums"]["user_role"]
          user_uuid: string
        }
        Returns: boolean
      }
      user_meets_role_level: {
        Args: { p_min_level: number; p_user_id: string }
        Returns: boolean
      }
      user_owns_resource: {
        Args: {
          p_owner_column?: string
          p_resource_id: string
          p_table_name: string
          p_user_id: string
        }
        Returns: boolean
      }
      validate_ad_creative_upload: {
        Args: {
          p_campaign_id: string
          p_file_name: string
          p_file_size: number
          p_file_type: string
          p_height: number
          p_placement_type: Database["public"]["Enums"]["placement_type"]
          p_width: number
        }
        Returns: {
          error_message: string
          is_valid: boolean
        }[]
      }
    }
    Enums: {
      agent_approval_status: "pending" | "approved" | "rejected" | "expired"
      agent_category:
        | "dev"
        | "maintain"
        | "nurture"
        | "prospect"
        | "support"
        | "manage"
        | "security"
        | "governance"
      agent_mode: "shadow" | "live"
      agent_task_status:
        | "open"
        | "auto_resolving"
        | "resolved"
        | "escalated"
        | "assigned"
        | "closed"
        | "failed"
      campaign_status:
        | "draft"
        | "pending_payment"
        | "pending_creative"
        | "active"
        | "completed"
        | "cancelled"
        | "rejected"
        | "refunded"
      content_type: "event" | "attraction" | "restaurant" | "playground"
      crm_opp_stage:
        | "new"
        | "qualified"
        | "contacted"
        | "proposal"
        | "won"
        | "lost"
      csp_violation_type:
        | "script_src"
        | "style_src"
        | "img_src"
        | "connect_src"
        | "font_src"
        | "object_src"
        | "media_src"
        | "frame_src"
        | "base_uri"
        | "form_action"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      placement_type:
        | "top_banner"
        | "featured_spot"
        | "below_fold"
        | "sponsored_listing"
      rating_value: "1" | "2" | "3" | "4" | "5"
      refund_status: "pending" | "completed" | "failed"
      reputation_level:
        | "new"
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "moderator"
        | "admin"
      support_channel: "web_form" | "email" | "in_app"
      support_sender: "user" | "agent" | "admin" | "system"
      support_ticket_status:
        | "new"
        | "ai_handling"
        | "awaiting_user"
        | "escalated"
        | "resolved"
        | "closed"
      team_role: "owner" | "admin" | "editor" | "viewer"
      traffic_tier: "low" | "medium" | "high" | "peak"
      user_role: "user" | "moderator" | "admin" | "root_admin" | "sales"
      violation_severity: "minor" | "major" | "critical"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
    Enums: {
      agent_approval_status: ["pending", "approved", "rejected", "expired"],
      agent_category: [
        "dev",
        "maintain",
        "nurture",
        "prospect",
        "support",
        "manage",
        "security",
        "governance",
      ],
      agent_mode: ["shadow", "live"],
      agent_task_status: [
        "open",
        "auto_resolving",
        "resolved",
        "escalated",
        "assigned",
        "closed",
        "failed",
      ],
      campaign_status: [
        "draft",
        "pending_payment",
        "pending_creative",
        "active",
        "completed",
        "cancelled",
        "rejected",
        "refunded",
      ],
      content_type: ["event", "attraction", "restaurant", "playground"],
      crm_opp_stage: [
        "new",
        "qualified",
        "contacted",
        "proposal",
        "won",
        "lost",
      ],
      csp_violation_type: [
        "script_src",
        "style_src",
        "img_src",
        "connect_src",
        "font_src",
        "object_src",
        "media_src",
        "frame_src",
        "base_uri",
        "form_action",
      ],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      placement_type: [
        "top_banner",
        "featured_spot",
        "below_fold",
        "sponsored_listing",
      ],
      rating_value: ["1", "2", "3", "4", "5"],
      refund_status: ["pending", "completed", "failed"],
      reputation_level: [
        "new",
        "bronze",
        "silver",
        "gold",
        "platinum",
        "moderator",
        "admin",
      ],
      support_channel: ["web_form", "email", "in_app"],
      support_sender: ["user", "agent", "admin", "system"],
      support_ticket_status: [
        "new",
        "ai_handling",
        "awaiting_user",
        "escalated",
        "resolved",
        "closed",
      ],
      team_role: ["owner", "admin", "editor", "viewer"],
      traffic_tier: ["low", "medium", "high", "peak"],
      user_role: ["user", "moderator", "admin", "root_admin", "sales"],
      violation_severity: ["minor", "major", "critical"],
    },
  },
} as const
