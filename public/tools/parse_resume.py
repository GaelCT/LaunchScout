#!/usr/bin/env python3
"""Convert a local resume to Markdown without an API key or network requests.

Python 3.10+. TXT/MD/DOCX use the standard library; PDF additionally needs pypdf.
Run: python parse_resume.py resume.pdf -o resume.md
"""

from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_DOCX_XML_BYTES = 10 * 1024 * 1024
MAX_CHARACTERS = 30_000
MAX_PAGES = 15
WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SECTION = re.compile(
    r"^(summary|profile|education|experience|work experience|professional experience|"
    r"projects|selected projects|skills|technical skills|certifications|awards|"
    r"volunteering|leadership|community|publications|languages)$", re.IGNORECASE
)
SPACED_HEADINGS = {
    heading.replace(" ", ""): heading.title()
    for heading in (
        "summary", "profile", "education", "experience", "work experience",
        "professional experience", "projects", "selected projects", "skills",
        "technical skills", "certifications", "awards", "volunteering", "leadership",
        "community", "publications", "languages",
    )
}


class ResumeError(ValueError):
    """A user-readable import or output error."""


def extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ResumeError(
            "PDF support needs pypdf. Install it with: python -m pip install pypdf"
        ) from exc
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ResumeError("This PDF is encrypted. Export an unlocked copy first.")
        if len(reader.pages) > MAX_PAGES:
            raise ResumeError("Use a resume with 15 pages or fewer.")
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
            if sum(len(text) for text in pages) > MAX_CHARACTERS:
                raise ResumeError("Use a resume with 30,000 characters or fewer.")
        return "\n\n".join(pages)
    except ResumeError:
        raise
    except Exception as exc:
        raise ResumeError("This PDF could not be read. Try a text-based, unlocked PDF.") from exc


def extract_docx(data: bytes) -> str:
    try:
        with ZipFile(BytesIO(data)) as document:
            info = document.getinfo("word/document.xml")
            if info.file_size > MAX_DOCX_XML_BYTES:
                raise ResumeError("The expanded Word document is too large.")
            xml = document.read(info)
        # Word documents do not need DTDs or entity definitions for text extraction.
        if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", xml, re.IGNORECASE):
            raise ResumeError("Word documents with XML entity definitions are unsupported.")
        root = ET.fromstring(xml)
        paragraphs = []
        for paragraph in root.iter(WORD_NS + "p"):
            parts = []
            for node in paragraph.iter():
                if node.tag == WORD_NS + "t":
                    parts.append(node.text or "")
                elif node.tag == WORD_NS + "tab":
                    parts.append("\t")
                elif node.tag in (WORD_NS + "br", WORD_NS + "cr"):
                    parts.append("\n")
            text = "".join(parts).strip()
            if not text:
                continue
            style = paragraph.find(f"{WORD_NS}pPr/{WORD_NS}pStyle")
            style_name = style.get(WORD_NS + "val", "") if style is not None else ""
            heading = re.fullmatch(r"Heading([1-6])", style_name, re.IGNORECASE)
            if heading:
                text = "#" * min(int(heading.group(1)) + 1, 6) + " " + text
            elif paragraph.find(f"{WORD_NS}pPr/{WORD_NS}numPr") is not None:
                text = "- " + text
            paragraphs.append(text)
        return "\n\n".join(paragraphs)
    except ResumeError:
        raise
    except (BadZipFile, KeyError, ET.ParseError, RuntimeError, OSError) as exc:
        raise ResumeError("This DOCX file could not be read. Try an unencrypted .docx copy.") from exc


def to_markdown(text: str) -> str:
    """Normalize spacing, known section headings and bullets; never rewrite facts."""
    lines = []
    first_content = True
    for line in text.strip().splitlines():
        content = line.strip()
        if not content:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        # Some PDF producers expose letter spacing as spaces between characters.
        # Normalize only recognized all-caps section names; leave other text alone.
        compact = re.sub(r"\s+", "", content.rstrip(":")).lower()
        if content.isupper() and compact in SPACED_HEADINGS and not SECTION.fullmatch(content.rstrip(":")):
            content = SPACED_HEADINGS[compact]
        if content.startswith("#"):
            lines.append(content)
        elif SECTION.fullmatch(content.rstrip(":")):
            if lines and lines[-1] != "":
                lines.append("")
            lines.extend(["## " + content.rstrip(":"), ""])
        elif first_content and len(content) < 100:
            lines.append("# " + content)
        else:
            lines.append(re.sub(r"^[\u2022\u25cf\u25aa]\s*", "- ", content))
        first_content = False
    return "\n".join(lines).strip() + "\n"


def parse_resume(source: Path) -> str:
    if not source.is_file():
        raise ResumeError("Choose an existing resume file.")
    extension = source.suffix.lower()
    if extension not in {".pdf", ".docx", ".txt", ".md"}:
        raise ResumeError("Supported files: PDF, DOCX, UTF-8 TXT, and Markdown. Not .doc.")
    if source.stat().st_size > MAX_FILE_BYTES:
        raise ResumeError("Choose a file no larger than 5 MB.")
    with source.open("rb") as stream:
        data = stream.read(MAX_FILE_BYTES + 1)
    if not data:
        raise ResumeError("The resume file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise ResumeError("Choose a file no larger than 5 MB.")
    if extension == ".pdf":
        text = extract_pdf(data)
    elif extension == ".docx":
        text = extract_docx(data)
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ResumeError("Save text and Markdown files as UTF-8, then try again.") from exc
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\0", "").strip()
    if not text:
        raise ResumeError("No readable text found. Scanned PDFs need OCR first.")
    if len(text) > MAX_CHARACTERS:
        raise ResumeError("Use a resume with 30,000 characters or fewer.")
    return text + "\n" if extension == ".md" else to_markdown(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resume", type=Path, help="Local PDF, DOCX, TXT, or MD file")
    parser.add_argument("-o", "--output", type=Path, help="Output .md path (default: INPUT.parsed.md)")
    parser.add_argument("--force", action="store_true", help="Replace an existing output; never the input")
    args = parser.parse_args(argv)
    output = args.output or args.resume.with_suffix(".parsed.md")
    try:
        if output.resolve() == args.resume.resolve() or (
            output.exists() and args.resume.exists() and output.samefile(args.resume)
        ):
            raise ResumeError("The output must differ from the original resume, even with --force.")
        if output.suffix.lower() != ".md":
            raise ResumeError("Choose an output path ending in .md.")
        if output.exists() and not args.force:
            raise ResumeError("Output already exists. Choose a new path or use --force.")
        markdown = parse_resume(args.resume)
        with output.open("w" if args.force else "x", encoding="utf-8", newline="\n") as stream:
            stream.write(markdown)
        print(f"Created {output}. Review the extracted facts before using it.")
        return 0
    except (ResumeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
