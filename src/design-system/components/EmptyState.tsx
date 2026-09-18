import { Icon, type IconName } from '@/components/Icon';
import './ds.css';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  /** Optional call to action, e.g. a retry button on load failures. */
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon = 'music', title, description, action }: EmptyStateProps) {
  return (
    <div className="am-empty">
      <div className="am-empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <div className="am-empty__title">{title}</div>
      {description ? <div className="am-empty__desc">{description}</div> : null}
      {action ? (
        <button
          className="am-btn am-btn--secondary am-btn--sm"
          style={{ marginTop: 14 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
