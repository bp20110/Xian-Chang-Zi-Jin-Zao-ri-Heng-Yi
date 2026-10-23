import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
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
import {
  CreateCounterpartyBody,
  CreateCounterpartyResponse,
  CreatePurchaseBillBody,
  CreatePurchaseBillResponse,
  CreateReceiptParams,
  CreateReceiptBody,
  CreateReceiptResponse,
  CreateSalesInvoiceBody,
  CreateSalesInvoiceResponse,
  CreateSiteBody,
  CreateSiteResponse,
  CreateSupplierPaymentBody,
  CreateSupplierPaymentParams,
  CreateSupplierPaymentResponse,
  DeleteCounterpartyParams,
  DeletePurchaseBillParams,
  DeleteReceiptParams,
  DeleteSalesInvoiceParams,
  DeleteSiteParams,
  DeleteSupplierPaymentParams,
  ExportCsvQueryParams,
  GetCashflowQueryParams,
  GetCashflowResponse,
  GetCounterpartiesResponse,
  GetDashboardResponse,
  GetPurchaseBillsQueryParams,
  GetPurchaseBillsResponse,
  GetSalesInvoicesQueryParams,
  GetSalesInvoicesResponse,
  GetSalesInvoiceParams,
  GetSalesInvoiceResponse,
  GetSiteFinancesResponse,
  GetSiteParams,
  GetSiteResponse,
  GetSitesResponse,
  UpdateCounterpartyBody,
  UpdateCounterpartyParams,
  UpdateCounterpartyResponse,
  UpdatePurchaseBillBody,
  UpdatePurchaseBillParams,
  UpdatePurchaseBillResponse,
  UpdateSalesInvoiceBody,
  UpdateSalesInvoiceParams,
  UpdateSalesInvoiceResponse,
  UpdateSiteBody,
  UpdateSiteParams,
  UpdateSiteResponse,
} from "@workspace/api-zod";
import {
  calculateLine,
  getCounterpartyUsage,
  getSiteWithDetails,
  isClientCounterparty,
  isSupplierCounterparty,
  loadPurchaseBills,
  loadSalesInvoices,
  loadSiteFinanceRows,
  loadSites,
} from "../lib/finance-data";

const router: IRouter = Router();

// Generated response validators coerce dates to Date objects. These domain
// fields are calendar days, so preserve YYYY-MM-DD at the JSON boundary.
function calendarDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(calendarDates);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, calendarDates(entry)]));
  }
  return value;
}

router.use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = ((body: unknown) => json(calendarDates(body))) as typeof res.json;
  next();
});

function parsedId(params: unknown) {
  return GetSiteParams.safeParse(params);
}

function isWithin(date: string, from?: string, to?: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function asDateString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function eventRow(
  date: string,
  counterparty: string,
  site: string,
  description: string,
  net: number,
  tax: number,
  gross: number,
  category: "売上" | "仕入",
): string {
  return [date, counterparty, site, description, net, tax, gross, category]
    .map(csvCell)
    .join(",");
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [invoices, bills] = await Promise.all([
    loadSalesInvoices(),
    loadPurchaseBills(),
  ]);
  const current = today();
  const horizon = addDays(current, 30);
  const receivable = invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const overdueReceivable = invoices
    .filter(
      (invoice) =>
        invoice.outstandingAmount > 0 &&
        invoice.expectedPaymentAt !== null &&
        invoice.expectedPaymentAt < current,
    )
    .reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const payable = bills.reduce((sum, bill) => sum + bill.outstandingAmount, 0);
  const incomingEvents = invoices
    .filter(
      (invoice) =>
        invoice.outstandingAmount > 0 &&
        invoice.expectedPaymentAt !== null &&
        invoice.expectedPaymentAt >= current &&
        invoice.expectedPaymentAt <= horizon,
    )
    .map((invoice) => ({
      date: invoice.expectedPaymentAt!,
      direction: "incoming" as const,
      amount: invoice.outstandingAmount,
      siteName: invoice.siteName,
      counterpartyName: invoice.counterpartyName,
      description: invoice.memo || `請求 #${invoice.id}`,
    }));
  const outgoingEvents = bills
    .filter(
      (bill) =>
        bill.outstandingAmount > 0 &&
        bill.dueAt >= current &&
        bill.dueAt <= horizon,
    )
    .map((bill) => ({
      date: bill.dueAt,
      direction: "outgoing" as const,
      amount: bill.outstandingAmount,
      siteName: bill.siteName,
      counterpartyName: bill.counterpartyName,
      description: bill.memo || `仕入 #${bill.id}`,
    }));
  const nextEvents = [...incomingEvents, ...outgoingEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);
  res.json(
    GetDashboardResponse.parse({
      receivable,
      overdueReceivable,
      payable,
      upcomingIncoming: incomingEvents.reduce((sum, event) => sum + event.amount, 0),
      upcomingOutgoing: outgoingEvents.reduce((sum, event) => sum + event.amount, 0),
      nextEvents,
    }),
  );
});

router.get("/sites", async (_req, res): Promise<void> => {
  res.json(GetSitesResponse.parse(await loadSites()));
});

router.post("/sites", async (req, res): Promise<void> => {
  const parsed = CreateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.clientId !== null && !(await isClientCounterparty(parsed.data.clientId))) {
    res.status(400).json({ error: "請求先として登録された取引先を選択してください" });
    return;
  }
  const [site] = await db.insert(sitesTable).values(parsed.data).returning();
  const [view] = (await loadSites()).filter((row) => row.id === site.id);
  res.status(201).json(CreateSiteResponse.parse(view));
});

router.get("/sites/:id", async (req, res): Promise<void> => {
  const params = parsedId(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const site = await getSiteWithDetails(params.data.id);
  if (!site) {
    res.status(404).json({ error: "現場が見つかりません" });
    return;
  }
  res.json(GetSiteResponse.parse(site));
});

router.patch("/sites/:id", async (req, res): Promise<void> => {
  const params = UpdateSiteParams.safeParse(req.params);
  const body = UpdateSiteBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  if (body.data.clientId !== null && !(await isClientCounterparty(body.data.clientId))) {
    res.status(400).json({ error: "請求先として登録された取引先を選択してください" });
    return;
  }
  const [updated] = await db
    .update(sitesTable)
    .set(body.data)
    .where(eq(sitesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "現場が見つかりません" });
    return;
  }
  const [view] = (await loadSites()).filter((row) => row.id === updated.id);
  res.json(UpdateSiteResponse.parse(view));
});

router.delete("/sites/:id", async (req, res): Promise<void> => {
  const params = DeleteSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [deleted] = await db.delete(sitesTable).where(eq(sitesTable.id, params.data.id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "現場が見つかりません" });
      return;
    }
    res.sendStatus(204);
  } catch {
    res.status(409).json({ error: "支払い記録がある現場は削除できません" });
  }
});

router.get("/counterparties", async (_req, res): Promise<void> => {
  const rows = await db.select().from(counterpartiesTable).orderBy(counterpartiesTable.name);
  res.json(GetCounterpartiesResponse.parse(rows));
});

router.post("/counterparties", async (req, res): Promise<void> => {
  const parsed = CreateCounterpartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.isClient && !parsed.data.isSupplier) {
    res.status(400).json({ error: "請求先または支払先を1つ以上選択してください" });
    return;
  }
  const [created] = await db.insert(counterpartiesTable).values(parsed.data).returning();
  res.status(201).json(CreateCounterpartyResponse.parse(created));
});

router.patch("/counterparties/:id", async (req, res): Promise<void> => {
  const params = UpdateCounterpartyParams.safeParse(req.params);
  const body = UpdateCounterpartyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  if (!body.data.isClient && !body.data.isSupplier) {
    res.status(400).json({ error: "請求先または支払先を1つ以上選択してください" });
    return;
  }
  const [updated] = await db
    .update(counterpartiesTable)
    .set(body.data)
    .where(eq(counterpartiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "取引先が見つかりません" });
    return;
  }
  res.json(UpdateCounterpartyResponse.parse(updated));
});

router.delete("/counterparties/:id", async (req, res): Promise<void> => {
  const params = DeleteCounterpartyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (await getCounterpartyUsage(params.data.id)) {
    res.status(409).json({ error: "請求や仕入に使用中の取引先は削除できません" });
    return;
  }
  const [deleted] = await db
    .delete(counterpartiesTable)
    .where(eq(counterpartiesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "取引先が見つかりません" });
    return;
  }
  res.sendStatus(204);
});

router.get("/sales-invoices", async (req, res): Promise<void> => {
  const query = GetSalesInvoicesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const all = await loadSalesInvoices();
  const outstanding = req.query.outstanding === "true";
  const rows = outstanding
    ? all
        .filter((invoice) => invoice.outstandingAmount > 0)
        .sort((a, b) => (a.expectedPaymentAt ?? "").localeCompare(b.expectedPaymentAt ?? ""))
    : all.sort((a, b) => b.id - a.id);
  res.json(GetSalesInvoicesResponse.parse(rows));
});

router.post("/sales-invoices", async (req, res): Promise<void> => {
  const parsed = CreateSalesInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.id, parsed.data.siteId)).limit(1);
  if (!site || !(await isClientCounterparty(parsed.data.counterpartyId))) {
    res.status(400).json({ error: "現場と請求先を確認してください" });
    return;
  }
  let invoiceId = 0;
  try {
    const lines = parsed.data.lines.map(calculateLine);
    await db.transaction(async (tx) => {
      const [invoice] = await tx.insert(salesInvoicesTable).values({
        siteId: parsed.data.siteId,
        counterpartyId: parsed.data.counterpartyId,
        issuedAt: asDateString(parsed.data.issuedAt),
        expectedPaymentAt: asDateString(parsed.data.expectedPaymentAt),
        memo: parsed.data.memo,
      }).returning();
      invoiceId = invoice.id;
      await tx.insert(salesInvoiceLinesTable).values(lines.map((line) => ({ ...line, invoiceId })));
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "請求を登録できませんでした" });
    return;
  }
  const [invoice] = (await loadSalesInvoices(invoiceId));
  res.status(201).json(CreateSalesInvoiceResponse.parse(invoice));
});

router.get("/sales-invoices/:id", async (req, res): Promise<void> => {
  const params = GetSalesInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [invoice] = await loadSalesInvoices(params.data.id);
  if (!invoice) {
    res.status(404).json({ error: "請求が見つかりません" });
    return;
  }
  res.json(GetSalesInvoiceResponse.parse(invoice));
});

router.patch("/sales-invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateSalesInvoiceParams.safeParse(req.params);
  const body = UpdateSalesInvoiceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  const [existing] = await loadSalesInvoices(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "請求が見つかりません" });
    return;
  }
  if (!body.data.issuedAt && existing.receivedAmount > 0) {
    res.status(409).json({ error: "入金記録がある請求は未請求に戻せません" });
    return;
  }
  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.id, body.data.siteId)).limit(1);
  if (!site || !(await isClientCounterparty(body.data.counterpartyId))) {
    res.status(400).json({ error: "現場と請求先を確認してください" });
    return;
  }
  try {
    const lines = body.data.lines.map(calculateLine);
    const newGross = lines.reduce((sum, line) => sum + line.grossAmount, 0);
    if (newGross < existing.receivedAmount) {
      res.status(409).json({ error: "入金済み金額より小さくなるよう変更できません" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(salesInvoicesTable).set({
        siteId: body.data.siteId,
        counterpartyId: body.data.counterpartyId,
        issuedAt: asDateString(body.data.issuedAt),
        expectedPaymentAt: asDateString(body.data.expectedPaymentAt),
        memo: body.data.memo,
        updatedAt: new Date(),
      }).where(eq(salesInvoicesTable.id, params.data.id));
      await tx.delete(salesInvoiceLinesTable).where(eq(salesInvoiceLinesTable.invoiceId, params.data.id));
      await tx.insert(salesInvoiceLinesTable).values(lines.map((line) => ({ ...line, invoiceId: params.data.id })));
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "請求を更新できませんでした" });
    return;
  }
  const [updated] = await loadSalesInvoices(params.data.id);
  res.json(UpdateSalesInvoiceResponse.parse(updated));
});

router.delete("/sales-invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteSalesInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(salesInvoicesTable).where(eq(salesInvoicesTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "請求が見つかりません" });
    return;
  }
  res.sendStatus(204);
});

router.post("/sales-invoices/:id/receipts", async (req, res): Promise<void> => {
  const params = CreateReceiptParams.safeParse(req.params);
  const body = CreateReceiptBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  const [invoice] = await loadSalesInvoices(params.data.id);
  if (!invoice || invoice.status === "unbilled") {
    res.status(404).json({ error: "請求済みの請求が見つかりません" });
    return;
  }
  if (body.data.amount > invoice.outstandingAmount) {
    res.status(400).json({ error: "入金額が未入金残高を超えています" });
    return;
  }
  const [receipt] = await db.insert(receiptsTable).values({
    invoiceId: params.data.id,
    receivedAt: asDateString(body.data.receivedAt)!,
    amount: body.data.amount,
    memo: body.data.memo,
  }).returning();
  res.status(201).json(CreateReceiptResponse.parse(receipt));
});

router.delete("/receipts/:id", async (req, res): Promise<void> => {
  const params = DeleteReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(receiptsTable).where(eq(receiptsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "入金記録が見つかりません" });
    return;
  }
  res.sendStatus(204);
});

router.get("/purchase-bills", async (req, res): Promise<void> => {
  const query = GetPurchaseBillsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const all = await loadPurchaseBills();
  const outstanding = req.query.outstanding === "true";
  const rows = outstanding
    ? all.filter((bill) => bill.outstandingAmount > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    : all.sort((a, b) => b.id - a.id);
  res.json(GetPurchaseBillsResponse.parse(rows));
});

router.post("/purchase-bills", async (req, res): Promise<void> => {
  const parsed = CreatePurchaseBillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.id, parsed.data.siteId)).limit(1);
  if (!site || !(await isSupplierCounterparty(parsed.data.counterpartyId))) {
    res.status(400).json({ error: "現場と支払先を確認してください" });
    return;
  }
  let billId = 0;
  try {
    const lines = parsed.data.lines.map(calculateLine);
    await db.transaction(async (tx) => {
      const [bill] = await tx.insert(purchaseBillsTable).values({
        siteId: parsed.data.siteId,
        counterpartyId: parsed.data.counterpartyId,
        billedAt: asDateString(parsed.data.billedAt)!,
        dueAt: asDateString(parsed.data.dueAt)!,
        memo: parsed.data.memo,
      }).returning();
      billId = bill.id;
      await tx.insert(purchaseBillLinesTable).values(lines.map((line) => ({ ...line, billId })));
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "仕入を登録できませんでした" });
    return;
  }
  const [bill] = await loadPurchaseBills(billId);
  res.status(201).json(CreatePurchaseBillResponse.parse(bill));
});

router.patch("/purchase-bills/:id", async (req, res): Promise<void> => {
  const params = UpdatePurchaseBillParams.safeParse(req.params);
  const body = UpdatePurchaseBillBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  const [existing] = await loadPurchaseBills(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "仕入が見つかりません" });
    return;
  }
  const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.id, body.data.siteId)).limit(1);
  if (!site || !(await isSupplierCounterparty(body.data.counterpartyId))) {
    res.status(400).json({ error: "現場と支払先を確認してください" });
    return;
  }
  try {
    const lines = body.data.lines.map(calculateLine);
    const newGross = lines.reduce((sum, line) => sum + line.grossAmount, 0);
    if (newGross < existing.paidAmount) {
      res.status(409).json({ error: "支払い済み金額より小さくなるよう変更できません" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(purchaseBillsTable).set({
        siteId: body.data.siteId,
        counterpartyId: body.data.counterpartyId,
        billedAt: asDateString(body.data.billedAt)!,
        dueAt: asDateString(body.data.dueAt)!,
        memo: body.data.memo,
        updatedAt: new Date(),
      }).where(eq(purchaseBillsTable.id, params.data.id));
      await tx.delete(purchaseBillLinesTable).where(eq(purchaseBillLinesTable.billId, params.data.id));
      await tx.insert(purchaseBillLinesTable).values(lines.map((line) => ({ ...line, billId: params.data.id })));
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "仕入を更新できませんでした" });
    return;
  }
  const [updated] = await loadPurchaseBills(params.data.id);
  res.json(UpdatePurchaseBillResponse.parse(updated));
});

router.delete("/purchase-bills/:id", async (req, res): Promise<void> => {
  const params = DeletePurchaseBillParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(purchaseBillsTable).where(eq(purchaseBillsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "仕入が見つかりません" });
    return;
  }
  res.sendStatus(204);
});

router.post("/purchase-bills/:id/payments", async (req, res): Promise<void> => {
  const params = CreateSupplierPaymentParams.safeParse(req.params);
  const body = CreateSupplierPaymentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "入力内容を確認してください";
    res.status(400).json({ error: message });
    return;
  }
  const [bill] = await loadPurchaseBills(params.data.id);
  if (!bill) {
    res.status(404).json({ error: "仕入が見つかりません" });
    return;
  }
  if (body.data.amount > bill.outstandingAmount) {
    res.status(400).json({ error: "支払額が未払い残高を超えています" });
    return;
  }
  const [payment] = await db.insert(supplierPaymentsTable).values({
    billId: params.data.id,
    paidAt: asDateString(body.data.paidAt)!,
    amount: body.data.amount,
    memo: body.data.memo,
  }).returning();
  res.status(201).json(CreateSupplierPaymentResponse.parse(payment));
});

router.delete("/supplier-payments/:id", async (req, res): Promise<void> => {
  const params = DeleteSupplierPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(supplierPaymentsTable).where(eq(supplierPaymentsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "支払い記録が見つかりません" });
    return;
  }
  res.sendStatus(204);
});

router.get("/site-finances", async (_req, res): Promise<void> => {
  res.json(GetSiteFinancesResponse.parse(await loadSiteFinanceRows()));
});

router.get("/cashflow", async (req, res): Promise<void> => {
  const parsed = GetCashflowQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = asDateString(parsed.data.from)!;
  const to = asDateString(parsed.data.to)!;
  if (from > to) {
    res.status(400).json({ error: "期間の開始日と終了日を確認してください" });
    return;
  }
  const [invoices, bills] = await Promise.all([loadSalesInvoices(), loadPurchaseBills()]);
  const events = [
    ...invoices
      .filter((invoice) => invoice.outstandingAmount > 0 && invoice.expectedPaymentAt && isWithin(invoice.expectedPaymentAt, from, to))
      .map((invoice) => ({
        date: invoice.expectedPaymentAt!,
        direction: "incoming" as const,
        amount: invoice.outstandingAmount,
        siteName: invoice.siteName,
        counterpartyName: invoice.counterpartyName,
        description: invoice.memo || `請求 #${invoice.id}`,
      })),
    ...bills
      .filter((bill) => bill.outstandingAmount > 0 && isWithin(bill.dueAt, from, to))
      .map((bill) => ({
        date: bill.dueAt,
        direction: "outgoing" as const,
        amount: bill.outstandingAmount,
        siteName: bill.siteName,
        counterpartyName: bill.counterpartyName,
        description: bill.memo || `仕入 #${bill.id}`,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const periods = new Map<string, { startDate: string; endDate: string; incoming: number; outgoing: number; events: typeof events }>();
  for (const event of events) {
    const date = new Date(`${event.date}T00:00:00.000Z`);
    let start: string;
    let end: string;
    if (parsed.data.groupBy === "month") {
      start = `${event.date.slice(0, 7)}-01`;
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      end = `${event.date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    } else {
      const startDate = new Date(date);
      const weekday = (startDate.getUTCDay() + 6) % 7;
      startDate.setUTCDate(startDate.getUTCDate() - weekday);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6);
      start = startDate.toISOString().slice(0, 10);
      end = endDate.toISOString().slice(0, 10);
    }
    const period = periods.get(start) ?? { startDate: start, endDate: end, incoming: 0, outgoing: 0, events: [] };
    if (event.direction === "incoming") period.incoming += event.amount;
    else period.outgoing += event.amount;
    period.events.push(event);
    periods.set(start, period);
  }
  const response = [...periods.values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((period) => ({ ...period, net: period.incoming - period.outgoing }));
  res.json(GetCashflowResponse.parse(response));
});

router.get("/export.csv", async (req, res): Promise<void> => {
  const parsed = ExportCsvQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = asDateString(parsed.data.from) ?? undefined;
  const to = asDateString(parsed.data.to) ?? undefined;
  if (from && to && from > to) {
    res.status(400).json({ error: "期間の開始日と終了日を確認してください" });
    return;
  }
  const [invoices, bills] = await Promise.all([loadSalesInvoices(), loadPurchaseBills()]);
  const rows = ["日付,取引先,現場,摘要,税抜,消費税,税込,区分"];
  for (const invoice of invoices) {
    const date = invoice.issuedAt ?? invoice.createdAt.toISOString().slice(0, 10);
    if (isWithin(date, from, to)) {
      rows.push(eventRow(date, invoice.counterpartyName, invoice.siteName, `${invoice.issuedAt ? "請求" : "未請求"}${invoice.memo ? `：${invoice.memo}` : ` #${invoice.id}`}`, invoice.netAmount, invoice.taxAmount, invoice.grossAmount, "売上"));
    }
    const gross = invoice.grossAmount || 1;
    let receivedBefore = 0;
    for (const receipt of invoice.receipts) {
      const tax = Math.round(((receivedBefore + receipt.amount) * invoice.taxAmount) / gross) - Math.round((receivedBefore * invoice.taxAmount) / gross);
      receivedBefore += receipt.amount;
      if (!isWithin(receipt.receivedAt, from, to)) continue;
      rows.push(eventRow(receipt.receivedAt, invoice.counterpartyName, invoice.siteName, `入金${receipt.memo ? `：${receipt.memo}` : ` #${invoice.id}`}`, receipt.amount - tax, tax, receipt.amount, "売上"));
    }
  }
  for (const bill of bills) {
    if (isWithin(bill.billedAt, from, to)) {
      rows.push(eventRow(bill.billedAt, bill.counterpartyName, bill.siteName, `仕入${bill.memo ? `：${bill.memo}` : ` #${bill.id}`}`, bill.netAmount, bill.taxAmount, bill.grossAmount, "仕入"));
    }
    const gross = bill.grossAmount || 1;
    let paidBefore = 0;
    for (const payment of bill.payments) {
      const tax = Math.round(((paidBefore + payment.amount) * bill.taxAmount) / gross) - Math.round((paidBefore * bill.taxAmount) / gross);
      paidBefore += payment.amount;
      if (!isWithin(payment.paidAt, from, to)) continue;
      rows.push(eventRow(payment.paidAt, bill.counterpartyName, bill.siteName, `支払い${payment.memo ? `：${payment.memo}` : ` #${bill.id}`}`, payment.amount - tax, tax, payment.amount, "仕入"));
    }
  }
  res
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", 'attachment; filename="site-cashflow.csv"')
    .send(`\uFEFF${rows.join("\r\n")}`);
});

export default router;
