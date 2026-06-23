export interface Chalet {
  id: number;
  name: string;
  loc: string;
  cap: number;
  price: number;
  wprice: number;
  ins: number;
  description?: string;
  st: "active" | "inactive";
  img?: string | null;
  open_date?: string | null;
  prev_revenue?: number;
  monthly_goal?: number;
  // computed from smart_devices
  _acOn?: boolean;
  _acTemp?: number;
  _acMode?: string;
  _acSpeed?: string;
  _sdId?: number | null;
}

export interface Booking {
  id: number;
  chalet: string;
  guest: string;
  phone?: string;
  date_from: string;
  date_to: string;
  checkin_time?: string;
  checkout_time?: string;
  price: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  note?: string;
  payment_method?: string;
  notes?: string;
  pre_arrival_sent?: boolean;
  pool_preference?: string | null;
  pool_approved?: boolean;
}

export interface MaintenanceRequest {
  id: number;
  chalet: string;
  issue: string;
  maint_date: string;
  priority: "منخفض" | "متوسط" | "عالي";
  status: "open" | "in_progress" | "done";
  cost?: number;
  note?: string;
  req?: string;
  image?: string | null;
}

export interface WalletTransaction {
  id: number;
  trans_date: string;
  type: "إيداع" | "سحب صيانة" | string;
  chalet: string;
  cat?: string;
  amount: number;
  note?: string;
}

export interface CleaningTransaction {
  id: number;
  trans_date: string;
  type: "إيداع" | "سحب" | string;
  chalet: string;
  amount: number;
  note?: string;
}

export interface Expense {
  id: number;
  chalet: string;
  category: string;
  amount: number;
  note?: string;
  expense_date: string;
}

export interface FixedExpense {
  id: number;
  chalet: string;
  name: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "yearly";
  category: string;
  active: boolean;
}

export interface CleaningExpense {
  id: number;
  chalet: string;
  category: string;
  amount: number;
  note?: string;
  expense_date: string;
}

export interface CleaningTask {
  id: number;
  chalet: string;
  title: string;
  frequency: string;
  category: string;
  assigned_to?: string;
  active?: boolean;
}

export interface CleaningLog {
  id: number;
  task_id: number;
  chalet: string;
  log_date: string;
  worker_done: boolean;
  supervisor_ok: boolean;
  note?: string;
  worker_id?: number | null;
  status?: "pending" | "sent" | "done";
  due_date?: string;
  sent_at?: string;
  done_at?: string;
  done_note?: string;
  done_media_url?: string;
}

export interface CleaningWorker {
  id: number;
  name: string;
  phone: string;
  language: "ar" | "hi" | "en";
  active: boolean;
}

export interface Room {
  id: number;
  chalet: string;
  name: string;
  _acOn?: boolean;
  _acTemp?: number;
  _acMode?: string;
  _acSpeed?: string;
  _sdId?: number | null;
}

export interface Review {
  id: number;
  booking_id: number;
  chalet: string;
  guest: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface LoyaltyCard {
  id: number;
  phone: string;
  name: string;
  tickets: number;
  free_nights: number;
  total_reviews: number;
  created_at?: string;
  updated_at?: string;
}

export interface AppUser {
  id: number;
  name: string;
  username?: string;
  email?: string;
  role: "admin" | "staff" | "chalet_manager";
  chalet?: string;
}
