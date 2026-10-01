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

// Post pages only: reading-progress bar, "On this page" highlighting and
// copy buttons on code blocks.
const POST_SCRIPT = `<script>
      (function () {
        var bar = document.querySelector(".read-progress span");
        var body = document.querySelector(".post-content");
        function progress() {
          if (!bar || !body) return;
          var r = body.getBoundingClientRect();
          var total = r.height - window.innerHeight * 0.6;
          var p = total > 0 ? -r.top / total : 1;
          bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, p)) + ")";
        }
        addEventListener("scroll", progress, { passive: true });
        addEventListener("resize", progress);
        progress();

        var links = document.querySelectorAll(".post-toc a");
        if (links.length && "IntersectionObserver" in window) {
          var byId = {};
          links.forEach(function (a) {
            byId[a.getAttribute("href").slice(1)] = a;
          });
          var spy = new IntersectionObserver(
            function (entries) {
              entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                links.forEach(function (a) {
                  a.classList.remove("active");
                });
                var a = byId[e.target.id];
                if (a) a.classList.add("active");
              });
            },
            { rootMargin: "0px 0px -70% 0px" }
          );
          Object.keys(byId).forEach(function (id) {
            var h = document.getElementById(id);
            if (h) spy.observe(h);
          });
        }

        document.querySelectorAll(".post-content pre").forEach(function (pre) {
          var wrap = document.createElement("div");
          wrap.className = "code-wrap";
          pre.parentNode.insertBefore(wrap, pre);
          wrap.appendChild(pre);
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "copy-btn";
          btn.textContent = "Copy";
          btn.setAttribute("aria-label", "Copy code to clipboard");
          wrap.appendChild(btn);
          btn.addEventListener("click", function () {
            var text = pre.innerText;
            function done(ok) {
              btn.textContent = ok ? "Copied ✓" : "Press Ctrl+C";
              btn.classList.toggle("copied", ok);
              setTimeout(function () {
                btn.textContent = "Copy";
                btn.classList.remove("copied");
              }, 1600);
            }
            function fallback() {
              var ta = document.createElement("textarea");
              ta.value = text;
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              document.body.appendChild(ta);
              ta.select();
              var ok = false;
              try {
                ok = document.execCommand("copy");
              } catch (e) {}
              document.body.removeChild(ta);
              done(ok);
            }
            if (navigator.clipboard && window.isSecureContext) {
              navigator.clipboard.writeText(text).then(function () {
                done(true);
              }, fallback);
            } else {
              fallback();
            }
          });
        });
      })();
    </script>`;

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

// Headings get a slug id; each one is also pushed onto `headings` so the
// post page can build its "On this page" list.
function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function markdownToHtml(md, headings = []) {
  const usedIds = new Set();
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
        let id = slugify(headingMatch[2]);
        for (let n = 2; usedIds.has(id); n++) id = `${slugify(headingMatch[2])}-${n}`;
        usedIds.add(id);
        const html = renderInline(headingMatch[2]);
        headings.push({ level, id, html });
        return `<h${level} id="${id}">${html}</h${level}>`;
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
// ---- log card metadata ------------------------------------------------

// ~200 words per minute, rounded up; code counts as words too.
function readingMinutes(md) {
  const words = md.replace(/[#*`>\-\[\]()!]/g, " ").split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 200));
}

// First few meaningful lines of the post's first code block (no #includes,
// blank lines or bare braces), highlighted for the featured card.
function codeTeaser(md) {
  const m = md.match(/```(\w*)\r?\n([\s\S]*?)```/);
  if (!m) return "";
  const lines = m[2]
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*#\s*include\b/.test(l) && !/^\s*[{}]\s*$/.test(l))
    .slice(0, 4);
  return lines.length ? highlightCode(lines.join("\n"), m[1]) : "";
}

// ---- card diagrams ----------------------------------------------------
// Small line drawings in the same style as the homepage project
// schematics (cream panel, navy strokes). Pick one per post with
// `diagram: <name>` in the frontmatter; unknown/missing names fall back
// to "chip". Classes drive the draw-in animation in style.css:
//   .d    stroke draws itself (needs pathLength="1")
//   .g    bar grows from the left      .pop  pops in
//   .fade fades in                     .loop dashes keep marching

const INK = "#002535";
const PAPER = "#f8f5ec";
const TEAL = "#0a5a60";
const BERRY = "#8f201c";
const RUST = "#b5450b";
const GOLD = "#d98a1f";
const MONO = `font-family="'IBM Plex Mono',monospace"`;
const at = (s) => `style="animation-delay: ${s}s"`;
const label = (x, y, text, { size = 12.5, fill = INK, anchor = "middle", cls = "fade", delay = 0.5, weight = "" } = {}) =>
  `<text class="${cls}" ${at(delay)} x="${x}" y="${y}" ${MONO} font-size="${size}" fill="${fill}" text-anchor="${anchor}"${
    weight ? ` font-weight="${weight}"` : ""
  }>${text}</text>`;
const line = (x1, y1, x2, y2, { stroke = INK, delay = 0, width = 2 } = {}) =>
  `<line class="d" ${at(delay)} pathLength="1" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" />`;
const box = (x, y, w, h, { fill = PAPER, delay = 0, rx = 3, cls = "pop", extra = "" } = {}) =>
  `<rect class="${cls}" ${at(delay)} x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="2"${extra} />`;
const arrowHead = (x, y, dir, { fill = INK, delay = 0 } = {}) => {
  const pts = {
    right: `${x},${y} ${x - 8},${y - 5} ${x - 8},${y + 5}`,
    left: `${x},${y} ${x + 8},${y - 5} ${x + 8},${y + 5}`,
    up: `${x},${y} ${x - 5},${y + 8} ${x + 5},${y + 8}`,
  }[dir];
  return `<polygon class="pop" ${at(delay)} points="${pts}" fill="${fill}" />`;
};

const DIAGRAMS = {
  // byte order: the same 4 bytes, wire order vs. little-endian memory
  endianness() {
    const xs = [112, 178, 244, 310];
    const wire = ["00", "01", "00", "00"];
    const mem = ["00", "00", "01", "00"];
    let s = label(96, 34, "WIRE", { anchor: "end", delay: 0.1 }) + label(96, 98, "x86", { anchor: "end", delay: 0.1 });
    xs.forEach((x, i) => {
      s += line(x + 28, 42, xs[3 - i] + 28, 78, { stroke: i === 1 ? TEAL : INK, delay: 0.3 + i * 0.08 });
    });
    xs.forEach((x, i) => {
      const hot = wire[i] === "01";
      s += box(x, 14, 56, 28, { fill: hot ? TEAL : PAPER, delay: 0.05 + i * 0.06 });
      s += label(x + 28, 33, wire[i], { fill: hot ? PAPER : INK, delay: 0.1 + i * 0.06, weight: hot ? "600" : "" });
    });
    xs.forEach((x, i) => {
      const hot = mem[i] === "01";
      s += box(x, 78, 56, 28, { fill: hot ? TEAL : PAPER, delay: 0.7 + i * 0.06 });
      s += label(x + 28, 97, mem[i], { fill: hot ? PAPER : INK, delay: 0.75 + i * 0.06, weight: hot ? "600" : "" });
    });
    return s;
  },

  // two's complement range: negating INT_MIN has nowhere to land
  "int-range"() {
    let s = line(20, 58, 360, 58, { delay: 0 });
    [
      [40, "INT_MIN"],
      [190, "0"],
      [282, "INT_MAX"],
    ].forEach(([x, t], i) => {
      s += line(x, 51, x, 65, { delay: 0.2 + i * 0.05 });
      s += label(x, 80, t, { delay: 0.3 });
    });
    s += `<path class="d" ${at(0.5)} pathLength="1" d="M40 50 C 100 -4, 290 -4, 352 48" fill="none" stroke="${BERRY}" stroke-width="2" />`;
    s += label(196, 30, "−x", { fill: BERRY, size: 13, delay: 0.8, weight: "600" });
    s += `<circle class="pop" ${at(1.1)} cx="352" cy="58" r="7" fill="${PAPER}" stroke="${BERRY}" stroke-width="2" stroke-dasharray="3 2" />`;
    s += label(352, 80, "2³¹?", { fill: BERRY, delay: 1.15, weight: "600" });
    s += `<path class="fade" ${at(1.3)} d="M352 90 C 320 122, 90 122, 52 96" fill="none" stroke="${BERRY}" stroke-width="2" stroke-dasharray="5 4" />`;
    s += arrowHead(46, 92, "up", { fill: BERRY, delay: 1.4 });
    return s;
  },

  // the optimizer deletes a post-addition overflow check
  "overflow-check"() {
    let s = box(12, 42, 112, 34, { delay: 0.05 }) + label(68, 63, "sum = x + y", { delay: 0.1 });
    s += line(124, 59, 146, 59, { delay: 0.25 }) + arrowHead(150, 59, "right", { delay: 0.35 });
    s += `<polygon class="pop" ${at(0.4)} points="205,26 260,59 205,92 150,59" fill="${PAPER}" stroke="${INK}" stroke-width="2" />`;
    s += label(205, 63, "sum &lt; 0 ?", { size: 11.5, delay: 0.5 });
    s += line(260, 59, 280, 59, { delay: 0.6 }) + arrowHead(284, 59, "right", { delay: 0.7 });
    s += box(284, 42, 100, 34, { delay: 0.75 }) + label(334, 63, "return 1", { delay: 0.8 });
    s += line(278, 88, 390, 30, { stroke: BERRY, delay: 1.1, width: 3 });
    s += label(334, 110, "-O2: deleted", { fill: BERRY, delay: 1.4, weight: "600" });
    s += label(205, 112, "UB ⇒ never true", { size: 11.5, delay: 1.4 });
    return s;
  },

  // (a + b) + c  ≠  a + (b + c)
  "float-assoc"() {
    const node = (x, y, d) =>
      `<circle class="pop" ${at(d)} cx="${x}" cy="${y}" r="13" fill="${PAPER}" stroke="${INK}" stroke-width="2" />` +
      label(x, y + 4, "+", { size: 13, delay: d + 0.05, weight: "600" });
    const leaf = (x, y, t, d) =>
      box(x - 11, y - 11, 22, 22, { delay: d, fill: GOLD }) + label(x, y + 4, t, { delay: d + 0.05, weight: "600" });
    let s = "";
    // left: (a + b) + c
    s += line(92, 30, 62, 68, { delay: 0.2 }) + line(92, 30, 126, 68, { delay: 0.2 });
    s += line(62, 68, 38, 98, { delay: 0.4 }) + line(62, 68, 86, 98, { delay: 0.4 });
    s += node(92, 30, 0.05) + node(62, 68, 0.3) + leaf(126, 70, "c", 0.35) + leaf(38, 100, "a", 0.5) + leaf(86, 100, "b", 0.5);
    // right: a + (b + c)
    s += line(308, 30, 274, 68, { delay: 0.2 }) + line(308, 30, 338, 68, { delay: 0.2 });
    s += line(338, 68, 314, 98, { delay: 0.4 }) + line(338, 68, 362, 98, { delay: 0.4 });
    s += node(308, 30, 0.05) + leaf(274, 70, "a", 0.35) + node(338, 68, 0.3) + leaf(314, 100, "b", 0.5) + leaf(362, 100, "c", 0.5);
    s += label(200, 76, "≠", { size: 38, fill: BERRY, delay: 0.8 });
    return s;
  },

  // linked nodes + a CAS swinging the tail pointer
  "lock-free-queue"() {
    let s = "";
    [20, 112, 204].forEach((x, i) => {
      const d = 0.05 + i * 0.12;
      s += box(x, 44, 66, 32, { delay: d });
      s += line(x + 46, 44, x + 46, 76, { delay: d + 0.1 });
      s += `<circle class="pop" ${at(d + 0.15)} cx="${x + 56}" cy="60" r="3.5" fill="${INK}" />`;
      if (i < 2) s += line(x + 60, 60, x + 88, 60, { delay: d + 0.2 }) + arrowHead(x + 92, 60, "right", { delay: d + 0.3 });
    });
    s += `<rect class="fade" ${at(0.7)} x="306" y="44" width="66" height="32" rx="3" fill="none" stroke="${TEAL}" stroke-width="2" stroke-dasharray="5 4" />`;
    s += label(339, 64, "new", { fill: TEAL, delay: 0.75 });
    s += `<path class="loop" d="M262 42 C 276 6, 320 6, 334 40" fill="none" stroke="${TEAL}" stroke-width="2" stroke-dasharray="4 3" />`;
    s += label(346, 26, "CAS", { fill: TEAL, anchor: "start", delay: 0.8, weight: "600" });
    s += label(53, 100, "HEAD", { delay: 0.5 }) + label(237, 100, "TAIL", { delay: 0.6 });
    return s;
  },

  // 8 / 16 / 32 / 64-bit widths
  "int-widths"() {
    const rows = [
      ["int8_t", 35, RUST],
      ["int16_t", 70, TEAL],
      ["int32_t", 140, GOLD],
      ["int64_t", 280, BERRY],
    ];
    return rows
      .map(
        ([t, w, c], i) =>
          label(84, 25 + i * 26, t, { anchor: "end", delay: 0.05 + i * 0.08 }) +
          box(92, 13 + i * 26, w, 16, { fill: c, cls: "g gl", rx: 2, delay: 0.1 + i * 0.12 })
      )
      .join("");
  },

  // terminal deleting repos one confirmation at a time
  terminal() {
    const tx = (y, t, fill, d) => label(62, y, t, { fill, anchor: "start", size: 12, delay: d });
    let s = `<rect class="fade" ${at(0)} x="40" y="8" width="320" height="104" rx="6" fill="#0b1a22" stroke="${INK}" stroke-width="2" />`;
    s += [BERRY, GOLD, TEAL]
      .map((c, i) => `<circle class="pop" ${at(0.1 + i * 0.05)} cx="${56 + i * 12}" cy="20" r="3.5" fill="${c}" />`)
      .join("");
    s += tx(46, "&gt; gh repo list | ForEach", "#6cbccc", 0.3);
    s += tx(66, "  old-project-2019      y", "#dfe7e4", 0.5);
    s += tx(84, "  hackathon-demo        y", "#dfe7e4", 0.6);
    s += tx(102, "  portfolio             n", "#93c9a6", 0.7);
    s += line(70, 62, 230, 62, { stroke: "#e07a6e", delay: 0.9 }) + line(70, 80, 230, 80, { stroke: "#e07a6e", delay: 1.05 });
    return s;
  },

  // generic fallback: an IC package
  chip() {
    let s = box(150, 22, 100, 76, { delay: 0.05, fill: PAPER });
    [36, 52, 68, 84].forEach((y, i) => {
      s += line(122, y, 150, y, { delay: 0.2 + i * 0.06 }) + line(250, y, 278, y, { delay: 0.2 + i * 0.06 });
    });
    s += `<circle class="pop" ${at(0.3)} cx="164" cy="34" r="3" fill="${INK}" />`;
    s += label(200, 66, "LOG", { size: 14, delay: 0.5, weight: "600" });
    return s;
  },
};

function renderDiagram(name) {
  const draw = DIAGRAMS[name] || DIAGRAMS.chip;
  return `<svg viewBox="0 0 400 120" aria-hidden="true" focusable="false">${draw()}</svg>`;
}

function rfc822(iso) {
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

// ---- log cards -----------------------------------------------------------
// The newest post is the wide "featured" card (with a code teaser); the
// rest sit in the two-column card grid. `base` is the path from the page
// the card is on to the diary/ folder.

function renderCard(p, indent, { featured = false, base = "" } = {}) {
  const tags = p.tags.length
    ? `<ul class="log-tags" aria-label="Topics">${p.tags
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join("")}</ul>`
    : "";
  const teaser =
    featured && p.teaser
      ? `\n${indent}      <pre class="log-teaser" aria-hidden="true"><code>${p.teaser}</code></pre>`
      : "";
  return `${indent}<li${featured ? ' class="log-featured"' : ""}>
${indent}  <article class="log-card">
${indent}    <div class="log-thumb">${renderDiagram(p.diagram)}</div>
${indent}    <div class="log-body">
${indent}      <div class="log-text">
${indent}        <div class="log-meta">${
    featured ? `<span class="log-badge">Latest</span>` : ""
  }<time datetime="${p.date}">${p.date}</time><span>${p.readMinutes} min read</span></div>
${indent}        <h3 class="log-title"><a href="${base}${p.slug}.html" class="log-link">${escapeHtml(
    p.title
  )}</a></h3>
${indent}        <p class="log-excerpt">${escapeHtml(p.summary)}</p>
${indent}        <div class="log-foot">${tags}<span class="log-more" aria-hidden="true">Read →</span></div>
${indent}      </div>${teaser}
${indent}    </div>
${indent}  </article>
${indent}</li>`;
}

// Up to two other posts, ranked by tags in common (then newest first).
// "C" is on nearly every post, so it only counts as a tie-breaker.
function relatedPosts(post, posts) {
  const mine = new Set(post.tags);
  return posts
    .filter((q) => q.slug !== post.slug)
    .map((q) => ({
      q,
      score: q.tags.reduce((n, t) => n + (mine.has(t) ? (t === "C" ? 0.1 : 1) : 0), 0),
    }))
    .filter((r) => r.score >= 1)
    .sort((a, b) => b.score - a.score || (a.q.date < b.q.date ? 1 : -1))
    .slice(0, 2)
    .map((r) => r.q);
}

// ---- post page template ------------------------------------------------

function renderPostPage({
  slug,
  title,
  date,
  summary,
  tags,
  readMinutes,
  headings,
  bodyHtml,
  newer,
  older,
  related,
}) {
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

  // "On this page": the top two heading levels, only when there are 3+
  const top = Math.min(...headings.map((h) => h.level));
  const tocItems = headings.filter((h) => h.level <= top + 1);
  const toc =
    tocItems.length >= 3
      ? `
        <nav class="post-toc" aria-label="On this page">
          <p class="post-toc-title">On this page</p>
          <ol>
${tocItems
  .map(
    (h) =>
      `            <li${h.level > top ? ' class="sub"' : ""}><a href="#${h.id}">${h.html.replace(
        /<\/?(?:a|em|strong)[^>]*>/g,
        ""
      )}</a></li>`
  )
  .join("\n")}
          </ol>
        </nav>`
      : "";

  const tagList = tags.length
    ? `
          <ul class="log-tags" aria-label="Topics">${tags
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join("")}</ul>`
    : "";

  const relatedHtml = related.length
    ? `
          <section class="post-related" aria-labelledby="related-title">
            <h2 id="related-title" class="post-related-title">Related notes</h2>
            <ul class="log-list reveal-stagger">
${related.map((p) => renderCard(p, "              ")).join("\n")}
            </ul>
          </section>`
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
      <div class="read-progress" aria-hidden="true"><span></span></div>
    </header>

    <main id="main" class="container" style="padding-top: 60px; padding-bottom: 60px;">
      <article class="post-layout${toc ? " has-toc" : ""}">
        <div class="page-intro post-head">
          <a href="../diary.html" class="btn btn-secondary" style="font-size: 16px; padding: 10px 20px;">&larr; Back to Technical Log</a>
          <h1 class="section-title" style="margin-top: 20px;">${safeTitle}</h1>
          <div class="log-meta post-meta"><time datetime="${date}">${formatDate(
    date
  )}</time><span>${readMinutes} min read</span></div>${tagList}
        </div>
${toc}
        <div class="post-main">
          <div class="post-content">
${bodyHtml}
          </div>
${relatedHtml}
${postNav}
        </div>
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
    ${POST_SCRIPT}
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
      const headings = [];
      const bodyHtml = markdownToHtml(body, headings);
      return {
        slug,
        title: meta.title,
        date: meta.date,
        summary: meta.summary,
        tags: (meta.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        diagram: meta.diagram || "chip",
        readMinutes: readingMinutes(body),
        teaser: codeTeaser(body),
        headings,
        bodyHtml,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  posts.forEach((p, idx) => {
    const page = renderPostPage({
      ...p,
      newer: posts[idx - 1],
      older: posts[idx + 1],
      related: relatedPosts(p, posts),
    });
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), page, "utf8");
  });

  replaceBetween(
    INDEX_FILE,
    CARDS_START,
    CARDS_END,
    `\n${posts
      .slice(0, PREVIEW_COUNT)
      .map((p, i) => renderCard(p, "              ", { featured: i === 0, base: "diary/" }))
      .join("\n")}\n              `,
    "index.html"
  );

  replaceBetween(
    DIARY_FILE,
    ARCHIVE_START,
    ARCHIVE_END,
    `\n${posts
      .map((p, i) => renderCard(p, "          ", { featured: i === 0, base: "diary/" }))
      .join("\n")}\n          `,
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
