import { Icon } from '@/components/Icon';
import './ds.css';

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <div className="am-section-header">
      <h2 className="am-section-header__title">{title}</h2>
      {action ? (
        <button className="am-section-header__action" onClick={onAction}>
          {action}
          <Icon name="chevronRight" size={14} />
        </button>
      ) : null}
    </div>
  );
}
