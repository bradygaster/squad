---
name: "pandoc-pdf-to-markdown"
description: "Convert PDF files to clean Markdown using pandoc"
domain: "document-conversion"
confidence: "medium"
source: "manual — pandoc installed on Dina's Windows laptop, available from bash"
---

## Context

Use this skill when you need to extract content from PDF files into Markdown for editing, analysis, or content workflows. Pandoc is installed locally and available from bash shell on the Windows laptop.

## Patterns

### Basic PDF to Markdown

```bash
pandoc input.pdf -o output.md
```

### With better formatting options

```bash
# Wrap lines at 80 chars, extract media to subfolder
pandoc input.pdf -o output.md --wrap=none --extract-media=./media

# ATX-style headers (# instead of underline style)
pandoc input.pdf -o output.md --wrap=none --atx-headers
```

### Batch conversion (all PDFs in a directory)

```bash
for f in *.pdf; do
  pandoc "$f" -o "${f%.pdf}.md" --wrap=none --atx-headers --extract-media=./media
done
```

### From PowerShell (calling bash)

```powershell
# Single file
bash -c "pandoc input.pdf -o output.md --wrap=none --atx-headers"

# Batch
bash -c 'for f in *.pdf; do pandoc "$f" -o "${f%.pdf}.md" --wrap=none --atx-headers; done'
```

## Recommended Options

| Option | Purpose | When to use |
|--------|---------|-------------|
| `--wrap=none` | Prevents artificial line breaks | Always — preserves paragraph structure |
| `--atx-headers` | Uses `#` headers instead of underline | Always — standard Markdown style |
| `--extract-media=./media` | Pulls embedded images to a folder | When PDF has images/diagrams |
| `--standalone` | Includes YAML metadata block | When you want title/author/date extracted |
| `-t gfm` | Output GitHub Flavored Markdown | When targeting GitHub repos or docs |
| `--shift-heading-level-by=-1` | Promotes headings up one level | When PDF has deeply nested structure |

## Post-Conversion Cleanup

PDF-to-Markdown output typically needs cleanup:

1. **Tables** — Pandoc often mangles complex PDF tables. Review and reformat manually.
2. **Headers** — Check hierarchy; PDFs may use visual formatting (bold/large text) instead of semantic headers.
3. **Images** — Verify extracted images are correct and paths are valid.
4. **Page numbers/footers** — Remove repeated headers, footers, page numbers.
5. **Line breaks** — Remove orphaned line breaks mid-sentence (common from PDF column layouts).
6. **Special characters** — Fix encoding artifacts (curly quotes, em dashes, ligatures).

## Other Useful Conversions

Pandoc handles many formats beyond PDF→Markdown:

```bash
# DOCX to Markdown
pandoc input.docx -o output.md --wrap=none --atx-headers --extract-media=./media

# Markdown to DOCX
pandoc input.md -o output.docx

# Markdown to PowerPoint (useful for deep dive presentations!)
pandoc input.md -o output.pptx

# HTML to Markdown
pandoc input.html -o output.md -t gfm
```

## Anti-Patterns

- **Don't assume perfect conversion.** PDF is a visual format, not semantic. Complex layouts (multi-column, sidebars, callout boxes) will produce messy output.
- **Don't skip cleanup.** Always review output before using in content workflows.
- **Don't use pandoc for scanned PDFs.** Pandoc reads text-layer PDFs only. For scanned/image PDFs, you need OCR (Tesseract) first.
- **Don't forget `--wrap=none`.** Without it, pandoc inserts hard line breaks at ~72 chars, splitting paragraphs.
