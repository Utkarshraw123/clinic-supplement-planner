CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','team')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  description TEXT,
  package_size TEXT,
  form TEXT,
  default_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reusable comment snippets ("Only take at night", "Add to water", ...) the
-- practitioner can insert into any supplement line or product default note.
CREATE TABLE IF NOT EXISTS note_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  category TEXT DEFAULT 'supplement',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('allergen','ingredient','concern','diet','caution')),
  label TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  UNIQUE (type, label)
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id),
  tag_type TEXT NOT NULL CHECK (tag_type IN ('ingredient','allergen','concern','diet','caution')),
  PRIMARY KEY (product_id, taxonomy_term_id, tag_type)
);

CREATE TABLE IF NOT EXISTS supplier_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_alternatives (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alternative_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, alternative_product_id)
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  clinic_name TEXT,
  logo_url TEXT,
  address TEXT,
  contact TEXT,
  email_from TEXT,
  letterhead_template TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  postcode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS patient_attributes (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id),
  attr_type TEXT NOT NULL CHECK (attr_type IN ('allergy','goal','diet','med_condition')),
  PRIMARY KEY (patient_id, taxonomy_term_id, attr_type)
);

-- GDPR consent, append-only and versioned. A withdrawal is a NEW row with
-- granted=0 (the grant row is never mutated). Latest-per-purpose is the current
-- state. Removed only when the patient is erased.
CREATE TABLE IF NOT EXISTS patient_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0,1)),
  version TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dated clinical consultation notes. Free body plus optional SOAP fields.
CREATE TABLE IF NOT EXISTS consultation_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  note_date TEXT NOT NULL,
  title TEXT,
  body TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  author_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One practitioner-entered intake record per patient (upserted).
CREATE TABLE IF NOT EXISTS patient_intake (
  patient_id INTEGER PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  chief_concern TEXT,
  health_history TEXT,
  current_medications TEXT,
  current_supplements TEXT,
  lifestyle TEXT,
  goals TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dosing_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised')),
  author_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  dosing_preset_id INTEGER REFERENCES dosing_presets(id),
  dosing_custom_text TEXT,
  note TEXT,
  chosen_alternative_id INTEGER REFERENCES products(id),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  frozen_json TEXT NOT NULL,
  pdf_base64 TEXT NOT NULL,
  sent_to_email TEXT,
  sent_at TEXT,
  sent_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS protocol_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  dosing_preset_id INTEGER REFERENCES dosing_presets(id),
  dosing_custom_text TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

-- Practitioner-authored fields for the branded Supplement Instruction Guide PDF.
-- One row per plan. Supplement and meds text start pre-filled but are editable.
CREATE TABLE IF NOT EXISTS plan_guide (
  plan_id INTEGER PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  consultation_date TEXT,
  intro TEXT,
  next_consultation TEXT,
  lifestyle TEXT,
  dietary TEXT,
  supplement_text TEXT,
  meds_text TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brand_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE (brand_id, code)
);

CREATE TABLE IF NOT EXISTS dietary_protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Appointment types a clinic offers (name + duration, optional price).
CREATE TABLE IF NOT EXISTS appointment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Booked appointments.
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id INTEGER REFERENCES users(id),
  appointment_type_id INTEGER REFERENCES appointment_types(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled')),
  notes TEXT,
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

-- Weekly clinic availability windows (clinic-wide). weekday 0=Sunday..6=Saturday.
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

-- One-time, hashed, short-lived magic-link tokens for the client portal.
CREATE TABLE IF NOT EXISTS portal_login_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Client-facing invoices (Phase 3b). Practitioner bills the patient. Money in integer cents.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  payment_link_url TEXT,
  paid_at TEXT,
  paid_method TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  appointment_id INTEGER,
  plan_id INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);
