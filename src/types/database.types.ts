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
      clients: {
        Row: {
          address: string | null
          bank_info: Json | null
          contact_person: string | null
          created_at: string | null
          id: string
          invoice_title: string | null
          name: string
          phone: string | null
          tin: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bank_info?: Json | null
          contact_person?: string | null
          created_at?: string | null
          id?: string
          invoice_title?: string | null
          name: string
          phone?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bank_info?: Json | null
          contact_person?: string | null
          created_at?: string | null
          id?: string
          invoice_title?: string | null
          name?: string
          phone?: string | null
          tin?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      kol_services: {
        Row: {
          created_at: string | null
          id: string
          kol_id: string | null
          price: number
          service_type_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          service_type_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          service_type_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_services_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      kol_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      kols: {
        Row: {
          bank_info: Json | null
          created_at: string | null
          id: string
          name: string
          real_name: string | null
          social_links: Json | null
          type_id: string | null
          updated_at: string | null
        }
        Insert: {
          bank_info?: Json | null
          created_at?: string | null
          id?: string
          name: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bank_info?: Json | null
          created_at?: string | null
          id?: string
          name?: string
          real_name?: string | null
          social_links?: Json | null
          type_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kols_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "kol_types"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          kol_id: string | null
          price: number
          quantity: number
          quotation_id: string | null
          remark: string | null
          service: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          quantity?: number
          quotation_id?: string | null
          remark?: string | null
          service: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          kol_id?: string | null
          price?: number
          quantity?: number
          quotation_id?: string | null
          remark?: string | null
          service?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          attachments: Json[] | null
          client_contact: string | null
          client_id: string | null
          created_at: string | null
          discounted_price: number | null
          grand_total_taxed: number | null
          has_discount: boolean | null
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          remarks: string | null
          status: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed: number | null
          tax: number | null
          terms: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json[] | null
          client_contact?: string | null
          client_id?: string | null
          created_at?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed?: number | null
          tax?: number | null
          terms?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json[] | null
          client_contact?: string | null
          client_id?: string | null
          created_at?: string | null
          discounted_price?: number | null
          grand_total_taxed?: number | null
          has_discount?: boolean | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_name?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
          subtotal_untaxed?: number | null
          tax?: number | null
          terms?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { user_id: string }
        Returns: string
      }
    }
    Enums: {
      payment_method: "電匯" | "ATM轉帳"
      quotation_status: "草稿" | "待簽約" | "已簽約" | "已歸檔"
      user_role: "admin" | "member"
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
      payment_method: ["電匯", "ATM轉帳"],
      quotation_status: ["草稿", "待簽約", "已簽約", "已歸檔"],
      user_role: ["admin", "member"],
    },
  },
} as const
