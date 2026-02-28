import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/App.css';
import { AuthProvider } from './context/AuthContext';
import { KnowledgeProvider } from './context/KnowledgeContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <KnowledgeProvider>
        <App />
      </KnowledgeProvider>
    </AuthProvider>
  </React.StrictMode>,
);
