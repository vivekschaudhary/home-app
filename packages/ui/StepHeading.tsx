import { forwardRef, type ReactNode } from "react";

/** Step heading (h1) that receives focus on step change for screen-reader
 *  orientation (design.md: focus to step heading, tabindex=-1). */
export const StepHeading = forwardRef<HTMLHeadingElement, { children: ReactNode; subtitle?: ReactNode }>(
  function StepHeading({ children, subtitle }, ref) {
    return (
      <div className="mb-5">
        <h1 ref={ref} tabIndex={-1} className="text-xl font-semibold text-gray-900 outline-none">
          {children}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
      </div>
    );
  },
);
