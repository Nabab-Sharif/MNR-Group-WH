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
      app_users: {
        Row: {
          access_id: string
          can_add: boolean
          can_clear_notifications: boolean
          can_delete: boolean
          can_delete_history: boolean
          can_edit: boolean
          can_excel: boolean
          can_print: boolean
          created_at: string
          destination: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          access_id: string
          can_add?: boolean
          can_clear_notifications?: boolean
          can_delete?: boolean
          can_delete_history?: boolean
          can_edit?: boolean
          can_excel?: boolean
          can_print?: boolean
          created_at?: string
          destination?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          access_id?: string
          can_add?: boolean
          can_clear_notifications?: boolean
          can_delete?: boolean
          can_delete_history?: boolean
          can_edit?: boolean
          can_excel?: boolean
          can_print?: boolean
          created_at?: string
          destination?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      carton_history: {
        Row: {
          action: Database["public"]["Enums"]["history_action"]
          carton_id: string | null
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          details: Json | null
          hidden_by: Json
          id: string
          office_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["history_action"]
          carton_id?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          details?: Json | null
          hidden_by?: Json
          id?: string
          office_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["history_action"]
          carton_id?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          details?: Json | null
          hidden_by?: Json
          id?: string
          office_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carton_history_carton_id_fkey"
            columns: ["carton_id"]
            isOneToOne: false
            referencedRelation: "cartons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carton_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carton_history_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      cartons: {
        Row: {
          buyer: string | null
          carton_no: string
          category: string
          color: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          inspection_notes: string | null
          issued_at: string | null
          issued_to: string | null
          office_id: string
          po_no: string | null
          quantity: number
          si_no: string | null
          size: string | null
          status: Database["public"]["Enums"]["carton_status"]
          style: string | null
          style_no: string | null
          updated_at: string
        }
        Insert: {
          buyer?: string | null
          carton_no: string
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          inspection_notes?: string | null
          issued_at?: string | null
          issued_to?: string | null
          office_id: string
          po_no?: string | null
          quantity?: number
          si_no?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["carton_status"]
          style?: string | null
          style_no?: string | null
          updated_at?: string
        }
        Update: {
          buyer?: string | null
          carton_no?: string
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          inspection_notes?: string | null
          issued_at?: string | null
          issued_to?: string | null
          office_id?: string
          po_no?: string | null
          quantity?: number
          si_no?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["carton_status"]
          style?: string | null
          style_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartons_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_items: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          deleted_by_name: string | null
          id: string
          label: string | null
          payload: Json
          record_id: string
          table_name: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          label?: string | null
          payload: Json
          record_id: string
          table_name: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          id?: string
          label?: string | null
          payload?: Json
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action: Database["public"]["Enums"]["history_action"]
          carton_id: string | null
          carton_no: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          details: Json | null
          field_changed: string | null
          hidden_by: Json
          id: string
          message: string
          office_id: string | null
          office_name: string | null
          read_by: Json
          route: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["history_action"]
          carton_id?: string | null
          carton_no?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          details?: Json | null
          field_changed?: string | null
          hidden_by?: Json
          id?: string
          message: string
          office_id?: string | null
          office_name?: string | null
          read_by?: Json
          route?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["history_action"]
          carton_id?: string | null
          carton_no?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          details?: Json | null
          field_changed?: string | null
          hidden_by?: Json
          id?: string
          message?: string
          office_id?: string | null
          office_name?: string | null
          read_by?: Json
          route?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      receive_cartons: {
        Row: {
          created_at: string
          ctn_qty: number
          id: string
          location: string | null
          pcs_per_ctn: number
          rack: string | null
          receive_id: string
          remarks: string | null
        }
        Insert: {
          created_at?: string
          ctn_qty?: number
          id?: string
          location?: string | null
          pcs_per_ctn?: number
          rack?: string | null
          receive_id: string
          remarks?: string | null
        }
        Update: {
          created_at?: string
          ctn_qty?: number
          id?: string
          location?: string | null
          pcs_per_ctn?: number
          rack?: string | null
          receive_id?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receive_cartons_receive_id_fkey"
            columns: ["receive_id"]
            isOneToOne: false
            referencedRelation: "receives"
            referencedColumns: ["id"]
          },
        ]
      }
      receive_issue_lines: {
        Row: {
          created_at: string
          ctn_qty: number
          id: string
          issue_id: string
          pcs_per_ctn: number
          remarks: string | null
          returned_ctn: number
          returned_pcs: number
          source_carton_id: string | null
        }
        Insert: {
          created_at?: string
          ctn_qty?: number
          id?: string
          issue_id: string
          pcs_per_ctn?: number
          remarks?: string | null
          returned_ctn?: number
          returned_pcs?: number
          source_carton_id?: string | null
        }
        Update: {
          created_at?: string
          ctn_qty?: number
          id?: string
          issue_id?: string
          pcs_per_ctn?: number
          remarks?: string | null
          returned_ctn?: number
          returned_pcs?: number
          source_carton_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receive_issue_lines_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "receive_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receive_issue_lines_source_carton_id_fkey"
            columns: ["source_carton_id"]
            isOneToOne: false
            referencedRelation: "receive_cartons"
            referencedColumns: ["id"]
          },
        ]
      }
      receive_issues: {
        Row: {
          ar_desh: string | null
          created_at: string
          created_by: string | null
          ctn_qty: number
          department: string | null
          designation: string | null
          destination: string | null
          driver_mobile: string | null
          driver_name: string | null
          export_by: string | null
          id: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          issued_at: string
          issued_to: string | null
          lock_no: string | null
          pcs_per_ctn: number
          port: string | null
          receive_id: string
          receiver_name: string | null
          remarks: string | null
          total_ctn: number
          total_pcs: number
          truck_no: string | null
          unit_office: string | null
        }
        Insert: {
          ar_desh?: string | null
          created_at?: string
          created_by?: string | null
          ctn_qty?: number
          department?: string | null
          designation?: string | null
          destination?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          export_by?: string | null
          id?: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          issued_at?: string
          issued_to?: string | null
          lock_no?: string | null
          pcs_per_ctn?: number
          port?: string | null
          receive_id: string
          receiver_name?: string | null
          remarks?: string | null
          total_ctn?: number
          total_pcs?: number
          truck_no?: string | null
          unit_office?: string | null
        }
        Update: {
          ar_desh?: string | null
          created_at?: string
          created_by?: string | null
          ctn_qty?: number
          department?: string | null
          designation?: string | null
          destination?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          export_by?: string | null
          id?: string
          issue_type?: Database["public"]["Enums"]["issue_type"]
          issued_at?: string
          issued_to?: string | null
          lock_no?: string | null
          pcs_per_ctn?: number
          port?: string | null
          receive_id?: string
          receiver_name?: string | null
          remarks?: string | null
          total_ctn?: number
          total_pcs?: number
          truck_no?: string | null
          unit_office?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receive_issues_receive_id_fkey"
            columns: ["receive_id"]
            isOneToOne: false
            referencedRelation: "receives"
            referencedColumns: ["id"]
          },
        ]
      }
      receives: {
        Row: {
          buyer: string | null
          challan_no: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          office_id: string
          po_no: string | null
          remarks: string | null
          si_no: string | null
          style: string | null
          updated_at: string
        }
        Insert: {
          buyer?: string | null
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          office_id: string
          po_no?: string | null
          remarks?: string | null
          si_no?: string | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          buyer?: string | null
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          office_id?: string
          po_no?: string | null
          remarks?: string | null
          si_no?: string | null
          style?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          login_at: string
          logout_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
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
      app_role: "super_admin" | "admin" | "management" | "store_user"
      carton_status:
        | "in_stock"
        | "issued"
        | "inspection_pending"
        | "pass"
        | "fail"
      history_action: "created" | "updated" | "issued" | "inspected" | "deleted"
      issue_type: "sample" | "inspection" | "shipment"
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
      app_role: ["super_admin", "admin", "management", "store_user"],
      carton_status: [
        "in_stock",
        "issued",
        "inspection_pending",
        "pass",
        "fail",
      ],
      history_action: ["created", "updated", "issued", "inspected", "deleted"],
      issue_type: ["sample", "inspection", "shipment"],
    },
  },
} as const
