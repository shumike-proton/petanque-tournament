import { useEffect, useState } from 'react';

/**
 * Печать через диалог браузера. Режим позволяет перед печатью отрисовать дополнительное
 * содержимое (например, все группы сразу): print('all') → перерисовка → window.print().
 * После закрытия диалога режим сбрасывается.
 *
 * landscape — печатать в альбомной ориентации. Ориентация задаётся для всего документа:
 * если назначить её только части страницы, браузер выносит эту часть на отдельный лист,
 * оставляя первый лист с одним заголовком.
 */
export function usePrint<Mode extends string>(landscape = false) {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    if (mode === null) return;
    const style = document.createElement('style');
    style.textContent = landscape
      ? '@page { size: A4 landscape; margin: 10mm; }'
      : '@page { margin: 12mm; }';
    document.head.appendChild(style);
    const done = () => setMode(null);
    window.addEventListener('afterprint', done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      style.remove();
    };
  }, [mode, landscape]);

  return { mode, print: setMode };
}
