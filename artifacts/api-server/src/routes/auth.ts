import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, adminCredentialsTable } from "@workspace/db";
import {
  GetAuthStatusResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  SetupPasswordBody,
  SetupPasswordResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "field_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 14;
const attempts = new Map<string, { count: number; since: number }>();

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured");
  return secret;
}

function signature(expiration: string): string {
  return createHmac("sha256", sessionSecret()).update(expiration).digest("base64url");
}

function cookieValue(req: Request): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const prefix = `${COOKIE_NAME}=`;
  return cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix))?.slice(prefix.length);
}

function isAuthenticated(req: Request): boolean {
  const token = cookieValue(req);
  if (!token) return false;
  const [expiration, receivedSignature] = token.split(".");
  if (!expiration || !receivedSignature || !/^\d+$/.test(expiration)) return false;
  if (Number(expiration) <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(expiration));
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function setSession(res: Response): void {
  const expiration = String(Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS);
  res.cookie(COOKIE_NAME, `${expiration}.${signature(expiration)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: SESSION_LIFETIME_SECONDS * 1000,
  });
}

function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function requestKey(req: Request): string {
  return req.ip ?? "unknown";
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  const key = requestKey(req);
  const current = attempts.get(key);
  if (!current || now - current.since > 15 * 60 * 1000) {
    attempts.set(key, { count: 1, since: now });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

async function authStatus(): Promise<{ configured: boolean; authenticated: boolean }> {
  const [credential] = await db.select({ id: adminCredentialsTable.id }).from(adminCredentialsTable).limit(1);
  return { configured: Boolean(credential), authenticated: false };
}

router.get("/auth/status", async (req, res): Promise<void> => {
  const status = await authStatus();
  status.authenticated = isAuthenticated(req);
  res.json(GetAuthStatusResponse.parse(status));
});

router.post("/auth/setup", async (req, res): Promise<void> => {
  const parsed = SetupPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select({ id: adminCredentialsTable.id }).from(adminCredentialsTable).limit(1);
  if (existing) {
    res.status(409).json({ error: "初回設定はすでに完了しています" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  await db
    .insert(adminCredentialsTable)
    .values({ id: 1, passwordHash })
    .onConflictDoNothing();
  const [credential] = await db.select().from(adminCredentialsTable).limit(1);
  if (!credential || !(await verifyPassword(parsed.data.password, credential.passwordHash))) {
    res.status(409).json({ error: "別の端末で初回設定が完了しました。ログインしてください" });
    return;
  }
  setSession(res);
  res.json(SetupPasswordResponse.parse({ configured: true, authenticated: true }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (isRateLimited(req)) {
    res.status(429).json({ error: "試行回数が多すぎます。しばらくしてから再度お試しください" });
    return;
  }
  const [credential] = await db.select().from(adminCredentialsTable).limit(1);
  if (!credential || !(await verifyPassword(parsed.data.password, credential.passwordHash))) {
    res.status(401).json({ error: "パスワードが正しくありません" });
    return;
  }
  attempts.delete(requestKey(req));
  setSession(res);
  res.json(LoginResponse.parse({ configured: true, authenticated: true }));
});

router.post("/auth/logout", (_req, res): void => {
  clearSession(res);
  res.json(LogoutResponse.parse({ configured: true, authenticated: false }));
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "ログインしてください" });
    return;
  }
  next();
}

export default router;
