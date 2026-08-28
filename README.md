# ashishaggrawal.github.io

Personal portfolio site for Ashish Aggrawal — plain HTML/CSS, no framework, no build step for the site itself. Live at [ashishaggrawal.github.io](https://ashishaggrawal.github.io/).

## Structure

```
index.html          Homepage — hero, technical arsenal, featured projects,
                     experience timeline, technical log preview, contact
projects.html        Full project archive
diary.html            Full technical log archive (legacy list of external links)
style.css             Shared styles for every page (single stylesheet, no preprocessor)
Resources/            Images and resume used across the site
.nojekyll              Tells GitHub Pages to serve files as-is (no Jekyll processing)
```

## Technical Log (blog)

Posts are written as Markdown and rendered into static pages by a small,
dependency-free Node script — no CMS, no framework.

```
content/diary/         Markdown source posts (frontmatter + body)
content/diary/_template.md   Copy this to start a new post (never gets built)
diary/                 Generated post pages (diary/<slug>.html) — build output
diary/images/           Images referenced from posts
build-diary.js           The build script
```

### Writing a new post

1. Copy `content/diary/_template.md` to a new file in `content/diary/` — the
   filename (without `.md`) becomes the post's URL slug, e.g.
   `my-new-post.md` → `diary/my-new-post.html`.
2. Fill in the frontmatter and write the post:

   ```
   ---
   title: Your Post Title
   date: YYYY-MM-DD
   summary: One-line summary shown on the homepage card.
   ---

   Your **Markdown** content here...
   ```

3. Run the build:

   ```
   node build-diary.js
   ```

   This generates `diary/<slug>.html` (using the same nav/header/footer/styles
   as the rest of the site) and refreshes the homepage's Technical Log preview
   with the 3 most recent posts.
4. Commit everything, including the generated `diary/*.html` files — GitHub
   Pages serves static files only, nothing builds server-side.

Supported Markdown: `#`/`##`/`###` headings, **bold**, *italics*, bullet
lists, `` `inline code` ``, fenced code blocks, `[links](url)`, and
`![images](path)`. Drop image files into `diary/images/` and reference them
from a post as `images/your-file.png`.

## Deployment

Static site hosted via GitHub Pages, served directly from `main` — no CI
build step. Push to `main` and the site redeploys automatically (confirm this
under the repo's Settings → Pages if it doesn't).
