import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { destination, validate } from "../scripts/check-redirect.mjs";

function fixture(callback) {
  const root = mkdtempSync(join(tmpdir(), "legacy-redirect-"));
  try {
    for (const file of [
      "index.html",
      "404.html",
      "vercel.json",
      "robots.txt",
      "favicon-animated.svg",
      "favicon-motion.js",
    ])
      cpSync(new URL(`../${file}`, import.meta.url), join(root, file));
    cpSync(new URL("../.github/", import.meta.url), join(root, ".github"), {
      recursive: true,
    });
    callback(root);
  } finally {
    const target = resolve(root);
    const allowedPrefix = join(resolve(tmpdir()), "legacy-redirect-");
    if (!target.startsWith(allowedPrefix))
      throw new Error("Unexpected fixture cleanup target");
    rmSync(target, { recursive: true, force: true });
  }
}

test("both Pages fallback documents and the permanent Vercel rule are coherent", () =>
  fixture((root) => assert.deepEqual(validate(root), [])));

test("an accidental redirect loop or attacker-selected destination fails the gate", () =>
  fixture((root) => {
    const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    for (const url of [
      "https://riccardo-buzzolan-portfolio.vercel.app/",
      "https://example.invalid/:path*",
    ]) {
      config.redirects[0].destination = url;
      writeFileSync(join(root, "vercel.json"), JSON.stringify(config));
      assert.ok(
        validate(root).some((error) => error.includes("fixed canonical")),
      );
    }
  }));

test("temporary redirects and conditional redirect bypasses fail the gate", () =>
  fixture((root) => {
    writeFileSync(
      join(root, "vercel.json"),
      JSON.stringify({
        redirects: [
          {
            source: "/(.*)",
            destination,
            permanent: false,
            has: [{ type: "query", key: "redirect" }],
          },
        ],
      }),
    );
    assert.ok(validate(root).some((error) => error.includes("permanently")));
  }));

test("the manual fallback and noindex cannot silently disappear from either page", () =>
  fixture((root) => {
    const path = join(root, "404.html");
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace("noindex, follow", "index, follow")
        .replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/, ""),
    );
    const errors = validate(root);
    assert.ok(errors.some((error) => error.includes("noindex")));
    assert.ok(errors.some((error) => error.includes("manual link")));
  }));

test("robots cannot prevent reading the page's noindex", () =>
  fixture((root) => {
    writeFileSync(join(root, "robots.txt"), "User-agent: *\nDisallow: /\n");
    assert.ok(validate(root).some((error) => error.includes("Allow crawlers")));
  }));

test("unpinned Actions and unnecessary write permissions fail the gate", () =>
  fixture((root) => {
    const path = join(root, ".github/workflows/quality.yml");
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v4")
        .replace("contents: read", "contents: write"),
    );
    const errors = validate(root);
    assert.ok(errors.some((error) => error.includes("read-only")));
    assert.ok(errors.some((error) => error.includes("commit SHA")));
  }));

test("only the local deferred favicon script is allowed, with no inline or remote code", () => {
  for (const script of [
    '<script src="./legacy-app.js" defer></script>',
    '<script src="https://example.invalid/favicon-motion.js" defer></script>',
    '<script src="./favicon-motion.js/../legacy-app.js" defer></script>',
    '<script src="./favicon-motion.js?v=valid&redirect=remote" defer></script>',
    '<script src="./favicon-motion.js" defer>alert(1)</script>',
    '<script src="./favicon-motion.js" onload="alert(1)" defer></script>',
  ])
    fixture((root) => {
      const path = join(root, "index.html");
      writeFileSync(
        path,
        readFileSync(path, "utf8").replace(
          /<script\b[\s\S]*?<\/script>/i,
          script,
        ),
      );
      assert.ok(
        validate(root).some((error) => error.includes("legacy application")),
      );
    });
});

test("favicon reference allowances cannot be reused for links or other assets", () => {
  for (const injection of [
    '<a href="./favicon-motion.js">legacy</a>',
    '<link rel="stylesheet" href="./favicon-animated.svg" />',
    '<img src="./favicon-animated.svg" />',
    '<a href="https://example.invalid/">external</a>',
  ])
    fixture((root) => {
      const path = join(root, "index.html");
      writeFileSync(
        path,
        readFileSync(path, "utf8").replace("</main>", injection + "</main>"),
      );
      assert.ok(
        validate(root).some((error) =>
          error.includes("unexpected local or external"),
        ),
      );
    });
  for (const firstHref of [
    'href="https://example.invalid/favicon.svg"',
    "href=https://example.invalid/favicon.svg",
  ])
    fixture((root) => {
      const path = join(root, "index.html");
      const html = readFileSync(path, "utf8");
      writeFileSync(
        path,
        html.replace(/(<link\b[^>]*data-favicon-motion[^>]*>)/i, (icon) =>
          icon.replace(/href=/i, firstHref + " href="),
        ),
      );
      assert.ok(
        validate(root).some((error) =>
          error.includes("unexpected local or external"),
        ),
      );
    });
});

test("missing motion assets, duplicate scripts, relaxed CSP and scripts on 404 fail", () => {
  fixture((root) => {
    rmSync(join(root, "favicon-motion.js"));
    assert.ok(
      validate(root).some((error) => error.includes("Missing motion asset")),
    );
  });
  fixture((root) => {
    const path = join(root, "index.html");
    const html = readFileSync(path, "utf8");
    const script = /<script\b[\s\S]*?<\/script>/i.exec(html)[0];
    writeFileSync(path, html.replace("</head>", script + "</head>"));
    assert.ok(
      validate(root).some((error) => error.includes("one local motion")),
    );
  });
  fixture((root) => {
    const path = join(root, "index.html");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "script-src 'self'",
        "script-src 'self' 'unsafe-inline'",
      ),
    );
    assert.ok(
      validate(root).some((error) => error.includes("bounded local CSP")),
    );
  });
  fixture((root) => {
    const path = join(root, "404.html");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "</head>",
        '<script src="./favicon-motion.js" defer></script></head>',
      ),
    );
    assert.ok(
      validate(root).some((error) => error.includes("legacy application")),
    );
  });
});
