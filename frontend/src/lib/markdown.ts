// 轻量 Markdown 渲染（迁移自原 index.html：先转义再还原结构，避免 XSS）。

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderMd(text: string): string {
  let html = esc(text)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
  html = html.replace(/^\s*\d+\. (.*)$/gm, '<li>$1</li>')
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
  html = html
    .split(/\n{2,}/)
    .map((p) => (/^<(h\d|pre|ul|ol)/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('')
  return html
}
