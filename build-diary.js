#!/usr/bin/env node
/**
 * build-diary.js
 * ---------------------------------------------------------------------
 * Reads every Markdown post from content/diary/*.md, renders each one
 * into a full page at diary/<slug>.html using the site's existing nav,
 * header, footer, fonts and colors (no new visual design), and
 * refreshes the homepage's Diary preview cards in index.html with the
 * most recent posts.
 *
 * Usage:
 *   node build-diary.js
 *
 * Run this every time you add, edit, or remove a file in
 * content/diary/. No npm install / dependencies required.
 * ---------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, "content", "diary");
const OUT_DIR = path.join(ROOT, "diary");
const INDEX_FILE = path.join(ROOT, "index.html");

const CARDS_START = "<!-- DIARY_CARDS:START -->";
const CARDS_END = "<!-- DIARY_CARDS:END -->";
const PREVIEW_COUNT = 3; // most recent posts shown on the homepage
const CODE_PLACEHOLDER = "@@CODEBLOCK"; // unlikely to collide with real prose

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
    return `<a href="${href}"${external ? ' target="_blank"' : ""}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

// ---- block-level markdown ---------------------------------------------
// Supported: # / ## / ### headings, bullet lists (- or *), fenced code
// blocks (```), paragraphs, plus the inline formatting above.
// Heading levels are shifted down two (#->h3, ##->h4, ###->h5) because
// the post's own title is rendered as the page's h2.

function markdownToHtml(md) {
  const codeBlocks = [];
  // Extract fenced code blocks first so nothing inside them is touched
  // by block/inline parsing. Force blank lines around the placeholder
  // so it always lands in its own block, even if the fence in the
  // source wasn't blank-line separated (e.g. "Output:\n```\n...\n```").
  const source = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(
      `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(
        code.replace(/\r?\n$/, "")
      )}</code></pre>`
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

// ---- date formatting: matches the site's existing "Dec 31, 2025" style --

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
}

// ---- page template: same header/nav/footer markup as diary.html ------

function renderPostPage({ title, date, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ashish Aggrawal - ${escapeHtml(title)}</title>
    <link rel="stylesheet" href="../style.css" />
    <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet">
  </head>
  <body>
    <div class="color-bar">
      <div class="c1"></div><div class="c2"></div><div class="c3"></div>
      <div class="c4"></div><div class="c5"></div><div class="c6"></div><div class="c7"></div>
    </div>

    <header>
      <div class="container header-content">
        <div class="logo">
          <h1><a href="../index.html">Ashish.</a></h1>
        </div>
        <nav>
          <a href="../index.html">Home</a>
          <a href="../projects.html">Projects</a>
          <a href="../diary.html" class="active">Technical Log</a>
        </nav>
      </div>
    </header>

    <div class="container" style="padding-top: 60px; padding-bottom: 60px;">
      <div style="max-width: 800px; margin: 0 auto;">
        <div style="margin-bottom: 40px; border-bottom: 2px dashed var(--text-navy); padding-bottom: 20px;">
          <a href="../index.html#diary" class="btn" style="font-size: 16px; padding: 10px 20px;">&larr; Back to Technical Log</a>
          <h2 class="section-title" style="margin-top: 20px;">${escapeHtml(title)}</h2>
          <span class="diary-date" style="font-size: 15px;">${formatDate(date)}</span>
        </div>

        <div class="post-content">
${bodyHtml}
        </div>
      </div>
    </div>

    <footer>
      <p>&copy; 2026 Ashish Aggrawal.</p>
    </footer>
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

  // Files starting with "_" (e.g. _template.md) are skipped — they never
  // become posts, so you can keep a template alongside real posts.
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  if (files.length === 0) {
    console.warn(`No .md files found in ${POSTS_DIR}`);
  }

  const posts = files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { meta, body } = parsePost(raw, file);
    const bodyHtml = markdownToHtml(body);
    const page = renderPostPage({ title: meta.title, date: meta.date, bodyHtml });
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), page, "utf8");
    return { slug, title: meta.title, date: meta.date, summary: meta.summary };
  });

  posts.sort((a, b) => (a.date < b.date ? 1 : -1));

  const cardsHtml = posts
    .slice(0, PREVIEW_COUNT)
    .map(
      (p) => `              <li>
                <span class="diary-date">${formatDate(p.date)}</span>
                <a href="diary/${p.slug}.html" class="diary-link">${escapeHtml(p.title)}</a>
                <p class="diary-excerpt">${escapeHtml(p.summary)}</p>
              </li>`
    )
    .join("\n");

  const indexHtml = fs.readFileSync(INDEX_FILE, "utf8");
  const markerRegex = new RegExp(`${CARDS_START}[\\s\\S]*?${CARDS_END}`);
  if (!markerRegex.test(indexHtml)) {
    throw new Error(`Could not find ${CARDS_START} / ${CARDS_END} markers in index.html`);
  }
  fs.writeFileSync(
    INDEX_FILE,
    indexHtml.replace(markerRegex, `${CARDS_START}\n${cardsHtml}\n              ${CARDS_END}`),
    "utf8"
  );

  console.log(`Built ${posts.length} post(s):`);
  posts.forEach((p) => console.log(`  - diary/${p.slug}.html  (${p.date})  ${p.title}`));
  console.log(
    `Updated homepage Diary preview with the ${Math.min(PREVIEW_COUNT, posts.length)} most recent post(s).`
  );
}

build();
