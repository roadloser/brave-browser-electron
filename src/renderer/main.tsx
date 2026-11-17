import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/shell.css';

const root = document.getElementById('root');
if (!root) throw new Error('浏览器根视图不存在');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
