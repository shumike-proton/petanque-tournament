import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { TournamentListPage } from './pages/TournamentListPage';
import { TournamentPage } from './pages/TournamentPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<TournamentListPage />} />
        <Route path="/t/:id/:tab?" element={<TournamentPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
