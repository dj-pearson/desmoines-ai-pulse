export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      attractions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          rating: number | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          rating?: number | null
          type: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          rating?: number | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      campaign_creatives: {
        Row: {
          campaign_id: string
          created_at: string
          cta_text: string | null
          description: string | null
          id: string
          image_url: string | null
          is_approved: boolean | null
          link_url: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          title: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          cta_text?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          link_url?: string | null
          placement_type: Database["public"]["Enums"]["placement_type"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          cta_text?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_approved?: boolean | null
          link_url?: string | null
          placement_type?: Database["public"]["Enums"]["placement_type"]
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
      campaign_placements: {
        Row: {
          campaign_id: string
          created_at: string
          daily_cost: number
          days_count: number
          id: string
          placement_type: Database["public"]["Enums"]["placement_type"]
          total_cost: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          daily_cost: number
          days_count: number
          id?: string
          placement_type: Database["public"]["Enums"]["placement_type"]
          total_cost: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          daily_cost?: number
          days_count?: number
          id?: string
          placement_type?: Database["public"]["Enums"]["placement_type"]
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
      campaigns: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_cost?: number | null
          updated_at?: string
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
      event_photos: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          helpful_votes: number | null
          id: string
          is_approved: boolean | null
          photo_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          helpful_votes?: number | null
          id?: string
          is_approved?: boolean | null
          photo_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          helpful_votes?: number | null
          id?: string
          is_approved?: boolean | null
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
          enhanced_description: string | null
          event_start_local: string | null
          event_start_utc: string | null
          event_timezone: string | null
          id: string
          image_url: string | null
          is_enhanced: boolean | null
          is_featured: boolean | null
          latitude: number | null
          location: string
          longitude: number | null
          original_description: string | null
          price: string | null
          source_url: string | null
          title: string
          updated_at: string | null
          venue: string | null
          writeup_generated_at: string | null
          writeup_prompt_used: string | null
        }
        Insert: {
          ai_writeup?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date: string
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          location: string
          longitude?: number | null
          original_description?: string | null
          price?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
          venue?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Update: {
          ai_writeup?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          date?: string
          enhanced_description?: string | null
          event_start_local?: string | null
          event_start_utc?: string | null
          event_timezone?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string
          longitude?: number | null
          original_description?: string | null
          price?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
          venue?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Relationships: []
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
      playgrounds: {
        Row: {
          age_range: string | null
          amenities: string[] | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          age_range?: string | null
          amenities?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          age_range?: string | null
          amenities?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          communication_preferences: Json | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          interests: string[] | null
          last_name: string | null
          location: string | null
          phone: string | null
          updated_at: string
          user_id: string
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          communication_preferences?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          last_name?: string | null
          location?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          communication_preferences?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          last_name?: string | null
          location?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          user_role?: Database["public"]["Enums"]["user_role"] | null
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
          description: string | null
          enhanced: string | null
          google_place_id: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          opening: string | null
          opening_date: string | null
          opening_timeframe: string | null
          phone: string | null
          popularity_score: number | null
          price_range: string | null
          rating: number | null
          slug: string | null
          source_url: string | null
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
          description?: string | null
          enhanced?: string | null
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          opening?: string | null
          opening_date?: string | null
          opening_timeframe?: string | null
          phone?: string | null
          popularity_score?: number | null
          price_range?: string | null
          rating?: number | null
          slug?: string | null
          source_url?: string | null
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
          description?: string | null
          enhanced?: string | null
          google_place_id?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          opening?: string | null
          opening_date?: string | null
          opening_timeframe?: string | null
          phone?: string | null
          popularity_score?: number | null
          price_range?: string | null
          rating?: number | null
          slug?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
          writeup_generated_at?: string | null
          writeup_prompt_used?: string | null
        }
        Relationships: []
      }
      scraping_jobs: {
        Row: {
          config: Json
          created_at: string | null
          events_found: number | null
          id: string
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
          category: string | null
          clicked_result_id: string | null
          created_at: string
          date_filter: Json | null
          id: string
          location: string | null
          price_filter: string | null
          query: string
          results_count: number | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          clicked_result_id?: string | null
          created_at?: string
          date_filter?: Json | null
          id?: string
          location?: string | null
          price_filter?: string | null
          query: string
          results_count?: number | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          clicked_result_id?: string | null
          created_at?: string
          date_filter?: Json | null
          id?: string
          location?: string | null
          price_filter?: string | null
          query?: string
          results_count?: number | null
          session_id?: string
          user_id?: string | null
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
          id: string
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
          id?: string
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
          id?: string
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
      user_analytics: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          device_type: string | null
          event_type: string
          filters_used: Json | null
          id: string
          ip_address: unknown | null
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
          ip_address?: unknown | null
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
          ip_address?: unknown | null
          page_url?: string | null
          referrer?: string | null
          search_query?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
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
          helpful_votes: number
          id: string
          level: Database["public"]["Enums"]["reputation_level"]
          points: number
          total_ratings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          helpful_votes?: number
          id?: string
          level?: Database["public"]["Enums"]["reputation_level"]
          points?: number
          total_ratings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          helpful_votes?: number
          id?: string
          level?: Database["public"]["Enums"]["reputation_level"]
          points?: number
          total_ratings?: number
          updated_at?: string
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
          start_time: string | null
          status: string | null
          submitted_at: string | null
          tags: string[] | null
          title: string
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
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          title: string
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
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
          venue?: string | null
          website_url?: string | null
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
    }
    Views: {
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
    }
    Functions: {
      calculate_reputation_level: {
        Args: { points: number }
        Returns: Database["public"]["Enums"]["reputation_level"]
      }
      calculate_restaurant_popularity_score: {
        Args: {
          restaurant_rating: number
          is_featured: boolean
          days_since_created: number
          review_count?: number
        }
        Returns: number
      }
      calculate_social_buzz_score: {
        Args: {
          views_count: number
          shares_count: number
          saves_count: number
          going_count: number
          interested_count: number
        }
        Returns: number
      }
      calculate_trending_scores: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      generate_restaurant_slug: {
        Args: { restaurant_name: string }
        Returns: string
      }
      get_active_ads: {
        Args: {
          p_placement_type: Database["public"]["Enums"]["placement_type"]
        }
        Returns: {
          id: string
          title: string
          description: string
          image_url: string
          link_url: string
          cta_text: string
        }[]
      }
      get_friends_near_event: {
        Args: {
          p_user_id: string
          p_event_latitude: number
          p_event_longitude: number
          p_radius_km?: number
        }
        Returns: {
          friend_id: string
          friend_name: string
          distance_km: number
        }[]
      }
      get_next_optimal_posting_time: {
        Args: { base_time?: string }
        Returns: string
      }
      get_user_reputation_weight: {
        Args: { user_id: string }
        Returns: number
      }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_role_simple: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      run_scraping_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_scraping_jobs_simple: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_social_media_automation: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_content_rating_aggregate: {
        Args: {
          p_content_type: Database["public"]["Enums"]["content_type"]
          p_content_id: string
        }
        Returns: undefined
      }
      update_trending_scores: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_user_reputation: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      user_has_role_or_higher: {
        Args: {
          user_uuid: string
          required_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      campaign_status:
        | "draft"
        | "pending_payment"
        | "pending_creative"
        | "active"
        | "completed"
        | "cancelled"
      content_type: "event" | "attraction" | "restaurant" | "playground"
      placement_type: "top_banner" | "featured_spot" | "below_fold"
      rating_value: "1" | "2" | "3" | "4" | "5"
      reputation_level:
        | "new"
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "moderator"
        | "admin"
      user_role: "user" | "moderator" | "admin" | "root_admin"
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
} as const
