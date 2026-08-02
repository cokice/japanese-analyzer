export type AtomIconState = 'off' | 'on' | 'busy';

interface AtomIconProps {
  state: AtomIconState;
  size?: number;
  className?: string;
}

export default function AtomIcon({
  state,
  size = 22,
  className = '',
}: AtomIconProps) {
  const stateClasses = state === 'off' ? '' : state === 'on' ? 'on' : 'on busy';

  return (
    <svg
      className={`atom-icon v6 ${stateClasses} ${className}`.trim()}
      viewBox="0 0 44 44"
      width={size}
      height={size}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="orbit" cx="22" cy="22" rx="18" ry="7" />
      <ellipse className="orbit o2" cx="22" cy="22" rx="18" ry="7" />
      <ellipse className="orbit o3" cx="22" cy="22" rx="18" ry="7" />
      <circle className="nucleus" cx="22" cy="22" r="3" />
      <circle className="electron" r="2.2" />
      <g className="eg2"><circle className="electron e2" r="2.2" /></g>
      <g className="eg3"><circle className="electron e3" r="2.2" /></g>
    </svg>
  );
}
