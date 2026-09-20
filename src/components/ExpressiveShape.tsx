import { shapePath, type ExpressiveShapeName } from '@/utils/expressiveShapes';

interface ExpressiveShapeProps {
  shape: ExpressiveShapeName;
  size?: number;
  /** Any CSS colour; defaults to the surrounding text colour. */
  color?: string;
  className?: string;
}

/** Renders one of the Material 3 Expressive shapes as a filled SVG. */
export function ExpressiveShape({
  shape,
  size = 40,
  color = 'currentColor',
  className,
}: ExpressiveShapeProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path d={shapePath(shape)} fill={color} />
    </svg>
  );
}
