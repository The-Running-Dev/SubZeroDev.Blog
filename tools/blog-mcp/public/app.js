// Plain vanilla JS, no framework, no bundler, no CDN assets -- see
// tools/blog-mcp/README.md's "Capability tiers" / CSP notes. Every render
// path below uses textContent (or DOM element creation), never innerHTML:
// post bodies and PR data ultimately come from author-controlled content
// and must never be interpreted as markup.
(function () {
  const CSRF_HEADER = 'X-Blog-Mcp-Csrf';

  async function api(path) {
    const res = await fetch(path, { headers: { [CSRF_HEADER]: '1' } });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body && body.error ? body.error : `Request failed (${res.status})`);
    return body;
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === 'className') node.className = value;
        else node.setAttribute(key, value);
      }
    }
    for (const child of children || []) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function table(headers, rows) {
    const thead = el('thead', null, [el('tr', null, headers.map((h) => el('th', null, [h])))]);
    const tbody = el(
      'tbody',
      null,
      rows.map((row) => el('tr', null, row.map((cell) => el('td', null, [String(cell)]))))
    );
    return el('table', null, [thead, tbody]);
  }

  // --- login page -----------------------------------------------------------
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = document.getElementById('login-error');
      errorEl.hidden = true;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          errorEl.textContent = body.error || 'Sign in failed.';
          errorEl.hidden = false;
          return;
        }
        window.location.href = '/';
      } catch {
        errorEl.textContent = 'Sign in failed.';
        errorEl.hidden = false;
      }
    });
    return;
  }

  // --- main app ---------------------------------------------------------------
  const content = document.getElementById('content');
  if (!content) return;

  function renderError(err) {
    content.replaceChildren(el('p', { className: 'error' }, [err.message || String(err)]));
  }

  async function viewPosts() {
    const data = await api('/api/posts');
    const posts = (data.data && data.data.posts) || [];
    content.replaceChildren(
      el('h2', null, ['Posts']),
      table(
        ['Date', 'Title', 'Slug', 'Tags'],
        posts.map((p) => [p.date, p.title, p.slug, (p.tags || []).join(', ')])
      )
    );
  }

  async function viewLog() {
    const data = await api('/api/log?limit=30');
    const commits = (data.data && data.data.commits) || [];
    content.replaceChildren(
      el('h2', null, [`Log (${data.data ? data.data.ref : ''})`]),
      table(
        ['SHA', 'Author', 'Date', 'Subject'],
        commits.map((c) => [c.sha.slice(0, 10), c.authorName, c.authorDate, c.subject])
      )
    );
  }

  async function viewBranches() {
    const data = await api('/api/branches');
    const branches = (data.data && data.data.branches) || [];
    content.replaceChildren(
      el('h2', null, ['Branches']),
      table(
        ['Name', 'Current', 'Ahead', 'Behind'],
        branches.map((b) => [b.name, b.current ? 'yes' : '', b.ahead, b.behind])
      )
    );
  }

  async function viewHealth() {
    const data = await api('/api/repo/health');
    const h = data.data || {};
    content.replaceChildren(
      el('h2', null, ['Repo health']),
      el('p', null, [`Branch: ${h.branch} (base: ${h.baseBranch})`]),
      el('p', null, [`Dirty: ${h.dirty}`]),
      el('p', null, [`Parked off base: ${h.parked}`]),
      el('p', null, [`Ahead/behind vs base: ${h.ahead}/${h.behind}`])
    );
  }

  function viewPr() {
    const input = el('input', { type: 'number', placeholder: 'PR number' }, []);
    const button = el('button', { type: 'button' }, ['Look up']);
    const result = el('div', null, []);
    button.addEventListener('click', async () => {
      result.replaceChildren();
      const pr = input.value;
      if (!pr) return;
      try {
        const data = await api(`/api/pr/${encodeURIComponent(pr)}`);
        const d = data.data || {};
        result.replaceChildren(
          el('p', null, [`State: ${d.state}`]),
          el('p', null, [`Mergeable: ${d.mergeable}`]),
          el('p', null, [`Head SHA: ${d.headRefOid}`]),
          el('p', null, [`URL: ${d.url}`])
        );
      } catch (err) {
        result.replaceChildren(el('p', { className: 'error' }, [err.message]));
      }
    });
    content.replaceChildren(el('h2', null, ['PR status']), el('div', null, [input, button]), result);
  }

  const views = { posts: viewPosts, log: viewLog, branches: viewBranches, health: viewHealth, pr: viewPr };

  for (const button of document.querySelectorAll('nav button[data-view]')) {
    button.addEventListener('click', () => {
      const view = views[button.dataset.view];
      if (view) Promise.resolve(view()).catch(renderError);
    });
  }

  const logoutButton = document.getElementById('logout');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await fetch('/logout', { method: 'POST' }).catch(() => undefined);
      window.location.href = '/login';
    });
  }

  viewPosts().catch(renderError);
})();
