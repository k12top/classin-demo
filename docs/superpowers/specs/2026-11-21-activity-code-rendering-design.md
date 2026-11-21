# Activity code rendering design

Course exercise answers and choice options should preserve source-code layout without turning ordinary prose into code. A conservative, language-neutral detector will classify explicit fenced Markdown and multiline text with multiple structural signals (indentation plus code syntax) as code. AI option payloads containing literal `\\n` will only be decoded when the decoded result passes that detector, so source strings such as `print("\\n")` remain unchanged.

Code-like content renders in a semantic `pre > code` surface with preserved whitespace, a monospace stack, wrapping for readable classroom cards, and horizontal scrolling as a fallback. Ordinary content continues through the existing Markdown/KaTeX renderer. The first delivery applies this shared renderer to student written answers and activity options; question prompts and explanations remain Markdown.

Considered approaches:

- Global `white-space: pre-wrap`: smallest change, but gives prose code-like spacing and no semantic code surface.
- Require fenced code only: deterministic, but student submissions and AI options usually omit fences.
- Conservative code detection (selected): preserves current prose behavior while fixing unmarked classroom code.

The detector must avoid single-token false positives, prose with punctuation, mathematical Markdown, and literal escaped newlines inside otherwise single-line code.
