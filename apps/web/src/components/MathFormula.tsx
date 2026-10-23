import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathFormulaProps {
  math: string;
  block?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const MathFormula: React.FC<MathFormulaProps> = ({
  math,
  block = false,
  className = '',
  style = {}
}) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        throwOnError: false,
        displayMode: block,
      });
    } catch (e) {
      console.warn('KaTeX render error:', e);
      return math;
    }
  }, [math, block]);

  if (block) {
    return (
      <div
        className={`math-block-container ${className}`}
        style={{
          overflowX: 'auto',
          maxWidth: '100%',
          padding: '6px 0',
          margin: '4px 0',
          WebkitOverflowScrolling: 'touch',
          ...style
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`math-inline-container ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        overflowX: 'auto',
        maxWidth: '100%',
        ...style
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
