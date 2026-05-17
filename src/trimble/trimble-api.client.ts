import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext } from 'playwright';
import fetch from 'node-fetch';
import { writeFile } from 'node:fs/promises';

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * StructShare / Trimble Materials project row as returned by
 * GET /api/next/project.  Only the fields we actually persist are typed here;
 * the rest land in TrimbleProject.payloadJson.
 */
export interface TrimbleProjectRow {
  id: number;
  name: string | null;
  companyId: number | null;
  subCompanyId: number | null;
  subCompany: { name?: string | null } | null;
  jobNumber: string | null;
  address: string | null;
  isActive: boolean | null;
  isWarehouse: boolean | null;
  warehouseId: number | null;
  deliveryContactName: string | null;
  deliveryContactPhoneNumber: string | null;
  /** Full raw row (so we can stringify and persist it). */
  _raw: unknown;
}

export interface TrimbleProjectsPage {
  data: TrimbleProjectRow[];
  meta: {
    page: number;
    pageSize: number;
    count: number;
    next: number | null;
    pageCount: number;
  };
}

interface TrimbleLoginResult {
  accessToken: string;
  userId: number | null;
  companyId: number | null;
  email: string | null;
  receivedAt: number;
  /** Parsed `exp` claim (epoch ms), used to decide when to re-login proactively. */
  expiresAt: number | null;
}

/**
 * Handles everything that touches Trimble Identity + StructShare's internal API.
 *
 * Login uses a short-lived headless Chromium session because the Trimble ID
 * (WSO2 / Cognito) flow sets regional cookies across id.trimble.com and
 * us.id.trimble.com that are painful to reproduce in raw HTTP.  After login we
 * grab the StructShare Bearer JWT directly from the `/api/next/tid/login`
 * response and from that point on everything is plain `node-fetch`.
 */
@Injectable()
export class TrimbleApiClient {
  private readonly logger = new Logger(TrimbleApiClient.name);

  private readonly appBase = 'https://app.structshare.io';
  private readonly loginPath = '/api/next/tid/login';

  private session: TrimbleLoginResult | null = null;
  /** Serialises concurrent login attempts so a cron run never spawns 2 browsers. */
  private loginInFlight: Promise<TrimbleLoginResult> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Epoch ms until the current access token is considered valid.  Null if we have no session. */
  getSessionExpiry(): number | null {
    return this.session?.expiresAt ?? null;
  }

  /** For /trimble/status diagnostics. */
  getSessionInfo(): { loggedIn: boolean; email: string | null; companyId: number | null; expiresAt: string | null } {
    return {
      loggedIn: Boolean(this.session),
      email: this.session?.email ?? null,
      companyId: this.session?.companyId ?? null,
      expiresAt: this.session?.expiresAt ? new Date(this.session.expiresAt).toISOString() : null,
    };
  }

  /**
   * Ensure we have a non-expired access token.  If we already have one with at
   * least 60s of life left, reuse it; otherwise run a fresh browser login.
   */
  async ensureSession(): Promise<TrimbleLoginResult> {
    const now = Date.now();
    const leeway = 60_000;
    if (this.session && this.session.expiresAt && this.session.expiresAt - now > leeway) {
      return this.session;
    }
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.doLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  /** Force a fresh login, e.g. after a 401 from the data API. */
  async forceRelogin(): Promise<TrimbleLoginResult> {
    this.session = null;
    return this.ensureSession();
  }

  /**
   * Drive a headless Chromium through the Trimble ID sign-in form and snoop the
   * StructShare `/api/next/tid/login` response to grab the Bearer JWT.
   *
   * Implementation notes (verified against the captured /tmp debug HTML):
   * - Trimble Identity overlays FOUR forms in the same DOM (sign-in, sign-up,
   *   password-reset, MFA) and swaps visibility via JS.  There are 2 "Next"
   *   buttons: `#sign-up-button` (registration) and `#enter_username_submit`
   *   (sign-in).  We must target the sign-in one.
   * - There are 3 `<input type="password">` elements: `input-password`,
   *   `new_password`, `confirm_password`.  Only `tcp-auto="input-password"`
   *   is the real sign-in field.
   * - The username input is `<input name="username" inputmode="email">` — NO
   *   `type="email"` attribute, so generic `input[type=email]` selectors miss.
   * - Both submit buttons start `disabled="disabled"` and Trimble's JS only
   *   un-disables them after its own keyup handlers validate the input.
   *   `page.fill()` fires an input event but NOT keyup, so pressing Enter on
   *   a still-disabled submit button does nothing.  We instead `type()` the
   *   value (so per-keystroke handlers fire), then poll for `:not([disabled])`
   *   on the submit button before clicking.
   * - OneTrust cookie banner (`#onetrust-accept-btn-handler`) floats over the
   *   bottom of the page; we dismiss it so it can't intercept clicks.
   * - After email submission, Trimble may show a "Use a passkey / Use password"
   *   chooser.  We click `#use_password` / `#button_use_password` if present.
   * - `.catch()` attached synchronously to `loginResponsePromise` so a failure
   *   earlier in the flow doesn't surface as an UnhandledPromiseRejection.
   */
  private async doLogin(): Promise<TrimbleLoginResult> {
    const email = this.config.get<string>('TRIMBLE_EMAIL');
    const password = this.config.get<string>('TRIMBLE_PASSWORD');
    if (!email || !password) {
      throw new Error('TRIMBLE_EMAIL / TRIMBLE_PASSWORD must be set in .env before running Trimble sync.');
    }
    const headless = this.config.get<string>('TRIMBLE_HEADLESS', 'true') !== 'false';
    const slowMo = Number(this.config.get<string>('TRIMBLE_SLOWMO_MS', '0')) || 0;
    // How long we wait for the *StructShare login callback*.  This is the outer
    // wall-clock budget for the whole sign-in and must be ≥ the time it takes a
    // human to receive and type an OTP code (email/SMS/authenticator).  Default
    // 10 minutes; bump via TRIMBLE_LOGIN_TIMEOUT_MS if your MFA is slower.
    const timeoutMs =
      Number(this.config.get<string>('TRIMBLE_LOGIN_TIMEOUT_MS', '600000')) || 600_000;
    // How long we wait for a single element (input, button) to appear.  Short
    // by default so a missing selector fails fast instead of chewing 10 min.
    const selectorTimeoutMs =
      Number(this.config.get<string>('TRIMBLE_SELECTOR_TIMEOUT_MS', '90000')) || 90_000;
    const screenshotDir = this.config.get<string>('TRIMBLE_SCREENSHOT_DIR', '/tmp');
    // Optional directory for a persistent Chromium profile.  When set, Trimble's
    // "remember this device" cookie survives across restarts so we only OTP
    // once.  Leave empty for a throwaway context (dev only).
    const userDataDir = (this.config.get<string>('TRIMBLE_USER_DATA_DIR', '') || '').trim();

    this.logger.log(
      `Trimble login start (headless=${headless}, slowMo=${slowMo}ms, email=${email}, ` +
        `passwordLen=${password.length}, userDataDir=${userDataDir || '(throwaway)'})`,
    );

    let browser: Browser | null = null;
    let ctx: BrowserContext | null = null;
    let page: import('playwright').Page | null = null;
    try {
      const launchOpts = {
        headless,
        slowMo,
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      };
      if (userDataDir) {
        // Persistent profile — cookies, localStorage, and Trimble's "trusted
        // device" markers persist across runs, so after the first successful
        // OTP the user doesn't see the MFA challenge again.
        ctx = await chromium.launchPersistentContext(userDataDir, launchOpts);
      } else {
        browser = await chromium.launch({ headless, slowMo });
        ctx = await browser.newContext({
          viewport: launchOpts.viewport,
          userAgent: launchOpts.userAgent,
        });
      }
      page = ctx.pages()[0] ?? (await ctx.newPage());
      // Applies to .waitFor(...), .click(...), etc. unless a specific timeout
      // is passed.  NOT the same as the waitForResponse outer budget below.
      page.setDefaultTimeout(selectorTimeoutMs);

      // --- Force a fresh `/api/next/tid/login` call ------------------------
      // The persistent profile keeps two *different* kinds of cookies:
      //
      //   (a) id.trimble.com / us.id.trimble.com  →  "trusted device" marker
      //       that skips the MFA / OTP challenge.  We WANT to keep these.
      //   (b) app.structshare.io                  →  StructShare session JWT
      //       cookie.  If we keep this, the SPA short-circuits the OAuth
      //       callback, never calls POST /api/next/tid/login, and our
      //       `waitForResponse` sits idle for 10 minutes and times out.
      //
      // So before every login we wipe (b) only.  Trimble's MFA cookie is
      // untouched → still no OTP prompt → but the StructShare SPA is forced
      // through a fresh code-for-token exchange we can sniff.
      try {
        const cookies = await ctx.cookies();
        const toClear = cookies.filter((c) => /(^|\.)structshare\.io$/i.test(c.domain));
        if (toClear.length > 0) {
          await ctx.clearCookies({ domain: 'app.structshare.io' });
          await ctx.clearCookies({ domain: '.structshare.io' });
          this.logger.debug(
            `Trimble login: cleared ${toClear.length} structshare.io cookies to force fresh login POST`,
          );
        }
      } catch (e: any) {
        this.logger.debug(`Trimble login: cookie pre-clean skipped (${e?.message ?? e})`);
      }

      // Attach .catch() synchronously so a rejection of this promise can never
      // surface as an unhandledRejection if the flow throws earlier.
      const loginResponsePromise = page
        .waitForResponse(
          (resp) =>
            resp.url().startsWith(`${this.appBase}${this.loginPath}`) && resp.request().method() === 'POST',
          { timeout: timeoutMs },
        )
        .catch((err) => {
          this.logger.warn(`waitForResponse(${this.loginPath}) timed out: ${err?.message ?? err}`);
          return null as import('playwright').Response | null;
        });

      // Log every navigation so if the flow stalls we can see *where* in the
      // redirect chain it stopped.
      page.on('framenavigated', (f) => {
        if (f === page!.mainFrame()) this.logger.debug(`Trimble login nav → ${f.url()}`);
      });

      await page.goto(`${this.appBase}/`, { waitUntil: 'domcontentloaded' });
      this.logger.debug(`Trimble login: landed at ${page.url()}`);

      // --- Dismiss cookie banner so it can't intercept later clicks --------
      await this.dismissCookieBanner(page);

      // --- Email step (OPTIONAL) -------------------------------------------
      // If `id.trimble.com` still has a valid Trimble SSO cookie in the
      // persistent profile, Trimble silently issues a new auth code and
      // bounces us straight back to app.structshare.io without ever showing
      // the username form.  In that case #username-field never appears and
      // we must NOT block on it.  We wait a short window for the form; if
      // it doesn't show, assume SSO auto-login and fall through to the
      // waitForResponse below.
      const emailLoc = page.locator('#username-field').first();
      let sawEmailForm = false;
      try {
        await emailLoc.waitFor({ state: 'visible', timeout: 10_000 });
        sawEmailForm = true;
      } catch {
        this.logger.debug(
          'Trimble login: username form did not appear — assuming Trimble SSO auto-redirect.',
        );
      }

      if (sawEmailForm) {
        await emailLoc.click();
        // `type()` fires per-keystroke events, which is what Trimble's
        // validation JS listens to in order to un-disable the Next button.
        // `fill()` would set the value but leave the submit button disabled.
        await emailLoc.fill('');
        await emailLoc.type(email, { delay: 20 });

        await this.clickWhenEnabled(page, '#enter_username_submit', selectorTimeoutMs);
        this.logger.debug('Trimble login: clicked Next (username)');

        // --- Optional "Use a passkey / Use password" chooser ---------------
        // If Trimble offers passkey as the default, click "Use password" to
        // fall through to the password form.
        try {
          const usePwd = page.locator('#use_password, #button_use_password').first();
          await usePwd.waitFor({ state: 'visible', timeout: 4000 });
          await usePwd.click({ timeout: 3000 });
          this.logger.debug('Trimble login: clicked "Use password"');
        } catch {
          /* No passkey chooser on this account — proceed directly to password. */
        }

        // --- Password step -------------------------------------------------
        // tcp-auto="input-password" uniquely identifies the sign-in password
        // input (as opposed to new_password / confirm_password on the reset form).
        //
        // Use .fill() (sets value directly, fires a single input event) rather
        // than .type() to avoid any keyboard-layout edge cases on shifted symbols
        // (e.g. `#` = Shift+3 on US layout).  The password submit button is
        // already enabled when this page loads, so no keyup cascade is needed.
        const passwordLoc = page.locator('input[tcp-auto="input-password"]').first();
        await passwordLoc.waitFor({ state: 'visible', timeout: selectorTimeoutMs });
        await passwordLoc.click();
        await passwordLoc.fill(password);

        // Read back what actually landed in the DOM and verify it matches what
        // we intended.  If Playwright dropped a character or the page ate one
        // via an input filter, we want a loud, fast error — not a 90-second
        // `waitForResponse` mystery that looks identical to a wrong password.
        const typedPw: string = await passwordLoc.inputValue();
        if (typedPw !== password) {
          this.logger.warn(
            `Password field mismatch: typed ${typedPw.length} chars, expected ${password.length}.`,
          );
        } else {
          this.logger.debug(`Password field filled (${typedPw.length} chars, ok)`);
        }

        const pageUrl = page.url();
        if (pageUrl.includes('id.trimble.com')) {
          this.logger.debug(`Password page URL: ${pageUrl}`);
        }

        // If Trimble finishes OAuth (incl. OTP) and redirects to StructShare before
        // the Sign-in button flips to enabled, a plain waitForFunction on the button
        // keeps polling on the *new* document where that selector does not exist →
        // 90s timeout at /home.  Allow "navigated off Trimble Identity" as success.
        await this.clickWhenEnabled(page, 'button[name="password-submit"]', selectorTimeoutMs, {
          allowNavigateAwayFromTrimbleIdentity: true,
        });
        this.logger.debug('Trimble login: password / Sign-in step complete');
      }

      // --- Optional OTP / MFA step ----------------------------------------
      // If Trimble redirects to a verification-code page, sit back and let the
      // human type the code.  We don't try to auto-read SMS/email; we just
      // give them plenty of wall-clock time.  The outer `loginResponsePromise`
      // (timeoutMs, default 10 min) is the real budget.
      //
      // Common Trimble OTP inputs: #otp-input, input[name="otp"], input[name="code"],
      // and the legacy `#enter_verification_code_submit` button.  We log when
      // we see one so you know to look at the browser.
      setTimeout(() => {
        void (async () => {
          try {
            const otpLoc = page!
              .locator(
                '#otp-input, input[name="otp"], input[name="code"], input[autocomplete="one-time-code"]',
              )
              .first();
            if ((await otpLoc.count()) > 0 && (await otpLoc.isVisible())) {
              this.logger.warn(
                `Trimble is asking for an OTP / verification code.  Enter it in the ` +
                  `Chromium window — you have ~${Math.round(timeoutMs / 1000)}s.`,
              );
            }
          } catch {
            /* ignore — this is advisory logging only */
          }
        })();
      }, 3000);

      const resp = await loginResponsePromise;
      if (!resp) {
        throw new Error(
          `Timed out waiting for ${this.loginPath} response — login likely failed silently. ` +
            `Current URL: ${page.url()}.  Set TRIMBLE_HEADLESS=false to watch the browser.`,
        );
      }
      if (!resp.ok()) {
        throw new Error(`StructShare login endpoint returned HTTP ${resp.status()}`);
      }
      const body: any = await resp.json();
      if (!body?.accessToken) {
        throw new Error(`StructShare login response did not include accessToken (status=${body?.status}).`);
      }

      const accessToken = String(body.accessToken);
      const expiresAt = this.decodeExpiry(accessToken);
      const userId = body?.user?.id != null ? Number(body.user.id) : null;
      const companyId = body?.user?.companyId != null ? Number(body.user.companyId) : null;
      const userEmail = body?.user?.email ?? null;

      const session: TrimbleLoginResult = {
        accessToken,
        userId,
        companyId,
        email: userEmail,
        receivedAt: Date.now(),
        expiresAt,
      };
      this.session = session;
      this.logger.log(
        `Trimble login ok user=${userEmail ?? userId} companyId=${companyId} exp=${
          expiresAt ? new Date(expiresAt).toISOString() : 'unknown'
        }`,
      );
      return session;
    } catch (err: any) {
      this.logger.error(`Trimble login failed: ${err?.message ?? err}`);
      // Save a screenshot + page HTML next to the error so we can eyeball what
      // the Trimble form actually looked like when it broke.
      if (page) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const shotPath = `${screenshotDir.replace(/\/$/, '')}/trimble-login-fail-${stamp}.png`;
        const htmlPath = `${screenshotDir.replace(/\/$/, '')}/trimble-login-fail-${stamp}.html`;
        try {
          await page.screenshot({ path: shotPath, fullPage: true });
          const html = await page.content();
          await writeFile(htmlPath, html, 'utf8');
          this.logger.warn(`Trimble login debug artifacts: ${shotPath} , ${htmlPath} (url=${page.url()})`);
        } catch (e: any) {
          this.logger.warn(`Could not save Trimble login debug artifacts: ${e?.message ?? e}`);
        }
      }
      throw err;
    } finally {
      await ctx?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  /**
   * Dismiss the OneTrust cookie consent banner that Trimble shows.  If the
   * banner isn't there (e.g. cookies already persisted) this is a no-op.
   */
  private async dismissCookieBanner(page: import('playwright').Page): Promise<void> {
    const btn = page.locator('#onetrust-accept-btn-handler, #onetrust-reject-all-handler').first();
    try {
      await btn.waitFor({ state: 'visible', timeout: 4000 });
      await btn.click({ timeout: 2000 });
      this.logger.debug('Trimble login: dismissed cookie banner');
    } catch {
      /* Banner not present — nothing to dismiss. */
    }
  }

  /**
   * Click a button, but first wait for Trimble's JS to un-disable it.  Submit
   * buttons on the sign-in form start `disabled="disabled"` and only become
   * clickable after field validation passes.
   *
   * `allowNavigateAwayFromTrimbleIdentity`: for the password submit step only.
   * After OTP / redirect the main frame can land on app.structshare.io while
   * this wait is still running; `querySelector` then finds no button and would
   * otherwise hit `selectorTimeoutMs` with a misleading timeout.
   */
  private async clickWhenEnabled(
    page: import('playwright').Page,
    selector: string,
    timeoutMs: number,
    opts?: { allowNavigateAwayFromTrimbleIdentity?: boolean },
  ): Promise<void> {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout: timeoutMs });
    const allowAway = !!opts?.allowNavigateAwayFromTrimbleIdentity;
    await page.waitForFunction(
      ({ sel, allowNavigateAway }) => {
        const h = window.location.hostname.toLowerCase();
        const stillOnTrimbleIdentity =
          h === 'id.trimble.com' || h.endsWith('.id.trimble.com');
        if (allowNavigateAway && !stillOnTrimbleIdentity) {
          return true;
        }
        const el = document.querySelector(sel) as HTMLButtonElement | null;
        return !!el && !el.disabled && !el.hasAttribute('disabled');
      },
      { sel: selector, allowNavigateAway: allowAway },
      { timeout: timeoutMs },
    );
    const h = new URL(page.url()).hostname.toLowerCase();
    const stillOnTrimbleIdentity = h === 'id.trimble.com' || h.endsWith('.id.trimble.com');
    if (allowAway && !stillOnTrimbleIdentity) {
      this.logger.debug(
        'Trimble login: left Trimble Identity before Sign-in click — session continues on StructShare.',
      );
      return;
    }
    await loc.click({ timeout: 10_000 });
  }

  /**
   * Decode the `exp` claim of the Bearer JWT to know when we need to re-login.
   * We do NOT verify the signature — we just need the timestamp.
   */
  private decodeExpiry(jwt: string): number | null {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload && typeof payload.exp === 'number') return payload.exp * 1000;
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * Issue an authenticated request to StructShare, automatically re-logging-in
   * once if we hit a 401.
   */
  private async authedFetch(
    path: string,
    init?: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<FetchResponse> {
    const timeoutMs =
      Number(this.config.get<string>('TRIMBLE_FETCH_TIMEOUT_MS', '120000')) || 120_000;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    const session = await this.ensureSession();
    const doFetch = (token: string) =>
      fetch(`${this.appBase}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
          ...(init?.headers ?? {}),
        },
        body: init?.body,
        signal: ac.signal,
      });

    try {
      let resp = await doFetch(session.accessToken);
      if (resp.status === 401) {
        this.logger.warn(`StructShare returned 401 for ${path} — re-logging in and retrying once.`);
        const fresh = await this.forceRelogin();
        resp = await doFetch(fresh.accessToken);
      }
      return resp;
    } finally {
      clearTimeout(timer);
    }
  }

  /** One page of `/api/next/project?page=N&limit=25&isActive=true`. */
  async listProjectsPage(page: number, opts?: { limit?: number; isActive?: boolean }): Promise<TrimbleProjectsPage> {
    const limit = opts?.limit ?? 25;
    const isActive = opts?.isActive ?? true;
    const qs = `page=${page}&limit=${limit}&search=&isActive=${isActive ? 'true' : 'false'}`;
    const resp = await this.authedFetch(`/api/next/project?${qs}`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`GET /api/next/project?${qs} → HTTP ${resp.status} ${text.slice(0, 400)}`);
    }
    const json: any = await resp.json();
    const rows: TrimbleProjectRow[] = Array.isArray(json?.data)
      ? json.data.map((r: any) => this.normalizeProjectRow(r))
      : [];
    const meta = json?.meta ?? {};
    return {
      data: rows,
      meta: {
        page: Number(meta.page ?? page),
        pageSize: Number(meta.pageSize ?? limit),
        count: Number(meta.count ?? rows.length),
        next: meta.next === null || meta.next === undefined ? null : Number(meta.next),
        pageCount: Number(meta.pageCount ?? 1),
      },
    };
  }

  /** Iterate through every page of projects, yielding rows as they come. */
  async *iterateAllProjects(opts?: { limit?: number; isActive?: boolean }): AsyncIterable<TrimbleProjectRow> {
    let page = 1;
    while (true) {
      const got = await this.listProjectsPage(page, opts);
      for (const row of got.data) yield row;
      if (!got.meta.next || got.data.length === 0 || page >= got.meta.pageCount) return;
      page = got.meta.next;
    }
  }

  /**
   * Same shape StructShare sends when you click Export on `/project/{id}/line-items`.
   * Keys like `manufactureres` mirror the SPA (likely a long-standing typo server-side).
   */
  private buildLineItemsExcelRequestBody(projectId: number, companyId: number): Record<string, unknown> {
    return {
      companyId,
      projectId,
      search: '',
      itemsType: 'ORDER_ITEMS',
      filters: {
        organizations: [],
        costCodes: [],
        phases: [],
        budgetCategories: [],
        fromDate: null,
        toDate: null,
        hideCanceledOrders: false,
        itemsType: 'ORDER_ITEMS',
        manufactureres: [],
        searchInNotes: false,
        source: 'all',
      },
      hiddenColumns: [
        'costTypeId',
        'organizationAccountingRef',
        'erpOrderTitle',
        'organizationName',
        'aggregatedEstimatedQuantityBOM',
        'aggregatedRevisedQuantityBOM',
        'averageEstimatedQuantityPerUnitBOM',
        'averageEstimatedUnitCostBOM',
        'averageRevisedUnitCostBOM',
        'averagePricePerDayBOM',
        'aggregatedEstimatedCostBOM',
        'aggregatedRevisedCostBOM',
        'averageEstimatedLaborCostHourBOM',
        'averageProductionRateHourBOM',
        'aggregatedEstimatedLaborHoursBOM',
        'aggregatedEstimatedLaborCostBOM',
        'aggregatedRevisedLaborHoursBOM',
        'aggregatedRevisedLaborCostBOM',
        'aggregatedTotalEstimatedCost',
        'aggregatedTotalRevisedCost',
      ],
    };
  }

  /**
   * Download one project's Line Items workbook as raw XLSX bytes.
   *
   * The UI uses **POST** `/api/next/project/line-items/excel` with a full JSON
   * payload (`companyId`, `projectId`, `filters`, `hiddenColumns`, etc.) — not
   * a project id in the URL path.
   *
   * Some projects have no line items — the API may return HTTP 200 with an
   * empty body or a small JSON payload instead of a ZIP/XLSX; those are treated
   * as `isEmptyExport` rather than a hard error.
   *
   * @param projectCompanyId `companyId` from the project row; falls back to the logged-in session.
   */
  async downloadLineItemsExcel(projectId: number, projectCompanyId?: number | null): Promise<{
    buffer: Buffer;
    contentType: string | null;
    fileName: string | null;
    httpStatus: number;
    /** True when the call succeeded but there is no workbook (no rows / empty export). */
    isEmptyExport?: boolean;
  }> {
    const session = await this.ensureSession();
    const companyId = projectCompanyId ?? session.companyId;
    if (companyId == null) {
      throw new Error(
        `Cannot export line-items Excel for projectId=${projectId}: missing companyId (project and session both lack it).`,
      );
    }

    const path = `/api/next/project/line-items/excel`;
    const body = this.buildLineItemsExcelRequestBody(projectId, companyId);
    let resp: FetchResponse;
    try {
      resp = await this.authedFetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: `${this.appBase}/project/${projectId}/line-items`,
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(
          `POST ${path} projectId=${projectId} aborted (timeout — raise TRIMBLE_FETCH_TIMEOUT_MS).`,
        );
      }
      throw e;
    }
    const contentType = resp.headers.get('content-type');
    const disposition = resp.headers.get('content-disposition');
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (!resp.ok) {
      const snippet = buffer.toString('utf8').slice(0, 500);
      throw new Error(
        `POST ${path} projectId=${projectId} → HTTP ${resp.status} (${buffer.length} bytes) ${snippet}`,
      );
    }

    const looksLikeXlsxZip =
      buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

    if (buffer.length === 0) {
      return {
        buffer: Buffer.alloc(0),
        contentType,
        fileName: null,
        httpStatus: resp.status,
        isEmptyExport: true,
      };
    }

    if (!looksLikeXlsxZip) {
      const start = buffer.toString('utf8', 0, Math.min(400, buffer.length)).trimStart();
      if (start.startsWith('{') || start.startsWith('[')) {
        this.logger.debug(
          `Trimble line-items: projectId=${projectId} returned JSON instead of XLSX (${buffer.length} b): ${start.slice(0, 200)}`,
        );
        return {
          buffer: Buffer.alloc(0),
          contentType,
          fileName: null,
          httpStatus: resp.status,
          isEmptyExport: true,
        };
      }
      throw new Error(
        `POST ${path} projectId=${projectId} → OK but body is not an XLSX (${buffer.length} bytes, content-type=${contentType})`,
      );
    }

    return {
      buffer,
      contentType,
      fileName: this.parseFileNameFromDisposition(disposition),
      httpStatus: resp.status,
    };
  }

  private parseFileNameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    // filename*=UTF-8''foo.xlsx  or  filename="foo.xlsx"
    const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(disposition);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].replace(/"/g, ''));
      } catch {
        return star[1].replace(/"/g, '');
      }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
    return plain?.[1] ?? null;
  }

  private normalizeProjectRow(r: any): TrimbleProjectRow {
    return {
      id: Number(r?.id),
      name: r?.name ?? null,
      companyId: r?.companyId != null ? Number(r.companyId) : null,
      subCompanyId: r?.subCompanyId != null ? Number(r.subCompanyId) : null,
      subCompany: r?.subCompany ?? null,
      jobNumber: r?.jobNumber ?? null,
      address: r?.address ?? null,
      isActive: typeof r?.isActive === 'boolean' ? r.isActive : null,
      isWarehouse: typeof r?.isWarehouse === 'boolean' ? r.isWarehouse : null,
      warehouseId: r?.warehouseId != null ? Number(r.warehouseId) : null,
      deliveryContactName: r?.deliveryContactName ?? null,
      deliveryContactPhoneNumber: r?.deliveryContactPhoneNumber ?? null,
      _raw: r,
    };
  }
}
