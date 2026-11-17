"""Behavior tests for the offline parser. Only fictional resume data is used."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
from io import StringIO
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

SCRIPT = Path(__file__).resolve().parents[2] / "public" / "tools" / "parse_resume.py"
SPEC = importlib.util.spec_from_file_location("offline_resume", SCRIPT)
parser = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(parser)

SAMPLE = "Taylor Demo\n\nEducation\nExample University 2027 | GPA: 3.6\n\nSkills\n\u2022 Python\n\u2022 SQL\n"


class OfflineParserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.network = patch.object(socket, "socket", side_effect=AssertionError("No network allowed"))
        self.network.start()
        self.addCleanup(self.network.stop)

    def text_file(self, text=SAMPLE, name="resume.txt"):
        source = self.root / name
        source.write_text(text, encoding="utf-8")
        return source

    def word_file(self, body):
        source = self.root / "resume.docx"
        with ZipFile(source, "w") as document:
            document.writestr("word/document.xml", body)
        return source

    def pdf_file(self, text="Taylor Demo - Python and SQL", pages=1, encrypted=False):
        writer = PdfWriter()
        for _ in range(pages):
            page = writer.add_blank_page(width=612, height=792)
            if text:
                font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
                page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
                stream = DecodedStreamObject()
                stream.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii"))
                page[NameObject("/Contents")] = stream
        if encrypted:
            writer.encrypt("test-password")
        source = self.root / "resume.pdf"
        writer.write(source)
        return source

    def run_cli(self, *args):
        out, err = StringIO(), StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            status = parser.main([str(arg) for arg in args])
        return status, out.getvalue(), err.getvalue()

    def test_text_becomes_headings_and_bullets_without_rewriting_facts(self):
        markdown = parser.parse_resume(self.text_file())
        for expected in ("# Taylor Demo", "## Education", "GPA: 3.6", "## Skills", "- Python", "- SQL"):
            self.assertIn(expected, markdown)
        self.assertNotIn("expert", markdown.lower())

    def test_utf8_bom_and_windows_newlines(self):
        source = self.root / "resume.txt"
        source.write_bytes(b"\xef\xbb\xbfTaylor Demo\r\nSkills\r\nSQL")
        self.assertEqual(parser.parse_resume(source), "# Taylor Demo\n\n## Skills\n\nSQL\n")

    def test_letter_spaced_pdf_headings_are_recognized_without_changing_other_text(self):
        markdown = parser.to_markdown("Taylor Demo\nP R O F I L E\nPython developer\nT E C H N I C A L S K I L L S\nSQL\nA C M E Company")
        self.assertIn("## Profile", markdown)
        self.assertIn("## Technical Skills", markdown)
        self.assertIn("A C M E Company", markdown)

    def test_existing_markdown_is_not_reformatted(self):
        markdown = "# Taylor Demo\n\n```python\nprint('hello')\n```\n\n- SQL\n"
        self.assertEqual(parser.parse_resume(self.text_file(markdown, "resume.md")), markdown)

    def test_real_pdf_text_extraction(self):
        self.assertIn("Taylor Demo - Python and SQL", parser.parse_resume(self.pdf_file()))

    def test_pdf_page_limit(self):
        with self.assertRaisesRegex(parser.ResumeError, "15 pages"):
            parser.parse_resume(self.pdf_file(pages=16))

    def test_encrypted_pdf_is_rejected(self):
        with self.assertRaisesRegex(parser.ResumeError, "encrypted"):
            parser.parse_resume(self.pdf_file(encrypted=True))

    def test_image_only_or_blank_pdf_requests_ocr(self):
        with self.assertRaisesRegex(parser.ResumeError, "OCR"):
            parser.parse_resume(self.pdf_file(text=""))

    def test_corrupt_pdf_has_readable_error(self):
        source = self.root / "resume.pdf"
        source.write_bytes(b"not a PDF")
        with self.assertRaisesRegex(parser.ResumeError, "could not be read"):
            parser.parse_resume(source)

    def test_docx_preserves_paragraphs_tables_headings_and_bullets(self):
        source = self.word_file('''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>Taylor Demo</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Education</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Example University 2027</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Python &amp; SQL</w:t></w:r></w:p>
        </w:body></w:document>''')
        markdown = parser.parse_resume(source)
        for expected in ("# Taylor Demo", "## Education", "Example University 2027", "- Python & SQL"):
            self.assertIn(expected, markdown)

    def test_broken_docx_and_entity_definitions_are_rejected(self):
        for xml in ("not xml", '<!DOCTYPE root [<!ENTITY x "unsafe">]><root>&x;</root>'):
            with self.subTest(xml=xml):
                with self.assertRaises(parser.ResumeError):
                    parser.parse_resume(self.word_file(xml))

    def test_missing_empty_unsupported_and_non_utf8_files_are_rejected(self):
        cases = [(self.root / "missing.txt", "existing"), (self.text_file("", "empty.txt"), "empty"), (self.text_file("text", "resume.doc"), "Supported")]
        binary = self.root / "binary.txt"
        binary.write_bytes(b"\xff\xff")
        cases.append((binary, "UTF-8"))
        for source, message in cases:
            with self.subTest(source=source):
                with self.assertRaisesRegex(parser.ResumeError, message):
                    parser.parse_resume(source)

    def test_input_byte_and_character_limits(self):
        source = self.root / "oversized.txt"
        source.write_bytes(b"a" * (parser.MAX_FILE_BYTES + 1))
        with self.assertRaisesRegex(parser.ResumeError, "5 MB"):
            parser.parse_resume(source)
        with self.assertRaisesRegex(parser.ResumeError, "30,000"):
            parser.parse_resume(self.text_file("a" * (parser.MAX_CHARACTERS + 1)))

    def test_cli_creates_default_markdown_and_keeps_original(self):
        source = self.text_file()
        status, _, error = self.run_cli(source)
        self.assertEqual((status, error), (0, ""))
        self.assertEqual(source.read_text(encoding="utf-8"), SAMPLE)
        self.assertIn("## Skills", source.with_suffix(".parsed.md").read_text(encoding="utf-8"))

    def test_cli_preserves_existing_output_without_force(self):
        source = self.text_file()
        output = self.text_file("keep me", "output.md")
        status, _, error = self.run_cli(source, "-o", output)
        self.assertEqual(status, 1)
        self.assertIn("already exists", error)
        self.assertEqual(output.read_text(), "keep me")
        self.assertEqual(self.run_cli(source, "-o", output, "--force")[0], 0)
        self.assertIn("Taylor Demo", output.read_text())

    def test_cli_never_overwrites_original_even_with_force(self):
        source = self.text_file("# Taylor Demo\n", "resume.md")
        status, _, error = self.run_cli(source, "-o", source, "--force")
        self.assertEqual(status, 1)
        self.assertIn("differ from the original", error)
        self.assertEqual(source.read_text(), "# Taylor Demo\n")

    def test_cli_rejects_wrong_output_extension(self):
        status, _, error = self.run_cli(self.text_file(), "-o", self.root / "output.txt")
        self.assertEqual(status, 1)
        self.assertIn("ending in .md", error)


if __name__ == "__main__":
    unittest.main()
