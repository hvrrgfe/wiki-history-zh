/* ── 维基历史条目库 · Kiwix 风格 ── */
let allEntries = [];
let currentFocus = -1;
let currentSearch = '';

const $ = (id) => document.getElementById(id);
const homeSearch = $('home-search');
const articleSearch = $('article-search');
const searchResults = $('search-results');
const articleSearchResults = $('article-search-results');
const homeView = $('home-view');
const articleView = $('article-view');
const articleContent = $('article-content');

/* ── 加载索引 ── */
fetch('data.json').then(r => r.json()).then(data => {
  allEntries = data;
});

/* ── 搜索逻辑 ── */
function search(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  // 优先前缀匹配，其次包含匹配
  const prefix = [], contains = [];
  for (const e of allEntries) {
    const t = e.t.toLowerCase();
    if (t.startsWith(q)) prefix.push(e);
    else if (t.includes(q)) contains.push(e);
  }
  return [...prefix, ...contains].slice(0, 50);
}

function renderResults(results, container, inputEl) {
  if (results.length === 0) {
    container.innerHTML = '<div class="sr-empty">未找到相关条目</div>';
  } else {
    container.innerHTML = results.map((e, i) => {
      const badge = e.r ? '<span class="sr-redirect">↳ 重定向</span>' : '<span class="sr-badge">正文</span>';
      return `<div class="sr-item" data-idx="${i}">${e.t} ${badge}</div>`;
    }).join('');
    container.querySelectorAll('.sr-item').forEach((el) => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        openArticle(results[idx]);
      };
    });
  }
  container.classList.add('show');
  currentFocus = -1;
}

/* ── 搜索事件 ── */
let searchTimer = null;
homeSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = homeSearch.value;
  if (!q.trim()) {
    searchResults.classList.remove('show');
    return;
  }
  searchTimer = setTimeout(() => {
    currentSearch = q;
    renderResults(search(q), searchResults, homeSearch);
  }, 150);
});

articleSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = articleSearch.value;
  if (!q.trim()) {
    articleSearchResults.classList.remove('show');
    return;
  }
  searchTimer = setTimeout(() => {
    currentSearch = q;
    renderResults(search(q), articleSearchResults, articleSearch);
  }, 150);
});

/* ── 键盘导航 ── */
function handleKeyboard(e, results, container, inputEl) {
  const items = container.querySelectorAll('.sr-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    currentFocus = Math.min(currentFocus + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === currentFocus));
    if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    currentFocus = Math.max(currentFocus - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === currentFocus));
    if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentFocus >= 0 && results[currentFocus]) {
      openArticle(results[currentFocus]);
    } else if (results.length > 0) {
      openArticle(results[0]);
    }
  } else if (e.key === 'Escape') {
    container.classList.remove('show');
    inputEl.blur();
  }
}

homeSearch.addEventListener('keydown', (e) => {
  const results = search(currentSearch);
  handleKeyboard(e, results, searchResults, homeSearch);
});

articleSearch.addEventListener('keydown', (e) => {
  const results = search(currentSearch);
  handleKeyboard(e, results, articleSearchResults, articleSearch);
});

/* ── 点击外部关闭搜索结果 ── */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box') && !e.target.closest('.article-header')) {
    searchResults.classList.remove('show');
    articleSearchResults.classList.remove('show');
  }
});

/* ── 打开文章 ── */
async function openArticle(entry) {
  // 切换视图
  homeView.style.display = 'none';
  articleView.style.display = 'block';
  searchResults.classList.remove('show');
  articleSearchResults.classList.remove('show');
  homeSearch.value = '';
  articleSearch.value = '';

  // 加载状态
  articleContent.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  document.querySelector('.article-wrap').scrollTop = 0;

  try {
    const fileName = encodeURIComponent(entry.f);
    const resp = await fetch(`articles/${fileName}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    // 按 --- 分隔提取单篇文章
    const sections = text.split(/\n---\n/);
    let found = null, foundRedirect = null;
    for (const s of sections) {
      const m = s.match(/^#\s+(.+)$/m);
      if (m && m[1].trim() === entry.t) {
        if (s.includes('重定向至')) {
          if (!foundRedirect) foundRedirect = s;
        } else {
          found = s;
          break;
        }
      }
    }
    const article = found || foundRedirect || sections.find(s => s.includes(`# ${entry.t}`)) || '';

    if (article) {
      let html = marked.parse(article);
      // 如果是重定向，添加提示样式
      if (article.includes('重定向至')) {
        html = html.replace(/<blockquote>.*?重定向至.*?<\/blockquote>/s,
          '<div class="redirect-notice">📌 本条目为重定向条目</div>');
      }
      articleContent.innerHTML = html;
    } else {
      articleContent.innerHTML = '<p style="color:#a0aec0;text-align:center;padding:40px">未找到该条目内容</p>';
    }
  } catch (err) {
    articleContent.innerHTML = `<p style="color:#e53e3e;text-align:center;padding:40px">加载失败: ${err.message}</p>`;
  }
}

/* ── 返回首页 ── */
function goHome() {
  articleView.style.display = 'none';
  homeView.style.display = 'flex';
  homeSearch.focus();
}

/* ── 随机条目 ── */
function randomArticle() {
  if (allEntries.length === 0) return;
  // 优先随机正文条目
  const articles = allEntries.filter(e => !e.r);
  const pool = articles.length > 0 ? articles : allEntries;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  openArticle(entry);
}

/* ── marked.js 配置 ── */
if (window.marked) {
  marked.setOptions({ breaks: true, gfm: true });
}

/* ── 浏览器前进/后退 ── */
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.home) {
    goHome();
  }
});

/* ── 自动聚焦 ── */
homeSearch.focus();
