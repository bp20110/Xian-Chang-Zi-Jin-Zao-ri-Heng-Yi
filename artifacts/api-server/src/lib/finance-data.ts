import { and, eq } from "drizzle-orm";
import {
  db,
  counterpartiesTable,
  purchaseBillLinesTable,
  purchaseBillsTable,
  receiptsTable,
  salesInvoiceLinesTable,
  salesInvoicesTable,
  sitesTable,
  supplierPaymentsTable,
} from "@workspace/db";

type LineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export function calculateLine(line: LineInput) {
  const netAmount = line.quantity * line.unitPrice;
  if (!Number.isSafeInteger(netAmount)) {
    throw new Error("明細の金額が上限を超えています");
  }
  const taxAmount = Math.round((netAmount * line.taxRate) / 100);
  return {
    ...line,
    netAmount,
    taxAmount,
    grossAmount: netAmount + taxAmount,
  };
}

export async function loadSalesInvoices(invoiceId?: number) {
  const where = invoiceId ? eq(salesInvoicesTable.id, invoiceId) : undefined;
  const [invoices, sites, counterparties, lines, receipts] = await Promise.all([
    db.select().from(salesInvoicesTable).where(where),
    db.select().from(sitesTable),
    db.select().from(counterpartiesTable),
    db.select().from(salesInvoiceLinesTable),
    db.select().from(receiptsTable),
  ]);
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const counterpartyById = new Map(counterparties.map((counterparty) => [counterparty.id, counterparty]));
  return invoices.map((invoice) => {
    const invoiceLines = lines
      .filter((line) => line.invoiceId === invoice.id)
      .sort((a, b) => a.id - b.id);
    const invoiceReceipts = receipts
      .filter((receipt) => receipt.invoiceId === invoice.id)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id - b.id);
    const netAmount = invoiceLines.reduce((sum, line) => sum + line.netAmount, 0);
    const taxAmount = invoiceLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const grossAmount = invoiceLines.reduce((sum, line) => sum + line.grossAmount, 0);
    const receivedAmount = invoiceReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const rawOutstanding = Math.max(0, grossAmount - receivedAmount);
    const status = !invoice.issuedAt
      ? "unbilled"
      : rawOutstanding === 0
        ? "paid"
        : receivedAmount > 0
          ? "partially_paid"
          : "invoiced";
    const outstandingAmount = status === "unbilled" ? 0 : rawOutstanding;
    return {
      ...invoice,
      siteName: siteById.get(invoice.siteId)?.name ?? "",
      counterpartyName: counterpartyById.get(invoice.counterpartyId)?.name ?? "",
      lines: invoiceLines,
      netAmount,
      taxAmount,
      grossAmount,
      receivedAmount,
      outstandingAmount,
      status,
      receipts: invoiceReceipts,
    };
  });
}

export async function loadPurchaseBills(billId?: number) {
  const where = billId ? eq(purchaseBillsTable.id, billId) : undefined;
  const [bills, sites, counterparties, lines, payments] = await Promise.all([
    db.select().from(purchaseBillsTable).where(where),
    db.select().from(sitesTable),
    db.select().from(counterpartiesTable),
    db.select().from(purchaseBillLinesTable),
    db.select().from(supplierPaymentsTable),
  ]);
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const counterpartyById = new Map(counterparties.map((counterparty) => [counterparty.id, counterparty]));
  return bills.map((bill) => {
    const billLines = lines
      .filter((line) => line.billId === bill.id)
      .sort((a, b) => a.id - b.id);
    const billPayments = payments
      .filter((payment) => payment.billId === bill.id)
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id - b.id);
    const netAmount = billLines.reduce((sum, line) => sum + line.netAmount, 0);
    const taxAmount = billLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const grossAmount = billLines.reduce((sum, line) => sum + line.grossAmount, 0);
    const paidAmount = billPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstandingAmount = Math.max(0, grossAmount - paidAmount);
    return {
      ...bill,
      siteName: siteById.get(bill.siteId)?.name ?? "",
      counterpartyName: counterpartyById.get(bill.counterpartyId)?.name ?? "",
      lines: billLines,
      netAmount,
      taxAmount,
      grossAmount,
      paidAmount,
      outstandingAmount,
      status: outstandingAmount === 0 ? "paid" : "unpaid",
      payments: billPayments,
    };
  });
}

export async function loadSites() {
  const [sites, counterparties, invoices, invoiceLines, bills, billLines] = await Promise.all([
    db.select().from(sitesTable),
    db.select().from(counterpartiesTable),
    db.select().from(salesInvoicesTable),
    db.select().from(salesInvoiceLinesTable),
    db.select().from(purchaseBillsTable),
    db.select().from(purchaseBillLinesTable),
  ]);
  const counterpartyById = new Map(counterparties.map((counterparty) => [counterparty.id, counterparty]));
  return sites.map((site) => {
    const siteInvoiceIds = new Set(invoices.filter((invoice) => invoice.siteId === site.id).map((invoice) => invoice.id));
    const siteBillIds = new Set(bills.filter((bill) => bill.siteId === site.id).map((bill) => bill.id));
    const salesTotal = invoiceLines
      .filter((line) => siteInvoiceIds.has(line.invoiceId))
      .reduce((sum, line) => sum + line.grossAmount, 0);
    const purchasesTotal = billLines
      .filter((line) => siteBillIds.has(line.billId))
      .reduce((sum, line) => sum + line.grossAmount, 0);
    return {
      ...site,
      clientName: site.clientId ? counterpartyById.get(site.clientId)?.name ?? null : null,
      salesTotal,
      purchasesTotal,
      balance: salesTotal - purchasesTotal,
    };
  });
}

export async function loadSiteFinanceRows() {
  const [sites, invoices, invoiceLines, bills, billLines, receipts, payments] = await Promise.all([
    db.select().from(sitesTable),
    db.select().from(salesInvoicesTable),
    db.select().from(salesInvoiceLinesTable),
    db.select().from(purchaseBillsTable),
    db.select().from(purchaseBillLinesTable),
    db.select().from(receiptsTable),
    db.select().from(supplierPaymentsTable),
  ]);
  return sites.map((site) => {
    const siteInvoices = invoices.filter((invoice) => invoice.siteId === site.id);
    const siteInvoiceIds = new Set(siteInvoices.map((invoice) => invoice.id));
    const siteBills = bills.filter((bill) => bill.siteId === site.id);
    const siteBillIds = new Set(siteBills.map((bill) => bill.id));
    const sales = invoiceLines
      .filter((line) => siteInvoiceIds.has(line.invoiceId))
      .reduce((sum, line) => sum + line.grossAmount, 0);
    const purchases = billLines
      .filter((line) => siteBillIds.has(line.billId))
      .reduce((sum, line) => sum + line.grossAmount, 0);
    const issuedInvoiceIds = new Set(siteInvoices.filter((invoice) => invoice.issuedAt).map((invoice) => invoice.id));
    const issuedGross = invoiceLines
      .filter((line) => issuedInvoiceIds.has(line.invoiceId))
      .reduce((sum, line) => sum + line.grossAmount, 0);
    const receivable = Math.max(
      0,
      issuedGross -
        receipts
          .filter((receipt) => issuedInvoiceIds.has(receipt.invoiceId))
          .reduce((sum, receipt) => sum + receipt.amount, 0),
    );
    const payable = Math.max(
      0,
      purchases -
        payments
          .filter((payment) => siteBillIds.has(payment.billId))
          .reduce((sum, payment) => sum + payment.amount, 0),
    );
    return {
      siteId: site.id,
      siteName: site.name,
      status: site.status,
      sales,
      purchases,
      balance: sales - purchases,
      receivable,
      payable,
    };
  });
}

export async function getSiteWithDetails(siteId: number) {
  const [site] = await loadSites().then((rows) => rows.filter((row) => row.id === siteId));
  if (!site) return undefined;
  const [invoices, purchases] = await Promise.all([
    loadSalesInvoices().then((rows) => rows.filter((row) => row.siteId === siteId)),
    loadPurchaseBills().then((rows) => rows.filter((row) => row.siteId === siteId)),
  ]);
  return { ...site, invoices, purchases };
}

export async function getCounterpartyUsage(counterpartyId: number) {
  const [[invoice], [bill]] = await Promise.all([
    db
      .select({ id: salesInvoicesTable.id })
      .from(salesInvoicesTable)
      .where(eq(salesInvoicesTable.counterpartyId, counterpartyId))
      .limit(1),
    db
      .select({ id: purchaseBillsTable.id })
      .from(purchaseBillsTable)
      .where(eq(purchaseBillsTable.counterpartyId, counterpartyId))
      .limit(1),
  ]);
  return Boolean(invoice || bill);
}

export async function isClientCounterparty(counterpartyId: number): Promise<boolean> {
  const [row] = await db
    .select({ isClient: counterpartiesTable.isClient })
    .from(counterpartiesTable)
    .where(and(eq(counterpartiesTable.id, counterpartyId), eq(counterpartiesTable.isClient, true)))
    .limit(1);
  return Boolean(row);
}

export async function isSupplierCounterparty(counterpartyId: number): Promise<boolean> {
  const [row] = await db
    .select({ isSupplier: counterpartiesTable.isSupplier })
    .from(counterpartiesTable)
    .where(and(eq(counterpartiesTable.id, counterpartyId), eq(counterpartiesTable.isSupplier, true)))
    .limit(1);
  return Boolean(row);
}
