// Plain vanilla JS, no framework, no bundler, no CDN assets -- see
// tools/blog-mcp/README.md's "Capability tiers" / CSP notes. Every render
// path below uses textContent (or DOM element creation), never innerHTML:
// post bodies and PR data ultimately come from author-controlled content
// and must never be interpreted as markup.
(function () {
  const CSRF_HEADER = 'X-Blog-Mcp-Csrf';

  async function api(path, options) {
    const opts = options || {};
    const headers = { [CSRF_HEADER]: '1' };
    let requestBody;
    if (opts.method === 'POST') {
      headers['content-type'] = 'application/json';
      requestBody = JSON.stringify(opts.body || {});
    }
    const res = await fetch(path, { method: opts.method, headers, body: requestBody });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    const body = await res.json();
    if (!res.ok || body.ok === false) {
      const message = (body && (body.error || body.summary)) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return body;
  }

  function post(path, body) {
    return api(path, { method: 'POST', body });
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
    return el('div', { className: 'table-wrap' }, [el('table', null, [thead, tbody])]);
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
      el('div', { className: 'panel' }, [
        el('p', null, [`Branch: ${h.branch} (base: ${h.baseBranch})`]),
        el('p', null, [`Dirty: ${h.dirty}`]),
        el('p', null, [`Parked off base: ${h.parked}`]),
        el('p', null, [`Ahead/behind vs base: ${h.ahead}/${h.behind}`])
      ])
    );
  }

  function viewPr() {
    const input = el('input', { type: 'number', placeholder: 'PR number' }, []);
    const button = el('button', { type: 'button', className: 'primary' }, ['Look up']);
    const result = el('div', { className: 'panel' }, []);
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
    content.replaceChildren(
      el('h2', null, ['PR status']),
      el('div', { className: 'compose-actions' }, [input, button]),
      result
    );
  }

  async function viewCompose() {
    const state = { exists: false, branch: null, path: null, pr: null };

    // Best-effort: a failure here just means no autocomplete/checkboxes,
    // never blocks the form from rendering.
    let existingSlugs = [];
    try {
      const postsData = await api('/api/posts');
      existingSlugs = ((postsData.data && postsData.data.posts) || []).map((p) => p.slug);
    } catch {
      /* no suggestions available */
    }
    let existingTags = [];
    try {
      const tagsData = await api('/api/tags');
      existingTags = (tagsData.data && tagsData.data.tags) || [];
    } catch {
      /* no known tag vocabulary to offer */
    }

    const slugList = el(
      'datalist',
      { id: 'existing-slugs' },
      existingSlugs.map((s) => el('option', { value: s }, []))
    );
    const slugInput = el('input', { type: 'text', placeholder: 'slug (e.g. my-post)', list: 'existing-slugs' }, []);
    const titleInput = el('input', { type: 'text', placeholder: 'Title' }, []);
    const descInput = el('input', { type: 'text', placeholder: 'Description' }, []);
    const bodyInput = el('textarea', { rows: '12', placeholder: 'Body (markdown, include <!-- truncate --> when updating)' }, []);
    const loadButton = el('button', { type: 'button' }, ['Load existing']);
    const publishButton = el('button', { type: 'button', className: 'primary' }, ['Create/update & open PR']);
    const armButton = el('button', { type: 'button', className: 'primary', disabled: 'disabled' }, ['Arm auto-merge']);
    const statusLog = el('ul', { className: 'compose-log' }, []);

    // One checkbox per tag declared in docs/blog/tags.yml -- picking from a
    // known vocabulary instead of free-typing avoids the "Unknown tag key"
    // validation error a typo'd tag name would otherwise only surface at
    // publish time.
    const tagCheckboxes = existingTags.map((tag) => {
      const checkbox = el('input', { type: 'checkbox', id: `tag-${tag.key}`, value: tag.key }, []);
      const chip = el('label', { className: 'tag-chip', for: `tag-${tag.key}` }, [checkbox, tag.label || tag.key]);
      return { key: tag.key, checkbox, chip };
    });
    const tagChecklist = el(
      'div',
      { className: 'tag-checklist' },
      tagCheckboxes.length
        ? tagCheckboxes.map((t) => t.chip)
        : [el('span', { className: 'muted' }, ['No tags declared in docs/blog/tags.yml yet.'])]
    );

    function logLine(text, isError) {
      statusLog.appendChild(el('li', isError ? { className: 'error' } : null, [text]));
    }

    function tagList() {
      return tagCheckboxes.filter((t) => t.checkbox.checked).map((t) => t.key);
    }

    function setCheckedTags(tags) {
      const wanted = new Set(tags || []);
      for (const t of tagCheckboxes) t.checkbox.checked = wanted.has(t.key);
    }

    async function loadExisting(slug) {
      statusLog.replaceChildren();
      try {
        const data = await api(`/api/posts/${encodeURIComponent(slug)}`);
        const fm = data.data.frontMatter || {};
        titleInput.value = fm.title || '';
        descInput.value = fm.description || '';
        setCheckedTags(fm.tags);
        bodyInput.value = data.data.body || '';
        state.exists = true;
        state.path = data.data.path;
        logLine(`Loaded existing post '${slug}'.`);
      } catch (err) {
        state.exists = false;
        logLine(`No existing post found for '${slug}' -- Publish will create a new one. (${err.message})`);
      }
    }

    loadButton.addEventListener('click', () => {
      const slug = slugInput.value.trim();
      if (slug) loadExisting(slug);
    });

    // Fires once the user picks a suggestion from the datalist dropdown (or
    // types an exact existing slug and blurs/tabs away) -- picking from the
    // list is then enough on its own, "Load existing" stays around for
    // typing a slug from memory without opening the dropdown.
    slugInput.addEventListener('change', () => {
      const slug = slugInput.value.trim();
      if (slug && existingSlugs.includes(slug)) loadExisting(slug);
    });

    publishButton.addEventListener('click', async () => {
      statusLog.replaceChildren();
      const slug = slugInput.value.trim();
      if (!slug) {
        logLine('Slug is required.', true);
        return;
      }

      try {
        logLine(`Creating/switching to branch 'blog/${slug}'...`);
        const branchResult = await post('/api/branch', { slug, kind: 'blog', checkoutExisting: true });
        state.branch = branchResult.data.branch;
        logLine(`On branch '${state.branch}'.`);

        if (state.exists) {
          logLine('Updating post...');
          const updateResult = await post(`/api/posts/${encodeURIComponent(slug)}`, {
            body: bodyInput.value,
            frontMatter: { title: titleInput.value, description: descInput.value, tags: tagList() }
          });
          state.path = updateResult.data.path;
        } else {
          logLine('Creating post...');
          const createResult = await post('/api/posts', {
            title: titleInput.value,
            description: descInput.value,
            slug,
            body: bodyInput.value,
            tags: tagList()
          });
          state.path = createResult.data.path;
          state.exists = true;
        }
        logLine(`Wrote ${state.path}.`);

        logLine('Staging...');
        await post('/api/stage', { paths: [state.path] });

        logLine('Committing...');
        await post('/api/commit', { type: 'feat', scope: 'blog', summary: `add ${slug}` });

        logLine('Pushing...');
        const pushResult = await post('/api/push', {});
        state.pushedSha = pushResult.data.localSha;

        logLine('Opening pull request...');
        const prResult = await post('/api/pr', {
          title: `Add ${titleInput.value || slug}`,
          body: 'Published via blog-mcp’s UI.',
          head: state.branch
        });
        state.pr = prResult.data.pr;
        logLine(`Opened PR #${state.pr}: ${prResult.data.url}`);
        armButton.disabled = false;
      } catch (err) {
        logLine(err.message, true);
      }
    });

    armButton.addEventListener('click', async () => {
      if (!state.pr) return;
      if (!state.pushedSha) {
        logLine('No known-good pushed SHA to validate against -- publish first.', true);
        return;
      }
      try {
        // Deliberately the SHA this session itself just pushed, not
        // whatever /api/pr/:number currently reports -- fetching the
        // "expected" value from the same place the check validates against
        // would make the cross-check tautological and defeat the reason
        // blog_arm_auto_merge takes an explicit headSha at all: to catch
        // the branch having moved (someone else pushed) between publish and
        // arming.
        const armResult = await post(`/api/pr/${state.pr}/merge`, { headSha: state.pushedSha });
        logLine(`Auto-merge armed: ${armResult.summary}`);
      } catch (err) {
        logLine(err.message, true);
      }
    });

    content.replaceChildren(
      el('h2', null, ['Compose']),
      el('p', { className: 'muted' }, [
        'Create a new post or load an existing one by slug, then publish: branch → write → stage → commit → push → open PR. Arming auto-merge is a separate, explicit step.'
      ]),
      el('div', { className: 'compose-form' }, [
        slugList,
        el('div', { className: 'field' }, [
          el('span', { className: 'field-label' }, ['Slug']),
          el('div', { className: 'slug-row' }, [slugInput, loadButton])
        ]),
        el('div', { className: 'field' }, [el('span', { className: 'field-label' }, ['Title']), titleInput]),
        el('div', { className: 'field' }, [el('span', { className: 'field-label' }, ['Description']), descInput]),
        el('div', { className: 'field' }, [el('span', { className: 'field-label' }, ['Tags']), tagChecklist]),
        el('div', { className: 'field' }, [el('span', { className: 'field-label' }, ['Body']), bodyInput]),
        el('div', { className: 'compose-actions' }, [publishButton, armButton])
      ]),
      statusLog
    );
  }

  const views = { posts: viewPosts, log: viewLog, branches: viewBranches, health: viewHealth, pr: viewPr, compose: viewCompose };

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
