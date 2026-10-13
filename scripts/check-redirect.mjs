import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const destination = "https://riccardobuzzolan.github.io/";
export const motionCsp =
  "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const motionAsset = (value, filename) =>
  new RegExp(
    `^\\./${filename.replaceAll(".", "\\.")}(?:\\?v=[A-Za-z0-9_-]{1,64})?$`,
  ).test(value ?? "");
const motionScript =
  /<script\s+src=(["'])\.\/favicon-motion\.js(?:\?v=[A-Za-z0-9_-]{1,64})?\1\s+defer\s*>\s*<\/script\s*>/gi;

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi)].map((match) => [
      match[1].toLowerCase(),
      match[3],
    ]),
  );
}

function uniqueAttributes(tag) {
  const body = tag.replace(/^<[\w:-]+\b|\/?>$/g, "");
  const names = [
    ...body.matchAll(/([a-z][\w:-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi),
  ].map((match) => match[1].toLowerCase());
  return new Set(names).size === names.length;
}

export function validate(directory = ".") {
  const root = resolve(directory);
  const errors = [];
  const read = (name) => {
    const path = join(root, name);
    if (!existsSync(path)) {
      errors.push(`Missing required file: ${name}`);
      return "";
    }
    return readFileSync(path, "utf8");
  };
  for (const name of ["index.html", "404.html"]) {
    const html = read(name);
    const allowedScripts =
      name === "index.html" ? [...html.matchAll(motionScript)] : [];
    const iconTags = [...html.matchAll(/<link\b[^>]*>/gi)].filter((match) => {
      const tag = attributes(match[0]);
      return (
        name === "index.html" &&
        tag.rel === "icon" &&
        tag.type === "image/svg+xml" &&
        tag["data-motion"] === "ribbon" &&
        /\sdata-favicon-motion(?:\s|\/?>)/i.test(match[0]) &&
        motionAsset(tag.href, "favicon-animated.svg") &&
        uniqueAttributes(match[0]) &&
        Object.keys(tag).every((key) =>
          ["rel", "type", "href", "data-motion"].includes(key),
        ) &&
        !/\son[a-z]+\s*=/i.test(match[0])
      );
    });
    const hasMotion = allowedScripts.length > 0 || iconTags.length > 0;
    const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) =>
      attributes(match[0]),
    );
    if (hasMotion) {
      if (allowedScripts.length !== 1 || iconTags.length !== 1)
        errors.push(
          `${name}: one local motion favicon and deferred script required`,
        );
      const policies = meta.filter(
        (tag) => tag["http-equiv"]?.toLowerCase() === "content-security-policy",
      );
      if (policies.length !== 1 || policies[0].content !== motionCsp)
        errors.push(`${name}: motion assets require the bounded local CSP`);
      for (const asset of ["favicon-animated.svg", "favicon-motion.js"])
        if (!existsSync(join(root, asset)))
          errors.push(`Missing motion asset: ${asset}`);
    }
    const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => attributes(match[0]))
      .filter((tag) => tag.rel === "canonical");
    if (canonical.length !== 1 || canonical[0].href !== destination)
      errors.push(`${name}: canonical must point to the current portfolio`);
    const robots = meta
      .find((tag) => tag.name === "robots")
      ?.content?.split(/[,\s]+/);
    if (!robots?.includes("noindex") || !robots.includes("follow"))
      errors.push(`${name}: noindex, follow required`);
    const refresh = meta.filter(
      (tag) => tag["http-equiv"]?.toLowerCase() === "refresh",
    );
    if (refresh.length !== 1 || refresh[0].content !== `0; url=${destination}`)
      errors.push(`${name}: fixed immediate refresh required`);
    const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
    if (
      !links.some(
        (match) =>
          attributes(match[1]).href === destination &&
          match[2].replace(/<[^>]+>/g, "").trim(),
      )
    )
      errors.push(`${name}: usable manual link required`);
    if (
      (html.match(/<h1\b/gi) || []).length !== 1 ||
      !/<main\b/i.test(html) ||
      !/<html\b[^>]*lang="it"/i.test(html)
    )
      errors.push(`${name}: semantic fallback required`);
    if (
      !meta.some((tag) => tag.name === "viewport") ||
      !/<title>[^<]+<\/title>/i.test(html)
    )
      errors.push(`${name}: title/viewport required`);
    if (
      /<script\b|<iframe\b|<form\b|<canvas\b|serviceWorker|data:image|rel=["']manifest|javascript:/i.test(
        name === "index.html" ? html.replace(motionScript, "") : html,
      )
    )
      errors.push(`${name}: legacy application/PWA content remains`);
    const allowedTags = new Set(
      [...allowedScripts, ...iconTags].map(
        (match) => /^<[^>]*>/.exec(match[0])[0],
      ),
    );
    for (const match of html.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)) {
      for (const [, value] of match[0].matchAll(
        /\b(?:src|href)=["']([^"']+)["']/g,
      ))
        if (value !== destination && !allowedTags.has(match[0]))
          errors.push(`${name}: unexpected local or external reference`);
    }
  }
  try {
    const config = JSON.parse(read("vercel.json"));
    const redirects = config.redirects;
    if (
      Object.keys(config).some((key) => key !== "redirects") ||
      !Array.isArray(redirects) ||
      redirects.length !== 1
    )
      errors.push("Vercel must contain one redirect and no application routes");
    const redirect = redirects?.[0];
    if (
      !redirect ||
      redirect.source !== "/(.*)" ||
      redirect.destination !== destination ||
      redirect.permanent !== true ||
      Object.keys(redirect).some(
        (key) => !["source", "destination", "permanent"].includes(key),
      )
    )
      errors.push(
        "Vercel redirect must permanently send all paths to the fixed canonical portfolio",
      );
  } catch {
    errors.push("vercel.json must be valid JSON");
  }
  const robots = read("robots.txt");
  if (!/^User-agent:\s*\*/m.test(robots) || /^Disallow:\s*\/\s*$/m.test(robots))
    errors.push(
      "Allow crawlers to read the noindex/redirect instead of blocking the legacy page",
    );
  const workflow = read(".github/workflows/quality.yml");
  if (
    !/permissions:\s*\n\s+contents:\s*read/.test(workflow) ||
    /(?:contents|pages|id-token|security-events):\s*write/.test(workflow)
  )
    errors.push("CI requires read-only permissions");
  if (
    !/persist-credentials:\s*false/.test(workflow) ||
    !/timeout-minutes:\s*5\b/.test(workflow) ||
    !/concurrency:/.test(workflow)
  )
    errors.push("CI credentials, timeout and concurrency guards required");
  for (const [, action] of workflow.matchAll(/\buses:\s*([^\s#]+)/g)) {
    if (!/@[a-f0-9]{40}$/.test(action))
      errors.push("CI action must be pinned to a commit SHA");
  }
  if (
    !workflow.includes("node scripts/check-redirect.mjs") ||
    !workflow.includes("node --test tests/redirect.test.mjs")
  )
    errors.push("CI must execute redirect validation and regressions");
  if (
    !read(".github/dependabot.yml").includes(
      "package-ecosystem: github-actions",
    )
  )
    errors.push("GitHub Actions Dependabot required");

  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if ([".git", "node_modules"].includes(entry.name)) return [];
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
  const files = walk(root);
  const secretPatterns = [
    ["private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
    [
      "GitHub token",
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/,
    ],
    [
      "API token",
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
    ],
    ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ];
  for (const path of files) {
    const name = relative(root, path).replaceAll("\\", "/");
    if (
      /(?:^|\/)(?:\.env(?!\.example)|id_rsa|id_ed25519|credentials?|secrets?|service[-_]?account)(?:\.|\/|$)|\.(?:pem|key|p12|pfx|jks|keystore|zip|7z|rar|bak|backup|sqlite|db)$/i.test(
        name,
      )
    )
      errors.push(`Reserved file: ${name}`);
    if (
      !/\.(?:mjs|js|html|json|ya?ml|txt|md)$/.test(extname(path)) ||
      name === "scripts/check-redirect.mjs"
    )
      continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const [kind, pattern] of secretPatterns) {
      const line = lines.findIndex((value) => pattern.test(value));
      if (line >= 0)
        errors.push(`Possible ${kind}: ${name}:${line + 1} (value redacted)`);
    }
  }
  for (const obsolete of [
    "site.webmanifest",
    "manifest.json",
    "sw.js",
    "service-worker.js",
    "favicon.ico",
    "apple-touch-icon.png",
    "social-preview.png",
  ])
    if (existsSync(join(root, obsolete)))
      errors.push(`Unused legacy file remains: ${obsolete}`);
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const errors = validate(process.argv[2]);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Legacy fallback, canonical, noindex, HTTP redirect config and secret checks passed.",
    );
}
