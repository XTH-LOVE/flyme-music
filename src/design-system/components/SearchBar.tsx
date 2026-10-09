import { Icon } from '@/components/Icon';
import type { KeyboardEvent, FocusEvent } from 'react';
import './ds.css';

interface SearchBarProps {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export function SearchBar({
  value,
  placeholder = '搜索音乐',
  autoFocus = false,
  onChange,
  onSubmit,
  onKeyDown,
  onFocus,
  onBlur,
}: SearchBarProps) {
  return (
    <div className="am-search">
      <Icon name="search" size={18} className="am-search__icon" />
      <input
        className="am-search__input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented && e.key === 'Enter') onSubmit?.(value);
        }}
      />
      {value ? (
        <button className="am-search__clear" onClick={() => onChange('')} aria-label="清空">
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}
