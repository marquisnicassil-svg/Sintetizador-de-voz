import React from 'react';

interface AppIconMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export const AppIconMark: React.FC<AppIconMarkProps> = ({
  size = 28,
  animated = false,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="512" height="512" rx="116" fill="#0E1116" />
      <rect
        x="18"
        y="18"
        width="476"
        height="476"
        rx="98"
        stroke="#27303F"
        strokeWidth="8"
      />
      <rect
        x="112"
        y="206"
        width="36"
        height="100"
        rx="18"
        fill="#F97316"
        className={animated ? 'animate-splash-bar-1' : undefined}
      />
      <rect
        x="174"
        y="148"
        width="36"
        height="216"
        rx="18"
        fill="#FB923C"
        className={animated ? 'animate-splash-bar-2' : undefined}
      />
      <rect
        x="238"
        y="96"
        width="36"
        height="320"
        rx="18"
        fill="#FFF7ED"
        className={animated ? 'animate-splash-bar-3' : undefined}
      />
      <rect
        x="302"
        y="156"
        width="36"
        height="200"
        rx="18"
        fill="#FB923C"
        className={animated ? 'animate-splash-bar-2' : undefined}
      />
      <rect
        x="364"
        y="206"
        width="36"
        height="100"
        rx="18"
        fill="#F97316"
        className={animated ? 'animate-splash-bar-1' : undefined}
      />
    </svg>
  );
};
