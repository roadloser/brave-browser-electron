import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children?: ReactNode;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, children, active, className = '', ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type={props.type ?? 'button'}
        className={`icon-button ${className}`}
        title={props.title ?? label}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
      </button>
    );
  },
);
