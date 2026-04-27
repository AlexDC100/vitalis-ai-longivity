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
      action_completions: {
        Row: {
          action_text: string
          completed_at: string | null
          created_at: string
          fix_key: string
          id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_text: string
          completed_at?: string | null
          created_at?: string
          fix_key: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_text?: string
          completed_at?: string | null
          created_at?: string
          fix_key?: string
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      consultation_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          notes: string | null
          partner_id: string
          phone: string | null
          preferred_time: string | null
          severity: string | null
          specialty: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          notes?: string | null
          partner_id: string
          phone?: string | null
          preferred_time?: string | null
          severity?: string | null
          specialty: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          partner_id?: string
          phone?: string | null
          preferred_time?: string | null
          severity?: string | null
          specialty?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      health_profiles: {
        Row: {
          apob: number | null
          avg_sleep_hours: number | null
          body_fat_pct: number | null
          bp_diastolic: number | null
          bp_systolic: number | null
          cortisol: number | null
          created_at: string
          date_of_birth: string | null
          dhea_s: number | null
          estradiol: number | null
          fasting_glucose: number | null
          fasting_insulin: number | null
          fev1_pct: number | null
          free_t: number | null
          free_t3: number | null
          free_t4: number | null
          full_name: string | null
          hba1c: number | null
          hdl: number | null
          height_cm: number | null
          homocysteine: number | null
          hrv_ms: number | null
          hscrp: number | null
          id: string
          igf1: number | null
          ldl: number | null
          lpa: number | null
          resting_hr: number | null
          sex: string | null
          sleep_quality: number | null
          testosterone: number | null
          total_cholesterol: number | null
          triglycerides: number | null
          tsh: number | null
          updated_at: string
          user_id: string
          vitamin_d: number | null
          vo2_max: number | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          apob?: number | null
          avg_sleep_hours?: number | null
          body_fat_pct?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          cortisol?: number | null
          created_at?: string
          date_of_birth?: string | null
          dhea_s?: number | null
          estradiol?: number | null
          fasting_glucose?: number | null
          fasting_insulin?: number | null
          fev1_pct?: number | null
          free_t?: number | null
          free_t3?: number | null
          free_t4?: number | null
          full_name?: string | null
          hba1c?: number | null
          hdl?: number | null
          height_cm?: number | null
          homocysteine?: number | null
          hrv_ms?: number | null
          hscrp?: number | null
          id?: string
          igf1?: number | null
          ldl?: number | null
          lpa?: number | null
          resting_hr?: number | null
          sex?: string | null
          sleep_quality?: number | null
          testosterone?: number | null
          total_cholesterol?: number | null
          triglycerides?: number | null
          tsh?: number | null
          updated_at?: string
          user_id: string
          vitamin_d?: number | null
          vo2_max?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          apob?: number | null
          avg_sleep_hours?: number | null
          body_fat_pct?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          cortisol?: number | null
          created_at?: string
          date_of_birth?: string | null
          dhea_s?: number | null
          estradiol?: number | null
          fasting_glucose?: number | null
          fasting_insulin?: number | null
          fev1_pct?: number | null
          free_t?: number | null
          free_t3?: number | null
          free_t4?: number | null
          full_name?: string | null
          hba1c?: number | null
          hdl?: number | null
          height_cm?: number | null
          homocysteine?: number | null
          hrv_ms?: number | null
          hscrp?: number | null
          id?: string
          igf1?: number | null
          ldl?: number | null
          lpa?: number | null
          resting_hr?: number | null
          sex?: string | null
          sleep_quality?: number | null
          testosterone?: number | null
          total_cholesterol?: number | null
          triglycerides?: number | null
          tsh?: number | null
          updated_at?: string
          user_id?: string
          vitamin_d?: number | null
          vo2_max?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      health_snapshots: {
        Row: {
          bio_age: number
          chrono_age: number
          created_at: string
          id: string
          main_issue: string | null
          risk_score: number | null
          score: number
          severity: string | null
          snapshot_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio_age: number
          chrono_age: number
          created_at?: string
          id?: string
          main_issue?: string | null
          risk_score?: number | null
          score: number
          severity?: string | null
          snapshot_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio_age?: number
          chrono_age?: number
          created_at?: string
          id?: string
          main_issue?: string | null
          risk_score?: number | null
          score?: number
          severity?: string | null
          snapshot_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intake_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          extracted_fields: Json
          id: string
          section: string
          status: string
          transcript: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          extracted_fields?: Json
          id?: string
          section: string
          status?: string
          transcript?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          extracted_fields?: Json
          id?: string
          section?: string
          status?: string
          transcript?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medical_documents: {
        Row: {
          created_at: string
          document_type: string
          extracted_data: Json | null
          file_name: string
          file_path: string
          id: string
          medicine_stack: Json | null
          provider: string | null
          recommendations: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type?: string
          extracted_data?: Json | null
          file_name: string
          file_path: string
          id?: string
          medicine_stack?: Json | null
          provider?: string | null
          recommendations?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          extracted_data?: Json | null
          file_name?: string
          file_path?: string
          id?: string
          medicine_stack?: Json | null
          provider?: string | null
          recommendations?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_family_history: {
        Row: {
          condition: string
          created_at: string
          id: string
          relatives: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          condition: string
          created_at?: string
          id?: string
          relatives?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          id?: string
          relatives?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_privacy_settings: {
        Row: {
          keep_documents: boolean
          keep_snapshots: boolean
          retention_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          keep_documents?: boolean
          keep_snapshots?: boolean
          retention_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          keep_documents?: boolean
          keep_snapshots?: boolean
          retention_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_substances: {
        Row: {
          category: string
          created_at: string
          dose: string | null
          frequency: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          dose?: string | null
          frequency?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          dose?: string | null
          frequency?: string | null
          id?: string
          name?: string
          notes?: string | null
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
      [_ in never]: never
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
