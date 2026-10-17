/**
 * A minimal fake shop behind a fake Playwright `Page`, for the integration
 * test. One product page; "add to cart" is rejected with a required-option
 * error unless a size was selected first (mirrors the PRD demo task).
 */
import type { Page } from "playwright-core";

import type { EvaluatorResult } from "../../lib/execution/types.js";

export const SHOP_HOME = "http://shop.test/";
export const PRODUCT_URL = "http://shop.test/running-shorts";
export const SIZE_SELECTOR = "#size";
export const ADD_SELECTOR = "#product-addtocart-button";
export const REQUIRED_OPTION_ERROR =
  "Add to cart rejected: required option 'Size' was not selected (\"This is a required field.\")";

export interface FakeShop {
  page: Page;
  state: { url: string; size: string | null; cart: Array<{ product: string; size: string }> };
  /** Stands in for the WebArena evaluator: looks only at final shop state, never at the agent's words. */
  evaluate(): EvaluatorResult;
}

export function makeFakeShop(): FakeShop {
  const state: FakeShop["state"] = { url: "about:blank", size: null, cart: [] };

  const locator = (selector: string) => {
    const loc = {
      first: () => loc,
      click: async () => {
        if (state.url !== PRODUCT_URL) throw new Error(`locator.click: no element matches "${selector}"`);
        if (selector !== ADD_SELECTOR) throw new Error(`locator.click: no element matches "${selector}"`);
        if (!state.size) throw new Error(REQUIRED_OPTION_ERROR);
        state.cart.push({ product: "running shorts", size: state.size });
      },
      fill: async () => {
        throw new Error(`locator.fill: no input matches "${selector}"`);
      },
      selectOption: async (value: string) => {
        if (state.url !== PRODUCT_URL || selector !== SIZE_SELECTOR) {
          throw new Error(`locator.selectOption: no <select> matches "${selector}"`);
        }
        if (!["S", "M", "L"].includes(value)) throw new Error(`no option "${value}"`);
        state.size = value;
      },
      ariaSnapshot: async () =>
        state.url === PRODUCT_URL
          ? `- heading "Running shorts"\n- combobox "Size": ${state.size ?? "Choose an option"}\n- button "Add to Cart"`
          : '- heading "Shop home"\n- link "Running shorts"',
    };
    return loc;
  };

  const page = {
    url: () => state.url,
    title: async () => (state.url === PRODUCT_URL ? "Running shorts" : "Shop"),
    goto: async (target: string) => {
      state.url = target;
    },
    waitForLoadState: async () => undefined,
    locator,
  };

  return {
    page: page as unknown as Page,
    state,
    evaluate() {
      const ok = state.cart.some((line) => line.product === "running shorts" && line.size === "M");
      return {
        passed: ok,
        score: ok ? 1.0 : 0.0,
        evidence: {
          type: "program_html",
          detail: ok
            ? "Cart contains running shorts with Size=M."
            : `Cart contains no running shorts with Size=M (cart has ${state.cart.length} line item(s)).`,
        },
      };
    },
  };
}
