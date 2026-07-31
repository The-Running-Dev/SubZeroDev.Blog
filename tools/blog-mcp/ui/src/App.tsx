import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import LoginPage from './views/LoginPage';
import PostsView from './views/PostsView';
import ComposeView from './views/ComposeView';
import LogView from './views/LogView';
import BranchesView from './views/BranchesView';
import HealthView from './views/HealthView';
import PrStatusView from './views/PrStatusView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/posts" replace />} />
          <Route path="/posts" element={<PostsView />} />
          <Route path="/compose" element={<ComposeView />} />
          <Route path="/compose/:slug" element={<ComposeView />} />
          <Route path="/log" element={<LogView />} />
          <Route path="/branches" element={<BranchesView />} />
          <Route path="/health" element={<HealthView />} />
          <Route path="/pr" element={<PrStatusView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
