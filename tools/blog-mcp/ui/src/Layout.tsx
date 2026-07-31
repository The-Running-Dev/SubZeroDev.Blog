import { NavLink, Outlet } from 'react-router-dom';

async function handleLogout(): Promise<void> {
  await fetch('/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/login';
}

export default function Layout() {
  return (
    <>
      <header>
        <h1>blog-mcp</h1>
        <nav>
          <NavLink to="/posts">Posts</NavLink>
          <NavLink to="/compose">Compose</NavLink>
          <NavLink to="/log">Log</NavLink>
          <NavLink to="/branches">Branches</NavLink>
          <NavLink to="/health">Repo health</NavLink>
          <NavLink to="/pr">PR status</NavLink>
          <button type="button" id="logout" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </nav>
      </header>
      <main id="content">
        <Outlet />
      </main>
    </>
  );
}
