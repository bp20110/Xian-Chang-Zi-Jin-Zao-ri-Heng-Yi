import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const adminCredentialsTable = pgTable("admin_credentials", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const counterpartiesTable = pgTable("counterparties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isClient: boolean("is_client").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  closingDay: integer("closing_day"),
  paymentTerms: text("payment_terms"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientId: integer("client_id").references(() => counterpartiesTable.id, {
    onDelete: "set null",
  }),
  status: text("status", { enum: ["active", "completed"] })
    .notNull()
    .default("active"),
  contractAmount: integer("contract_amount"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesInvoicesTable = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  counterpartyId: integer("counterparty_id")
    .notNull()
    .references(() => counterpartiesTable.id, { onDelete: "restrict" }),
  issuedAt: date("issued_at", { mode: "string" }),
  expectedPaymentAt: date("expected_payment_at", { mode: "string" }),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesInvoiceLinesTable = pgTable("sales_invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => salesInvoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  taxRate: integer("tax_rate").notNull(),
  netAmount: integer("net_amount").notNull(),
  taxAmount: integer("tax_amount").notNull(),
  grossAmount: integer("gross_amount").notNull(),
});

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => salesInvoicesTable.id, { onDelete: "cascade" }),
  receivedAt: date("received_at", { mode: "string" }).notNull(),
  amount: integer("amount").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseBillsTable = pgTable("purchase_bills", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "restrict" }),
  counterpartyId: integer("counterparty_id")
    .notNull()
    .references(() => counterpartiesTable.id, { onDelete: "restrict" }),
  billedAt: date("billed_at", { mode: "string" }).notNull(),
  dueAt: date("due_at", { mode: "string" }).notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseBillLinesTable = pgTable("purchase_bill_lines", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => purchaseBillsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  taxRate: integer("tax_rate").notNull(),
  netAmount: integer("net_amount").notNull(),
  taxAmount: integer("tax_amount").notNull(),
  grossAmount: integer("gross_amount").notNull(),
});

export const supplierPaymentsTable = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => purchaseBillsTable.id, { onDelete: "cascade" }),
  paidAt: date("paid_at", { mode: "string" }).notNull(),
  amount: integer("amount").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type", { enum: ["sales_invoice", "purchase_bill", "receipt", "supplier_payment"] }).notNull(),
  ownerId: integer("owner_id").notNull(),
  storagePath: text("storage_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
