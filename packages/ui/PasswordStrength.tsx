interface PasswordStrengthProps {
  score: 0 | 1 | 2 | 3 | 4;
  /** Text equivalent of the meter (a11y: meter is not color-only). */
  label: string;
}

const BAR_COLORS = ["bg-gray-200", "bg-red-400", "bg-amber-400", "bg-lime-500", "bg-green-600"];

/** Password strength meter with a visible text label (screen-reader + sighted
 *  equivalent — never color-only). */
export function PasswordStrength({ score, label }: PasswordStrengthProps) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= score ? BAR_COLORS[score] : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Password strength: <span className="font-medium text-gray-700">{label}</span>
      </p>
    </div>
  );
}
