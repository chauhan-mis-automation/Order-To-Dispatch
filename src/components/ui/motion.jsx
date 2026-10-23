import { useCountUp } from "../../hooks/useCountUp";

/** <CountUp value={1234.5} decimals={1} prefix="₹" suffix="%" /> */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 900 }) {
  const v = useCountUp(value, duration);
  const text = v.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <>{prefix}{text}{suffix}</>;
}
