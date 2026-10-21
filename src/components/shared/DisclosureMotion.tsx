import type { ReactNode } from 'react';
import { useOverlayPresence } from './useOverlayPresence';

/** Animate natural height while the closed content is already inert and absent from AX. */
export function DisclosureMotion({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const motion = useOverlayPresence(open);
  return (
    <div id={id} className="disclosure-motion" {...motion.layerProps}
      data-ui-phase={motion.present ? motion.layerProps['data-ui-phase'] : undefined}
      data-ui-retained={motion.present || undefined}>
      <div className="disclosure-motion-clip">{children}</div>
    </div>
  );
}
