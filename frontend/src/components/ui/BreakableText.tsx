import { Fragment } from "react";

/**
 * Renders an email/URL with soft wrap points after "@" and before "." so long addresses wrap at
 * natural boundaries on narrow screens instead of being split mid-word.
 */
export function BreakableEmail({ value }: { value: string }) {
  const parts = value.split(/(?=[.@])|(?<=@)/);
  return <>{parts.map((part, index) => <Fragment key={index}>{index > 0 && <wbr />}{part}</Fragment>)}</>;
}
