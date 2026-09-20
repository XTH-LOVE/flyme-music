import { Icon, type IconName } from '@/components/Icon';
import { ExpressiveShape } from '@/components/ExpressiveShape';
import type { ExpressiveShapeName } from '@/utils/expressiveShapes';
import './ds.css';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  /** Optional call to action, e.g. a retry button on load failures. */
  action?: { label: string; onClick: () => void };
  /** Badge silhouette. Pass null for the plain rounded square. */
  shape?: ExpressiveShapeName | null;
}

export function EmptyState({
  icon = 'music',
  title,
  description,
  action,
  shape = 'cookie',
}: EmptyStateProps) {
  return (
    <div className="am-empty">
      <div className={'am-empty__icon' + (shape ? ' am-empty__icon--shaped' : '')}>
        {shape ? (
          <ExpressiveShape shape={shape} size={56} className="am-empty__shape" />
        ) : null}
        <Icon name={icon} size={26} className="am-empty__glyph" />
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
