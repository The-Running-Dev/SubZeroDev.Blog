import React, { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import OriginalMDXComponents from '@theme-original/MDXComponents';

function ArticleTable(props: ComponentProps<'table'>): React.JSX.Element {
  const tableRef = useRef<HTMLTableElement>(null);
  const hintId = useId();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const table = tableRef.current;
    if (!table || !table.closest('.blog-post-page')) return;

    const phone = window.matchMedia('(max-width: 767px)');
    const update = (): void => {
      setShowHint(phone.matches && table.scrollWidth > table.clientWidth + 1);
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    // Intrinsic column widths can change with the reading-size control even
    // when the table's outer width stays fixed.
    for (const section of Array.from(table.children)) observer.observe(section);
    phone.addEventListener('change', update);
    update();

    return () => {
      observer.disconnect();
      phone.removeEventListener('change', update);
    };
  }, []);

  return (
    <div className="article-table">
      {showHint && <p className="article-table__hint" id={hintId}>Swipe to see all columns</p>}
      <table
        {...props}
        ref={tableRef}
        tabIndex={showHint ? (props.tabIndex ?? 0) : props.tabIndex}
        aria-describedby={[props['aria-describedby'], showHint ? hintId : undefined].filter(Boolean).join(' ') || undefined}
      />
    </div>
  );
}

export default { ...OriginalMDXComponents, table: ArticleTable };
