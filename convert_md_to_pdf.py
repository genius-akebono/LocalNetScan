#!/usr/bin/env python3
"""
Markdown to PDF converter using markdown and weasyprint
"""
import markdown
from weasyprint import HTML, CSS
import sys

def convert_md_to_pdf(md_file, pdf_file):
    """Convert Markdown file to PDF"""

    # Read markdown file
    with open(md_file, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Convert markdown to HTML
    html_content = markdown.markdown(
        md_content,
        extensions=['tables', 'fenced_code', 'codehilite']
    )

    # Create full HTML document with styling
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>ネットワーク基礎ガイド</title>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """

    # CSS styling for better PDF output
    css_string = """
    @page {
        size: A4;
        margin: 2cm;
    }

    body {
        font-family: "DejaVu Sans", "Noto Sans CJK JP", sans-serif;
        font-size: 11pt;
        line-height: 1.6;
        color: #333;
    }

    h1 {
        font-size: 24pt;
        color: #2c3e50;
        border-bottom: 3px solid #3498db;
        padding-bottom: 10px;
        margin-top: 20px;
    }

    h2 {
        font-size: 18pt;
        color: #2980b9;
        border-bottom: 2px solid #bdc3c7;
        padding-bottom: 8px;
        margin-top: 30px;
        page-break-after: avoid;
    }

    h3 {
        font-size: 14pt;
        color: #34495e;
        margin-top: 20px;
    }

    pre {
        background-color: #f8f8f8;
        border: 1px solid #ddd;
        border-left: 3px solid #3498db;
        padding: 10px;
        overflow-x: auto;
        font-family: "Courier New", monospace;
        font-size: 9pt;
        line-height: 1.4;
        page-break-inside: avoid;
    }

    code {
        background-color: #f0f0f0;
        padding: 2px 4px;
        font-family: "Courier New", monospace;
        font-size: 10pt;
        color: #c7254e;
    }

    table {
        border-collapse: collapse;
        width: 100%;
        margin: 15px 0;
        page-break-inside: avoid;
    }

    table th {
        background-color: #3498db;
        color: white;
        padding: 10px;
        text-align: left;
        border: 1px solid #2980b9;
    }

    table td {
        padding: 8px;
        border: 1px solid #ddd;
    }

    table tr:nth-child(even) {
        background-color: #f9f9f9;
    }

    p {
        margin: 10px 0;
        text-align: justify;
    }

    ul, ol {
        margin: 10px 0;
        padding-left: 30px;
    }

    li {
        margin: 5px 0;
    }

    strong {
        color: #e74c3c;
        font-weight: bold;
    }

    hr {
        border: none;
        border-top: 2px solid #ecf0f1;
        margin: 30px 0;
    }

    blockquote {
        border-left: 4px solid #3498db;
        padding-left: 15px;
        margin: 15px 0;
        color: #555;
        font-style: italic;
    }
    """

    # Convert HTML to PDF
    try:
        HTML(string=full_html).write_pdf(
            pdf_file,
            stylesheets=[CSS(string=css_string)]
        )
        print(f"✓ PDF successfully created: {pdf_file}")
        return True
    except Exception as e:
        print(f"✗ Error creating PDF: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 convert_md_to_pdf.py <input.md> <output.pdf>")
        sys.exit(1)

    md_file = sys.argv[1]
    pdf_file = sys.argv[2]

    success = convert_md_to_pdf(md_file, pdf_file)
    sys.exit(0 if success else 1)
