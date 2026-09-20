import './ds.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

export function Skeleton({ width, height = 16, radius = 8, className }: SkeletonProps) {
  return (
    <div
      className={'am-skeleton ' + (className ?? '')}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
