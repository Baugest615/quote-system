export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'member'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'member'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'member'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          tin: string | null
          invoice_title: string | null
          contact_person: string | null
          phone: string | null
          address: string | null
          bank_info: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          tin?: string | null
          invoice_title?: string | null
          contact_person?: string | null
          phone?: string | null
          address?: string | null
          bank_info?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          tin?: string | null
          invoice_title?: string | null
          contact_person?: string | null
          phone?: string | null
          address?: string | null
          bank_info?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      kols: {
        Row: {
          id: string
          name: string
          platform: string
          followers: number | null
          engagement_rate: number | null
          price_per_post: number | null
          email: string | null
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string
        }
        Insert: {
          id?: string
          name: string
          platform: string
          followers?: number | null
          engagement_rate?: number | null
          price_per_post?: number | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by: string
        }
        Update: {
          id?: string
          name?: string
          platform?: string
          followers?: number | null
          engagement_rate?: number | null
          price_per_post?: number | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "kols_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      quotations: {
        Row: {
          id: string
          project_name: string
          client_id: string | null
          client_contact: string | null
          payment_method: '電匯' | 'ATM轉帳'
          subtotal_untaxed: number
          tax: number
          grand_total_taxed: number
          has_discount: boolean
          discounted_price: number | null
          status: '草稿' | '待簽約' | '已簽約' | '已歸檔'
          terms: string | null
          remarks: string | null
          attachments: Json[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_name: string
          client_id?: string | null
          client_contact?: string | null
          payment_method?: '電匯' | 'ATM轉帳'
          subtotal_untaxed?: number
          tax?: number
          grand_total_taxed?: number
          has_discount?: boolean
          discounted_price?: number | null
          status?: '草稿' | '待簽約' | '已簽約' | '已歸檔'
          terms?: string | null
          remarks?: string | null
          attachments?: Json[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_name?: string
          client_id?: string | null
          client_contact?: string | null
          payment_method?: '電匯' | 'ATM轉帳'
          subtotal_untaxed?: number
          tax?: number
          grand_total_taxed?: number
          has_discount?: boolean
          discounted_price?: number | null
          status?: '草稿' | '待簽約' | '已簽約' | '已歸檔'
          terms?: string | null
          remarks?: string | null
          attachments?: Json[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      quote_items: {
        Row: {
          id: string
          quote_id: string
          kol_id: string | null
          service_type: string
          description: string
          quantity: number
          unit_price: number
          total_price: number
          created_at: string
        }
        Insert: {
          id?: string
          quote_id: string
          kol_id?: string | null
          service_type: string
          description: string
          quantity: number
          unit_price: number
          total_price: number
          created_at?: string
        }
        Update: {
          id?: string
          quote_id?: string
          kol_id?: string | null
          service_type?: string
          description?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_kol_id_fkey"
            columns: ["kol_id"]
            referencedRelation: "kols"
            referencedColumns: ["id"]
          }
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}