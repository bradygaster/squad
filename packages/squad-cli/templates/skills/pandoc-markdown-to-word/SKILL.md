---
name: "pandoc-markdown-to-word"
description: "Convert Markdown files to Word (.docx) using pandoc"
domain: "document-conversion"
confidence: "medium"
source: "manual — pandoc installed on Dina's Windows laptop, available from bash"
---

## Context

Use this skill when you need to produce Word documents from Markdown sources — for sharing with stakeholders who prefer .docx, generating review documents, or creating polished deliverables from content drafts. Pandoc is installed locally and available from bash shell.

## Patterns

### Basic Markdown to Word

```bash
pandoc input.md -o output.docx
```

### With better formatting

```bash
# Standalone with metadata (title, author, date from YAML front matter)
pandoc input.md -o output.docx --standalone

# With table of contents
pandoc input.md -o output.docx --toc --toc-depth=3

# With a custom reference template (preserves corporate styling)
pandoc input.md -o output.docx --reference-doc=template.docx
```

### Creating a reference template

Extract the default template, customize in Word, then reuse:

```bash
# Generate default reference doc
pandoc -o custom-reference.docx --print-default-data-file reference.docx

# Then open custom-reference.docx in Word, modify styles (Heading 1, Body Text, etc.)
# Use it for all future conversions:
pandoc input.md -o output.docx --reference-doc=custom-reference.docx
```

### Multiple files → single Word doc

```bash
# Combine several markdown files into one document
pandoc chapter1.md chapter2.md chapter3.md -o combined.docx --toc

# With file list
pandoc $(cat filelist.txt) -o combined.docx --toc
```

### From PowerShell

```powershell
# Single file
bash -c "pandoc input.md -o output.docx --toc"

# With reference template
bash -c "pandoc input.md -o output.docx --reference-doc=template.docx"
```

### Batch conversion (all .md files in a directory)

```bash
for f in *.md; do
  pandoc "$f" -o "${f%.md}.docx" --standalone
done
```

## Recommended Options

| Option | Purpose | When to use |
|--------|---------|-------------|
| `--standalone` | Includes document metadata | Always — ensures title/author render properly |
| `--toc` | Generates table of contents | Documents longer than 3 sections |
| `--toc-depth=N` | TOC heading depth (default: 3) | Adjust for deeply/shallowly nested docs |
| `--reference-doc=X.docx` | Apply custom Word styles | When you need corporate branding or consistent formatting |
| `--highlight-style=tango` | Syntax highlighting for code blocks | Documents with code samples |
| `--metadata title="X"` | Set title without YAML front matter | Quick one-offs without editing the .md |
| `--wrap=none` | No line wrapping in source | Prevents odd paragraph breaks |
| `-f gfm` | Input is GitHub Flavored Markdown | When source uses GFM extensions (task lists, tables, strikethrough) |

## YAML Front Matter

Pandoc reads YAML front matter for document metadata:

```markdown
---
title: "Deep Dive: Content Strategy"
author: "Dina Berry"
date: "March 2026"
abstract: "Overview of the content strategy for Azure developer documentation."
---

# Section 1
...
```

This renders as the Word document's title page, author field, and abstract.

## Word-Specific Tips

1. **Styles map to headings** — `# H1` → Word "Heading 1", `## H2` → "Heading 2", etc. Customize these in the reference doc.
2. **Tables render natively** — Markdown tables become real Word tables (not images).
3. **Code blocks** — Rendered with monospace font and optional syntax highlighting.
4. **Images** — Local image paths are embedded. Use relative paths.
5. **Links** — Become clickable hyperlinks in Word.
6. **Footnotes** — Pandoc footnote syntax (`[^1]`) becomes Word footnotes.

## Common Workflows

### Content review cycle
```bash
# Author writes in markdown, generates Word for reviewer
pandoc article.md -o article-review.docx --toc --reference-doc=msft-template.docx
# Reviewer comments in Word, author incorporates back into markdown
```

### Presentation prep → Word handout
```bash
# Convert presentation notes to Word handout
pandoc presentation-notes.md -o handout.docx --toc --metadata title="Deep Dive Handout"
```

### Multi-source report
```bash
# Combine analysis files into single report
pandoc executive-summary.md findings.md recommendations.md -o report.docx \
  --toc --metadata title="Q3 Content Strategy Report"
```

## Anti-Patterns

- **Don't expect pixel-perfect layout.** Word conversion prioritizes structure over visual design. Use `--reference-doc` for styling.
- **Don't use HTML in markdown for Word output.** Raw HTML blocks are often ignored or poorly rendered. Stick to pure Markdown/Pandoc syntax.
- **Don't forget `-f gfm` for GitHub-style markdown.** Without it, task lists (`- [ ]`) and strikethrough (`~~text~~`) won't convert properly.
- **Don't skip `--standalone` for formal documents.** Without it, metadata (title, author) won't appear in the Word document properties.
