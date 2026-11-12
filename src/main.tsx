import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { TournamentListPage } from './pages/TournamentListPage';
import { TournamentPage } from './pages/TournamentPage';
import './styles.css';

// Работа без интернета и установка на главный экран — только когда приложение открыто с сайта
// (https). При открытии файла с диска и в режиме разработки сервис-воркер не нужен.
const servedFromSite = location.protocol === 'https:' || location.hostname === 'localhost';
if (import.meta.env.PROD && 'serviceWorker' in navigator && servedFromSite) {
  void navigator.serviceWorker.register('./sw.js');
}

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
