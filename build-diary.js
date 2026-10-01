#!/usr/bin/env node
/**
 * build-diary.js
 * ---------------------------------------------------------------------
 * Reads every Markdown post from content/diary/*.md and:
 *   - renders each to diary/<slug>.html (site header/nav/footer, dark
 *     mode, build-time syntax highlighting, prev/next links)
 *   - refreshes the homepage preview cards in index.html
 *   - refreshes the full archive list in diary.html
 *   - writes sitemap.xml, robots.txt and feed.xml at the repo root
 *
 * Usage:  node build-diary.js
 * Run this whenever you add, edit or remove a file in content/diary/.
 * No npm install / dependencies required.
 * ---------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, "content", "diary");
const OUT_DIR = path.join(ROOT, "diary");
const INDEX_FILE = path.join(ROOT, "index.html");
const DIARY_FILE = path.join(ROOT, "diary.html");
const SITE_URL = "https://ashishaggrawal.github.io";
const FAVICON =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E%3Crect%20width='100'%20height='100'%20rx='18'%20fill='%23002535'/%3E%3Ctext%20x='50'%20y='54'%20font-family='Georgia,serif'%20font-size='62'%20fill='%23e8dfc8'%20text-anchor='middle'%20dominant-baseline='central'%3EA%3C/text%3E%3C/svg%3E";

const CARDS_START = "<!-- DIARY_CARDS:START -->";
const CARDS_END = "<!-- DIARY_CARDS:END -->";
const ARCHIVE_START = "<!-- DIARY_ARCHIVE:START -->";
const ARCHIVE_END = "<!-- DIARY_ARCHIVE:END -->";
const PREVIEW_COUNT = 5; // most recent posts shown on the homepage
const CODE_PLACEHOLDER = "@@CODEBLOCK"; // unlikely to collide with real prose

// ---- shared markup (kept identical to index.html / diary.html) -------

const THEME_INIT_SCRIPT = `<script>
      (function () {
        document.documentElement.classList.add("js");
        try {
          var s = localStorage.getItem("theme");
          var d = s
            ? s === "dark"
            : matchMedia("(prefers-color-scheme: dark)").matches;
          if (d) document.documentElement.setAttribute("data-theme", "dark");
        } catch (e) {}
      })();
    </script>`;

const THEME_TOGGLE_SCRIPT = `<script>
      (function () {
        var root = document.documentElement;
        var btn = document.querySelector(".theme-toggle");
        if (btn)
          btn.addEventListener("click", function () {
            var dark = root.getAttribute("data-theme") !== "dark";
            root.classList.add("theme-anim");
            root.setAttribute("data-theme", dark ? "dark" : "light");
            try {
              localStorage.setItem("theme", dark ? "dark" : "light");
            } catch (e) {}
            setTimeout(function () {
              root.classList.remove("theme-anim");
            }, 420);
          });
        try {
          matchMedia("(prefers-color-scheme: dark)").addEventListener(
            "change",
            function (e) {
              if (!localStorage.getItem("theme"))
                root.setAttribute("data-theme", e.matches ? "dark" : "light");
            }
          );
        } catch (e) {}

        var targets = document.querySelectorAll(".reveal, .reveal-stagger");
        if (!("IntersectionObserver" in window)) {
          targets.forEach(function (el) {
            el.classList.add("in-view");
          });
          return;
        }
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add("in-view");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
        );
        targets.forEach(function (el) {
          io.observe(el);
        });
      })();
    </script>`;

const SVG_DEFS = `<svg width="0" height="0" aria-hidden="true" style="position: absolute">
      <symbol id="ico-github" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></symbol>
      <symbol id="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></symbol>
      <symbol id="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></symbol>
    </svg>`;

const THEME_TOGGLE_BTN = `<button class="theme-toggle" type="button" aria-label="Switch color theme">
          <svg class="ico-moon" aria-hidden="true"><use href="#ico-moon" /></svg>
          <svg class="ico-sun" aria-hidden="true"><use href="#ico-sun" /></svg>
        </button>`;

// ---- frontmatter -----------------------------------------------------

function parsePost(raw, filename) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(
      `${filename}: missing YAML frontmatter block ("---" ... "---") at the top of the file.`
    );
  }
  const [, fmBlock, body] = match;
  const meta = {};
  fmBlock.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
  ["title", "date", "summary"].forEach((key) => {
    if (!meta[key]) {
      throw new Error(`${filename}: frontmatter is missing "${key}:"`);
    }
  });
  return { meta, body: body.trim() };
}

// ---- inline markdown (bold, italics, links, images, inline code) -----

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text) {
  let out = escapeHtml(text);
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy" />`
  );
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href);
    return `<a href="${href}"${
      external ? ' target="_blank" rel="noopener"' : ""
    }>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

// ---- build-time syntax highlighting (C / C++ / PowerShell) ----------

const C_KEYWORDS =
  "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL nullptr".split(
    " "
  );
const C_TYPES =
  "int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t int_least8_t int_least16_t int_least32_t int_least64_t int_fast8_t int_fast16_t int_fast32_t int_fast64_t intmax_t uintmax_t size_t ssize_t ptrdiff_t intptr_t uintptr_t wchar_t char16_t char32_t FILE".split(
    " "
  );
const PS_KEYWORDS =
  "if else elseif for foreach while do switch function filter return param begin process end try catch finally throw break continue in".split(
    " "
  );

function highlightCode(raw, lang) {
  const code = raw.replace(/\r?\n$/, "");
  lang = (lang || "").toLowerCase();
  const isC = ["c", "cpp", "c++", "h", "hpp"].includes(lang);
  const isPS = ["powershell", "pwsh", "ps", "ps1"].includes(lang);
  if (!isC && !isPS) return escapeHtml(code);

  const rules = isPS
    ? [
        ["comment", /<#[\s\S]*?#>|#[^\n]*/y],
        ["string", /@"[\s\S]*?"@|@'[\s\S]*?'@|"(?:[^"`]|`.)*"|'[^']*'/y],
        ["var", /\$[A-Za-z_][\w:]*/y],
        ["fn", /\b[A-Z][a-z]+-[A-Za-z][A-Za-z0-9]*\b/y],
        ["kw", new RegExp("\\b(?:" + PS_KEYWORDS.join("|") + ")\\b", "iy")],
        ["num", /\b\d+\b/y],
        ["id", /[A-Za-z_]\w*/y],
      ]
    : [
        ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
        ["pre", /^[ \t]*#[ \t]*[A-Za-z_]+/my],
        ["string", /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y],
        [
          "num",
          /\b0[xX][0-9A-Fa-f]+[uUlL]*\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b/y,
        ],
        ["kw", new RegExp("\\b(?:" + C_KEYWORDS.join("|") + ")\\b", "y")],
        ["type", new RegExp("\\b(?:" + C_TYPES.join("|") + ")\\b", "y")],
        ["fn", /[A-Za-z_]\w*(?=\s*\()/y],
        ["id", /[A-Za-z_]\w*/y],
      ];

  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    let hit = null;
    let cls = null;
    for (const [c, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i && m[0].length) {
        hit = m[0];
        cls = c;
        break;
      }
    }
    if (hit == null) {
      out += escapeHtml(code[i]);
      i += 1;
      continue;
    }
    out +=
      cls === "id"
        ? escapeHtml(hit)
        : `<span class="tok-${cls}">${escapeHtml(hit)}</span>`;
    i += hit.length;
  }
  return out;
}

// ---- block-level markdown -------------------------------------------
// Supported: # / ## / ### headings (shifted to h3/h4/h5), bullet lists
// (- or *), fenced code blocks (```lang), paragraphs, inline formatting.

function markdownToHtml(md) {
  const codeBlocks = [];
  const source = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(
      `<pre><code${
        lang ? ` class="language-${lang}"` : ""
      }>${highlightCode(code, lang)}</code></pre>`
    );
    return `\n\n${CODE_PLACEHOLDER}${codeBlocks.length - 1}\n\n`;
  });

  return source
    .split(/\r?\n\r?\n+/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";

      const codeMatch = block.match(new RegExp(`^${CODE_PLACEHOLDER}(\\d+)$`));
      if (codeMatch) return codeBlocks[Number(codeMatch[1])];

      const headingMatch = block.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length + 2;
        return `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
      }

      if (/^[-*]\s+/.test(block)) {
        const items = block
          .split(/\r?\n/)
          .map((line) => `<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      return `<p>${renderInline(block.split(/\r?\n/).join(" "))}</p>`;
    })
    .join("\n");
}

// ---- dates ---------------------------------------------------------

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}
function rfc822(iso) {
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

// ---- post page template ------------------------------------------------

function renderPostPage({ slug, title, date, summary, bodyHtml, newer, older }) {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const url = `${SITE_URL}/diary/${slug}.html`;

  const link = (p, label, rel) =>
    p
      ? `<a href="${p.slug}.html" rel="${rel}"><span>${label}</span><strong>${escapeHtml(
          p.title
        )}</strong></a>`
      : `<span></span>`;
  const postNav =
    newer || older
      ? `
        <nav class="post-nav reveal" aria-label="More posts">
          ${link(newer, "← Newer", "prev")}
          ${link(older, "Older →", "next")}
        </nav>`
      : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle} — Ashish Aggrawal</title>
    <meta name="description" content="${safeSummary}" />
    <meta name="author" content="Ashish Aggrawal" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" href="${FAVICON}" />
    <link rel="alternate" type="application/rss+xml" title="Ashish Aggrawal — Technical Log" href="${SITE_URL}/feed.xml" />
    <meta name="theme-color" content="#e8dfc8" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#131e26" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeSummary}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE_URL}/Resources/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE_URL}/Resources/og-image.png" />
    <script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    datePublished: date,
    author: { "@type": "Person", name: "Ashish Aggrawal" },
    url,
    description: summary,
  },
  null,
  2
)
  .split("\n")
  .map((l) => "      " + l)
  .join("\n")}
    </script>
    ${THEME_INIT_SCRIPT}
    <link rel="stylesheet" href="../style.css" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>

    ${SVG_DEFS}

    <div class="color-bar" aria-hidden="true">
      <div class="c1"></div><div class="c2"></div><div class="c3"></div>
    </div>

    <header>
      <div class="container header-content">
        <a class="logo" href="../index.html">Ashish.</a>
        <input type="checkbox" id="nav-toggle" class="nav-toggle" />
        <label for="nav-toggle" class="nav-toggle-btn" aria-label="Toggle navigation menu">
          <span></span><span></span><span></span>
        </label>
        <nav>
          <a href="../index.html#skills">Skills</a>
          <a href="../index.html#projects">Projects</a>
          <a href="../index.html#experience">Experience</a>
          <a href="../diary.html" class="active" aria-current="page">Technical Log</a>
          <a href="../index.html#contact">Contact</a>
        </nav>
        ${THEME_TOGGLE_BTN}
      </div>
    </header>

    <main id="main" class="container" style="padding-top: 60px; padding-bottom: 60px;">
      <article style="max-width: 800px; margin: 0 auto;">
        <div class="page-intro">
          <a href="../diary.html" class="btn btn-secondary" style="font-size: 16px; padding: 10px 20px;">&larr; Back to Technical Log</a>
          <h1 class="section-title" style="margin-top: 20px;">${safeTitle}</h1>
          <time class="diary-date" datetime="${date}" style="font-size: 15px;">${formatDate(
    date
  )}</time>
        </div>

        <div class="post-content">
${bodyHtml}
        </div>
${postNav}
      </article>
    </main>

    <footer>
      <div class="container footer-inner">
        <p>&copy; 2026 Ashish Aggrawal.</p>
        <nav class="footer-links" aria-label="Elsewhere">
          <a href="https://github.com/ashishaggrawal" target="_blank" rel="noopener">GitHub</a>
          <a href="https://www.linkedin.com/in/ashishaggrawal" target="_blank" rel="noopener">LinkedIn</a>
          <a href="../Resources/resume.pdf" target="_blank" rel="noopener" download>R&eacute;sum&eacute;</a>
          <a href="../feed.xml">RSS</a>
        </nav>
      </div>
    </footer>
    ${THEME_TOGGLE_SCRIPT}
  </body>
</html>
`;
}

// ---- main ---------------------------------------------------------------

function build() {
  if (!fs.existsSync(POSTS_DIR)) {
    throw new Error(`Posts folder not found: ${POSTS_DIR}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  if (files.length === 0) console.warn(`No .md files found in ${POSTS_DIR}`);

  // parse everything first, then sort, so prev/next neighbours are known
  const posts = files
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
      const { meta, body } = parsePost(raw, file);
      return {
        slug,
        title: meta.title,
        date: meta.date,
        summary: meta.summary,
        bodyHtml: markdownToHtml(body),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  posts.forEach((p, idx) => {
    const page = renderPostPage({
      ...p,
      newer: posts[idx - 1],
      older: posts[idx + 1],
    });
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), page, "utf8");
  });

  const renderItem = (p, indent) =>
    `${indent}<li>
${indent}  <time class="diary-date" datetime="${p.date}">${formatDate(
      p.date
    )}</time>
${indent}  <a href="diary/${p.slug}.html" class="diary-link">${escapeHtml(
      p.title
    )}</a>
${indent}  <p class="diary-excerpt">${escapeHtml(p.summary)}</p>
${indent}</li>`;

  replaceBetween(
    INDEX_FILE,
    CARDS_START,
    CARDS_END,
    `\n${posts
      .slice(0, PREVIEW_COUNT)
      .map((p) => renderItem(p, "              "))
      .join("\n")}\n              `,
    "index.html"
  );

  replaceBetween(
    DIARY_FILE,
    ARCHIVE_START,
    ARCHIVE_END,
    `\n${posts.map((p) => renderItem(p, "          ")).join("\n")}\n          `,
    "diary.html"
  );

  writeSiteFiles(posts);

  console.log(`Built ${posts.length} post(s):`);
  posts.forEach((p) =>
    console.log(`  - diary/${p.slug}.html  (${p.date})  ${p.title}`)
  );
  console.log(
    `Updated homepage preview (${Math.min(
      PREVIEW_COUNT,
      posts.length
    )}), diary.html archive (${posts.length}), sitemap.xml, robots.txt, feed.xml.`
  );
}

// ---- sitemap.xml / robots.txt / feed.xml ------------------------------

function writeSiteFiles(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const newest = posts[0] ? posts[0].date : today;

  const urls = [
    { loc: `${SITE_URL}/`, lastmod: newest },
    { loc: `${SITE_URL}/diary.html`, lastmod: newest },
    ...posts.map((p) => ({
      loc: `${SITE_URL}/diary/${p.slug}.html`,
      lastmod: p.date,
    })),
  ];
  fs.writeFileSync(
    path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`
        )
        .join("\n") +
      `\n</urlset>\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    "utf8"
  );

  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${SITE_URL}/diary/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE_URL}/diary/${p.slug}.html</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${escapeHtml(p.summary)}</description>
    </item>`
    )
    .join("\n");
  fs.writeFileSync(
    path.join(ROOT, "feed.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Ashish Aggrawal — Technical Log</title>
    <link>${SITE_URL}/diary.html</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Notes on systems programming, C/C++, kernels and low-level performance.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(newest)}</lastBuildDate>
${items}
  </channel>
</rss>
`,
    "utf8"
  );
}

// Replace the text between two marker comments in a file, keeping the markers.
function replaceBetween(file, startMarker, endMarker, inner, label) {
  const html = fs.readFileSync(file, "utf8");
  const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (!regex.test(html)) {
    throw new Error(
      `Could not find ${startMarker} / ${endMarker} markers in ${label}`
    );
  }
  fs.writeFileSync(
    file,
    html.replace(regex, `${startMarker}${inner}${endMarker}`),
    "utf8"
  );
}

build();
