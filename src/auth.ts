/**
 * Strider Labs - Instacart Auth/Session Management
 * 
 * Handles cookie persistence and session management for Instacart.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BrowserContext, Cookie } from "patchright";

const CONFIG_DIR = path.join(os.homedir(), ".strider", "instacart");
const COOKIES_FILE = path.join(CONFIG_DIR, "cookies.json");
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");
export const BROWSER_PROFILE_DIR = path.join(CONFIG_DIR, "browser-profile");

export interface SessionInfo {
  isLoggedIn: boolean;
  userEmail?: string;
  lastUpdated: string;
  zipCode?: string;
  storeName?: string;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Save cookies from browser context to disk
 */
export async function saveCookies(context: BrowserContext): Promise<void> {
  ensureConfigDir();
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Load cookies from disk and apply to browser context
 */
export async function loadCookies(context: BrowserContext): Promise<boolean> {
  if (!fs.existsSync(COOKIES_FILE)) {
    return false;
  }

  try {
    const cookiesJson = fs.readFileSync(COOKIES_FILE, "utf-8");
    const cookies: Cookie[] = JSON.parse(cookiesJson);
    
    // Filter out expired cookies
    const now = Date.now() / 1000;
    const validCookies = cookies.filter((c) => !c.expires || c.expires > now);
    
    if (validCookies.length > 0) {
      await context.addCookies(validCookies);
      return true;
    }
  } catch (error) {
    console.error("Failed to load cookies:", error);
  }
  
  return false;
}

/**
 * Save session info to disk
 */
export function saveSessionInfo(info: SessionInfo): void {
  ensureConfigDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(info, null, 2));
}

/**
 * Load session info from disk
 */
export function loadSessionInfo(): SessionInfo | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const sessionJson = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(sessionJson);
  } catch (error) {
    console.error("Failed to load session info:", error);
    return null;
  }
}

/**
 * Clear all saved auth data including browser profile
 */
export function clearAuthData(): void {
  if (fs.existsSync(COOKIES_FILE)) {
    fs.unlinkSync(COOKIES_FILE);
  }
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
  if (fs.existsSync(BROWSER_PROFILE_DIR)) {
    fs.rmSync(BROWSER_PROFILE_DIR, { recursive: true, force: true });
  }
}

/**
 * Check if we have saved cookies (may or may not still be valid)
 */
export function hasSavedCookies(): boolean {
  return fs.existsSync(COOKIES_FILE);
}

/**
 * Get the config directory path (useful for debugging)
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Load auth cookies from environment variables.
 * Supports INSTACART_AUTH_TOKEN and INSTACART_SESSION_ID.
 * Returns an array of Cookie objects ready for context.addCookies(), or null if neither env var is set.
 */
export function loadEnvVarAuth(): Cookie[] | null {
  const authToken = process.env.INSTACART_AUTH_TOKEN;
  const sessionId = process.env.INSTACART_SESSION_ID;

  if (!authToken && !sessionId) {
    return null;
  }

  const cookies: Cookie[] = [];
  const farFuture = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year

  if (authToken) {
    cookies.push({
      name: "instacart_auth_token",
      value: authToken,
      domain: ".instacart.com",
      path: "/",
      expires: farFuture,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  }

  if (sessionId) {
    cookies.push({
      name: "session_token",
      value: sessionId,
      domain: ".instacart.com",
      path: "/",
      expires: farFuture,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  }

  return cookies;
}
