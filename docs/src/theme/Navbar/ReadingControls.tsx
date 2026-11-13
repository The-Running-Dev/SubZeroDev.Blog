import React, { useEffect, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';

type TextSize = 'small' | 'standard' | 'large';
const storageKey = 'journal-text-size';

export default function ReadingControls(): React.JSX.Element {
  const { colorMode, setColorMode } = useColorMode();
  const [textSize, setTextSize] = useState<TextSize>('standard');

  useEffect(() => {
    let savedSize: TextSize = 'standard';
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'small' || saved === 'large') savedSize = saved;
    } catch { /* Reading controls also work when browser storage is disabled. */ }
    document.documentElement.dataset.journalTextSize = savedSize;
    setTextSize(savedSize);
  }, []);

  function changeTextSize(value: TextSize): void {
    document.documentElement.dataset.journalTextSize = value;
    setTextSize(value);
    try { localStorage.setItem(storageKey, value); } catch { /* Session-only preference. */ }
  }

  return (
    <div className="reading-controls" role="group" aria-label="Reading preferences">
      <label>
        <span>Text size</span>
        <select value={textSize} onChange={(event) => changeTextSize(event.target.value as TextSize)}>
          <option value="small">Small</option>
          <option value="standard">Standard</option>
          <option value="large">Large</option>
        </select>
      </label>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={colorMode === 'dark'}
        onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          {colorMode === 'dark'
            ? <path d="M20 14a8.5 8.5 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z" />
            : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
        </svg>
        <span>{colorMode === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
  );
}
