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
          location: string | null
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
          location?: string | null
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
          location?: string | null
          name?: string
          rating?: number | null
          type?: string
          updated_at?: string | null
          website?: string | null
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
      events: {
        Row: {
          category: string
          created_at: string | null
          date: string
          enhanced_description: string | null
          id: string
          image_url: string | null
          is_enhanced: boolean | null
          is_featured: boolean | null
          location: string
          original_description: string | null
          price: string | null
          source_url: string | null
          title: string
          updated_at: string | null
          venue: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          date: string
          enhanced_description?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          location: string
          original_description?: string | null
          price?: string | null
          source_url?: string | null
          title: string
          updated_at?: string | null
          venue?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          date?: string
          enhanced_description?: string | null
          id?: string
          image_url?: string | null
          is_enhanced?: boolean | null
          is_featured?: boolean | null
          location?: string
          original_description?: string | null
          price?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string | null
          venue?: string | null
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
          location: string | null
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
          location?: string | null
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
          location?: string | null
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
      restaurant_openings: {
        Row: {
          created_at: string | null
          cuisine: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          opening_date: string | null
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
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          created_at: string | null
          cuisine: string | null
          description: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          location: string | null
          name: string
          phone: string | null
          price_range: string | null
          rating: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          location?: string | null
          name: string
          phone?: string | null
          price_range?: string | null
          rating?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          location?: string | null
          name?: string
          phone?: string | null
          price_range?: string | null
          rating?: number | null
          updated_at?: string | null
          website?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_trending_scores: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_role_simple: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["user_role"]
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
      user_role: ["user", "moderator", "admin", "root_admin"],
    },
  },
} as const
