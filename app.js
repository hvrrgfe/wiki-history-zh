let allEntries = [];
let filteredEntries = [];
let currentArticle = null;
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const contentEl = document.getElementById('article');
const welcomeEl = document.getElementById('welcome');
const countEl = document.getElementById('count');

// 加载索引
fetch('data.json')
  .then(r => r.json())
  .then(data => {
    allEntries = data;
    filteredEntries = data;
    document.getElementById('total-count').textContent = data.length;
    document.getElementById('article-count').textContent = data.filter(e => !e.r).length;
    renderList();
    countEl.textContent = `${data.length} 条`;
  });

function renderList() {
  const frag = document.createDocumentFragment();
  const max = Math.min(filteredEntries.length, 500); // 限制渲染数量
  for (let i = 0; i < max; i++) {
    const e = filteredEntries[i];
    const div = document.createElement('div');
    div.className = 'item' + (e.r ? ' redirect' : '');
    div.textContent = e.t;
    div.dataset.idx = i;
    div.onclick = () => loadArticle(i);
    frag.appendChild(div);
  }
  if (filteredEntries.length > 500) {
    const more = document.createElement('div');
    more.className = 'item';
    more.style.color = '#9ca3af';
    more.style.textAlign = 'center';
    more.textContent = `... 还有 ${filteredEntries.length - 500} 条`;
    frag.appendChild(more);
  }
  listEl.innerHTML = '';
  listEl.appendChild(frag);
}

// 搜索
let searchTimer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 200);
});

function doSearch() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    filteredEntries = allEntries;
  } else {
    filteredEntries = allEntries.filter(e => e.t.toLowerCase().includes(q));
  }
  countEl.textContent = `${filteredEntries.length} 条`;
  renderList();
}

// 虚拟滚动 - 滚动时加载更多
listEl.addEventListener('scroll', () => {
  if (listEl.scrollHeight - listEl.scrollTop < 800 && filteredEntries.length > listEl.children.length) {
    const start = listEl.children.length;
    const max = Math.min(start + 500, filteredEntries.length);
    for (let i = start; i < max; i++) {
      const e = filteredEntries[i];
      if (!e) break;
      const div = document.createElement('div');
      div.className = 'item' + (e.r ? ' redirect' : '');
      div.textContent = e.t;
      div.dataset.idx = i;
      div.onclick = () => loadArticle(i);
      listEl.appendChild(div);
    }
    // 移除"...还有"提示
    const last = listEl.lastElementChild;
    if (last && last.textContent.startsWith('...')) last.remove();
    if (filteredEntries.length > listEl.children.length) {
      const more = document.createElement('div');
      more.className = 'item';
      more.style.color = '#9ca3af';
      more.style.textAlign = 'center';
      more.textContent = `... 还有 ${filteredEntries.length - listEl.children.length} 条`;
      listEl.appendChild(more);
    }
  }
});

async function loadArticle(idx) {
  const entry = filteredEntries[idx];
  if (!entry) return;

  // 更新active状态
  document.querySelectorAll('.item.active').forEach(el => el.classList.remove('active'));
  const items = listEl.querySelectorAll('.item');
  if (items[idx]) items[idx].classList.add('active');

  welcomeEl.style.display = 'none';
  contentEl.style.display = 'block';
  contentEl.innerHTML = '<div class="loading">加载中...</div>';

  try {
    // 处理文件名编码
    const fileName = encodeURIComponent(entry.f);
    const resp = await fetch(`articles/${fileName}`);
    const text = await resp.text();

    // 按分隔线 --- 拆分文章
    const sections = text.split(/\n---\n/);
    
    // 查找匹配的文章（优先找非重定向的）
    let foundArticle = null;
    let foundRedirect = null;
    for (let s of sections) {
      s = s.trim();
      if (!s) continue;
      const titleMatch = s.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1].trim() === entry.t) {
        if (s.includes('重定向至')) {
          if (!foundRedirect) foundRedirect = s;
        } else {
          foundArticle = s;
          break;
        }
      }
    }

    const result = foundArticle || foundRedirect || sections.find(s => s.includes(entry.t)) || '';
    if (result) {
      contentEl.innerHTML = marked.parse(result);
    } else {
      contentEl.innerHTML = '<p>未找到该条目内容</p>';
    }

    // 滚动到顶部
    contentEl.parentElement.scrollTop = 0;
  } catch (err) {
    contentEl.innerHTML = `<p>加载失败: ${err.message}</p>`;
  }
}

// 键盘导航
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && filteredEntries.length > 0) {
    loadArticle(0);
  }
  if (e.key === 'ArrowDown' && filteredEntries.length > 0) {
    e.preventDefault();
    const first = listEl.querySelector('.item');
    if (first) first.click();
  }
});
