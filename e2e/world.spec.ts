import { expect, test, type Page } from "@playwright/test";

type Tuple = [string, number, number, string | null, string | null, string | null];
type Stored = { schema: number; world: number; cells: Tuple[] };

/** Viewport centre of a cell, using the same anchor as the renderer: section centre, ground-band top. */
async function cellCenter(page: Page, region: string, x: number, y: number) {
  return page.evaluate(
    ([region, x, y]) => {
      const section = document.querySelector<HTMLElement>(`[data-world-region="${region}"]`)!;
      const ground = section.querySelector<HTMLElement>("[data-world-ground]")!;
      const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell"));
      const s = section.getBoundingClientRect();
      const g = ground.getBoundingClientRect();
      return { x: s.left + s.width / 2 + (Number(x) + 0.5) * cell, y: g.top + (Number(y) + 0.5) * cell };
    },
    [region, x, y] as const,
  );
}

async function stored(page: Page): Promise<Stored | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("tile-world") ?? "null") as Stored | null);
}

/** Scrolls so the given row sits a little above mid-screen, clear of the header and toolbar. */
async function centreOn(page: Page, region: string, y: number) {
  await page.evaluate(
    ([region, y]) => {
      document.documentElement.style.scrollBehavior = "auto";
      const ground = document.querySelector(`[data-world-region="${region}"] [data-world-ground]`)!;
      const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell"));
      const top = ground.getBoundingClientRect().top + window.scrollY + Number(y) * cell;
      window.scrollTo(0, top - window.innerHeight * 0.4);
    },
    [region, y] as const,
  );
  await page.waitForTimeout(100);
}

type DebugMob = { id: number; kind: string; region: string; home: string; state: string; x: number; y: number; bubble: string | null };

async function mobs(page: Page): Promise<DebugMob[]> {
  return page.evaluate(() => (document.querySelector("canvas") as HTMLCanvasElement & { __world: { mobs: () => DebugMob[] } }).__world.mobs());
}

/** A creature of one of these kinds that's on screen and not behind any text. */
async function reachable(page: Page, kinds: string[]): Promise<DebugMob | null> {
  return page.evaluate((kinds) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement & { __world: { mobs: () => DebugMob[] } };
    return canvas.__world.mobs().find((m) => kinds.includes(m.kind) && m.state !== "teleport" && m.x > 20 && m.x < innerWidth - 20 && m.y > 100 && m.y < innerHeight - 40 && document.elementFromPoint(m.x, m.y) === canvas) ?? null;
  }, kinds);
}

test.beforeEach(async ({ page, javaScriptEnabled }) => {
  if (javaScriptEnabled === false) return;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/world-ready/);
});

test("content is readable and build mode starts off", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const name of ["Projects", "Skills", "About", "Contact"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
  }
  await expect(page.getByRole("button", { name: "Build" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Build tools" })).toHaveCount(0);
});

test("right click places in the chosen layer; left click breaks the closest block", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse buttons are checked on desktop.");
  await page.getByRole("button", { name: "Build" }).click();
  await centreOn(page, "contact", -4);
  const p = await cellCenter(page, "contact", 3, -4);
  const status = page.locator("[data-world-status]");

  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(status).toHaveText("Placed grass in the middle layer.");
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(status).toHaveText(/middle layer is taken/);
  await page.keyboard.press("f");
  await page.keyboard.press("3");
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(status).toHaveText("Placed oak planks in the front layer.");
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["contact", 3, -4, null, "grass", "oak"]]);

  await page.mouse.click(p.x, p.y);
  await expect(status).toHaveText("Broke oak planks from the front layer.");
  await page.mouse.click(p.x, p.y);
  await expect(status).toHaveText("Broke grass from the middle layer.");
  await page.mouse.click(p.x, p.y);
  await expect(status).toHaveText("Nothing to break here.");
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["contact", 3, -4, null, null, null]]);
});

test("mined terrain stays mined after reload, and undo restores it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse buttons are checked on desktop.");
  await page.getByRole("button", { name: "Build" }).click();
  await centreOn(page, "skills", 0);
  const ground = await cellCenter(page, "skills", -2, 0);
  await page.mouse.click(ground.x, ground.y);
  await page.mouse.click(ground.x, ground.y);
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["skills", -2, 0, null, null, null]]);

  await page.reload();
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["skills", -2, 0, null, null, null]]);

  await page.getByRole("button", { name: "Build" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await centreOn(page, "skills", 0);
  const below = await cellCenter(page, "skills", -2, 1);
  await page.mouse.click(below.x, below.y);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["skills", -2, 0, null, null, null]]);
});

test("in build mode, clicks on text reach the world behind it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse buttons are checked on desktop.");
  await page.getByRole("button", { name: "Build" }).click();
  const lead = page.getByText("IT student building for the web, mobile, and games.");
  const box = (await lead.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await expect.poll(async () => (await stored(page))?.cells.length).toBe(1);
  expect((await stored(page))!.cells[0]![0]).toBe("intro");
});

test("reset restores the authored world after confirmation", async ({ page }) => {
  await page.getByRole("button", { name: "Build" }).click();
  await centreOn(page, "contact", -2);
  const p = await cellCenter(page, "contact", -2, -2);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect.poll(async () => (await stored(page))?.cells.length).toBe(1);

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Reset world…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset world" }).click();
  await expect.poll(() => stored(page)).toBeNull();
});

test("keyboard: arrows move, Enter places, Delete breaks, Escape exits", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard flow is checked on desktop.");
  const build = page.getByRole("button", { name: "Build" });
  await build.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("application", { name: "Tile world editor" }).focus();
  await page.keyboard.press("ArrowUp");
  const status = page.locator("[data-world-status]");
  await expect(status).toHaveText(/column 0, 2 above ground: empty/);
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Placed grass in the middle layer.");
  await page.keyboard.press("Delete");
  await expect(status).toHaveText("Broke grass from the middle layer.");
  await page.keyboard.press("Escape");
  await expect(build).toBeFocused();
  await expect(build).toHaveAttribute("aria-pressed", "false");
});

test("touch: a tap places a block", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch flow is checked on the mobile project.");
  await page.getByRole("button", { name: "Build" }).click();
  await centreOn(page, "contact", -4);
  const p = await cellCenter(page, "contact", 3, -4);
  await page.touchscreen.tap(p.x, p.y);
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["contact", 3, -4, null, "grass", null]]);
});

test("the résumé downloads, and each project links out", async ({ page, request }) => {
  const resume = page.getByRole("link", { name: "Download résumé (PDF)" }).first();
  await expect(resume).toHaveAttribute("download", /Resume\.pdf$/);
  const res = await request.get((await resume.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
  await expect(page.getByRole("link", { name: /Visit the live site/ })).toHaveAttribute("href", "https://ecopin-web.vercel.app/");
  await expect(page.getByRole("link", { name: /Play it on itch\.io/ })).toHaveAttribute("href", "https://artsaac.itch.io/plooy");
});

// The send route is answered inside the browser, so these tests never email anyone, even with a real key in .env.local.
async function answerContact(page: Page, status: number, body: object) {
  const posts: unknown[] = [];
  await page.route("**/api/contact", (route) => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return posts;
}

async function fillContact(page: Page) {
  const form = page.getByRole("form", { name: "Send me a message" });
  await form.scrollIntoViewIfNeeded();
  await form.getByLabel("Your name").fill("Ana Reyes");
  await form.getByLabel("Your email").fill("ana@example.com");
  await form.getByLabel("Message").fill("Hello! I'd like to talk about an internship.");
  // Bots that post instantly are ignored, so wait like a person would.
  await page.waitForTimeout(2600);
  await form.getByRole("button", { name: "Send message" }).click();
  return form;
}

test("the contact form checks fields and explains when sending isn't set up", async ({ page }) => {
  const posts = await answerContact(page, 503, { error: "not-configured", message: "The message form isn't connected yet. Please email me directly instead." });
  const form = page.getByRole("form", { name: "Send me a message" });
  await form.scrollIntoViewIfNeeded();
  await form.getByRole("button", { name: "Send message" }).click();
  await expect(form.getByText("Add your name.")).toBeVisible();
  await expect(form.getByLabel("Your name")).toBeFocused();
  expect(posts).toHaveLength(0);
  await fillContact(page);
  await expect(form.getByRole("status")).toContainText("isn't connected yet");
  await expect(form.getByRole("link", { name: "Email me instead" })).toBeVisible();
  expect(posts).toHaveLength(1);
});

test("after a message is sent, the creatures on screen shout out the sender", async ({ page }) => {
  await answerContact(page, 200, { ok: true });
  const form = await fillContact(page);
  await expect(form.getByRole("status")).toContainText("on its way");
  // If no creature was in view, the first one to come into view gives the shout-out.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect.poll(async () => (await mobs(page)).some((m) => m.bubble === "SHOUT OUT KAY, ANA!"), { timeout: 5000 }).toBe(true);
});

test("turning sound on downloads the sound effects and plays the toggle's click", async ({ page }) => {
  // Count sounds started, without needing speakers.
  await page.addInitScript(() => {
    const w = window as Window & { __plays?: number };
    w.__plays = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      w.__plays = (w.__plays ?? 0) + 1;
      return start.apply(this, args);
    };
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/world-ready/);
  const sounds: { url: string; status: number }[] = [];
  page.on("response", (r) => r.url().includes("/sounds/") && sounds.push({ url: r.url(), status: r.status() }));
  await page.getByRole("button", { name: "Build" }).click();
  await page.getByRole("button", { name: "More" }).click();
  const toggle = page.getByRole("button", { name: "Sound" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => (window as Window & { __plays?: number }).__plays ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
  expect(sounds.length).toBeGreaterThanOrEqual(21);
  expect(sounds.every((s) => s.status === 200 && /\.(ogg|wav)$/.test(s.url))).toBe(true);
});

test("the pause button stops the world's animation", async ({ page }) => {
  await page.getByRole("button", { name: "Pause animations" }).click();
  await expect(page.getByRole("button", { name: "Play animations" })).toBeVisible();
  // Anything mid-fall lands first; after that, frames stay identical.
  const still = () =>
    page.evaluate(async () => {
      const c = document.querySelector("canvas")!;
      const ctx = c.getContext("2d")!;
      const a = ctx.getImageData(0, 0, c.width, c.height).data.join();
      await new Promise((r) => setTimeout(r, 500));
      return a === ctx.getImageData(0, 0, c.width, c.height).data.join();
    });
  await expect.poll(still, { timeout: 6000 }).toBe(true);
});

test("a creature can be carried into another section, where it's puzzled", async ({ page, isMobile }) => {
  test.skip(isMobile, "Dragging with a mouse is checked on desktop.");
  await expect.poll(() => reachable(page, ["sheep", "pig"]), { timeout: 10_000 }).not.toBeNull();
  const m = (await reachable(page, ["sheep", "pig"]))!;
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  await page.mouse.move(m.x + 12, m.y - 24, { steps: 4 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, document.getElementById("projects")!.offsetTop + 200);
  });
  await page.mouse.move(m.x + 24, 480, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await mobs(page)).find((o) => o.id === m.id)?.region).toBe("projects");
  await expect.poll(async () => (await mobs(page)).find((o) => o.id === m.id)?.bubble ?? null).not.toBeNull();
});

test("clicking a creature makes it say something", async ({ page, isMobile }) => {
  test.skip(isMobile, "Checked with a mouse on desktop.");
  await expect.poll(() => reachable(page, ["sheep", "pig"]), { timeout: 10_000 }).not.toBeNull();
  const m = (await reachable(page, ["sheep", "pig"]))!;
  await page.mouse.click(m.x, m.y);
  await expect.poll(async () => (await mobs(page)).find((o) => o.id === m.id)?.bubble ?? null).not.toBeNull();
});

test("each case study is a world of its own to build in", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse buttons are checked on desktop.");
  await page.goto("/projects/plooy");
  await expect(page.locator("html")).toHaveClass(/world-ready/);
  await expect(page.getByRole("heading", { level: 1, name: "Plooy" })).toBeVisible();
  await page.getByRole("button", { name: "Build" }).click();
  await centreOn(page, "plooy", -5);
  const p = await cellCenter(page, "plooy", -14, -5);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect.poll(async () => (await stored(page))?.cells).toEqual([["plooy", -14, -5, null, "grass", null]]);
});

test("the night toggle turns the sky in about half a second", async ({ page }) => {
  await page.getByRole("button", { name: "Night" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-sky", "night", { timeout: 1500 });
  await expect(page.getByRole("button", { name: "Day" })).toBeVisible();
});

test("case studies open, and unknown slugs return 404", async ({ page }) => {
  await page.getByRole("link", { name: /Read the .* case study/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What I did" })).toBeVisible();
  const res = await page.goto("/projects/not-a-real-project");
  expect(res?.status()).toBe(404);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("essential content still works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Read the .* case study/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /@gmail\.com$/ })).toHaveAttribute("href", /^mailto:/);
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  });
});
