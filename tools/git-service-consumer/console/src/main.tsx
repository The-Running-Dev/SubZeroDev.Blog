import { createRoot } from 'react-dom/client';
import { createConsole } from '@subzerodev-git/console';
import { BLOG_VIEWS } from './blog-views.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('git-service-consumer console: no #root element in index.html');

createRoot(root).render(createConsole(BLOG_VIEWS));
