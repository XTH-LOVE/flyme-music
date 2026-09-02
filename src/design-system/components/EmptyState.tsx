import { Icon, type IconName } from '@/components/Icon';
import './ds.css';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
}

export function EmptyState({ icon = 'music', title, description }: EmptyStateProps) {
  return (
    <div className="am-empty">
      <div className="am-empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <div className="am-empty__title">{title}</div>
      {description ? <div className="am-empty__desc">{description}</div> : null}
    </div>
  );
}
