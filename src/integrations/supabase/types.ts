export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)";
  };
  public: {
    Tables: {
      attractions: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          is_featured: boolean | null;
          location: string | null;
          name: string;
          rating: number | null;
          type: string;
          updated_at: string | null;
          website: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name: string;
          rating?: number | null;
          type: string;
          updated_at?: string | null;
          website?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name?: string;
          rating?: number | null;
          type?: string;
          updated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      campaign_creatives: {
        Row: {
          campaign_id: string;
          created_at: string;
          cta_text: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          is_approved: boolean | null;
          link_url: string | null;
          placement_type: Database["public"]["Enums"]["placement_type"];
          title: string | null;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          cta_text?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_approved?: boolean | null;
          link_url?: string | null;
          placement_type: Database["public"]["Enums"]["placement_type"];
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          cta_text?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_approved?: boolean | null;
          link_url?: string | null;
          placement_type?: Database["public"]["Enums"]["placement_type"];
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          }
        ];
      };
      campaign_placements: {
        Row: {
          campaign_id: string;
          created_at: string;
          daily_cost: number;
          days_count: number;
          id: string;
          placement_type: Database["public"]["Enums"]["placement_type"];
          total_cost: number;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          daily_cost: number;
          days_count: number;
          id?: string;
          placement_type: Database["public"]["Enums"]["placement_type"];
          total_cost: number;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          daily_cost?: number;
          days_count?: number;
          id?: string;
          placement_type?: Database["public"]["Enums"]["placement_type"];
          total_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_placements_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          }
        ];
      };
      campaigns: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          name: string;
          start_date: string | null;
          status: Database["public"]["Enums"]["campaign_status"];
          stripe_payment_intent_id: string | null;
          stripe_session_id: string | null;
          total_cost: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          name: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          total_cost?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          name?: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          total_cost?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      content_metrics: {
        Row: {
          content_id: string;
          content_type: string;
          created_at: string;
          date: string;
          hour: number | null;
          id: string;
          metric_type: string;
          metric_value: number | null;
        };
        Insert: {
          content_id: string;
          content_type: string;
          created_at?: string;
          date?: string;
          hour?: number | null;
          id?: string;
          metric_type: string;
          metric_value?: number | null;
        };
        Update: {
          content_id?: string;
          content_type?: string;
          created_at?: string;
          date?: string;
          hour?: number | null;
          id?: string;
          metric_type?: string;
          metric_value?: number | null;
        };
        Relationships: [];
      };
      content_rating_aggregates: {
        Row: {
          average_rating: number;
          content_id: string;
          content_type: Database["public"]["Enums"]["content_type"];
          id: string;
          last_updated: string;
          rating_distribution: Json | null;
          total_ratings: number;
          weighted_average: number;
        };
        Insert: {
          average_rating?: number;
          content_id: string;
          content_type: Database["public"]["Enums"]["content_type"];
          id?: string;
          last_updated?: string;
          rating_distribution?: Json | null;
          total_ratings?: number;
          weighted_average?: number;
        };
        Update: {
          average_rating?: number;
          content_id?: string;
          content_type?: Database["public"]["Enums"]["content_type"];
          id?: string;
          last_updated?: string;
          rating_distribution?: Json | null;
          total_ratings?: number;
          weighted_average?: number;
        };
        Relationships: [];
      };
      domain_highlights: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          domain: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          domain: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          domain?: string;
          id?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          category: string;
          created_at: string | null;
          date: string;
          enhanced_description: string | null;
          id: string;
          image_url: string | null;
          is_enhanced: boolean | null;
          is_featured: boolean | null;
          location: string;
          original_description: string | null;
          price: string | null;
          source_url: string | null;
          title: string;
          updated_at: string | null;
          venue: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string | null;
          date: string;
          enhanced_description?: string | null;
          id?: string;
          image_url?: string | null;
          is_enhanced?: boolean | null;
          is_featured?: boolean | null;
          location: string;
          original_description?: string | null;
          price?: string | null;
          source_url?: string | null;
          title: string;
          updated_at?: string | null;
          venue?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          date?: string;
          enhanced_description?: string | null;
          id?: string;
          image_url?: string | null;
          is_enhanced?: boolean | null;
          is_featured?: boolean | null;
          location?: string;
          original_description?: string | null;
          price?: string | null;
          source_url?: string | null;
          title?: string;
          updated_at?: string | null;
          venue?: string | null;
        };
        Relationships: [];
      };
      playgrounds: {
        Row: {
          age_range: string | null;
          amenities: string[] | null;
          created_at: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          is_featured: boolean | null;
          location: string | null;
          name: string;
          rating: number | null;
          updated_at: string | null;
        };
        Insert: {
          age_range?: string | null;
          amenities?: string[] | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name: string;
          rating?: number | null;
          updated_at?: string | null;
        };
        Update: {
          age_range?: string | null;
          amenities?: string[] | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name?: string;
          rating?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          communication_preferences: Json | null;
          created_at: string;
          email: string | null;
          first_name: string | null;
          id: string;
          interests: string[] | null;
          last_name: string | null;
          location: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
          user_role: Database["public"]["Enums"]["user_role"] | null;
        };
        Insert: {
          communication_preferences?: Json | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          interests?: string[] | null;
          last_name?: string | null;
          location?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
          user_role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Update: {
          communication_preferences?: Json | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          interests?: string[] | null;
          last_name?: string | null;
          location?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
          user_role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Relationships: [];
      };
      rating_abuse_reports: {
        Row: {
          created_at: string;
          id: string;
          rating_id: string;
          reason: string;
          reported_by: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          rating_id: string;
          reason: string;
          reported_by: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          rating_id?: string;
          reason?: string;
          reported_by?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rating_abuse_reports_rating_id_fkey";
            columns: ["rating_id"];
            isOneToOne: false;
            referencedRelation: "user_ratings";
            referencedColumns: ["id"];
          }
        ];
      };
      rating_helpful_votes: {
        Row: {
          created_at: string;
          id: string;
          is_helpful: boolean;
          rating_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_helpful: boolean;
          rating_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_helpful?: boolean;
          rating_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rating_helpful_votes_rating_id_fkey";
            columns: ["rating_id"];
            isOneToOne: false;
            referencedRelation: "user_ratings";
            referencedColumns: ["id"];
          }
        ];
      };
      restaurant_openings: {
        Row: {
          created_at: string | null;
          cuisine: string | null;
          description: string | null;
          id: string;
          location: string | null;
          name: string;
          opening_date: string | null;
          opening_timeframe: string | null;
          source_url: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          cuisine?: string | null;
          description?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          opening_date?: string | null;
          opening_timeframe?: string | null;
          source_url?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          cuisine?: string | null;
          description?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          opening_date?: string | null;
          opening_timeframe?: string | null;
          source_url?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      restaurants: {
        Row: {
          created_at: string | null;
          cuisine: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          is_featured: boolean | null;
          location: string | null;
          name: string;
          opening: string | null;
          opening_date: string | null;
          opening_timeframe: string | null;
          phone: string | null;
          price_range: string | null;
          rating: number | null;
          slug: string | null;
          source_url: string | null;
          status: string | null;
          updated_at: string | null;
          website: string | null;
        };
        Insert: {
          created_at?: string | null;
          cuisine?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name: string;
          opening?: string | null;
          opening_date?: string | null;
          opening_timeframe?: string | null;
          phone?: string | null;
          price_range?: string | null;
          rating?: number | null;
          slug?: string | null;
          source_url?: string | null;
          status?: string | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Update: {
          created_at?: string | null;
          cuisine?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          location?: string | null;
          name?: string;
          opening?: string | null;
          opening_date?: string | null;
          opening_timeframe?: string | null;
          phone?: string | null;
          price_range?: string | null;
          rating?: number | null;
          slug?: string | null;
          source_url?: string | null;
          status?: string | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      scraping_jobs: {
        Row: {
          config: Json;
          created_at: string | null;
          events_found: number | null;
          id: string;
          last_run: string | null;
          name: string;
          next_run: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          config: Json;
          created_at?: string | null;
          events_found?: number | null;
          id?: string;
          last_run?: string | null;
          name: string;
          next_run?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          config?: Json;
          created_at?: string | null;
          events_found?: number | null;
          id?: string;
          last_run?: string | null;
          name?: string;
          next_run?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      search_analytics: {
        Row: {
          category: string | null;
          clicked_result_id: string | null;
          created_at: string;
          date_filter: Json | null;
          id: string;
          location: string | null;
          price_filter: string | null;
          query: string;
          results_count: number | null;
          session_id: string;
          user_id: string | null;
        };
        Insert: {
          category?: string | null;
          clicked_result_id?: string | null;
          created_at?: string;
          date_filter?: Json | null;
          id?: string;
          location?: string | null;
          price_filter?: string | null;
          query: string;
          results_count?: number | null;
          session_id: string;
          user_id?: string | null;
        };
        Update: {
          category?: string | null;
          clicked_result_id?: string | null;
          created_at?: string;
          date_filter?: Json | null;
          id?: string;
          location?: string | null;
          price_filter?: string | null;
          query?: string;
          results_count?: number | null;
          session_id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      trending_scores: {
        Row: {
          computed_at: string;
          content_id: string;
          content_type: string;
          date: string;
          id: string;
          rank: number | null;
          score: number;
          searches_24h: number | null;
          searches_7d: number | null;
          velocity_score: number | null;
          views_24h: number | null;
          views_7d: number | null;
        };
        Insert: {
          computed_at?: string;
          content_id: string;
          content_type: string;
          date?: string;
          id?: string;
          rank?: number | null;
          score?: number;
          searches_24h?: number | null;
          searches_7d?: number | null;
          velocity_score?: number | null;
          views_24h?: number | null;
          views_7d?: number | null;
        };
        Update: {
          computed_at?: string;
          content_id?: string;
          content_type?: string;
          date?: string;
          id?: string;
          rank?: number | null;
          score?: number;
          searches_24h?: number | null;
          searches_7d?: number | null;
          velocity_score?: number | null;
          views_24h?: number | null;
          views_7d?: number | null;
        };
        Relationships: [];
      };
      url_sources: {
        Row: {
          category: string;
          crawl_frequency: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean | null;
          last_crawled: string | null;
          name: string;
          success_rate: number | null;
          total_crawls: number | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          category: string;
          crawl_frequency?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_crawled?: string | null;
          name: string;
          success_rate?: number | null;
          total_crawls?: number | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          category?: string;
          crawl_frequency?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_crawled?: string | null;
          name?: string;
          success_rate?: number | null;
          total_crawls?: number | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      user_analytics: {
        Row: {
          content_id: string;
          content_type: string;
          created_at: string;
          device_type: string | null;
          event_type: string;
          filters_used: Json | null;
          id: string;
          ip_address: unknown | null;
          page_url: string | null;
          referrer: string | null;
          search_query: string | null;
          session_id: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          content_id: string;
          content_type: string;
          created_at?: string;
          device_type?: string | null;
          event_type: string;
          filters_used?: Json | null;
          id?: string;
          ip_address?: unknown | null;
          page_url?: string | null;
          referrer?: string | null;
          search_query?: string | null;
          session_id: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          content_id?: string;
          content_type?: string;
          created_at?: string;
          device_type?: string | null;
          event_type?: string;
          filters_used?: Json | null;
          id?: string;
          ip_address?: unknown | null;
          page_url?: string | null;
          referrer?: string | null;
          search_query?: string | null;
          session_id?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      user_event_feedback: {
        Row: {
          created_at: string;
          event_id: string;
          feedback_type: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          feedback_type: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          feedback_type?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_event_feedback_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          }
        ];
      };
      user_event_interactions: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          interaction_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          interaction_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          interaction_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_event_interactions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          }
        ];
      };
      user_ratings: {
        Row: {
          content_id: string;
          content_type: Database["public"]["Enums"]["content_type"];
          created_at: string;
          id: string;
          is_verified: boolean | null;
          rating: Database["public"]["Enums"]["rating_value"];
          review_text: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content_id: string;
          content_type: Database["public"]["Enums"]["content_type"];
          created_at?: string;
          id?: string;
          is_verified?: boolean | null;
          rating: Database["public"]["Enums"]["rating_value"];
          review_text?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          content_type?: Database["public"]["Enums"]["content_type"];
          created_at?: string;
          id?: string;
          is_verified?: boolean | null;
          rating?: Database["public"]["Enums"]["rating_value"];
          review_text?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_reputation: {
        Row: {
          created_at: string;
          helpful_votes: number;
          id: string;
          level: Database["public"]["Enums"]["reputation_level"];
          points: number;
          total_ratings: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          helpful_votes?: number;
          id?: string;
          level?: Database["public"]["Enums"]["reputation_level"];
          points?: number;
          total_ratings?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          helpful_votes?: number;
          id?: string;
          level?: Database["public"]["Enums"]["reputation_level"];
          points?: number;
          total_ratings?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      calculate_reputation_level: {
        Args: { points: number };
        Returns: Database["public"]["Enums"]["reputation_level"];
      };
      calculate_trending_scores: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      get_active_ads: {
        Args: {
          p_placement_type: Database["public"]["Enums"]["placement_type"];
        };
        Returns: {
          id: string;
          title: string;
          description: string;
          image_url: string;
          link_url: string;
          cta_text: string;
        }[];
      };
      get_user_reputation_weight: {
        Args: { user_id: string };
        Returns: number;
      };
      get_user_role: {
        Args: { user_uuid: string };
        Returns: Database["public"]["Enums"]["user_role"];
      };
      get_user_role_simple: {
        Args: { user_uuid: string };
        Returns: Database["public"]["Enums"]["user_role"];
      };
      update_content_rating_aggregate: {
        Args: {
          p_content_type: Database["public"]["Enums"]["content_type"];
          p_content_id: string;
        };
        Returns: undefined;
      };
      update_user_reputation: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      user_has_role_or_higher: {
        Args: {
          user_uuid: string;
          required_role: Database["public"]["Enums"]["user_role"];
        };
        Returns: boolean;
      };
    };
    Enums: {
      campaign_status:
        | "draft"
        | "pending_payment"
        | "pending_creative"
        | "active"
        | "completed"
        | "cancelled";
      content_type: "event" | "attraction" | "restaurant" | "playground";
      placement_type: "top_banner" | "featured_spot" | "below_fold";
      rating_value: "1" | "2" | "3" | "4" | "5";
      reputation_level:
        | "new"
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "moderator"
        | "admin";
      user_role: "user" | "moderator" | "admin" | "root_admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  public: {
    Enums: {
      campaign_status: [
        "draft",
        "pending_payment",
        "pending_creative",
        "active",
        "completed",
        "cancelled",
      ],
      content_type: ["event", "attraction", "restaurant", "playground"],
      placement_type: ["top_banner", "featured_spot", "below_fold"],
      rating_value: ["1", "2", "3", "4", "5"],
      reputation_level: [
        "new",
        "bronze",
        "silver",
        "gold",
        "platinum",
        "moderator",
        "admin",
      ],
      user_role: ["user", "moderator", "admin", "root_admin"],
    },
  },
} as const;
