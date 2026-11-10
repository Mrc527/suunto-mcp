/**
 * Web mode: "request access" sign-up, where an administrator approves new accounts.
 * Own server instance, so the sign-in rate limit of the other web tests does not interfere.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ACCESS_REQUESTS, REQUESTS_PER_IP_PER_DAY } from "../../src/web/routes-auth.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
const PASSWORD = "correct horse battery";
const admin = new Browser();

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
    log: () => {},
  });
  server.on("request", web.app);
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

const idOf = (email: string) => web.ctx.store.getUserByEmail(email)!.id;

describe("access requests", () => {
  it("is the default for new servers", () => {
    expect(web.ctx.store.getSettings().registration).toBe("approval");
  });

  it("lets visitors request access and only lets them in after approval", async () => {
    const visitor = new Browser();
    const form = await visitor.page("/signup");
    expect(form.html).toContain("Request access");
    expect(form.html).toContain('name="note"');

    const res = await visitor.signup("asker@example.com", PASSWORD, { note: "Jane from accounting" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Request sent");
    expect((await visitor.fetch("/account")).status).toBe(303);

    // A waiting request answers exactly like a wrong password (the requester chose the password,
    // so a different answer would reveal which emails were free).
    const waiting = await visitor.login("asker@example.com", PASSWORD);
    const wrong = await new Browser().login("asker@example.com", "wrong password!!");
    expect(waiting.status).toBe(401);
    expect(wrong.status).toBe(401);
    const waitingText = await waiting.text();
    expect(waitingText).toContain("may still be waiting for approval");
    expect(waitingText.match(/<div class="flash[^>]*>[^<]*<\/div>/)![0]).toBe((await wrong.text()).match(/<div class="flash[^>]*>[^<]*<\/div>/)![0]);

    const adminPage = await admin.page("/admin");
    expect(adminPage.html).toContain("asker@example.com");
    expect(adminPage.html).toContain("Jane from accounting");
    expect(adminPage.html).toContain('title="Access requests waiting">1</span>');

    const approve = await admin.post("/admin/requests/action", { _csrf: adminPage.csrf, id: idOf("asker@example.com"), action: "approve" });
    expect(approve.status).toBe(303);
    expect(approve.headers.get("location")).toBe("/admin?m=approved#requests");
    const user = web.ctx.store.getUser(idOf("asker@example.com"))!;
    expect(user.pending).toBe(false);
    expect(user.disabled).toBe(false);
    expect((await visitor.login("asker@example.com", PASSWORD)).status).toBe(303);
    expect((await visitor.fetch("/account")).status).toBe(200);
  });

  it("answers the same for existing accounts and rejects only requests", async () => {
    const before = web.ctx.store.countUsers();
    const dup = await new Browser().signup("asker@example.com", PASSWORD);
    expect(dup.status).toBe(200);
    expect(await dup.text()).toContain("Request sent");
    expect(web.ctx.store.countUsers()).toBe(before);

    expect((await new Browser().signup("spam@example.com", PASSWORD)).status).toBe(200);
    const { csrf } = await admin.page("/admin");
    // The request endpoint never touches active accounts.
    await admin.post("/admin/requests/action", { _csrf: csrf, id: idOf("asker@example.com"), action: "reject" });
    expect(web.ctx.store.getUserByEmail("asker@example.com")).toBeDefined();
    const reject = await admin.post("/admin/requests/action", { _csrf: csrf, id: idOf("spam@example.com"), action: "reject" });
    expect(reject.headers.get("location")).toBe("/admin?m=rejected#requests");
    expect(web.ctx.store.getUserByEmail("spam@example.com")).toBeUndefined();
  });

  it("lets people with a valid invite code skip the approval", async () => {
    const { csrf } = await admin.page("/admin");
    const created = await (await admin.post("/admin/invites", { _csrf: csrf, note: "for invited", days: "7" })).text();
    const code = created.match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    expect((await new Browser().signup("invited@example.com", PASSWORD, { invite: code })).status).toBe(303);
    expect(web.ctx.store.getUserByEmail("invited@example.com")!.pending).toBe(false);
    expect((await new Browser().signup("wrong@example.com", PASSWORD, { invite: "inv_not_valid" })).status).toBe(400);
    expect(web.ctx.store.getUserByEmail("wrong@example.com")).toBeUndefined();
  });

  it("lets a valid invite replace a waiting request for the same address", async () => {
    expect((await new Browser().signup("owner@example.com", "impostor password", { note: "It is me, really" })).status).toBe(200);
    expect(web.ctx.store.getUserByEmail("owner@example.com")!.pending).toBe(true);
    const { csrf } = await admin.page("/admin");
    const created = await (await admin.post("/admin/invites", { _csrf: csrf, note: "real owner", days: "7" })).text();
    const code = created.match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    const owner = new Browser();
    expect((await owner.signup("owner@example.com", PASSWORD, { invite: code })).status).toBe(303);
    expect(web.ctx.store.getUserByEmail("owner@example.com")!.pending).toBe(false);
    expect((await new Browser().login("owner@example.com", "impostor password")).status).toBe(401);
    expect((await new Browser().login("owner@example.com", PASSWORD)).status).toBe(303);
  });

  it("rejects all open requests at once", async () => {
    const { store } = web.ctx;
    store.createUser("one@example.com", "x", false, { note: "" });
    store.createUser("two@example.com", "x", false, { note: "" });
    const { csrf, html } = await admin.page("/admin");
    expect(html).toContain("Reject all");
    const res = await admin.post("/admin/requests/action", { _csrf: csrf, action: "reject-all" });
    expect(res.headers.get("location")).toBe("/admin?m=rejected#requests");
    expect(store.countAccessRequests()).toBe(0);
    expect(store.getUserByEmail("asker@example.com")).toBeDefined();
  });

  it("treats an account that an older version enabled as a normal user", async () => {
    const { store } = web.ctx;
    const user = store.createUser("legacy@example.com", "x", false, { note: "" });
    // An older version's "Enable" only clears disabled.
    store.db.prepare("UPDATE users SET disabled = 0, created_at = ? WHERE id = ?").run(Date.now() - 40 * 86_400_000, user.id);
    expect(store.getUser(user.id)!.pending).toBe(false);
    expect(store.listAccessRequests().map((u) => u.email)).not.toContain("legacy@example.com");
    store.cleanup();
    expect(store.getUser(user.id)).toBeDefined();
  });

  it("caps open requests for every address alike and removes unanswered ones after 30 days", async () => {
    const { store } = web.ctx;
    for (let i = store.countAccessRequests(); i < MAX_ACCESS_REQUESTS; i++) store.createUser(`flood${i}@example.com`, "x", false, { note: "" });
    // A full queue answers the same for new and for registered addresses.
    expect((await new Browser().signup("late@example.com", PASSWORD)).status).toBe(429);
    expect((await new Browser().signup("asker@example.com", PASSWORD)).status).toBe(429);
    store.db.prepare("UPDATE users SET created_at = ? WHERE pending = 1").run(Date.now() - 31 * 86_400_000);
    store.cleanup();
    expect(store.countAccessRequests()).toBe(0);
    expect(store.getUserByEmail("asker@example.com")).toBeDefined();
  });

  // Keep last: it uses up this IP's requests for the day.
  it("limits how many requests one IP address can send per day", async () => {
    let status = 200;
    for (let i = 0; i < REQUESTS_PER_IP_PER_DAY + 1 && status === 200; i++) {
      const res = await new Browser().signup(`burst${i}@example.com`, PASSWORD);
      status = res.status;
      if (status === 429) expect(await res.text()).toContain("several requests today");
    }
    expect(status).toBe(429);
    // Invite codes are not limited by it.
    expect((await new Browser().signup("withcode@example.com", PASSWORD, { invite: "inv_not_valid" })).status).toBe(400);
  });
});
