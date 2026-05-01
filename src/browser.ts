/**
 * Strider Labs - Instacart Browser Automation
 *
 * Playwright-based browser automation for Instacart operations.
 */

import * as fs from "fs";
import { chromium, BrowserContext, Page } from "patchright";
import {
  saveCookies,
  saveSessionInfo,
  loadSessionInfo,
  loadEnvVarAuth,
  BROWSER_PROFILE_DIR,
  type SessionInfo,
} from "./auth.js";

const INSTACART_BASE_URL = "https://www.instacart.com";
const DEFAULT_TIMEOUT = 60000;

// Singleton persistent-context instance
let context: BrowserContext | null = null;
let page: Page | null = null;

export interface ProductResult {
  name: string;
  price: string;
  pricePerUnit?: string;
  quantity?: string;
  imageUrl?: string;
  productId?: string;
  storeName?: string;
  inStock: boolean;
}

export interface CartItem {
  name: string;
  quantity: number;
  price: string;
  productId?: string;
}

export interface CartSummary {
  items: CartItem[];
  subtotal: string;
  deliveryFee?: string;
  serviceFee?: string;
  tax?: string;
  total: string;
  itemCount: number;
}

export interface OrderConfirmation {
  orderId: string;
  estimatedDelivery: string;
  total: string;
  storeName: string;
}

/**
 * Initialize browser using a persistent profile so login state survives across
 * MCP server restarts.  Set INSTACART_HEADLESS=false to show the browser window
 * (required on first run so the user can complete the login flow manually).
 */
async function initBrowser(): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page) {
    return { context, page };
  }

  const headless = process.env.INSTACART_HEADLESS !== "false";

  // Ensure the profile directory exists before launching
  fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

  context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  // Inject env var auth cookies if present
  const envVarCookies = loadEnvVarAuth();
  if (envVarCookies) {
    await context.addCookies(envVarCookies);
    console.error(`[mcp-instacart] Loaded ${envVarCookies.length} auth cookie(s) from environment variables`);
  }

  page = await context.newPage();

  // Mask webdriver detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { context, page };
}

/**
 * Close browser context (profile data is persisted automatically)
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
  }
}

/**
 * Check authentication status using positive detection: visit /account and
 * confirm the page resolves without being redirected to the login flow.
 * Falls back to trying the internal user API to retrieve the email address.
 */
export async function checkLoginStatus(): Promise<SessionInfo> {
  const usingEnvVarAuth = !!(process.env.INSTACART_AUTH_TOKEN || process.env.INSTACART_SESSION_ID);
  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/account`, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    // Positive check: authenticated users land on /account; unauthenticated
    // users are redirected to /login or /authentication.
    const isLoggedIn =
      !finalUrl.includes("/login") && !finalUrl.includes("/authentication");

    let userEmail: string | undefined;
    if (isLoggedIn) {
      // Try the internal user API available to authenticated sessions
      try {
        const userData = await page.evaluate(async () => {
          const r = await fetch("/v3/user", { credentials: "include" });
          if (!r.ok) return null;
          return r.json();
        });
        userEmail =
          userData?.user?.email ||
          userData?.email ||
          undefined;
      } catch {
        // Non-critical — email is optional
      }

      // Fallback: look for email text in the account page
      if (!userEmail) {
        const emailEl = await page.$('[class*="email"], [data-testid*="email"]');
        if (emailEl) {
          userEmail = (await emailEl.textContent())?.trim() || undefined;
        }
      }
    }

    // Get current zip from the address selector if present
    const addressButton = await page.$('button[aria-label*="address"]');
    let zipCode: string | undefined;
    if (addressButton) {
      const addressText = await addressButton.textContent();
      const zipMatch = addressText?.match(/\d{5}/);
      zipCode = zipMatch ? zipMatch[0] : undefined;
    }

    const sessionInfo: SessionInfo = {
      isLoggedIn: isLoggedIn || usingEnvVarAuth,
      userEmail,
      lastUpdated: new Date().toISOString(),
      zipCode,
      storeName: undefined,
    };

    saveSessionInfo(sessionInfo);
    return sessionInfo;
  } catch (error) {
    throw new Error(`Failed to check login status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initiate login flow.
 *
 * With INSTACART_HEADLESS=false the persistent browser will be visible so the
 * user can log in directly inside it.  Subsequent runs (with headless=true)
 * will reuse the saved profile and remain authenticated.
 */
export async function initiateLogin(): Promise<{ loginUrl: string; instructions: string }> {
  const { page } = await initBrowser();
  const headless = process.env.INSTACART_HEADLESS !== "false";

  try {
    await page.goto(`${INSTACART_BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });

    const instructions = headless
      ? "The MCP server is running in headless mode.\n\n" +
        "To log in:\n" +
        "1. Stop the MCP server\n" +
        "2. Set INSTACART_HEADLESS=false in your MCP server config\n" +
        "3. Restart the server — a visible browser window will open\n" +
        "4. Complete the Instacart login in that window\n" +
        "5. Once logged in, revert INSTACART_HEADLESS (or remove it) and restart\n" +
        "   The login session is stored in the browser profile and will persist."
      : "A browser window has opened.\n\n" +
        "1. Complete the Instacart login in the browser window\n" +
        "2. Once logged in, run instacart_status to verify the session\n\n" +
        "Your login will be saved to the persistent browser profile so future\n" +
        "headless runs stay authenticated automatically.";

    return {
      loginUrl: `${INSTACART_BASE_URL}/login`,
      instructions,
    };
  } catch (error) {
    throw new Error(`Failed to initiate login: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Search for products on Instacart
 */
export async function searchProducts(query: string, maxResults: number = 10): Promise<ProductResult[]> {
  const { page } = await initBrowser();

  try {
    const searchUrl = `${INSTACART_BASE_URL}/store/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });

    // Wait for product results to load - Instacart uses li elements with data-testid starting with "item_list_item_items_"
    // Fallback to legacy selectors for compatibility
    await page.waitForSelector('li[data-testid^="item_list_item_items_"], [role="group"][aria-label*="product card"]', {
      timeout: 15000,
    }).catch(() => {
      // No products found
    });

    // Give extra time for dynamic content
    await page.waitForTimeout(2000);

    // Extract product data using current Instacart DOM structure (April 2026)
    const products = await page.evaluate((max: number) => {
      const results: ProductResult[] = [];

      // Primary selector: modern Instacart DOM uses li with data-testid="item_list_item_items_*"
      let productItems = document.querySelectorAll('li[data-testid^="item_list_item_items_"]');

      // Fallback to legacy selector if modern selector returns nothing
      if (productItems.length === 0) {
        productItems = document.querySelectorAll('[role="group"][aria-label*="product card"]');
      }

      // Broader fallback: article elements that contain a price and an add button
      if (productItems.length === 0) {
        const articles = document.querySelectorAll('article');
        const matching = Array.from(articles).filter((el) => {
          const text = el.textContent || '';
          const hasPrice = /\$\d+\.\d{2}/.test(text);
          const hasAddBtn = !!el.querySelector('button[aria-label*="add" i], button[aria-label*="Add"]');
          return hasPrice && hasAddBtn;
        });
        if (matching.length > 0) {
          productItems = matching as unknown as NodeListOf<Element>;
        }
      }

      productItems.forEach((item, index) => {
        if (index >= max) return;

        // Try multiple approaches to extract product name
        let name = '';

        // Modern: Look for product name in aria-label of Add button or in heading/span elements
        const addButton = item.querySelector('button[aria-label^="Add "]');
        if (addButton) {
          const ariaLabel = addButton.getAttribute('aria-label') || '';
          // aria-label format: "Add 1, Product Name, $X.XX, ..."
          const parts = ariaLabel.split(',');
          if (parts.length >= 2) {
            name = parts[1].trim();
          }
        }

        // Fallback: Look for product name in common text containers
        if (!name) {
          const nameEl = item.querySelector('[data-testid*="name"], [class*="ItemName"], h3, h4');
          name = nameEl?.textContent?.trim() || '';
        }

        // Legacy fallback: aria-label on group element
        if (!name) {
          const ariaLabel = item.getAttribute('aria-label') || '';
          name = ariaLabel.replace(' product card', '').trim();
        }

        // Get the full text content for price extraction
        const textContent = item.textContent || '';

        // Extract price - look for common patterns
        let price = '';
        // Pattern 1: "Current price: $X.XX"
        const currentPriceMatch = textContent.match(/Current price:?\s*\$?([\d.]+)/i);
        // Pattern 2: Just "$X.XX" (most common)
        const simplePriceMatch = textContent.match(/\$([\d]+\.[\d]{2})/);

        if (currentPriceMatch) {
          price = `$${currentPriceMatch[1]}`;
        } else if (simplePriceMatch) {
          price = `$${simplePriceMatch[1]}`;
        }

        // Extract price per unit: "$X.XX / lb" or "$X.XX/lb" or similar
        const perUnitMatch = textContent.match(/\$([\d.]+)\s*\/?\s*(lb|oz|ct|each|ea)/i);
        const pricePerUnit = perUnitMatch ? `$${perUnitMatch[1]} / ${perUnitMatch[2]}` : undefined;

        // Extract quantity info like "16 oz", "1.7 oz", "1 lb" etc.
        const quantityMatch = textContent.match(/(\d+(?:\.\d+)?\s*(?:oz|lb|ct|fl oz|gal|pt|qt))/i);
        const quantity = quantityMatch ? quantityMatch[1].trim() : undefined;

        // Find image
        const imageEl = item.querySelector('img') as HTMLImageElement;

        // Get store name - look for retailer info in parent or sibling elements
        let storeName: string | undefined;
        const retailerEl = item.querySelector('[data-testid*="retailer"], [aria-label="retailer"] h3');
        if (retailerEl) {
          storeName = retailerEl.textContent?.trim();
        } else {
          // Try finding retailer in parent context
          const parentSection = item.closest('section, [data-testid*="store"]');
          const storeNameEl = parentSection?.querySelector('h2, h3, [data-testid*="store-name"]');
          storeName = storeNameEl?.textContent?.trim();
        }

        // Check for out of stock indicators
        const outOfStock = textContent.toLowerCase().includes('out of stock') ||
                          textContent.toLowerCase().includes('unavailable') ||
                          textContent.toLowerCase().includes('sold out');

        if (name) {
          results.push({
            name,
            price,
            pricePerUnit,
            quantity,
            imageUrl: imageEl?.src || undefined,
            storeName,
            inStock: !outOfStock,
          });
        }
      });

      return results;
    }, maxResults);

    return products;
  } catch (error) {
    throw new Error(`Failed to search products: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add item to cart
 */
export async function addToCart(productQuery: string, quantity: number = 1): Promise<{ success: boolean; message: string; cartCount?: number }> {
  const { page } = await initBrowser();

  try {
    // First search for the product
    const searchUrl = `${INSTACART_BASE_URL}/store/search/${encodeURIComponent(productQuery)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });

    // Wait for results - modern selector uses li with data-testid, fallback to legacy
    await page.waitForSelector('li[data-testid^="item_list_item_items_"], [role="group"][aria-label*="product card"]', {
      timeout: 15000,
    });

    await page.waitForTimeout(2000);

    // Find the first "Add" button - modern Instacart uses aria-label starting with "Add "
    // Pattern: "Add 1, Banana, $0.25, each" or similar
    let addButton = await page.$('button[aria-label^="Add "]');

    // Fallback to legacy patterns if modern selector fails
    if (!addButton) {
      addButton = await page.$('button[aria-label*="Add 1"]');
    }

    if (!addButton) {
      // Last resort: look for any button containing "Add" text
      const fallbackAddButton = await page.$('button:has-text("Add")');
      if (fallbackAddButton) {
        await fallbackAddButton.click();
      } else {
        throw new Error("No products found for query or could not find Add button");
      }
    } else {
      await addButton.click();
    }

    await page.waitForTimeout(1500);

    // Verify item was actually added: wait up to 3s for a toast notification or cart count change
    const confirmed = await Promise.race([
      page.waitForSelector('[data-testid*="toast"], [class*="toast" i], [role="status"]', { timeout: 3000 })
        .then(() => true).catch(() => false),
      page.waitForSelector('button[aria-label*="View Cart"]', { timeout: 3000 })
        .then(async (btn) => {
          const label = await btn?.getAttribute('aria-label');
          return !!(label && /\d/.test(label));
        }).catch(() => false),
    ]);

    if (!confirmed) {
      // Try alternative add-to-cart selectors introduced in May 2026 redesign
      const altButton = await page.$('[data-testid*="add-to-cart"], button[aria-label*="add" i]');
      if (altButton) {
        await altButton.click();
        await page.waitForTimeout(1000);
      }
    }

    // Handle quantity if more than 1
    if (quantity > 1) {
      for (let i = 1; i < quantity; i++) {
        const incrementButton = await page.$('button[aria-label*="Increase"], button[aria-label*="increase"], button[aria-label*="Add 1 more"]');
        if (incrementButton) {
          await incrementButton.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Get current cart count from the cart button
    const cartButton = await page.$('button[aria-label*="View Cart"]');
    let cartCount: number | undefined;
    if (cartButton) {
      const cartLabel = await cartButton.getAttribute('aria-label');
      const countMatch = cartLabel?.match(/Items in cart: (\d+)/);
      cartCount = countMatch ? parseInt(countMatch[1], 10) : undefined;
    }

    return {
      success: true,
      message: `Added ${quantity}x "${productQuery}" to cart`,
      cartCount,
    };
  } catch (error) {
    throw new Error(`Failed to add to cart: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * View current cart
 */
export async function viewCart(): Promise<CartSummary> {
  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });

    // Wait for cart to load
    await page.waitForTimeout(2000);

    // Check for empty cart
    const emptyCart = await page.$('[class*="empty-cart"], [data-testid="empty-cart"], :text("Your cart is empty")');
    if (emptyCart) {
      return {
        items: [],
        subtotal: "$0.00",
        total: "$0.00",
        itemCount: 0,
      };
    }

    // Extract cart items
    const cartData = await page.evaluate(() => {
      const items: CartItem[] = [];
      const cartItems = document.querySelectorAll('[data-testid="cart-item"], [class*="CartItem"], [class*="cart-item"]');

      cartItems.forEach((item) => {
        const nameEl = item.querySelector('[data-testid="item-name"], [class*="ItemName"], .item-name');
        const priceEl = item.querySelector('[data-testid="item-price"], [class*="ItemPrice"], .item-price');
        const qtyEl = item.querySelector('[data-testid="quantity"], [class*="Quantity"], input[type="number"]');

        const name = nameEl?.textContent?.trim() || "Unknown Item";
        const price = priceEl?.textContent?.trim() || "$0.00";
        const quantity = qtyEl ? parseInt((qtyEl as HTMLInputElement).value || qtyEl.textContent || "1", 10) : 1;

        items.push({ name, quantity, price });
      });

      // Get totals
      const subtotalEl = document.querySelector('[data-testid="subtotal"], [class*="Subtotal"], :text("Subtotal")');
      const totalEl = document.querySelector('[data-testid="total"], [class*="Total"]:not([class*="Subtotal"]), :text("Total")');
      const deliveryEl = document.querySelector('[data-testid="delivery-fee"], [class*="DeliveryFee"]');
      const serviceEl = document.querySelector('[data-testid="service-fee"], [class*="ServiceFee"]');
      const taxEl = document.querySelector('[data-testid="tax"], [class*="Tax"]');

      const extractPrice = (el: Element | null): string => {
        if (!el) return "";
        const text = el.textContent || "";
        const match = text.match(/\$[\d.]+/);
        return match ? match[0] : "";
      };

      return {
        items,
        subtotal: extractPrice(subtotalEl) || "$0.00",
        deliveryFee: extractPrice(deliveryEl) || undefined,
        serviceFee: extractPrice(serviceEl) || undefined,
        tax: extractPrice(taxEl) || undefined,
        total: extractPrice(totalEl) || "$0.00",
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      };
    });

    return cartData;
  } catch (error) {
    throw new Error(`Failed to view cart: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clear cart (remove all items)
 */
export async function clearCart(): Promise<{ success: boolean; message: string }> {
  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    let itemsRemoved = 0;
    while (true) {
      const removeButton = await page.$('[data-testid="remove-item"], button:has-text("Remove"), [aria-label*="remove"]');
      if (!removeButton) break;

      await removeButton.click();
      await page.waitForTimeout(500);
      itemsRemoved++;

      if (itemsRemoved > 100) break;
    }

    return {
      success: true,
      message: itemsRemoved > 0 ? `Removed ${itemsRemoved} items from cart` : "Cart was already empty",
    };
  } catch (error) {
    throw new Error(`Failed to clear cart: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Preview order (get order summary without placing)
 */
export async function previewOrder(): Promise<{
  canPlace: boolean;
  summary: CartSummary;
  deliveryWindow?: string;
  address?: string;
  issues?: string[];
}> {
  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    const cart = await viewCart();
    const issues: string[] = [];

    const loginRequired = await page.$('[data-testid="login-prompt"], button:has-text("Log in to checkout")');
    if (loginRequired) {
      issues.push("Login required to place order");
    }

    const paymentRequired = await page.$('[data-testid="add-payment"], :text("Add payment method")');
    if (paymentRequired) {
      issues.push("Payment method required");
    }

    const addressRequired = await page.$('[data-testid="add-address"], :text("Add delivery address")');
    if (addressRequired) {
      issues.push("Delivery address required");
    }

    const deliveryEl = await page.$('[data-testid="delivery-window"], [class*="DeliveryWindow"]');
    const deliveryWindow = deliveryEl ? await deliveryEl.textContent() : undefined;

    const addressEl = await page.$('[data-testid="delivery-address"], [class*="DeliveryAddress"]');
    const address = addressEl ? await addressEl.textContent() : undefined;

    const canPlace = issues.length === 0 && cart.itemCount > 0;

    return {
      canPlace,
      summary: cart,
      deliveryWindow: deliveryWindow?.trim(),
      address: address?.trim(),
      issues: issues.length > 0 ? issues : undefined,
    };
  } catch (error) {
    throw new Error(`Failed to preview order: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Place order (requires explicit confirmation)
 */
export async function placeOrder(confirmPlacement: boolean): Promise<OrderConfirmation | { requiresConfirmation: true; preview: Awaited<ReturnType<typeof previewOrder>> }> {
  if (!confirmPlacement) {
    const preview = await previewOrder();
    return {
      requiresConfirmation: true,
      preview,
    };
  }

  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    const preview = await previewOrder();
    if (!preview.canPlace) {
      throw new Error(`Cannot place order: ${preview.issues?.join(", ") || "Unknown issue"}`);
    }

    const placeOrderButton = await page.$(
      '[data-testid="place-order"], button:has-text("Place order"), button:has-text("Submit order")'
    );

    if (!placeOrderButton) {
      throw new Error("Could not find place order button");
    }

    await placeOrderButton.click();

    await page.waitForURL(/\/orders\/|\/confirmation/, { timeout: 30000 });
    await page.waitForTimeout(2000);

    const confirmation = await page.evaluate(() => {
      const orderIdEl = document.querySelector('[data-testid="order-id"], [class*="OrderId"]');
      const deliveryEl = document.querySelector('[data-testid="estimated-delivery"], [class*="EstimatedDelivery"]');
      const totalEl = document.querySelector('[data-testid="order-total"], [class*="OrderTotal"]');
      const storeEl = document.querySelector('[data-testid="store-name"], [class*="StoreName"]');

      return {
        orderId: orderIdEl?.textContent?.trim() || "Unknown",
        estimatedDelivery: deliveryEl?.textContent?.trim() || "Unknown",
        total: totalEl?.textContent?.trim() || "Unknown",
        storeName: storeEl?.textContent?.trim() || "Unknown",
      };
    });

    return confirmation;
  } catch (error) {
    throw new Error(`Failed to place order: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Set delivery address/zip code
 */
export async function setDeliveryAddress(address: string): Promise<{ success: boolean; message: string }> {
  const { page } = await initBrowser();

  try {
    await page.goto(INSTACART_BASE_URL, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });

    const addressSelector = await page.$(
      '[data-testid="address-selector"], [aria-label*="delivery address"], [class*="AddressSelector"]'
    );

    if (addressSelector) {
      await addressSelector.click();
      await page.waitForTimeout(500);
    }

    const addressInput = await page.$(
      'input[placeholder*="address"], input[placeholder*="zip"], input[data-testid="address-input"]'
    );

    if (!addressInput) {
      throw new Error("Could not find address input field");
    }

    await addressInput.fill(address);
    await page.waitForTimeout(500);

    const suggestion = await page.$('[data-testid="address-suggestion"], [class*="AddressSuggestion"]');
    if (suggestion) {
      await suggestion.click();
    } else {
      await addressInput.press("Enter");
    }

    await page.waitForTimeout(1000);

    return {
      success: true,
      message: `Delivery address set to: ${address}`,
    };
  } catch (error) {
    throw new Error(`Failed to set delivery address: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get available stores for current location
 */
export async function getAvailableStores(): Promise<{ name: string; deliveryFee?: string; eta?: string }[]> {
  const { page } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store`, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(3000);

    const stores = await page.evaluate(() => {
      const results: { name: string; deliveryFee?: string; eta?: string }[] = [];

      // Modern selector: look for store cards with data-testid or links containing store paths
      let retailerElements = document.querySelectorAll('[data-testid*="store"], [data-testid*="retailer"]');

      // Fallback to legacy selector
      if (retailerElements.length === 0) {
        retailerElements = document.querySelectorAll('[role="group"][aria-label="retailer"]');
      }

      // Additional fallback: look for anchor tags linking to stores
      if (retailerElements.length === 0) {
        retailerElements = document.querySelectorAll('a[href*="/store/"]');
      }

      // Final fallback: store links with aria-label attributes
      if (retailerElements.length === 0) {
        retailerElements = document.querySelectorAll('a[href*="/store/"][aria-label]');
      }

      retailerElements.forEach((el) => {
        // Try multiple approaches to get store name
        let name = '';

        // Modern: Look for heading elements
        const headingEl = el.querySelector('h2, h3, h4, [data-testid*="name"]');
        if (headingEl) {
          name = headingEl.textContent?.trim() || '';
        }

        // Fallback: aria-label or title attribute
        if (!name) {
          name = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        }

        // Last resort: first significant text content
        if (!name && el.textContent) {
          const text = el.textContent.trim();
          // Take first line or first 50 chars
          const firstLine = text.split('\n')[0].trim();
          name = firstLine.substring(0, 50);
        }

        if (!name || name === 'Unknown Store') {
          return; // Skip this element
        }

        const allText = el.textContent || '';

        // Extract delivery time
        const etaMatch = allText.match(/Delivery by (\d{1,2}:\d{2}\s*[ap]m)/i) ||
                        allText.match(/(\d{1,2}:\d{2}\s*[ap]m)/i) ||
                        allText.match(/(in \d+ min)/i);
        const eta = etaMatch ? etaMatch[1] : undefined;

        // Extract distance
        const distanceMatch = allText.match(/([\d.]+\s*mi)/i);
        const distance = distanceMatch ? distanceMatch[1] : undefined;

        // Extract delivery fee
        const feeMatch = allText.match(/(\$[\d.]+)\s*delivery/i) ||
                        allText.match(/delivery[:\s]*(\$[\d.]+)/i) ||
                        allText.match(/Free delivery/i);
        const deliveryFee = feeMatch
          ? (feeMatch[0].toLowerCase().includes('free') ? 'Free' : feeMatch[1])
          : undefined;

        results.push({
          name,
          deliveryFee,
          eta: eta ? `${eta}${distance ? ` • ${distance}` : ''}` : (distance || undefined),
        });
      });

      // Deduplicate by store name
      const seen = new Set<string>();
      return results.filter((store) => {
        if (seen.has(store.name)) return false;
        seen.add(store.name);
        return true;
      });
    });

    return stores;
  } catch (error) {
    throw new Error(`Failed to get available stores: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Ensure browser cleanup on process exit
process.on("exit", () => {
  if (context) {
    context.close().catch(() => {});
  }
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
