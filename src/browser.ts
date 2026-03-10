/**
 * Strider Labs - Instacart Browser Automation
 * 
 * Playwright-based browser automation for Instacart operations.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import {
  saveCookies,
  loadCookies,
  saveSessionInfo,
  loadSessionInfo,
  hasSavedCookies,
  type SessionInfo,
} from "./auth.js";

const INSTACART_BASE_URL = "https://www.instacart.com";
const DEFAULT_TIMEOUT = 30000;

// Singleton browser instance
let browser: Browser | null = null;
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
 * Initialize browser with stealth settings
 */
async function initBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (browser && context && page) {
    return { browser, context, page };
  }

  browser = await chromium.launch({
    headless: true, // Run headless for MCP server
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  // Load saved cookies if available
  const cookiesLoaded = await loadCookies(context);
  if (cookiesLoaded) {
    console.error("Loaded saved cookies");
  }

  page = await context.newPage();

  // Mask webdriver detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { browser, context, page };
}

/**
 * Close browser and save state
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await saveCookies(context);
  }
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

/**
 * Check if user is logged in
 */
export async function checkLoginStatus(): Promise<SessionInfo> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(INSTACART_BASE_URL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });

    // Look for indicators of logged-in state
    // Instacart shows account icon or user menu when logged in
    const accountButton = await page.$('[data-testid="account-button"], [aria-label*="Account"], [data-testid="user-menu"]');
    
    // Also check for sign-in prompts (indicates not logged in)
    const signInButton = await page.$('button:has-text("Log in"), button:has-text("Sign in"), a:has-text("Log in")');
    
    const isLoggedIn = accountButton !== null && signInButton === null;

    // Try to get user email if logged in
    let userEmail: string | undefined;
    if (isLoggedIn && accountButton) {
      await accountButton.click();
      await page.waitForTimeout(1000);
      const emailElement = await page.$('[data-testid="user-email"], .user-email');
      if (emailElement) {
        userEmail = await emailElement.textContent() || undefined;
      }
      // Close menu by clicking elsewhere
      await page.keyboard.press("Escape");
    }

    // Get current store/zip if visible
    const addressElement = await page.$('[data-testid="address-display"], [aria-label*="delivery address"]');
    const zipCode = addressElement ? await addressElement.textContent() || undefined : undefined;

    const storeElement = await page.$('[data-testid="store-name"], .store-name');
    const storeName = storeElement ? await storeElement.textContent() || undefined : undefined;

    const sessionInfo: SessionInfo = {
      isLoggedIn,
      userEmail,
      lastUpdated: new Date().toISOString(),
      zipCode: zipCode?.match(/\d{5}/)?.[0],
      storeName: storeName?.trim(),
    };

    saveSessionInfo(sessionInfo);
    await saveCookies(context);

    return sessionInfo;
  } catch (error) {
    throw new Error(`Failed to check login status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initiate login flow - returns URL for user to complete login
 */
export async function initiateLogin(): Promise<{ loginUrl: string; instructions: string }> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/login`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });
    await saveCookies(context);

    return {
      loginUrl: `${INSTACART_BASE_URL}/login`,
      instructions:
        "Please log in to Instacart manually:\n" +
        "1. Open the URL in your browser\n" +
        "2. Log in with your Instacart account\n" +
        "3. Once logged in, run 'instacart_status' to verify the session\n\n" +
        "Note: For headless operation, you may need to log in using the visible browser mode first, " +
        "then the session cookies will be saved for future use.",
    };
  } catch (error) {
    throw new Error(`Failed to initiate login: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Search for products on Instacart
 */
export async function searchProducts(query: string, maxResults: number = 10): Promise<ProductResult[]> {
  const { page, context } = await initBrowser();

  try {
    const searchUrl = `${INSTACART_BASE_URL}/store/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });

    // Wait for product results to load
    await page.waitForSelector('[data-testid="product-card"], .product-card, [class*="ProductCard"]', {
      timeout: 10000,
    }).catch(() => {
      // No products found
    });

    // Extract product data
    const products = await page.evaluate((max: number) => {
      const productCards = document.querySelectorAll(
        '[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="product-item"]'
      );
      const results: ProductResult[] = [];

      productCards.forEach((card, index) => {
        if (index >= max) return;

        const nameEl = card.querySelector('[data-testid="product-name"], .product-name, [class*="ProductName"], h2, h3');
        const priceEl = card.querySelector('[data-testid="product-price"], .product-price, [class*="Price"], [class*="price"]');
        const imageEl = card.querySelector('img');
        const outOfStock = card.querySelector('[class*="out-of-stock"], [class*="OutOfStock"], [data-testid="out-of-stock"]');

        const name = nameEl?.textContent?.trim() || "Unknown Product";
        const priceText = priceEl?.textContent?.trim() || "";
        
        // Extract price - look for dollar amounts
        const priceMatch = priceText.match(/\$[\d.]+/);
        const price = priceMatch ? priceMatch[0] : priceText;

        results.push({
          name,
          price,
          pricePerUnit: undefined,
          imageUrl: imageEl?.src || undefined,
          productId: card.getAttribute("data-product-id") || undefined,
          inStock: !outOfStock,
        });
      });

      return results;
    }, maxResults);

    await saveCookies(context);
    return products;
  } catch (error) {
    throw new Error(`Failed to search products: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add item to cart
 */
export async function addToCart(productQuery: string, quantity: number = 1): Promise<{ success: boolean; message: string; cartCount?: number }> {
  const { page, context } = await initBrowser();

  try {
    // First search for the product
    const searchUrl = `${INSTACART_BASE_URL}/store/search/${encodeURIComponent(productQuery)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });

    // Wait for results
    await page.waitForSelector('[data-testid="product-card"], .product-card, [class*="ProductCard"]', {
      timeout: 10000,
    });

    // Click on the first product's add button
    const addButton = await page.$('[data-testid="add-to-cart"], button:has-text("Add"), [class*="AddToCart"]');
    
    if (!addButton) {
      // Try clicking the product card itself first
      const productCard = await page.$('[data-testid="product-card"], .product-card, [class*="ProductCard"]');
      if (productCard) {
        await productCard.click();
        await page.waitForTimeout(1000);
        
        // Now look for add button on product detail page
        const detailAddButton = await page.waitForSelector(
          'button:has-text("Add to cart"), [data-testid="add-to-cart-button"]',
          { timeout: 5000 }
        ).catch(() => null);
        
        if (detailAddButton) {
          await detailAddButton.click();
        } else {
          throw new Error("Could not find add to cart button");
        }
      } else {
        throw new Error("No products found for query");
      }
    } else {
      await addButton.click();
    }

    await page.waitForTimeout(1000);

    // Handle quantity if more than 1
    if (quantity > 1) {
      for (let i = 1; i < quantity; i++) {
        const incrementButton = await page.$('[data-testid="increment-quantity"], button:has-text("+"), [aria-label*="increase"]');
        if (incrementButton) {
          await incrementButton.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // Get current cart count
    const cartBadge = await page.$('[data-testid="cart-count"], .cart-badge, [class*="CartCount"]');
    const cartCountText = cartBadge ? await cartBadge.textContent() : null;
    const cartCount = cartCountText ? parseInt(cartCountText, 10) : undefined;

    await saveCookies(context);

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
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });

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

    await saveCookies(context);
    return cartData;
  } catch (error) {
    throw new Error(`Failed to view cart: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clear cart (remove all items)
 */
export async function clearCart(): Promise<{ success: boolean; message: string }> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    // Find and click remove buttons for all items
    let itemsRemoved = 0;
    while (true) {
      const removeButton = await page.$('[data-testid="remove-item"], button:has-text("Remove"), [aria-label*="remove"]');
      if (!removeButton) break;

      await removeButton.click();
      await page.waitForTimeout(500);
      itemsRemoved++;

      // Safety limit
      if (itemsRemoved > 100) break;
    }

    await saveCookies(context);

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
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    const cart = await viewCart();
    const issues: string[] = [];

    // Check for common issues
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

    // Get delivery window if available
    const deliveryEl = await page.$('[data-testid="delivery-window"], [class*="DeliveryWindow"]');
    const deliveryWindow = deliveryEl ? await deliveryEl.textContent() : undefined;

    // Get address if available
    const addressEl = await page.$('[data-testid="delivery-address"], [class*="DeliveryAddress"]');
    const address = addressEl ? await addressEl.textContent() : undefined;

    const canPlace = issues.length === 0 && cart.itemCount > 0;

    await saveCookies(context);

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

  const { page, context } = await initBrowser();

  try {
    // Navigate to checkout
    await page.goto(`${INSTACART_BASE_URL}/store/checkout`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    // Verify we can place order
    const preview = await previewOrder();
    if (!preview.canPlace) {
      throw new Error(`Cannot place order: ${preview.issues?.join(", ") || "Unknown issue"}`);
    }

    // Click place order button
    const placeOrderButton = await page.$(
      '[data-testid="place-order"], button:has-text("Place order"), button:has-text("Submit order")'
    );

    if (!placeOrderButton) {
      throw new Error("Could not find place order button");
    }

    await placeOrderButton.click();

    // Wait for confirmation page
    await page.waitForURL(/\/orders\/|\/confirmation/, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Extract order confirmation details
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

    await saveCookies(context);

    return confirmation;
  } catch (error) {
    throw new Error(`Failed to place order: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Set delivery address/zip code
 */
export async function setDeliveryAddress(address: string): Promise<{ success: boolean; message: string }> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(INSTACART_BASE_URL, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });

    // Click on address selector
    const addressSelector = await page.$(
      '[data-testid="address-selector"], [aria-label*="delivery address"], [class*="AddressSelector"]'
    );

    if (addressSelector) {
      await addressSelector.click();
      await page.waitForTimeout(500);
    }

    // Find address input
    const addressInput = await page.$(
      'input[placeholder*="address"], input[placeholder*="zip"], input[data-testid="address-input"]'
    );

    if (!addressInput) {
      throw new Error("Could not find address input field");
    }

    await addressInput.fill(address);
    await page.waitForTimeout(500);

    // Select first suggestion
    const suggestion = await page.$('[data-testid="address-suggestion"], [class*="AddressSuggestion"]');
    if (suggestion) {
      await suggestion.click();
    } else {
      // Try pressing Enter
      await addressInput.press("Enter");
    }

    await page.waitForTimeout(1000);
    await saveCookies(context);

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
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${INSTACART_BASE_URL}/store`, { waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);

    const stores = await page.evaluate(() => {
      const storeCards = document.querySelectorAll(
        '[data-testid="store-card"], [class*="StoreCard"], [class*="retailer-card"]'
      );
      const results: { name: string; deliveryFee?: string; eta?: string }[] = [];

      storeCards.forEach((card) => {
        const nameEl = card.querySelector('[data-testid="store-name"], [class*="StoreName"], h2, h3');
        const feeEl = card.querySelector('[data-testid="delivery-fee"], [class*="DeliveryFee"]');
        const etaEl = card.querySelector('[data-testid="delivery-eta"], [class*="DeliveryEta"]');

        results.push({
          name: nameEl?.textContent?.trim() || "Unknown Store",
          deliveryFee: feeEl?.textContent?.trim() || undefined,
          eta: etaEl?.textContent?.trim() || undefined,
        });
      });

      return results;
    });

    await saveCookies(context);
    return stores;
  } catch (error) {
    throw new Error(`Failed to get available stores: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Ensure browser cleanup on process exit
process.on("exit", () => {
  if (browser) {
    browser.close().catch(() => {});
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
