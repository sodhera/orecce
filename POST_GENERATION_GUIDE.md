# Blog → Instagram Posts: Complete Pipeline Guide

This document explains the full process of turning blog posts into Instagram carousel content using AI. The pipeline has **three stages**: scraping blogs, generating posts with OpenAI, and uploading to a database.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Stage 1 — Scraping Blogs](#2-stage-1--scraping-blogs)
3. [Stage 2 — Generating Posts with OpenAI](#3-stage-2--generating-posts-with-openai)
4. [Stage 3 — Uploading to Supabase](#4-stage-3--uploading-to-supabase)
5. [Metadata CSV — Tracking Everything](#5-metadata-csv--tracking-everything)
6. [Directory Structure](#6-directory-structure)
7. [Setup & Dependencies](#7-setup--dependencies)

---

## 1. Pipeline Overview

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Blog Sites  │ ──▶  │  OpenAI GPT-5.2  │ ──▶  │  Supabase (DB)   │
│  (Scraping)  │      │  (Post Gen)      │      │  (Upload)        │
└──────────────┘      └──────────────────┘      └──────────────────┘
       │                       │                         │
   articles/             posts/*.json              posts table
   *.txt files           (carousel data)           (live data)
       │                       │                         │
   articles.csv ◀──── processed=true ◀──── uploaded=true
   (metadata)          (marked in CSV)       (marked in CSV)
```

**In plain English:**

1. **Scrape** blog articles from a website → saves each article as a `.txt` file and records metadata (title, URL, categories) in a CSV.
2. **Process** each `.txt` file by sending it to OpenAI's `gpt-5.2` model with a system prompt → the model returns a JSON object containing Instagram carousel posts. The CSV is updated to mark the blog as `processed=true`.
3. **Upload** the generated JSON posts to our Supabase database → the CSV is updated to mark the blog as `uploaded=true`.

---

## 2. Stage 1 — Scraping Blogs

We currently scrape from three blog sources. Each has its own scraper inside `blog_scraper/`.

### Farnam Street (fs.blog)

**Scraper:** `blog_scraper/fsblog/scraper.py`

The scraper has two subcommands:

```bash
# Step 1: Collect all article titles, links, dates, and categories → articles.csv
python blog_scraper/fsblog/scraper.py metadata

# Step 2: Download the full text of each article → articles/*.txt
python blog_scraper/fsblog/scraper.py download
```

**How `metadata` works:**
- Crawls every page of `https://fs.blog/blog/` (follows pagination links).
- For each article, extracts: `title`, `link`, `date`, `slug`, and `categories`.
- Also scrapes category pages to map each article to its categories (e.g., "Decision Making", "Mental Models").
- Saves everything to `blog_scraper/fsblog/articles.csv`.

**How `download` works:**
- Reads `articles.csv`, and for each row, downloads the full article HTML.
- Extracts the main text content (strips scripts, styles, nav, etc.).
- Saves each article as `blog_scraper/fsblog/articles/{slug}.txt`.
- Skips articles that have already been downloaded.

**Key code — extracting article text:**

```python
def extract_article(url: str) -> tuple[str, str]:
    soup = fetch_soup(url)

    # Extract date from meta tag
    date_meta = soup.select_one('meta[property="article:published_time"]')
    date_str = date_meta.get("content", "")[:10] if date_meta else ""

    # Extract content
    content = (
        soup.select_one(".entry-content")
        or soup.select_one("article .content")
        or soup.select_one("article")
    )

    # Remove unwanted elements
    for tag in content.find_all(["script", "style", "nav", "footer", ...]):
        tag.decompose()

    # Extract text blocks
    valid_tags = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"}
    blocks = []
    for el in content.find_all(valid_tags):
        text = el.get_text(separator=" ", strip=True)
        if text:
            blocks.append(text)

    return date_str, "\n\n".join(blocks)
```

### Paul Graham Essays

**Scraper:** `pg_essays_scraper.py`

```bash
python pg_essays_scraper.py                    # Scrape all essays
python pg_essays_scraper.py --only-new         # Only scrape new ones
python pg_essays_scraper.py --workers 16       # Faster (more parallelism)
```

- Scrapes essay links from `https://www.paulgraham.com/articles.html`.
- Downloads each essay's HTML, extracts plain text.
- Saves to `output/paul_graham/text/{slug}.txt` and a `essays.json` manifest.

### Modern Wisdom

- Similar structure under `blog_scraper/modern_wisdom/`.
- Has its own `scraper.py`.

---

## 3. Stage 2 — Generating Posts with OpenAI

**Script:** `process_blogs.py`

This is the core of the pipeline. It reads scraped blog text files one by one, sends each to OpenAI with our system prompt, and saves the returned JSON.

### How to Run

```bash
# Process all unprocessed blogs in the "Decision Making" category
python process_blogs.py

# Process only 5 blogs (for testing)
python process_blogs.py --limit 5

# Use a different model
python process_blogs.py --model gpt-4o

# Process a different blog source
python process_blogs.py \
  --input-dir blog_scraper/paul_graham/articles \
  --output-dir blog_scraper/paul_graham/posts \
  --csv-file blog_scraper/paul_graham/articles.csv
```

### Configuration (at top of `process_blogs.py`)

```python
OPENAI_API_KEY = "sk-proj-..."          # Your OpenAI API key
MODEL = "gpt-5.2-2025-12-11"           # The OpenAI model to use
MAX_CONCURRENT = 10                     # Max parallel API requests
INPUT_DIR = Path("blog_scraper/fsblog/articles")
OUTPUT_DIR = Path("blog_scraper/fsblog/posts")
CSV_PATH = Path("blog_scraper/fsblog/articles.csv")
PROMPT_FILE = Path("prompt2.md")        # Path to the system prompt
```

### What Happens Step by Step

1. **Reads the metadata CSV** and filters for articles in the target category (e.g., "Decision Making") that haven't been processed yet (`processed != "true"`).

2. **Reads the system prompt** from `prompt2.md`.

3. **For each unprocessed blog**, sends an API request to OpenAI:

```python
response = await client.chat.completions.create(
    model=model,
    messages=[
        {"role": "system", "content": system_prompt},   # Our prompt
        {"role": "user", "content": blog_text},          # The blog article
    ],
    response_format={"type": "json_object"},   # Force JSON output
    temperature=0.7,
)
```

4. **Saves the returned JSON** to `posts/{slug}.json`.

5. **Marks `processed=true`** in the CSV for that article.

The script processes blogs **concurrently** (up to 10 at a time by default) with a progress bar:

```
  ████████████████████████░░░░░░░░░░░░░░░░  15/25  (14 ✓  1 ✗)  60%
```

### The System Prompt

The full system prompt is in **`prompt.md`**. 

### Output JSON Format

The model returns JSON in this structure:

```json
{
  "source_title": "Title of the original blog post",
  "posts": [
    {
      "post_type": "carousel",
      "theme": "Perseverance Against All Odds",
      "slides": [
        {
          "slide_number": 1,
          "type": "hook",
          "text": "Most startup advice is wrong about failure.\n\nHere's what actually separates founders who survive from those who don't."
        },
        {
          "slide_number": 2,
          "type": "body",
          "text": "In 2008, Airbnb had **$200 in the bank**.\n\nBrian Chesky maxed out credit cards. Investors said no 7 times in a row.\n\nMost people would quit. They didn't."
        },
        {
          "slide_number": 3,
          "type": "closer",
          "text": "The difference between a failed startup and a $100B company?\n\n**One more try.**"
        }
      ]
    },
    {
      "post_type": "single",
      "theme": "Contrarian Insight",
      "slides": [
        {
          "slide_number": 1,
          "type": "standalone",
          "text": "The best founders don't avoid failure.\n\nThey **become comfortable** with it."
        }
      ]
    }
  ]
}
```

Each blog article can produce **multiple posts** — the model extracts as many distinct, quality ideas as it can.

---

## 4. Stage 3 — Uploading to Supabase

**Script:** `upload_to_supabase.js`

This script reads the generated JSON post files and uploads them to our Supabase database.

### How to Run

```bash
node upload_to_supabase.js
```

It's interactive — it prompts you for:
- **Author ID** (UUID of the author in the database)
- **Posts directory** (e.g., `blog_scraper/fsblog/posts`)
- **CSV path** (e.g., `blog_scraper/fsblog/articles.csv`)

### What Happens

1. Reads the metadata CSV, builds a lookup map of `slug → row`.
2. Iterates through every `.json` file in the posts directory.
3. **Skips** files where `uploaded=true` in the CSV.
4. For each file, extracts the posts array and formats them for Supabase:

```javascript
const postsToInsert = posts.map(post => ({
    author_id: config.authorId,
    post_type: post.post_type || 'carousel',
    theme: post.theme || 'Untitled',
    source_title: sourceTitle,
    source_url: row ? row.link : null,     // Original blog URL
    slides: post.slides,
    tags: [],
    global_popularity_score: 0.5,
    published_at: new Date().toISOString()
}));
```

5. Inserts into the `posts` table in Supabase.
6. On success, marks `uploaded=true` in the CSV.
7. Rewrites the CSV with updated statuses.

---

## 5. Metadata CSV — Tracking Everything

The CSV file (e.g., `blog_scraper/fsblog/articles.csv`) is the **central tracker** for the entire pipeline. Each row represents one blog article.

### CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| `title` | Article title | "Chesterton's Fence: A Lesson in Thinking" |
| `date` | Publication date | 2022-09-05 |
| `link` | Original URL | https://fs.blog/chestertons-fence/ |
| `slug` | URL-safe identifier (also the filename stem) | chestertons-fence-a-lesson-in-thinking |
| `categories` | Pipe-separated categories | Decision Making\|Thinking |
| `processed` | Whether the blog has been turned into posts | true / (empty) |
| `uploaded` | Whether the posts have been uploaded to Supabase | true / false |

### Example Row

```csv
title,date,link,slug,categories,processed,uploaded
Chesterton's Fence: A Lesson in Thinking,2022-09-05,https://fs.blog/chestertons-fence/,chestertons-fence-a-lesson-in-thinking,Decision Making|Thinking,true,true
```

### How Each Stage Updates the CSV

| Stage | What it does to CSV |
|-------|---------------------|
| **Scraping (metadata)** | Creates rows with `title`, `date`, `link`, `slug`, `categories` |
| **Processing (OpenAI)** | Sets `processed=true` for each blog that was successfully processed |
| **Uploading (Supabase)** | Sets `uploaded=true` for each blog whose posts were successfully uploaded |

This means you can always check the CSV to see which blogs still need processing or uploading.

---

## 6. Directory Structure

```
blogs_to_posts/
├── process_blogs.py           # Main script: sends blogs to OpenAI
├── prompt2.md                 # System prompt for OpenAI (current version)
├── prompt.md                  # System prompt (startup-focused variant)
├── upload_to_supabase.js      # Uploads generated posts to Supabase
├── pg_essays_scraper.py       # Paul Graham essay scraper
│
├── blog_scraper/
│   ├── fsblog/                # Farnam Street
│   │   ├── scraper.py         # FS Blog scraper
│   │   ├── articles.csv       # Metadata + tracking (1380+ articles)
│   │   ├── articles/          # Scraped blog text files (*.txt)
│   │   └── posts/             # Generated post JSONs (*.json)
│   │
│   ├── paul_graham/           # Paul Graham
│   │   ├── articles.csv
│   │   ├── articles/          # Scraped essays (*.txt)
│   │   └── posts/             # Generated post JSONs (*.json)
│   │
│   └── modern_wisdom/         # Modern Wisdom
│       ├── scraper.py
│       ├── articles.csv
│       └── articles/          # Scraped articles (*.txt)
│
├── package.json               # Node.js deps for upload script
└── README.md
```

---

## 7. Setup & Dependencies

### Python (for scraping + processing)

```bash
pip install openai beautifulsoup4 curl_cffi
```

### Node.js (for uploading)

```bash
npm install
```

The `package.json` includes:
- `@supabase/supabase-js` — Supabase client
- `inquirer` — interactive CLI prompts
- `csv-parser` / `csv-writer` — CSV reading/writing

### Environment

- **OpenAI API key:** Hardcoded at the top of `process_blogs.py` (line 28). Replace with your own key.
- **Supabase credentials:** Hardcoded at the top of `upload_to_supabase.js` (lines 11-12).

---

## Quick Start (End to End)

```bash
# 1. Scrape a blog
cd blog_scraper/fsblog
python scraper.py metadata        # Collect article metadata
python scraper.py download        # Download full article text
cd ../..

# 2. Generate posts with AI
python process_blogs.py           # Uses default config (fsblog, Decision Making)

# 3. Upload to database
node upload_to_supabase.js        # Interactive — will ask for author ID, paths
```

That's it! Check `articles.csv` to see what's been processed and uploaded.
