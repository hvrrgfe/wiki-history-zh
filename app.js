/* ── 维基历史条目库 · Kiwix 风格 ── */
let allEntries = [];
let currentFocus = -1;
let currentResults = [];

const $ = (id) => document.getElementById(id);
const homeSearch = $('home-search');
const articleSearch = $('article-search');
const searchResults = $('search-results');
const articleSearchResults = $('article-search-results');
const homeView = $('home-view');
const articleView = $('article-view');
const articleContent = $('article-content');

/* ── 加载索引 ── */
fetch('data.json').then(r => r.json()).then(data => { allEntries = data; });

/* ── 搜索 ── */
function doSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const prefix = [], contains = [];
  for (const e of allEntries) {
    const t = e.t.toLowerCase();
    if (t.startsWith(q)) prefix.push(e);
    else if (t.includes(q)) contains.push(e);
  }
  return [...prefix, ...contains].slice(0, 30);
}

function renderResults(results, container) {
  currentResults = results;
  if (results.length === 0) {
    container.innerHTML = '<div class="sr-empty">未找到相关条目</div>';
  } else {
    container.innerHTML = results.map((e, i) => {
      const badge = e.r ? '<span class="sr-redirect">↳</span>' : '';
      return `<div class="sr-item" data-idx="${i}">${e.t} ${badge}</div>`;
    }).join('');
    container.querySelectorAll('.sr-item').forEach(el => {
      el.onclick = () => openArticle(results[parseInt(el.dataset.idx)]);
    });
  }
  container.classList.add('show');
  currentFocus = -1;
}

/* ── 搜索事件 ── */
let searchTimer = null;
function onSearch(inputEl, resultsEl) {
  clearTimeout(searchTimer);
  const q = inputEl.value;
  if (!q.trim()) { resultsEl.classList.remove('show'); return; }
  searchTimer = setTimeout(() => renderResults(doSearch(q), resultsEl), 120);
}
homeSearch.addEventListener('input', () => onSearch(homeSearch, searchResults));
articleSearch.addEventListener('input', () => onSearch(articleSearch, articleSearchResults));

/* ── 键盘导航 ── */
function handleKB(e, container, inputEl) {
  const items = container.querySelectorAll('.sr-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    currentFocus = Math.min(currentFocus + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    currentFocus = Math.max(currentFocus - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const idx = currentFocus >= 0 ? currentFocus : 0;
    if (currentResults[idx]) openArticle(currentResults[idx]);
    return;
  } else if (e.key === 'Escape') {
    container.classList.remove('show'); inputEl.blur(); return;
  } else return;
  items.forEach((el, i) => el.classList.toggle('active', i === currentFocus));
  if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
}
homeSearch.addEventListener('keydown', e => handleKB(e, searchResults, homeSearch));
articleSearch.addEventListener('keydown', e => handleKB(e, articleSearchResults, articleSearch));

document.addEventListener('click', e => {
  if (!e.target.closest('.search-box') && !e.target.closest('.article-header')) {
    searchResults.classList.remove('show');
    articleSearchResults.classList.remove('show');
  }
});

/* ── 管道文本 → HTML 表格 ── */
function convertPipes(md) {
  const lines = md.split('\n');
  const out = [];
  let table = [];
  let tableCells = 0;

  function flushTable() {
    if (table.length === 0) return;
    // 分析表格结构
    const rows = table.map(line => {
      // 去掉行首 | 和空白
      line = line.replace(/^\s*\|?\s*/, '').replace(/\s*\|?\s*$/, '');
      return line.split(/\s*\|\s*/).filter(c => c !== '');
    });
    // 判断是否为键值对（2列且第一列短）
    const maxCols = Math.max(...rows.map(r => r.length));
    let html = '<table class="wiki-table">';
    if (maxCols <= 2 && rows.every(r => r.length <= 2)) {
      // 键值对格式
      for (const row of rows) {
        if (row.length === 1) {
          html += `<tr><td colspan="2" class="wiki-table-title">${row[0]}</td></tr>`;
        } else {
          html += `<tr><th>${row[0]}</th><td>${row[1]}</td></tr>`;
        }
      }
    } else {
      // 多列格式
      for (const row of rows) {
        html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    }
    html += '</table>';
    out.push(html);
    table = [];
  }

  for (const line of lines) {
    // 检测管道分隔行（行首或行中含 |，且不是markdown链接）
    const isPipeLine = /^\s*\|/.test(line) || (line.includes(' | ') && !line.includes('](') && !line.includes('://'));
    if (isPipeLine) {
      table.push(line);
    } else {
      flushTable();
      out.push(line);
    }
  }
  flushTable();
  return out.join('\n');
}

/* ── 打开文章 ── */
async function openArticle(entry) {
  homeView.style.display = 'none';
  articleView.style.display = 'block';
  searchResults.classList.remove('show');
  articleSearchResults.classList.remove('show');
  homeSearch.value = '';
  articleSearch.value = '';

  articleContent.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  document.querySelector('.article-wrap').scrollTop = 0;

  try {
    const fileName = encodeURIComponent(entry.f);
    const resp = await fetch(`articles/${fileName}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    // 按 --- 分隔提取单篇
    const sections = text.split(/\n---\n/);
    let found = null, foundRedirect = null;
    for (const s of sections) {
      const m = s.match(/^#\s+(.+)$/m);
      if (m && m[1].trim() === entry.t) {
        if (s.includes('重定向至')) {
          if (!foundRedirect) foundRedirect = s;
        } else {
          found = s; break;
        }
      }
    }
    const article = found || foundRedirect || '';

    if (article) {
      // 预处理：管道文本→表格，然后交给 marked 渲染
      const processed = convertPipes(article);
      let html = marked.parse(processed);

      // 清理空段落
      html = html.replace(/<p>\s*<\/p>/g, '');
      // 重定向提示
      if (article.includes('重定向至')) {
        html = html.replace(/<blockquote>[\s\S]*?重定向至[\s\S]*?<\/blockquote>/g,
          '<div class="redirect-notice">📌 本条目为重定向条目</div>');
      }
      articleContent.innerHTML = html;
    } else {
      articleContent.innerHTML = '<p style="color:#a0aec0;text-align:center;padding:40px">未找到该条目内容</p>';
    }
  } catch (err) {
    articleContent.innerHTML = `<p style="color:#e53e3e;padding:40px">加载失败: ${err.message}</p>`;
  }
}

function goHome() {
  articleView.style.display = 'none';
  homeView.style.display = 'flex';
  homeSearch.focus();
}

function randomArticle() {
  if (!allEntries.length) return;
  const arts = allEntries.filter(e => !e.r);
  const pool = arts.length ? arts : allEntries;
  openArticle(pool[Math.floor(Math.random() * pool.length)]);
}

if (window.marked) marked.setOptions({ breaks: true, gfm: true });
homeSearch.focus();
