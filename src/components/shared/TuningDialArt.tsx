import tuningDial from '../../../assets/ui/artist/tuning-dial.webp';
import './tuning-dial-art.css';

export function TuningDialArt({ size = 20 }: { size?: number }) {
  return <img className="tuning-dial-art" src={tuningDial} width={size} height={size}
    alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
