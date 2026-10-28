import { forwardRef, type IframeHTMLAttributes } from 'react';

/** Report and conversation markup share the same opaque-origin sandbox. */
export const ReportFrame = forwardRef<HTMLIFrameElement, Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'sandbox' | 'src'>>(
  function ReportFrame(props, ref) { return <iframe {...props} ref={ref} sandbox="allow-scripts" />; },
);
