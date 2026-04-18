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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          lecture_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lecture_id: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lecture_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          cluster: string | null
          created_at: string
          definition: string | null
          id: string
          kind: string | null
          lecture_id: string
          term: string
          user_id: string
        }
        Insert: {
          cluster?: string | null
          created_at?: string
          definition?: string | null
          id?: string
          kind?: string | null
          lecture_id: string
          term: string
          user_id: string
        }
        Update: {
          cluster?: string | null
          created_at?: string
          definition?: string | null
          id?: string
          kind?: string | null
          lecture_id?: string
          term?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          answer: string
          created_at: string
          due_date: string
          ease_factor: number
          id: string
          interval_days: number
          known: boolean
          last_reviewed_at: string | null
          lecture_id: string
          question: string
          repetitions: number
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          due_date?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          known?: boolean
          last_reviewed_at?: string | null
          lecture_id: string
          question: string
          repetitions?: number
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          due_date?: string
          ease_factor?: number
          id?: string
          interval_days?: number
          known?: boolean
          last_reviewed_at?: string | null
          lecture_id?: string
          question?: string
          repetitions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
      lectures: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_path: string | null
          id: string
          source_type: Database["public"]["Enums"]["lecture_source"]
          status: Database["public"]["Enums"]["lecture_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          source_type: Database["public"]["Enums"]["lecture_source"]
          status?: Database["public"]["Enums"]["lecture_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          source_type?: Database["public"]["Enums"]["lecture_source"]
          status?: Database["public"]["Enums"]["lecture_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          correct: boolean
          created_at: string
          flashcard_id: string | null
          id: string
          lecture_id: string
          topic: string | null
          user_id: string
        }
        Insert: {
          correct: boolean
          created_at?: string
          flashcard_id?: string | null
          id?: string
          lecture_id: string
          topic?: string | null
          user_id: string
        }
        Update: {
          correct?: boolean
          created_at?: string
          flashcard_id?: string | null
          id?: string
          lecture_id?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quizzes: {
        Row: {
          created_at: string
          id: string
          lecture_id: string
          question_count: number
          questions: Json
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lecture_id: string
          question_count?: number
          questions?: Json
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lecture_id?: string
          question_count?: number
          questions?: Json
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      study_sessions: {
        Row: {
          activity: string
          created_at: string
          id: string
          lecture_id: string
          minutes: number
          user_id: string
        }
        Insert: {
          activity?: string
          created_at?: string
          id?: string
          lecture_id: string
          minutes?: number
          user_id: string
        }
        Update: {
          activity?: string
          created_at?: string
          id?: string
          lecture_id?: string
          minutes?: number
          user_id?: string
        }
        Relationships: []
      }
      summaries: {
        Row: {
          bullets: Json
          created_at: string
          detailed: string | null
          id: string
          lecture_id: string
          quick: string | null
          takeaways: Json
          user_id: string
        }
        Insert: {
          bullets?: Json
          created_at?: string
          detailed?: string | null
          id?: string
          lecture_id: string
          quick?: string | null
          takeaways?: Json
          user_id: string
        }
        Update: {
          bullets?: Json
          created_at?: string
          detailed?: string | null
          id?: string
          lecture_id?: string
          quick?: string | null
          takeaways?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "summaries_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          created_at: string
          full_text: string
          id: string
          lecture_id: string
          segments: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          full_text?: string
          id?: string
          lecture_id: string
          segments?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          full_text?: string
          id?: string
          lecture_id?: string
          segments?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      lecture_source: "audio" | "video" | "pdf" | "text"
      lecture_status:
        | "uploading"
        | "extracting"
        | "transcribing"
        | "summarizing"
        | "done"
        | "error"
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
      lecture_source: ["audio", "video", "pdf", "text"],
      lecture_status: [
        "uploading",
        "extracting",
        "transcribing",
        "summarizing",
        "done",
        "error",
      ],
    },
  },
} as const
